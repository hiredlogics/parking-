import { getSql } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";
import { nextPublicCaseId } from "./publicId";
import type { AppealCase, CaseDocument, ServiceType, SufficiencyStatus } from "./types";
import type { ConfirmedPcn, ExtractionResult } from "@/types";
import type { AnswerMap } from "@/lib/facts/types";
import {
  understandingFromTriage,
  isServiceNotSupported,
} from "@/lib/cases/documentUnderstanding";
import type { CaseIntelligence } from "@/lib/cases/caseIntelligence";
import {
  lifecycleStatusFor,
  type AppealCaseStatus,
  type CaseOutcomeSource,
  type CaseOutcomeStatus,
  type RouteFamily,
} from "@/types/caseState";

/**
 * Case persistence. PostgreSQL is the authoritative store for a
 * customer's appeal; the browser keeps only a cache.
 *
 * Every function here is ownership-agnostic — access control lives in
 * `lib/cases/service.ts` so it cannot be forgotten at a call site.
 */

type Row = Record<string, unknown>;

async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  await ensureSchema();
  const sql = getSql();
  const res = (await sql.query(text, params)) as unknown as
    | { rows?: Row[] }
    | Row[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}

const arr = <T>(v: unknown, fallback: T[] = []): T[] =>
  Array.isArray(v) ? (v as T[]) : fallback;

