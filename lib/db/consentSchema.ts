/**
 * Purchase consent records.
 *
 * Terms section 16 requires that a Self-Service customer actively
 * confirms three things before payment, and that the site retains a
 * record of the version of the Terms accepted and the consent given at
 * the time of purchase. That record is evidence, so it is written
 * server-side, it is append-only in practice, and it stores the version
 * identifiers rather than the wording — the wording is resolved from the
 * immutable version module those identifiers name.
 *
 * `withdrawn_at` exists so a consent can be marked as no longer relied
 * upon without deleting the historical fact that it was given.
 */
export const CONSENT_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS purchase_consents (
    id                             TEXT PRIMARY KEY,
    case_id                        TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
    customer_id                    TEXT NOT NULL,
    /* The product the consent was given for, e.g. PRIVATE_PARKING_INITIAL_APPEAL. */
    service_type                   TEXT NOT NULL,
    /* Version identifiers, resolved against lib/legal/registry.ts. */
    terms_version                  TEXT NOT NULL,
    privacy_policy_version         TEXT NOT NULL,
    /* The three mandatory confirmations. Never defaulted to true. */
    information_accuracy_confirmed BOOLEAN NOT NULL,
    terms_privacy_accepted         BOOLEAN NOT NULL,
    immediate_supply_consent       BOOLEAN NOT NULL,
    /* Recorded separately because the statutory consequence is distinct
       from the consent that triggers it (Terms section 16). */
    cancellation_right_acknowledged BOOLEAN NOT NULL,
    accepted_at                    TEXT NOT NULL,
    /* Payment/order reference, filled once checkout produces one. */
    payment_id                     TEXT,
    provider_session_id            TEXT,
    /* Technical audit metadata. */
    ip_address                     TEXT,
    user_agent                     TEXT,
    withdrawn_at                   TEXT,
    created_at                     TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS purchase_consents_case_idx
     ON purchase_consents (case_id)`,
  `CREATE INDEX IF NOT EXISTS purchase_consents_customer_idx
     ON purchase_consents (customer_id)`,
  `CREATE INDEX IF NOT EXISTS purchase_consents_terms_idx
     ON purchase_consents (terms_version)`,
];
