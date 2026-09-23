/**
 * Rule graph DDL — the Admin-managed decision model.
 *
 * This is the schema that lets business and legal behaviour be
 * configuration rather than TypeScript. Before it, `appeal_rules` stored
 * a rule's *metadata* while its `test` predicate stayed in
 * `rules/rules.ts`, so an admin could rename or disable a rule but never
 * change when it applies. These columns hold the applicability itself,
 * as condition trees evaluated by `lib/rules/conditions.ts`.
 *
 *   SERVICE → ISSUE → required facts → knowledge → drafting/validation
 *
 * Additive and idempotent throughout. Nothing here drops or rewrites an
 * existing column, and an untouched database behaves exactly as before
 * until rows are populated.
 *
 * History is never destroyed: an edit writes a new version and archives
 * the previous snapshot into `issue_revisions`, mirroring how
 * `kb_module_revisions` already works for knowledge.
 */
export const RULE_GRAPH_STATEMENTS: string[] = [
  /* ------------------------------------------------------------------ */
  /* Fact registry                                                       */
  /* ------------------------------------------------------------------ */
  /*
   * The 70 fact keys currently live as a frozen `FACT` object in
   * lib/questions/facts.ts, with their labels, allowed answers and
   * question wording spread across requirements.ts and the question
   * bank. This table is the single description of a fact, so adding one
   * is a row rather than an edit in four files.
   *
   * `normalisation_json` maps what a customer may answer onto the
   * canonical stored value (e.g. "yeah" → "YES"), which is what stops
   * free-text answers from silently failing an `eq` condition.
   */
  `CREATE TABLE IF NOT EXISTS case_facts_registry (
    fact_key            TEXT PRIMARY KEY,
    label               TEXT NOT NULL,
    /* STRING | ENUM | BOOLEAN | NUMBER | DATE | TIME | MULTI_ENUM */
    value_type          TEXT NOT NULL DEFAULT 'STRING',
    allowed_values      JSONB NOT NULL DEFAULT '[]',
    normalisation_json  JSONB NOT NULL DEFAULT '{}',
    /* Evidence types that establish this fact without asking. */
    evidence_types      JSONB NOT NULL DEFAULT '[]',
    /* Guidance for the question writer. Never the question itself. */
    question_guidance   TEXT,
    /*
     * Keeper safety is not negotiable: a fact flagged here may never be
     * turned into a question that invites the customer to identify the
     * driver, whatever an admin configures.
     */
    driver_identifying  BOOLEAN NOT NULL DEFAULT FALSE,
    /* Derived from the notice / evidence rather than asked. */
    source              TEXT NOT NULL DEFAULT 'ANSWER',
    status              TEXT NOT NULL DEFAULT 'ACTIVE',
    notes               TEXT,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS case_facts_registry_status_idx
     ON case_facts_registry (status)`,

  /* ------------------------------------------------------------------ */
  /* Issue applicability                                                 */
  /* ------------------------------------------------------------------ */
  /*
   * `trigger_tags` remains for the tag matching already configured, but
   * it cannot express "postal notice issued more than 14 days after the
   * event" or "unless the customer named different circumstances".
   * These two columns can, and take precedence when populated.
   */
  `ALTER TABLE issues ADD COLUMN IF NOT EXISTS applicability_json JSONB`,
  `ALTER TABLE issues ADD COLUMN IF NOT EXISTS exclusion_json JSONB`,
  /* Guidance handed to the drafter when this issue is active. */
  `ALTER TABLE issues ADD COLUMN IF NOT EXISTS drafting_instruction TEXT`,
  /* Validator codes this issue must satisfy before release. */
  `ALTER TABLE issues ADD COLUMN IF NOT EXISTS validation_json JSONB NOT NULL DEFAULT '[]'`,
  /* Knowledge refs cited when substantiating this issue. */
  `ALTER TABLE issues ADD COLUMN IF NOT EXISTS effective_from TEXT`,
  `ALTER TABLE issues ADD COLUMN IF NOT EXISTS effective_to TEXT`,
  `ALTER TABLE issues ADD COLUMN IF NOT EXISTS supersedes_version INTEGER`,
  `ALTER TABLE issues ADD COLUMN IF NOT EXISTS created_by TEXT`,
  `ALTER TABLE issues ADD COLUMN IF NOT EXISTS change_note TEXT`,
  /*
   * Per-issue numeric/text parameters an admin may tune without a
   * TypeScript change — e.g. the POFA issue's statutory day counts.
   * Generic date/working-day arithmetic itself stays in code (see
   * lib/analysis/pofa.ts): a boundary-tolerance or bank-holiday bug is a
   * safety property, not something an admin edit should be able to
   * relax by accident. The *thresholds* fed into that arithmetic are
   * config, because a statute can be amended.
   */
  `ALTER TABLE issues ADD COLUMN IF NOT EXISTS config_json JSONB NOT NULL DEFAULT '{}'`,

  /* ------------------------------------------------------------------ */
  /* Fact defaults — controlled assumptions, never silent facts          */
  /* ------------------------------------------------------------------ */
  /*
   * "Registered keeper, driver not identified" is the product default
   * so the journey does not ask about it when nothing on the notice or
   * in the answers contradicts it. That must never be indistinguishable
   * from a fact the document or the customer actually established, so
   * every default row carries its own provenance and every fact it
   * produces is tagged SYSTEM_SAFE_DEFAULT — never DOCUMENT or ANSWER —
   * in the working facts the engine evaluates.
   *
   * Applying a default is provisional, not a claim: if a real answer or
   * a document value later contradicts it, that value wins and the
   * default is dropped for that case.
   */
  `CREATE TABLE IF NOT EXISTS fact_defaults (
    id             TEXT PRIMARY KEY,
    service_id     TEXT REFERENCES services(id) ON DELETE CASCADE,
    fact_key       TEXT NOT NULL,
    /* Condition under which the default applies. NULL = always. */
    condition_json JSONB,
    default_value  JSONB NOT NULL,
    reason_code    TEXT NOT NULL DEFAULT 'SYSTEM_SAFE_DEFAULT',
    priority       INTEGER NOT NULL DEFAULT 100,
    status         TEXT NOT NULL DEFAULT 'ACTIVE',
    version        INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS fact_defaults_fact_idx
     ON fact_defaults (fact_key, status)`,

  /* Non-destructive history for every issue edit. */
  `CREATE TABLE IF NOT EXISTS issue_revisions (
    id            BIGSERIAL PRIMARY KEY,
    issue_id      TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    version       INTEGER NOT NULL,
    snapshot_json JSONB NOT NULL,
    archived_at   TEXT NOT NULL,
    archived_by   TEXT,
    change_note   TEXT,
    UNIQUE (issue_id, version)
  )`,
  `CREATE INDEX IF NOT EXISTS issue_revisions_issue_idx
     ON issue_revisions (issue_id, version DESC)`,

  /* ------------------------------------------------------------------ */
  /* Required facts                                                      */
  /* ------------------------------------------------------------------ */
  /*
   * `required_when` already existed and was never read — the engine had
   * the per-fact skip logic hard-coded instead (jurisdiction already
   * derivable, permission source pointless when no permission was held,
   * and so on). Those become conditions here.
   *
   * `optional` separates "the appeal cannot be made without this" from
   * "this strengthens it": only the former may hold up a journey.
   */
  `ALTER TABLE issue_required_facts ADD COLUMN IF NOT EXISTS optional BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE issue_required_facts ADD COLUMN IF NOT EXISTS skip_when JSONB`,

  /* ------------------------------------------------------------------ */
  /* Knowledge applicability                                             */
  /* ------------------------------------------------------------------ */
  /*
   * `kb_modules.use_when` / `do_not_use_when` are prose for the drafter.
   * `lib/retrieval/gates.ts` then re-encodes the same contract as ~50
   * TypeScript predicates — the comment there says so outright. These
   * columns hold the machine-readable form so the prose and the gate
   * cannot drift apart, and so a new module is retrievable without a
   * deploy.
   */
  `ALTER TABLE kb_modules ADD COLUMN IF NOT EXISTS applicability_json JSONB`,
  `ALTER TABLE kb_modules ADD COLUMN IF NOT EXISTS exclusion_json JSONB`,
  `ALTER TABLE kb_modules ADD COLUMN IF NOT EXISTS jurisdiction TEXT NOT NULL DEFAULT 'ENGLAND_WALES'`,
  `ALTER TABLE kb_modules ADD COLUMN IF NOT EXISTS authority_level TEXT`,
  `ALTER TABLE kb_modules ADD COLUMN IF NOT EXISTS ata_applicability TEXT NOT NULL DEFAULT 'ALL'`,

  /* Individual approved paragraphs that assert a specific fact. */
  `ALTER TABLE drafting_blocks ADD COLUMN IF NOT EXISTS applicability_json JSONB`,
  `ALTER TABLE drafting_blocks ADD COLUMN IF NOT EXISTS exclusion_json JSONB`,

  /* ------------------------------------------------------------------ */
  /* Issue ↔ knowledge, with its own applicability                       */
  /* ------------------------------------------------------------------ */
  `ALTER TABLE issue_knowledge ADD COLUMN IF NOT EXISTS applicability_json JSONB`,
  `ALTER TABLE issue_knowledge ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 100`,

  /* ------------------------------------------------------------------ */
  /* Ingested source documents                                           */
  /* ------------------------------------------------------------------ */
  /*
   * Knowledge must be traceable to the document it came from, down to
   * the page, or a claim cannot be substantiated later.
   */
  `CREATE TABLE IF NOT EXISTS kb_documents (
    id             TEXT PRIMARY KEY,
    file_name      TEXT NOT NULL,
    mime_type      TEXT NOT NULL,
    storage_key    TEXT,
    sha256         TEXT NOT NULL,
    page_count     INTEGER,
    title          TEXT,
    /* PACK | CODE_OF_PRACTICE | STATUTE | CASE_LAW | GUIDANCE | OTHER */
    document_kind  TEXT NOT NULL DEFAULT 'OTHER',
    source_id      TEXT REFERENCES legal_sources(source_id),
    status         TEXT NOT NULL DEFAULT 'INGESTED',
    ingested_by    TEXT,
    ingest_report  JSONB NOT NULL DEFAULT '{}',
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS kb_documents_status_idx ON kb_documents (status)`,

  /* ------------------------------------------------------------------ */
  /* Claim traceability                                                  */
  /* ------------------------------------------------------------------ */
  /*
   * Every material assertion in a released appeal is recorded with the
   * chain that supports it: issue → rule/knowledge → legal source →
   * case fact → uploaded document. A claim with no chain must not be
   * released, and after release this table is the audit record.
   */
  `CREATE TABLE IF NOT EXISTS appeal_claim_traces (
    id             TEXT PRIMARY KEY,
    case_id        TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
    appeal_id      TEXT REFERENCES case_appeals(id) ON DELETE CASCADE,
    draft_id       TEXT,
    claim_index    INTEGER NOT NULL DEFAULT 0,
    claim_text     TEXT NOT NULL,
    issue_code     TEXT,
    module_ids     JSONB NOT NULL DEFAULT '[]',
    source_ids     JSONB NOT NULL DEFAULT '[]',
    fact_keys      JSONB NOT NULL DEFAULT '[]',
    fact_values    JSONB NOT NULL DEFAULT '{}',
    evidence_ids   JSONB NOT NULL DEFAULT '[]',
    condition_trace JSONB NOT NULL DEFAULT '[]',
    /* SUPPORTED | UNSUPPORTED | PARTIAL */
    support_status TEXT NOT NULL DEFAULT 'SUPPORTED',
    created_at     TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS appeal_claim_traces_case_idx
     ON appeal_claim_traces (case_id, claim_index)`,
  `CREATE INDEX IF NOT EXISTS appeal_claim_traces_appeal_idx
     ON appeal_claim_traces (appeal_id)`,

  /* ---------- Module → module edges: the graph's missing dimension ----------
   *
   * The knowledge base has been described as a graph since it was
   * written, but it was a three-level TREE: source → module → block,
   * with no relationship between modules at all. So two facts about the
   * legal content had nowhere to live:
   *
   *   CONFLICTS_WITH  two grounds that must not be argued together,
   *                   because arguing both is self-contradictory.
   *                   "Payment was made" and "the tariff did not apply"
   *                   is the obvious pair — a letter making both invites
   *                   the operator to pick whichever it prefers.
   *                   VAL-CONFLICT catches some of this in the prose,
   *                   but only after the draft exists; an edge stops it
   *                   being selected in the first place.
   *   REQUIRES        a module that is meaningless without another.
   *                   The PoFA content-defect modules only bite once the
   *                   keeper-liability threshold module is in play.
   *   SUPERSEDES      replaces another module from an effective date, so
   *                   a Code change can retire a proposition without
   *                   deleting the record of what applied before.
   *   NARROWS         a more specific case of a broader ground, used to
   *                   prefer the specific one rather than argue both.
   *
   * Directed. `weight` orders competing edges of the same kind. Kept
   * separate from kb_modules rather than as a JSONB column so an edge
   * can be added, audited and reversed on its own.
   */
  `CREATE TABLE IF NOT EXISTS kb_module_edges (
    id           TEXT PRIMARY KEY,
    from_module  TEXT NOT NULL,
    to_module    TEXT NOT NULL,
    /* SUPERSEDES | REQUIRES | CONFLICTS_WITH | NARROWS */
    edge_kind    TEXT NOT NULL,
    weight       INTEGER NOT NULL DEFAULT 0,
    note         TEXT,
    status       TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    UNIQUE (from_module, to_module, edge_kind)
  )`,
  `CREATE INDEX IF NOT EXISTS kb_module_edges_from_idx
     ON kb_module_edges (from_module, edge_kind, status)`,
  `CREATE INDEX IF NOT EXISTS kb_module_edges_to_idx
     ON kb_module_edges (to_module, edge_kind, status)`,
];

