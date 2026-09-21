/**
 * Admin exception path — HOLD / REJECT / APPROVE for cases that could
 * not auto-release. Normal successful appeals never need this.
 */
import type { SessionData } from "@/lib/auth/session";
import * as caseRepo from "@/lib/cases/repo";
import {
  findAppealById,
  markAppealHeld,
  markAppealRejected,
  type CaseAppeal,
} from "@/lib/appeals/repo";
import { releaseAppealToCustomer } from "@/lib/appeals/autoRelease";

export type ApprovalFailure = {
  ok: false;
  status: 400 | 403 | 404 | 409;
  code: string;
  message: string;
};

function requireAdmin(session: SessionData): ApprovalFailure | null {
  if (!session.userId || session.kind !== "ADMIN") {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      message: "Admin access required.",
    };
  }
  return null;
}

function paragraphsFromBody(body: string): Array<{ id: string; text: string }> {
  return body
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text, i) => ({ id: `p_manual_${i + 1}`, text }));
}

export async function approveAppeal(
  appealId: string,
  session: SessionData,
  opts: { bodyText?: string | null } = {},
): Promise<{ ok: true; appeal: CaseAppeal; emailId: string | null } | ApprovalFailure> {
  const denied = requireAdmin(session);
  if (denied) return denied;

  const before = await findAppealById(appealId);
  if (!before) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Appeal not found." };
  }

  const override = opts.bodyText?.trim() || null;
  const hasExisting =
    Boolean(before.body?.trim()) && before.paragraphs.length > 0;
  if (!override && !hasExisting) {
    return {
      ok: false,
      status: 409,
      code: "NO_BODY",
      message:
        "This appeal has no text to approve. Paste the letter text, then Approve.",
    };
  }

  const { isAppealBodyTooThin, buildRulesBasedLetter } = await import(
    "@/lib/appeals/rulesLetter"
  );

  let finalBody = override ?? before.body ?? "";
  let finalParagraphs = override ? paragraphsFromBody(override) : null;

  if (isAppealBodyTooThin(finalBody)) {
    const appealCase = await caseRepo.findCase(before.caseId);
    if (!appealCase?.confirmed) {
      return {
        ok: false,
        status: 404,
        code: "CASE_NOT_FOUND",
        message: "Case not found.",
      };
    }
    const docs = await caseRepo.listCaseDocuments(before.caseId, "EVIDENCE");
    const rulesLetter = await buildRulesBasedLetter({
      confirmed: appealCase.confirmed,
      answers: appealCase.adaptiveAnswers,
      evidenceTypes: docs.map((d) => d.evidenceType ?? "other"),
    });
    if (isAppealBodyTooThin(rulesLetter.body)) {
      return {
        ok: false,
        status: 400,
        code: "BODY_TOO_SHORT",
        message:
          "Appeal text is too short to approve and the rules engine could not assemble a letter. Paste a full formal appeal.",
      };
    }
    finalBody = rulesLetter.body;
    finalParagraphs =
      rulesLetter.paragraphs.length > 0
        ? rulesLetter.paragraphs
        : paragraphsFromBody(rulesLetter.body);
  }

  const released = await releaseAppealToCustomer({
    appealId,
    approvedBy: session.userId!,
    bodyText: finalBody,
    paragraphs: finalParagraphs,
    eventType: "APPEAL_APPROVED",
  });

  if (!released.ok) {
    return {
      ok: false,
      status: released.status,
      code: released.code,
      message: released.message,
    };
  }

  return { ok: true, appeal: released.appeal, emailId: released.emailId };
}

export async function holdAppeal(
  appealId: string,
  session: SessionData,
  reason: string,
  notes?: string,
): Promise<{ ok: true; appeal: CaseAppeal } | ApprovalFailure> {
  const denied = requireAdmin(session);
  if (denied) return denied;
  const appeal = await markAppealHeld(appealId, reason, notes);
  await caseRepo.addCaseEvent({
    caseId: appeal.caseId,
    eventType: "APPEAL_HELD",
    actorId: session.userId!,
    payload: { appealId, reason },
  });
  return { ok: true, appeal };
}

export async function rejectAppeal(
  appealId: string,
  session: SessionData,
  reason: string,
  notes?: string,
): Promise<{ ok: true; appeal: CaseAppeal } | ApprovalFailure> {
  const denied = requireAdmin(session);
  if (denied) return denied;
  const appeal = await markAppealRejected(appealId, reason, notes);
  await caseRepo.addCaseEvent({
    caseId: appeal.caseId,
    eventType: "APPEAL_REJECTED",
    actorId: session.userId!,
    payload: { appealId, reason },
  });
  return { ok: true, appeal };
}
