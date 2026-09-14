import { getSql } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";

/**
 * Audit events (V2 brief §32).
 *
 * Records decisions, outputs, versions and provenance — never private
 * chain-of-thought.
 */
export type AuditEventType =
  | "CASE_CREATED"
  | "DOCUMENT_UPLOADED"
  | "EXTRACTION_COMPLETED"
  | "EXTRACTION_CONFIRMED"
  | "QUESTION_ANSWERED"
  | "ANALYSIS_COMPLETED"
  | "KB_RETRIEVED"
  | "DRAFT_GENERATED"
  | "VALIDATION_COMPLETED"
  | "PAYMENT_STARTED"
  | "PAYMENT_CONFIRMED"
  | "APPEAL_UNLOCKED"
  | "PDF_GENERATED"
  | "MANUAL_REVIEW_REQUESTED"
  | "APPEAL_AWAITING_ADMIN_APPROVAL"
  | "APPEAL_APPROVED"
  | "KB_MODULE_STATUS_CHANGED"
  | "KB_BLOCK_STATUS_CHANGED"
  | "LEGAL_SOURCE_QUOTATION_CHANGED";

export interface AuditEventInput {
  eventType: AuditEventType;
  caseId?: string | null;
  actorId?: string | null;
  payload?: Record<string, unknown>;
}

export async function insertAuditEvent(input: AuditEventInput): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const id = `aud_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await sql.query(
    `INSERT INTO audit_events (id, case_id, event_type, payload, actor_id, created_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      id,
      input.caseId ?? null,
      input.eventType,
      input.payload ? JSON.stringify(input.payload) : null,
      input.actorId ?? null,
      new Date().toISOString(),
    ],
  );
}
