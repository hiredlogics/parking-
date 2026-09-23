/**
 * Live AI provider/model configuration — the DB-backed replacement for
 * the process-local, non-persisted override Map in services/ai/models.ts.
 *
 * `fallback_model` is a transport-failure-only fallback (see
 * services/ai/transport.ts / lib/ai/modelConfig.ts): it is tried once,
 * after the primary model has exhausted its retry budget on a transport
 * error, and is NEVER consulted for a content or validation disagreement.
 */
export const AI_CONFIG_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS ai_model_config (
    operation      TEXT PRIMARY KEY,
    model          TEXT NOT NULL,
    fallback_model TEXT,
    status         TEXT NOT NULL DEFAULT 'ACTIVE',
    notes          TEXT,
    updated_by     TEXT,
    version        INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  )`,
];
