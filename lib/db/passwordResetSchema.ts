/**
 * Password-reset tokens for customer accounts.
 *
 * Always applied even when the main schema sentinel short-circuits,
 * so existing local DBs pick up the table without a full rebuild.
 */

export const PASSWORD_RESET_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          TEXT PRIMARY KEY,
    client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TEXT NOT NULL,
    used_at     TEXT,
    created_at  TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS password_reset_tokens_client_idx
     ON password_reset_tokens (client_id)`,
];
