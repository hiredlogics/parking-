/**
 * Purchase consent persistence.
 *
 * Consent is evidence, so this module only ever appends. A later Terms
 * version cannot rewrite an earlier record: `terms_version` is stored as
 * given and the wording is resolved from the immutable module it names.
 */
import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";
import type {
  ConsentAuditMeta,
  ConsentInput,
  PurchaseConsentRecord,
} from "./types";

type Row = Record<string, unknown>;

async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  await ensureSchema();
  const sql = getSql();
  const res = (await sql.query(text, params)) as unknown as
    | { rows?: Row[] }
    | Row[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}

function rowToConsent(r: Row): PurchaseConsentRecord {
  return {
    id: r.id as string,
    caseId: r.case_id as string,
    customerId: r.customer_id as string,
    serviceType: r.service_type as string,
    termsVersion: r.terms_version as string,
    privacyPolicyVersion: r.privacy_policy_version as string,
    informationAccuracyConfirmed: Boolean(r.information_accuracy_confirmed),
    termsPrivacyAccepted: Boolean(r.terms_privacy_accepted),
    immediateSupplyConsent: Boolean(r.immediate_supply_consent),
    cancellationRightAcknowledged: Boolean(r.cancellation_right_acknowledged),
    acceptedAt: r.accepted_at as string,
    paymentId: (r.payment_id as string | null) ?? null,
    providerSessionId: (r.provider_session_id as string | null) ?? null,
    ipAddress: (r.ip_address as string | null) ?? null,
    userAgent: (r.user_agent as string | null) ?? null,
    withdrawnAt: (r.withdrawn_at as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

export async function recordPurchaseConsent(input: {
  caseId: string;
  customerId: string;
  serviceType: string;
  termsVersion: string;
  privacyPolicyVersion: string;
  consent: ConsentInput;
  audit?: ConsentAuditMeta;
}): Promise<PurchaseConsentRecord> {
  const id = `csnt_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const now = new Date().toISOString();

  /*
   * The acknowledgement is stored as its own column because section 16
   * treats it as a distinct statement, but it is derived from the third
   * checkbox rather than collected separately — the supplied wording
   * combines the consent and the acknowledgement in one sentence.
   */
  const rows = await q(
    `INSERT INTO purchase_consents (
       id, case_id, customer_id, service_type,
       terms_version, privacy_policy_version,
       information_accuracy_confirmed, terms_privacy_accepted,
       immediate_supply_consent, cancellation_right_acknowledged,
       accepted_at, ip_address, user_agent, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$11)
     RETURNING *`,
    [
      id,
      input.caseId,
      input.customerId,
      input.serviceType,
      input.termsVersion,
      input.privacyPolicyVersion,
      input.consent.informationAccuracyConfirmed,
      input.consent.termsPrivacyAccepted,
      input.consent.immediateSupplyConsent,
      input.consent.immediateSupplyConsent,
      now,
      input.audit?.ipAddress ?? null,
      input.audit?.userAgent ?? null,
    ],
  );
  return rowToConsent(rows[0]!);
}

/**
 * The consent a purchase may rely on: all three given, not withdrawn.
 *
 * Most recent first, so a re-consent after a withdrawal is the one that
 * counts while the withdrawn row stays on the record.
 */
export async function findUsableConsentForCase(
  caseId: string,
): Promise<PurchaseConsentRecord | null> {
  const rows = await q(
    `SELECT * FROM purchase_consents
      WHERE case_id = $1
        AND withdrawn_at IS NULL
        AND information_accuracy_confirmed = TRUE
        AND terms_privacy_accepted = TRUE
        AND immediate_supply_consent = TRUE
      ORDER BY accepted_at DESC
      LIMIT 1`,
    [caseId],
  );
  return rows[0] ? rowToConsent(rows[0]) : null;
}

/** Every consent recorded against a case, for audit and admin views. */
export async function listConsentsForCase(
  caseId: string,
): Promise<PurchaseConsentRecord[]> {
  const rows = await q(
    `SELECT * FROM purchase_consents WHERE case_id = $1 ORDER BY accepted_at DESC`,
    [caseId],
  );
  return rows.map(rowToConsent);
}

/**
 * Attach the payment reference once checkout has produced one.
 *
 * Only ever fills a blank: a consent already tied to a payment must not
 * be re-pointed at a different one.
 */
export async function attachPaymentToConsent(input: {
  consentId: string;
  paymentId?: string | null;
  providerSessionId?: string | null;
}): Promise<void> {
  await q(
    `UPDATE purchase_consents
        SET payment_id = COALESCE(payment_id, $2),
            provider_session_id = COALESCE(provider_session_id, $3)
      WHERE id = $1`,
    [input.consentId, input.paymentId ?? null, input.providerSessionId ?? null],
  );
}