function rowToCase(r: Row): AppealCase {
  return {
    id: r.id as string,
    publicId: r.public_id as string,
    customerId: r.customer_id as string,
    serviceType: (r.service_type as ServiceType) ?? "PRIVATE_PARKING_INITIAL_APPEAL",
    status: r.status as AppealCaseStatus,

    operatorName: (r.operator_name as string | null) ?? null,
    pcnNumber: (r.pcn_number as string | null) ?? null,
    vrm: (r.vrm as string | null) ?? null,
    parkingLocation: (r.parking_location as string | null) ?? null,
    parkingEventDate: (r.parking_event_date as string | null) ?? null,
    noticeIssueDate: (r.notice_issue_date as string | null) ?? null,
    noticeReceivedDate: (r.notice_received_date as string | null) ?? null,
    noticeRoute: (r.notice_route as AppealCase["noticeRoute"]) ?? "UNKNOWN",
    operatorAta: (r.operator_ata as AppealCase["operatorAta"]) ?? "UNKNOWN",
    driverStatus: (r.driver_status as AppealCase["driverStatus"]) ?? "UNKNOWN",
    pofaRoute: (r.pofa_route as string | null) ?? null,

    extraction: (r.extraction_json as ExtractionResult | null) ?? null,
    confirmed: (r.confirmed_json as ConfirmedPcn | null) ?? null,
    adaptiveAnswers: (r.adaptive_answers as AnswerMap) ?? {},
    askedQuestionIds: arr<string>(r.asked_question_ids),

    documentType: (r.document_type as string | null) ?? null,
    senderName: (r.sender_name as string | null) ?? null,
    parkingOperatorName: (r.parking_operator_name as string | null) ?? null,
    caseStage: (r.case_stage as string | null) ?? null,
    serviceDecision: (r.service_decision as string | null) ?? null,
    caseIntelligence:
      (r.case_intelligence_json as CaseIntelligence | null) ?? null,

    candidateRoutes: arr<RouteFamily>(r.candidate_routes),
    primaryRoute: (r.primary_route as RouteFamily | null) ?? null,
    secondaryRoutes: arr<RouteFamily>(r.secondary_routes),
    missingFacts: arr<string>(r.missing_facts),
    codeVersionId: (r.code_version_id as string | null) ?? null,

    questioningComplete: Boolean(r.questioning_complete),
    sufficiencyStatus: (r.sufficiency_status as SufficiencyStatus) ?? "INCOMPLETE",
    readinessCheckedAt: (r.readiness_checked_at as string | null) ?? null,
    outOfScopeReason: (r.out_of_scope_reason as string | null) ?? null,
    outOfScopeDetail: (r.out_of_scope_detail as string | null) ?? null,

    paymentStatus: (r.payment_status as AppealCase["paymentStatus"]) ?? "UNPAID",
    appealLocked: r.appeal_locked === undefined ? true : Boolean(r.appeal_locked),
    orderId: (r.order_id as string | null) ?? null,

    // Derived, never stored — see lifecycleStatusFor.
    lifecycleStatus: lifecycleStatusFor(r.status as AppealCaseStatus, {
      submittedAt: (r.submitted_at as string | null) ?? null,
      outcomeStatus: (r.outcome_status as CaseOutcomeStatus) ?? "PENDING",
    }),

    outcomeStatus: (r.outcome_status as CaseOutcomeStatus) ?? "PENDING",
    outcomeRecordedAt: (r.outcome_recorded_at as string | null) ?? null,
    outcomeSource: (r.outcome_source as CaseOutcomeSource | null) ?? null,
    outcomeDetail: (r.outcome_detail as string | null) ?? null,

    submittedAt: (r.submitted_at as string | null) ?? null,
    followUpDueAt: (r.follow_up_due_at as string | null) ?? null,

    stageNumber: Number(r.stage_number ?? 1),
    parentCaseId: (r.parent_case_id as string | null) ?? null,

    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------- Cases ------------------------------- */

export async function createCase(input: {
  customerId: string;
  serviceType?: ServiceType;
  /**
   * Set when this case continues an earlier one. The child references
   * the parent rather than copying its notice, facts and evidence.
   */
  parentCaseId?: string | null;
  stageNumber?: number;
}): Promise<AppealCase> {
  const id = genId("case");
  const publicId = await nextPublicCaseId();
  const now = new Date().toISOString();
  await q(
    `INSERT INTO appeal_cases
       (id, public_id, customer_id, service_type, status,
        parent_case_id, stage_number, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'DRAFT',$5::text,$6::integer,$7,$7)`,
    [
      id,
      publicId,
      input.customerId,
      input.serviceType ?? "PRIVATE_PARKING_INITIAL_APPEAL",
      input.parentCaseId ?? null,
      input.stageNumber ?? 1,
      now,
    ],
  );
  const rows = await q(`SELECT * FROM appeal_cases WHERE id = $1`, [id]);
  return rowToCase(rows[0]);
}

export async function findCase(id: string): Promise<AppealCase | null> {
  const rows = await q(`SELECT * FROM appeal_cases WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] ? rowToCase(rows[0]) : null;
}

/**
 * Every appeal case, newest first — admin only.
 *
 * Joined to the customer so the CRM can show who a case belongs to
 * without a second query per row.
 */
export async function listAllCases(
  limit = 200,
): Promise<Array<AppealCase & { customerName: string | null; customerEmail: string | null }>> {
  const rows = await q(
    `SELECT ac.*, c.name AS customer_name, c.email AS customer_email
       FROM appeal_cases ac
       LEFT JOIN clients c ON c.id = ac.customer_id
      ORDER BY ac.updated_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    ...rowToCase(r),
    customerName: (r.customer_name as string | null) ?? null,
    customerEmail: (r.customer_email as string | null) ?? null,
  }));
}

export async function findCasesForCustomer(
  customerId: string,
  limit = 25,
): Promise<AppealCase[]> {
  const rows = await q(
    `SELECT * FROM appeal_cases WHERE customer_id = $1
      ORDER BY updated_at DESC LIMIT $2`,
    [customerId, limit],
  );
  return rows.map(rowToCase);
}

/** Most recent case the customer can still work on. */
export async function findResumableCase(
  customerId: string,
): Promise<AppealCase | null> {
  const rows = await q(
    `SELECT * FROM appeal_cases
      WHERE customer_id = $1
        AND status NOT IN ('OUT_OF_SCOPE','FAILED')
      ORDER BY updated_at DESC LIMIT 1`,
    [customerId],
  );
  return rows[0] ? rowToCase(rows[0]) : null;
}

export async function setCaseStatus(
  id: string,
  status: AppealCaseStatus,
): Promise<void> {
  await q(
    `UPDATE appeal_cases SET status = $2, updated_at = $3 WHERE id = $1`,
    [id, status, new Date().toISOString()],
  );
}

