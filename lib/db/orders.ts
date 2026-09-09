import { getSql } from "./pool";
import { ensureSchema } from "./schema";
import type { AllAnswers, ConfirmedPcn, EvidenceItem } from "@/types";

/**
 * Server-side order record. Owns the payment / document / email state
 * that gates access to the clean appeal.
 *
 * `inputSnapshot` is the JSON payload used to regenerate the appeal PDF
 * server-side. It is never returned to the browser — only the metadata
 * fields are safe to expose.
 */
export type OrderPaymentStatus = "PENDING" | "PAID" | "REFUNDED" | "FAILED";
export type OrderDocumentStatus = "LOCKED" | "UNLOCKED";
export type OrderEmailStatus = "PENDING" | "SENT" | "SKIPPED" | "FAILED";
export type OrderAppealStatus = "GENERATED" | "COMPLETED";

export interface OrderInputSnapshot {
  pcn: ConfirmedPcn;
  answers: AllAnswers;
  evidence: EvidenceItem[];
}

export interface OrderRow {
  id: string;
  clientId: string;
  customerEmail: string;
  customerName: string;
  pcnNumber: string | null;
  vrm: string | null;
  operator: string | null;
  amount: number;
  currency: string;
  paymentStatus: OrderPaymentStatus;
  documentStatus: OrderDocumentStatus;
  emailStatus: OrderEmailStatus;
  appealStatus: OrderAppealStatus;
  provider: string;
  paymentReference: string | null;
  inputSnapshot: OrderInputSnapshot;
  groundCount: number;
  evidenceCount: number;
  appealId: string | null;
  caseId: string | null;
  createdAt: string;
  paidAt: string | null;
  emailedAt: string | null;
}

type Row = Record<string, unknown>;

async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  await ensureSchema();
  const sql = getSql();
  const res = (await sql.query(text, params)) as unknown as { rows?: Row[] } | Row[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}

function rowToOrder(r: Row): OrderRow {
  return {
    id: r.id as string,
    clientId: r.client_id as string,
    customerEmail: r.customer_email as string,
    customerName: r.customer_name as string,
    pcnNumber: (r.pcn_number as string | null) ?? null,
    vrm: (r.vrm as string | null) ?? null,
    operator: (r.operator as string | null) ?? null,
    amount: Number(r.amount),
    currency: (r.currency as string) ?? "GBP",
    paymentStatus: r.payment_status as OrderPaymentStatus,
    documentStatus: r.document_status as OrderDocumentStatus,
    emailStatus: r.email_status as OrderEmailStatus,
    appealStatus: r.appeal_status as OrderAppealStatus,
    provider: (r.provider as string) ?? "demo",
    paymentReference: (r.payment_reference as string | null) ?? null,
    inputSnapshot: r.input_snapshot as OrderInputSnapshot,
    groundCount: Number(r.ground_count ?? 0),
    evidenceCount: Number(r.evidence_count ?? 0),
    appealId: (r.appeal_id as string | null) ?? null,
    caseId: (r.case_id as string | null) ?? null,
    createdAt: r.created_at as string,
    paidAt: (r.paid_at as string | null) ?? null,
    emailedAt: (r.emailed_at as string | null) ?? null,
  };
}

export async function createOrder(input: {
  id: string;
  clientId: string;
  customerEmail: string;
  customerName: string;
  pcnNumber?: string | null;
  vrm?: string | null;
  operator?: string | null;
  amount: number;
  currency?: string;
  inputSnapshot: OrderInputSnapshot;
  groundCount: number;
  evidenceCount: number;
}): Promise<OrderRow> {
  const now = new Date().toISOString();
  await q(
    `INSERT INTO orders (
       id, client_id, customer_email, customer_name, pcn_number, vrm, operator,
       amount, currency, payment_status, document_status, email_status, appeal_status,
       provider, input_snapshot, ground_count, evidence_count, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING','LOCKED','PENDING','GENERATED','demo',$10,$11,$12,$13)`,
    [
      input.id,
      input.clientId,
      input.customerEmail,
      input.customerName,
      input.pcnNumber ?? null,
      input.vrm ?? null,
      input.operator ?? null,
      input.amount,
      input.currency ?? "GBP",
      JSON.stringify(input.inputSnapshot),
      input.groundCount,
      input.evidenceCount,
      now,
    ],
  );
  const rows = await q(`SELECT * FROM orders WHERE id = $1 LIMIT 1`, [input.id]);
  return rowToOrder(rows[0]);
}

export async function findOrder(id: string): Promise<OrderRow | null> {
  const rows = await q(`SELECT * FROM orders WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] ? rowToOrder(rows[0]) : null;
}

export async function findOrdersForClient(clientId: string): Promise<OrderRow[]> {
  const rows = await q(
    `SELECT * FROM orders WHERE client_id = $1 ORDER BY created_at DESC`,
    [clientId],
  );
  return rows.map(rowToOrder);
}

export async function markOrderPaid(
  id: string,
  info: { paymentReference: string; appealId?: string; caseId?: string },
): Promise<OrderRow | null> {
  const now = new Date().toISOString();
  await q(
    `UPDATE orders
       SET payment_status = 'PAID',
           document_status = 'UNLOCKED',
           appeal_status = 'COMPLETED',
           payment_reference = $2,
           appeal_id = COALESCE($3, appeal_id),
           case_id = COALESCE($4, case_id),
           paid_at = $5
     WHERE id = $1 AND payment_status <> 'PAID'`,
    [id, info.paymentReference, info.appealId ?? null, info.caseId ?? null, now],
  );
  return findOrder(id);
}

export async function markOrderEmailed(
  id: string,
  status: OrderEmailStatus,
): Promise<void> {
  const now = new Date().toISOString();
  await q(
    `UPDATE orders SET email_status = $2, emailed_at = $3 WHERE id = $1`,
    [id, status, status === "SENT" ? now : null],
  );
}
