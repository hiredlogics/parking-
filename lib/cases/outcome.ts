import type { SessionData } from "@/lib/auth/session";
import {
  ALL_OUTCOME_STATUSES,
  type CaseOutcomeSource,
  type CaseOutcomeStatus,
} from "@/types/caseState";
import { requireCaseAccess, type AccessFailure } from "./service";
import * as repo from "./repo";
import type { AppealCase } from "./types";

/**
 * Case outcome recording.
 *
 * The workflow and the outcome are separate axes. Recording an outcome
 * never moves the workflow status: an appeal that was prepared and sent
 * stays complete whether the operator accepts it, refuses it, or never
 * replies at all.
 *
 * Today the only writer is the customer answering "have you heard
 * back?". The rejection-document upload and the 30-day automation will
 * write through the same function with a different source, so the
 * reporting shape does not change when they arrive.
 */

export type OutcomeFailure =
  | AccessFailure
  | { ok: false; status: 400 | 409; code: string; message: string };

export function isOutcomeStatus(value: unknown): value is CaseOutcomeStatus {
  return (
    typeof value === "string" &&
    (ALL_OUTCOME_STATUSES as readonly string[]).includes(value)
  );
}

export interface OutcomeView {
  outcomeStatus: CaseOutcomeStatus;
  outcomeRecordedAt: string | null;
  submittedAt: string | null;
  followUpDue: boolean;
  /** True when a second stage could be offered later. Not built yet. */
  secondStageMayApply: boolean;
}

/** Is it time to ask the customer whether an outcome arrived? */
export function isFollowUpDue(
  appealCase: Pick<AppealCase, "submittedAt" | "followUpDueAt" | "outcomeStatus">,
  now = new Date(),
): boolean {
  if (!appealCase.submittedAt) return false;
  if (appealCase.outcomeStatus !== "PENDING") return false;
  if (!appealCase.followUpDueAt) return false;
  return Date.parse(appealCase.followUpDueAt) <= now.getTime();
}

export function toOutcomeView(appealCase: AppealCase, now = new Date()): OutcomeView {
  return {
    outcomeStatus: appealCase.outcomeStatus,
    outcomeRecordedAt: appealCase.outcomeRecordedAt,
    submittedAt: appealCase.submittedAt,
    followUpDue: isFollowUpDue(appealCase, now),
    // A refusal is what opens a second stage. Nothing acts on this yet.
    secondStageMayApply: appealCase.outcomeStatus === "REJECTED",
  };
}

/**
 * Record the operator's decision for a case.
 *
 * Refused before the appeal has been submitted — there is nothing for
 * an operator to have decided on yet, so accepting one would corrupt
 * the reporting.
 */
export async function recordOutcomeForCase(
  caseId: string,
  session: SessionData,
  input: {
    outcomeStatus: CaseOutcomeStatus;
    detail?: string | null;
    source?: CaseOutcomeSource;
  },
): Promise<{ ok: true; outcome: OutcomeView } | OutcomeFailure> {
  const access = await requireCaseAccess(caseId, session, "write");
  if (!access.ok) return access;
  const c = access.appealCase;

  if (!isOutcomeStatus(input.outcomeStatus)) {
    return {
      ok: false,
      status: 400,
      code: "BAD_OUTCOME",
      message: "Unrecognised outcome.",
    };
  }
  if (!c.submittedAt) {
    return {
      ok: false,
      status: 409,
      code: "NOT_SUBMITTED",
      message:
        "This appeal has not been completed yet, so there is no outcome to record.",
    };
  }

  await repo.recordOutcome(caseId, {
    outcomeStatus: input.outcomeStatus,
    source: input.source ?? "CUSTOMER",
    detail: input.detail ?? null,
  });

  await repo.addCaseEvent({
    caseId,
    eventType: "OUTCOME_RECORDED",
    actorId: session.userId ?? null,
    payload: {
      outcomeStatus: input.outcomeStatus,
      source: input.source ?? "CUSTOMER",
      // Kept for reporting: outcome by operator / route / stage.
      operatorName: c.operatorName,
      primaryRoute: c.primaryRoute,
      serviceType: c.serviceType,
      stageNumber: c.stageNumber,
    },
  });

  const updated = await repo.findCase(caseId);
  return { ok: true, outcome: toOutcomeView(updated ?? c) };
}
