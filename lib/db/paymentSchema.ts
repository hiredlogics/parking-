/**
 * P0-c — case payment state (additive).
 *
 * Payment state is authoritative in PostgreSQL. The frontend never
 * asserts that payment succeeded; only a provider-verified event or an
 * explicit provider query may move a case to PAID.
 *
 * `payment_webhook_events` gives idempotent webhook processing: the
 * provider's own event id is the primary key, so a re-delivery is a
 * no-op.
 */
export const PAYMENT_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS case_payments (
    id                       TEXT PRIMARY KEY,
    case_id                  TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
    provider                 TEXT NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'PENDING',
    amount                   NUMERIC NOT NULL,
    currency                 TEXT NOT NULL DEFAULT 'GBP',
    description              TEXT,
    /* Provider references. Null for the demo provider. */
    provider_session_id      TEXT,
    provider_payment_intent  TEXT,
    provider_customer_id     TEXT,
    checkout_url             TEXT,
    failure_reason           TEXT,
    created_at               TEXT NOT NULL,
    updated_at               TEXT NOT NULL,
    paid_at                  TEXT,
    failed_at                TEXT,
    refunded_at              TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS case_payments_case_idx ON case_payments (case_id)`,
  `CREATE INDEX IF NOT EXISTS case_payments_status_idx ON case_payments (status)`,
  /* One provider session maps to exactly one payment row. */
  `CREATE UNIQUE INDEX IF NOT EXISTS case_payments_session_idx
     ON case_payments (provider_session_id)
     WHERE provider_session_id IS NOT NULL`,

  `CREATE TABLE IF NOT EXISTS payment_webhook_events (
    /* The provider's event id — makes re-delivery idempotent. */
    id           TEXT PRIMARY KEY,
    provider     TEXT NOT NULL,
    event_type   TEXT NOT NULL,
    case_id      TEXT,
    payload      JSONB,
    result       TEXT,
    received_at  TEXT NOT NULL,
    processed_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS payment_webhook_events_case_idx ON payment_webhook_events (case_id)`,
];
