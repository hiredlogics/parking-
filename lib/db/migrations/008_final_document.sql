/**
 * Final appeal document persistence (additive, idempotent).
 *
 * The validated appeal was stored in case_appeal_drafts, but the PDF
 * was rendered on demand and never recorded — so no GENERATED row ever
 * existed and the final document could not appear in My Documents.
 *
 * `source_draft_id` ties each generated file to the exact draft version
 * that passed validation, so "this PDF is the appeal we approved" is
 * provable rather than assumed.
 */

ALTER TABLE case_documents_meta ADD COLUMN IF NOT EXISTS source_draft_id TEXT;

CREATE INDEX IF NOT EXISTS case_documents_meta_type_idx
  ON case_documents_meta (case_id, document_type);

CREATE INDEX IF NOT EXISTS case_documents_meta_draft_idx
  ON case_documents_meta (source_draft_id);