export async function setAwaitingAdminApproval(
  id: string,
  awaiting: boolean,
): Promise<void> {
  await q(
    `UPDATE appeal_cases
     SET awaiting_admin_approval = $2, updated_at = $3
     WHERE id = $1`,
    [id, awaiting, new Date().toISOString()],
  );
}

/**
 * How long after submission it becomes reasonable to ask the customer
 * whether an outcome arrived. Operators are generally expected to reply
 * within 28 days; 30 gives a little slack.
 */
export const FOLLOW_UP_DAYS = 30;

/**
 * Mark the initial appeal as completed and sent.
 *
 * Idempotent: a re-download or a regenerated draft must not move the
 * submission date, because the follow-up window is measured from it.
 */
export async function markSubmitted(
  id: string,
  when = new Date(),
): Promise<void> {
  const now = when.toISOString();
  const followUp = new Date(
    when.getTime() + FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  await q(
    `UPDATE appeal_cases
        SET submitted_at = COALESCE(submitted_at, $2::text),
            follow_up_due_at = COALESCE(follow_up_due_at, $3::text),
            updated_at = $2::text
      WHERE id = $1`,
    [id, now, followUp],
  );
}

/**
 * Record what the operator decided.
 *
 * Only the outcome columns move — the workflow `status` is untouched,
 * so a completed case stays completed whatever the operator says.
 */
export async function recordOutcome(
  id: string,
  input: {
    outcomeStatus: CaseOutcomeStatus;
    source: CaseOutcomeSource;
    detail?: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await q(
    `UPDATE appeal_cases
        SET outcome_status = $2::text,
            outcome_source = $3::text,
            outcome_detail = $4::text,
            outcome_recorded_at = $5::text,
            updated_at = $5::text
      WHERE id = $1`,
    [id, input.outcomeStatus, input.source, input.detail ?? null, now],
  );
}

/**
 * Cases whose follow-up window has passed and whose outcome is still
 * unknown. The future 30-day job will read exactly this; nothing calls
 * it on a schedule yet.
 */
export async function findCasesAwaitingOutcome(
  now = new Date(),
  limit = 200,
): Promise<AppealCase[]> {
  const rows = await q(
    `SELECT * FROM appeal_cases
      WHERE submitted_at IS NOT NULL
        AND outcome_status = 'PENDING'
        AND follow_up_due_at IS NOT NULL
        AND follow_up_due_at <= $1
      ORDER BY follow_up_due_at
      LIMIT $2`,
    [now.toISOString(), limit],
  );
  return rows.map(rowToCase);
}

/**
 * The generated document already rendered from a given draft.
 *
 * The immutability guarantee: if this returns a row, the PDF for that
 * validated appeal already exists and must be reused, never re-made.
 */
export async function findGeneratedDocumentForDraft(
  caseId: string,
  sourceDraftId: string,
): Promise<CaseDocument | null> {
  const rows = await q(
    `SELECT * FROM case_documents_meta
      WHERE case_id = $1 AND source_draft_id = $2
        AND document_type = 'GENERATED' AND deleted_at IS NULL
      ORDER BY uploaded_at DESC LIMIT 1`,
    [caseId, sourceDraftId],
  );
  return rows[0] ? rowToDocument(rows[0]) : null;
}

/**
 * Every document across a customer's cases.
 *
 * Joined to the case so the portal can show which appeal a file belongs
 * to without a query per row.
 */
export async function listDocumentsForCustomer(
  customerId: string,
): Promise<
  Array<CaseDocument & { casePublicId: string; caseIdRef: string }>
> {
  const rows = await q(
    `SELECT d.*, ac.public_id AS case_public_id
       FROM case_documents_meta d
       JOIN appeal_cases ac ON ac.id = d.case_id
      WHERE ac.customer_id = $1 AND d.deleted_at IS NULL
      ORDER BY d.uploaded_at DESC`,
    [customerId],
  );
  return rows.map((r) => ({
    ...rowToDocument(r),
    casePublicId: r.case_public_id as string,
    caseIdRef: r.case_id as string,
  }));
}

/** Later stages of a case, if any exist. */
export async function findChildCases(parentId: string): Promise<AppealCase[]> {
  const rows = await q(
    `SELECT * FROM appeal_cases WHERE parent_case_id = $1 ORDER BY stage_number`,
    [parentId],
  );
  return rows.map(rowToCase);
}

/** Persist the raw extraction result and durable document understanding. */
export async function saveExtraction(
  id: string,
  extraction: ExtractionResult,
): Promise<void> {
  const raw = extraction.raw ?? {};
  const triage = extraction.triage ?? null;
  const understanding = understandingFromTriage(triage);

  // Denormalised operator_name is the parking operator only — never the
  // debt-recovery sender.
  const parkingOperator =
    understanding.parkingOperatorName ??
    (isServiceNotSupported(understanding.serviceDecision)
      ? null
      : (raw.operator_name ?? null));

  await q(
    `UPDATE appeal_cases
        SET extraction_json = $2,
            operator_name = COALESCE($3, operator_name),
            pcn_number    = COALESCE($4, pcn_number),
            vrm           = COALESCE($5, vrm),
            parking_location = COALESCE($6, parking_location),
            parking_event_date = COALESCE($7, parking_event_date),
            notice_issue_date = COALESCE($8, notice_issue_date),
            document_type = COALESCE($9, document_type),
            sender_name = COALESCE($10, sender_name),
            parking_operator_name = COALESCE($11, parking_operator_name),
            case_stage = COALESCE($12, case_stage),
            service_decision = COALESCE($13, service_decision),
            out_of_scope_reason = CASE
              WHEN $13::text IN ('NOT_SUPPORTED', 'WRONG_STAGE_REDIRECT')
              THEN COALESCE($14, out_of_scope_reason)
              ELSE out_of_scope_reason END,
            out_of_scope_detail = CASE
              WHEN $13::text IN ('NOT_SUPPORTED', 'WRONG_STAGE_REDIRECT')
              THEN COALESCE($15, out_of_scope_detail)
              ELSE out_of_scope_detail END,
            status = CASE
              WHEN $13::text IN ('NOT_SUPPORTED', 'WRONG_STAGE_REDIRECT')
              THEN 'OUT_OF_SCOPE'
              ELSE 'AWAITING_CONFIRMATION' END,
            updated_at = $16
      WHERE id = $1`,
    [
      id,
      JSON.stringify(extraction),
      parkingOperator,
      raw.pcn_number ?? null,
      raw.vrm ?? null,
      raw.parking_location ?? null,
      raw.parking_event_date ?? null,
      raw.notice_issue_date ?? null,
      understanding.documentType,
      understanding.senderName,
      understanding.parkingOperatorName,
      understanding.caseStage,
      understanding.serviceDecision,
      triage?.reasonCode ?? null,
      triage?.detail ?? null,
      new Date().toISOString(),
    ],
  );
}

/**
 * Persist Case Intelligence built after confirm / answer updates.
 * Does not overwrite document understanding columns.
 */
export async function saveCaseIntelligence(
  id: string,
  intelligence: CaseIntelligence,
): Promise<void> {
  await q(
    `UPDATE appeal_cases
        SET case_intelligence_json = $2::jsonb,
            updated_at = $3
      WHERE id = $1`,
    [id, JSON.stringify(intelligence), new Date().toISOString()],
  );
}
export async function saveConfirmed(
  id: string,
  confirmed: ConfirmedPcn,
): Promise<void> {
  await q(
    `UPDATE appeal_cases
        SET confirmed_json = $2,
            operator_name = COALESCE($3, operator_name),
            pcn_number = $4,
            vrm = $5,
            parking_location = $6,
            parking_event_date = $7,
            notice_issue_date = $8,
            notice_received_date = $9,
            notice_route = COALESCE($10,'UNKNOWN'),
            status = CASE
              WHEN service_decision IN ('NOT_SUPPORTED', 'WRONG_STAGE_REDIRECT')
              THEN 'OUT_OF_SCOPE'
              WHEN status IN ('DRAFT','EXTRACTING','AWAITING_CONFIRMATION')
              THEN 'QUESTIONING'
              ELSE status END,
            updated_at = $11
      WHERE id = $1`,
    [
      id,
      JSON.stringify(confirmed),
      confirmed.operator_name ?? null,
      confirmed.pcn_number ?? null,
      confirmed.vrm ?? null,
      confirmed.parking_location ?? null,
      confirmed.parking_event_date ?? null,
      confirmed.notice_issue_date ?? null,
      confirmed.notice_received_date ?? null,
      confirmed.notice_route ?? "UNKNOWN",
      new Date().toISOString(),
    ],
  );
}

/** Persist adaptive answers plus the questions already asked. */
export async function saveAnswers(
  id: string,
  input: {
    adaptiveAnswers: AnswerMap;
    askedQuestionIds: string[];
    questioningComplete: boolean;
    missingFacts: string[];
    candidateRoutes: RouteFamily[];
    driverStatus?: AppealCase["driverStatus"];
    outOfScope?: { reason: string; detail: string } | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await q(
    /*
     * Parameters are cast explicitly. $7 and $8 appear inside COALESCE
     * and a bare `IS NOT NULL`, where Postgres cannot infer a type from
     * context and rejects the statement with 42P08.
     */
    `UPDATE appeal_cases
        SET adaptive_answers = $2::jsonb,
            asked_question_ids = $3::jsonb,
            questioning_complete = $4::boolean,
            missing_facts = $5::jsonb,
            candidate_routes = $6::jsonb,
            driver_status = COALESCE($7::text, driver_status),
            out_of_scope_reason = $8::text,
            out_of_scope_detail = $9::text,
            status = CASE
              WHEN $8::text IS NOT NULL THEN 'MANUAL_REVIEW'
              WHEN status = 'AWAITING_CONFIRMATION' THEN 'QUESTIONING'
              ELSE status END,
            updated_at = $10::text
      WHERE id = $1`,
    [
      id,
      JSON.stringify(input.adaptiveAnswers),
      JSON.stringify(input.askedQuestionIds),
      input.questioningComplete,
      JSON.stringify(input.missingFacts),
      JSON.stringify(input.candidateRoutes),
      input.driverStatus ?? null,
      input.outOfScope?.reason ?? null,
      input.outOfScope?.detail ?? null,
      now,
    ],
  );
}

/**
 * Persist the outcome of the sufficient-information check.
 *
 * Status moves to AWAITING_PAYMENT only when the case is sufficient —
 * that is the READY_FOR_PAYMENT state in the target flow.
 */
export async function saveReadiness(
  id: string,
  input: {
    sufficient: boolean;
    candidateRoutes: RouteFamily[];
    primaryRoute: RouteFamily | null;
    secondaryRoutes: RouteFamily[];
    missingFacts: string[];
    codeVersionId: string | null;
    pofaRoute: string | null;
    outOfScope: { detail: string } | null;
    /** Status to move to when sufficient, from the workflow config. */
    readyStatus: AppealCaseStatus;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await q(
    `UPDATE appeal_cases
        SET sufficiency_status = $2,
            candidate_routes = $3,
            primary_route = $4,
            secondary_routes = $5,
            missing_facts = $6,
            code_version_id = $7,
            pofa_route = $8,
            out_of_scope_detail = $9,
            readiness_checked_at = $10,
            status = CASE
              WHEN $11 THEN $12
              ELSE status END,
            updated_at = $10
      WHERE id = $1`,
    [
      id,
      input.sufficient ? "SUFFICIENT" : "INCOMPLETE",
      JSON.stringify(input.candidateRoutes),
      input.primaryRoute,
      JSON.stringify(input.secondaryRoutes),
      JSON.stringify(input.missingFacts),
      input.codeVersionId,
      input.pofaRoute,
      input.outOfScope?.detail ?? null,
      now,
      input.sufficient,
      input.readyStatus,
    ],
  );
}

/** Update routes / outstanding facts without changing case status. */
export async function updateCaseRoutes(
  id: string,
  input: {
    primaryRoute: RouteFamily | null;
    secondaryRoutes: RouteFamily[];
    missingFacts: string[];
    pofaRoute?: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await q(
    `UPDATE appeal_cases
        SET primary_route = $2,
            secondary_routes = $3,
            candidate_routes = $4,
            missing_facts = $5,
            pofa_route = COALESCE($6, pofa_route),
            out_of_scope_detail = NULL,
            updated_at = $7
      WHERE id = $1`,
    [
      id,
      input.primaryRoute,
      JSON.stringify(input.secondaryRoutes),
      JSON.stringify(
        [
          ...(input.primaryRoute ? [input.primaryRoute] : []),
          ...input.secondaryRoutes,
        ],
      ),
      JSON.stringify(input.missingFacts),
      input.pofaRoute ?? null,
      now,
    ],
  );
}

/* ----------------------------- Case facts ----------------------------- */

/**
 * Record a provenanced fact. The unique key is (case_id, field, source)
 * so a document value and a customer correction coexist rather than one
 * silently overwriting the other (V2 Part 11 auditability).
 */
export async function upsertCaseFact(input: {
  caseId: string;
  field: string;
  value: unknown;
  source: "document" | "customer" | "system" | "admin";
  documentId?: string | null;
  confidence?: number | null;
  customerConfirmed?: boolean;
}): Promise<void> {
  await q(
    `INSERT INTO case_facts
       (id, case_id, field, value_json, source, document_id, confidence, customer_confirmed, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (case_id, field, source) DO UPDATE SET
       value_json = EXCLUDED.value_json,
       document_id = EXCLUDED.document_id,
       confidence = EXCLUDED.confidence,
       customer_confirmed = EXCLUDED.customer_confirmed,
       updated_at = EXCLUDED.updated_at`,
    [
      genId("fact"),
      input.caseId,
      input.field,
      JSON.stringify(input.value ?? null),
      input.source,
      input.documentId ?? null,
      input.confidence ?? null,
      input.customerConfirmed ?? false,
      new Date().toISOString(),
    ],
  );
}

export async function listCaseFacts(caseId: string): Promise<
  Array<{
    field: string;
    value: unknown;
    source: string;
    confidence: number | null;
    customerConfirmed: boolean;
    updatedAt: string;
  }>
> {
  const rows = await q(
    `SELECT field, value_json, source, confidence, customer_confirmed, updated_at
       FROM case_facts WHERE case_id = $1 ORDER BY field, source`,
    [caseId],
  );
  return rows.map((r) => ({
    field: r.field as string,
    value: r.value_json,
    source: r.source as string,
    confidence: r.confidence === null ? null : Number(r.confidence),
    customerConfirmed: Boolean(r.customer_confirmed),
    updatedAt: r.updated_at as string,
  }));
}

/* ---------------------------- Case answers ---------------------------- */

/** One row per question answered, for the audit trail. */
export async function recordCaseAnswer(input: {
  caseId: string;
  questionId: string;
  answer: unknown;
}): Promise<void> {
  await q(
    `INSERT INTO case_answers (id, case_id, question_id, answer_json, created_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (case_id, question_id) DO UPDATE SET
       answer_json = EXCLUDED.answer_json,
       created_at = EXCLUDED.created_at`,
    [
      genId("ans"),
      input.caseId,
      input.questionId,
      JSON.stringify(input.answer ?? null),
      new Date().toISOString(),
    ],
  );
}

export async function listCaseAnswers(
  caseId: string,
): Promise<Array<{ questionId: string; answer: unknown; createdAt: string }>> {
  const rows = await q(
    `SELECT question_id, answer_json, created_at FROM case_answers
      WHERE case_id = $1 ORDER BY created_at`,
    [caseId],
  );
  return rows.map((r) => ({
    questionId: r.question_id as string,
    answer: r.answer_json,
    createdAt: r.created_at as string,
  }));
}

/* --------------------------- Case documents --------------------------- */

function rowToDocument(r: Row): CaseDocument {
  return {
    id: r.id as string,
    caseId: r.case_id as string,
    documentType: r.document_type as CaseDocument["documentType"],
    evidenceType: (r.evidence_type as string | null) ?? null,
    storageKey: r.storage_key as string,
    storageProvider: (r.storage_provider as string) ?? "memory",
    fileName: r.file_name as string,
    mimeType: r.mime_type as string,
    sizeBytes: Number(r.size_bytes ?? 0),
    sha256: (r.sha256 as string | null) ?? null,
    sourceDraftId: (r.source_draft_id as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    uploadedAt: r.uploaded_at as string,
    uploadedBy: r.uploaded_by as string,
  };
}

export async function addCaseDocument(input: {
  caseId: string;
  documentType: CaseDocument["documentType"];
  evidenceType?: string | null;
  storageKey: string;
  storageProvider?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  description?: string | null;
  uploadedBy: string;
  sha256?: string | null;
  sourceDraftId?: string | null;
}): Promise<CaseDocument> {
  const id = genId("doc");
  await q(
    `INSERT INTO case_documents_meta
       (id, case_id, document_type, evidence_type, storage_key, storage_provider,
        file_name, mime_type, size_bytes, description, sha256, uploaded_at,
        uploaded_by, source_draft_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      id,
      input.caseId,
      input.documentType,
      input.evidenceType ?? null,
      input.storageKey,
      input.storageProvider ?? "memory",
      input.fileName,
      input.mimeType,
      input.sizeBytes,
      input.description ?? null,
      input.sha256 ?? null,
      new Date().toISOString(),
      input.uploadedBy,
      input.sourceDraftId ?? null,
    ],
  );
  const rows = await q(`SELECT * FROM case_documents_meta WHERE id = $1`, [id]);
  return rowToDocument(rows[0]);
}

export async function listCaseDocuments(
  caseId: string,
  documentType?: CaseDocument["documentType"],
): Promise<CaseDocument[]> {
  const rows = documentType
    ? await q(
        `SELECT * FROM case_documents_meta
          WHERE case_id = $1 AND document_type = $2 AND deleted_at IS NULL
          ORDER BY uploaded_at`,
        [caseId, documentType],
      )
    : await q(
        `SELECT * FROM case_documents_meta
          WHERE case_id = $1 AND deleted_at IS NULL ORDER BY uploaded_at`,
        [caseId],
      );
  return rows.map(rowToDocument);
}

export async function findCaseDocument(
  id: string,
): Promise<CaseDocument | null> {
  const rows = await q(
    `SELECT * FROM case_documents_meta WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [id],
  );
  return rows[0] ? rowToDocument(rows[0]) : null;
}

/** Soft delete so the audit trail survives. */
export async function softDeleteCaseDocument(id: string): Promise<void> {
  await q(`UPDATE case_documents_meta SET deleted_at = $2 WHERE id = $1`, [
    id,
    new Date().toISOString(),
  ]);
}

/* ----------------------------- Case events ----------------------------- */

export async function addCaseEvent(input: {
  caseId: string;
  eventType: string;
  payload?: Record<string, unknown>;
  actorId?: string | null;
}): Promise<void> {
  await q(
    `INSERT INTO case_events (id, case_id, event_type, payload, actor_id, created_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      genId("evt"),
      input.caseId,
      input.eventType,
      input.payload ? JSON.stringify(input.payload) : null,
      input.actorId ?? null,
      new Date().toISOString(),
    ],
  );
}

/**
 * Most recent events across every case — the admin dashboard's "recent
 * activity" feed. Mirrors the customer-safe projection in
 * `lib/portal/overview.ts` (label allowlist over `case_events`), but
 * admin sees the fuller admin-facing set rather than the customer subset.
 */
export async function listRecentCaseEvents(
  limit = 20,
): Promise<
  Array<{ id: string; caseId: string; casePublicId: string; eventType: string; createdAt: string }>
> {
  const rows = await q(
    `SELECT ce.id, ce.case_id, ce.event_type, ce.created_at, ac.public_id
       FROM case_events ce
       JOIN appeal_cases ac ON ac.id = ce.case_id
      ORDER BY ce.created_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id as string,
    caseId: r.case_id as string,
    casePublicId: r.public_id as string,
    eventType: r.event_type as string,
    createdAt: r.created_at as string,
  }));
}

export async function listCaseEvents(
  caseId: string,
): Promise<Array<{ id: string; eventType: string; payload: unknown; createdAt: string }>> {
  const rows = await q(
    `SELECT id, event_type, payload, created_at FROM case_events
      WHERE case_id = $1 ORDER BY created_at`,
    [caseId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    eventType: r.event_type as string,
    payload: r.payload,
    createdAt: r.created_at as string,
  }));
}