/**
 * pgvector objects — applied best-effort, separately.
 *
 * `CREATE EXTENSION` needs a privilege the database owner may not have
 * granted, and a throw inside the main DDL loop would abandon the rest
 * of the schema. These run individually with their failures swallowed,
 * so a host without pgvector still gets every other table and
 * retrieval falls back to metadata + lexical ranking.
 */
export const VECTOR_STATEMENTS: string[] = [
  /*
   * Retrieval today embeds the whole corpus into an in-process array on
   * every cold start (lib/rag/vectorStore.ts), which cannot be filtered
   * by effective date or jurisdiction and is recomputed per replica.
   * Embeddings belong in the database next to the metadata that governs
   * eligibility.
   *
   * The extension is created here rather than assumed: if the host does
   * not offer it, `ensureSchema` records the failure and retrieval falls
   * back to metadata + lexical ranking rather than breaking.
   *
   * Dimension 1536 matches text-embedding-3-small, the configured
   * default in lib/rag/embeddings.ts.
   */
  `CREATE EXTENSION IF NOT EXISTS vector`,
  `CREATE TABLE IF NOT EXISTS kb_embeddings (
    id               TEXT PRIMARY KEY,
    /* kb_module | drafting_block | legal_source | pack_section */
    source_kind      TEXT NOT NULL,
    source_id        TEXT NOT NULL,
    /* Where in the ingested document this chunk came from. */
    document_id      TEXT,
    page             INTEGER,
    section          TEXT,
    chunk_index      INTEGER NOT NULL DEFAULT 0,
    content          TEXT NOT NULL,
    content_sha256   TEXT NOT NULL,
    /* Metadata mirrored for pre-filtering before similarity search. */
    route_family     TEXT,
    topic            TEXT,
    jurisdiction     TEXT NOT NULL DEFAULT 'ENGLAND_WALES',
    authority_level  TEXT,
    ata_applicability TEXT NOT NULL DEFAULT 'ALL',
    status           TEXT NOT NULL DEFAULT 'ACTIVE',
    version          INTEGER NOT NULL DEFAULT 1,
    effective_from   TEXT,
    effective_to     TEXT,
    embedding        vector(1536),
    embedding_model  TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    UNIQUE (source_kind, source_id, chunk_index)
  )`,
  `CREATE INDEX IF NOT EXISTS kb_embeddings_filter_idx
     ON kb_embeddings (status, route_family, jurisdiction)`,
  `CREATE INDEX IF NOT EXISTS kb_embeddings_source_idx
     ON kb_embeddings (source_kind, source_id)`,
  /*
   * IVFFlat needs training data, and an empty-table build is rejected by
   * some versions, so the ANN index is created by the ingestion job once
   * rows exist (lib/rag/index.ts). Cosine distance matches the
   * similarity the current store computes.
   */
];
