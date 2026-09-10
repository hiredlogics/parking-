"use client";

import { useEffect, useState } from "react";
import type { PortalOverview } from "@/lib/portal/overview";

/**
 * Load the customer's real case data for the portal screens.
 *
 * One request serves the dashboard and all four list screens, so
 * navigating between them does not refetch per page.
 */
export function usePortalOverview() {
  const [data, setData] = useState<PortalOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/overview", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !json?.success) {
          setError(json?.error?.message ?? `Could not load your data (${res.status}).`);
          return;
        }
        setData(json.data as PortalOverview);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Network error.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error, loading: data === null && error === null };
}

export type { PortalOverview };
