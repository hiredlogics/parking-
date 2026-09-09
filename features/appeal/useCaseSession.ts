"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppealStore } from "./store";
import { createCase, fetchCase, fetchCaseList } from "./caseSync";

/**
 * Bind the page to a server-backed case.
 *
 * Resume rules:
 *   1. If the store already has a caseId, load it from the server.
 *   2. If that case is gone or belongs to someone else, drop the stale
 *      id and fall back to the customer's most recent resumable case.
 *   3. If there is none and `createIfMissing` is set, start a new case.
 *
 * This is what makes a refresh safe: the browser only remembers the id,
 * and every field is re-read from PostgreSQL.
 */
export type CaseSessionStatus = "loading" | "ready" | "error";

export function useCaseSession(options: { createIfMissing?: boolean } = {}) {
  const { createIfMissing = false } = options;
  const caseId = useAppealStore((s) => s.caseId);
  const casePublicId = useAppealStore((s) => s.casePublicId);
  const setCaseId = useAppealStore((s) => s.setCaseId);
  const hydrateFromCase = useAppealStore((s) => s.hydrateFromCase);

  const [status, setStatus] = useState<CaseSessionStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  const resolve = useCallback(async () => {
    setError(null);

    // 1. Try the remembered case.
    if (caseId) {
      const existing = await fetchCase(caseId);
      if (existing.ok) {
        hydrateFromCase(existing.data.case);
        setStatus("ready");
        return;
      }
      // A 404 here means the id is stale or not ours — never surface it
      // as an error, just fall through to resume/create.
      if (existing.code !== "NOT_FOUND" && existing.code !== "UNAUTHENTICATED") {
        setError(existing.message);
        setStatus("error");
        return;
      }
    }

    // 2. Fall back to the most recent resumable case.
    const list = await fetchCaseList();
    if (list.ok && list.data.resume) {
      hydrateFromCase(list.data.resume);
      setStatus("ready");
      return;
    }

    // 3. Start a new one only where the page asks for it.
    if (!createIfMissing) {
      setStatus("ready");
      return;
    }
    const created = await createCase();
    if (!created.ok) {
      setError(created.message);
      setStatus("error");
      return;
    }
    hydrateFromCase(created.data.case);
    setCaseId(created.data.case.id, created.data.case.publicId);
    setStatus("ready");
  }, [caseId, createIfMissing, hydrateFromCase, setCaseId]);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    void resolve();
  }, [resolve]);

  return {
    caseId: useAppealStore.getState().caseId,
    casePublicId,
    status,
    error,
    reload: resolve,
  };
}
