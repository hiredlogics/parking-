import { getSql } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";
import type { CasePayment, PaymentStatus } from "./types";

/**
 * Payment persistence.
 *
 * `appeal_cases.payment_status` is kept in step with the payment row so
 * the entitlement guard can answer from a single column, but the
 * `case_payments` row remains the detailed record.
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

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function rowToPayment(r: Row): CasePayment {
  return {
    id: r.id as string,
    caseId: r.case_id as string,
    provider: r.provider as string,
    status: r.status as PaymentStatus,
    amount: Number(r.amount),
    currency: (r.currency as string) ?? "GBP",
    description: (r.description as string | null) ?? null,
    providerSessionId: (r.provider_session_id as string | null) ?? null,
    providerPaymentIntent: (r.provider_payment_intent as string | null) ?? null,
    providerCustomerId: (r.provider_customer_id as string | null) ?? null,
    checkoutUrl: (r.checkout_url as string | null) ?? null,
    failureReason: (r.failure_reason as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    paidAt: (r.paid_at as string | null) ?? null,
    failedAt: (r.failed_at as string | null) ?? null,
    refundedAt: (r.refunded_at as string | null) ?? null,
  };
}

/** Latest payment attempt for a case. */
export async function findPaymentForCase(
  caseId: string,
): Promise<CasePayment | null> {
  const rows = await q(
    `SELECT * FROM case_payments WHERE case_id = $1
      ORDER BY created_at DESC LIMIT 1`,
    [caseId],
  );
  return rows[0] ? rowToPayment(rows[0]) : null;
}

/** A settled payment for a case, if one exists. */
export async function findPaidPaymentForCase(
  caseId: string,
): Promise<CasePayment | null> {
  const rows = await q(
    `SELECT * FROM case_payments WHERE case_id = $1 AND status = 'PAID'
      ORDER BY paid_at DESC LIMIT 1`,
    [caseId],
  );
  return rows[0] ? rowToPayment(rows[0]) : null;
}

export async function findPaymentBySession(
  providerSessionId: string,
): Promise<CasePayment | null> {
  const rows = await q(
    `SELECT * FROM case_payments WHERE provider_session_id = $1 LIMIT 1`,
    [providerSessionId],
  );
  return rows[0] ? rowToPayment(rows[0]) : null;
}

export async function createPayment(input: {
  caseId: string;
  provider: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  description?: string | null;
  providerSessionId?: string | null;
  checkoutUrl?: string | null;
}): Promise<CasePayment> {
  const id = genId("pay");
  const now = new Date().toISOString();
  await q(
    `INSERT INTO case_payments
       (id, case_id, provider, status, amount, currency, description,
        provider_session_id, checkout_url, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
    [
      id,
      input.caseId,
      input.provider,
      input.status,
      input.amount,
      input.currency,
      input.description ?? null,
      input.providerSessionId ?? null,
      input.checkoutUrl ?? null,
      now,
    ],
  );
  await syncCasePaymentStatus(input.caseId, input.status);
  const rows = await q(`SELECT * FROM case_payments WHERE id = $1`, [id]);
  return rowToPayment(rows[0]);
}

/**
 * Move a payment to a new state and mirror it onto the case.
 *
 * Guard rails:
 *   - PAID is terminal-positive: once settled it is never downgraded by
 *     a late or out-of-order provider event.
 *   - A refund is allowed to move PAID → REFUNDED.
 */
export async function updatePaymentStatus(
  paymentId: string,
  status: PaymentStatus,
  extra: {
    providerPaymentIntent?: string | null;
    providerCustomerId?: string | null;
    failureReason?: string | null;
  } = {},
): Promise<CasePayment | null> {
  const now = new Date().toISOString();
  await q(
    `UPDATE case_payments
        SET status = CASE
              WHEN status = 'PAID' AND $2 <> 'REFUNDED' THEN status
              ELSE $2 END,
            provider_payment_intent = COALESCE($3, provider_payment_intent),
            provider_customer_id = COALESCE($4, provider_customer_id),
            failure_reason = COALESCE($5, failure_reason),
            paid_at = CASE WHEN $2 = 'PAID' AND paid_at IS NULL THEN $6 ELSE paid_at END,
            failed_at = CASE WHEN $2 = 'FAILED' THEN $6 ELSE failed_at END,
            refunded_at = CASE WHEN $2 = 'REFUNDED' THEN $6 ELSE refunded_at END,
            updated_at = $6
      WHERE id = $1`,
    [
      paymentId,
      status,
      extra.providerPaymentIntent ?? null,
      extra.providerCustomerId ?? null,
      extra.failureReason ?? null,
      now,
    ],
  );
  const rows = await q(`SELECT * FROM case_payments WHERE id = $1`, [paymentId]);
  if (!rows[0]) return null;
  const payment = rowToPayment(rows[0]);
  await syncCasePaymentStatus(payment.caseId, payment.status);
  return payment;
}

/**
 * Mirror payment state onto the case, and unlock the appeal when paid.
 *
 * `appeal_locked` is the flag the document layer reads, so it is only
 * ever cleared here — never from a client-supplied value.
 */
export async function syncCasePaymentStatus(
  caseId: string,
  status: PaymentStatus,
): Promise<void> {
  const now = new Date().toISOString();
  await q(
    `UPDATE appeal_cases
        SET payment_status = CASE
              WHEN payment_status = 'PAID' AND $2 <> 'REFUNDED' THEN payment_status
              ELSE $2 END,
            appeal_locked = CASE WHEN $2 = 'PAID' THEN FALSE ELSE appeal_locked END,
            status = CASE
              WHEN $2 = 'PAID' AND status = 'AWAITING_PAYMENT' THEN 'PAID'
              ELSE status END,
            updated_at = $3
      WHERE id = $1`,
    [caseId, status, now],
  );
}

/* ------------------------- Webhook idempotency ------------------------- */

/**
 * Claim a webhook event for processing.
 *
 * Returns false when the event id has been seen before, which makes
 * re-delivery a no-op. The insert itself is the lock, so two concurrent
 * deliveries cannot both proceed.
 */
export async function claimWebhookEvent(input: {
  eventId: string;
  provider: string;
  eventType: string;
  caseId?: string | null;
  payload?: unknown;
}): Promise<boolean> {
  const rows = await q(
    `INSERT INTO payment_webhook_events
       (id, provider, event_type, case_id, payload, received_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [
      input.eventId,
      input.provider,
      input.eventType,
      input.caseId ?? null,
      input.payload ? JSON.stringify(input.payload) : null,
      new Date().toISOString(),
    ],
  );
  return rows.length > 0;
}

export async function completeWebhookEvent(
  eventId: string,
  result: string,
): Promise<void> {
  await q(
    `UPDATE payment_webhook_events
        SET result = $2, processed_at = $3 WHERE id = $1`,
    [eventId, result, new Date().toISOString()],
  );
}

export async function wasWebhookProcessed(eventId: string): Promise<boolean> {
  const rows = await q(
    `SELECT id FROM payment_webhook_events WHERE id = $1 LIMIT 1`,
    [eventId],
  );
  return rows.length > 0;
}
