# DOCX deferred

## Decision

Customer deliverable for V1 is **PDF only**.

The UI previously offered Word download on checkout success and the portal.
DOCX was rendered **on demand** from the released draft and was **not**
persisted alongside the PDF artefact of record. That violates the rule that
released appeal content must not be regenerated on download.

## What we did

- Removed / disabled Word download CTAs in production UI.
- `renderCaseDocument(..., "docx")` returns `DOCX_NOT_AVAILABLE` (409).
- PDF continues to be served from the persisted final document.

## When to revisit

Implement DOCX only when we can:

1. Render once at release time from the same validated draft as the PDF.
2. Persist the exact bytes in private object storage.
3. Serve those bytes on download (no re-assembly).

Until then, DOCX remains deferred. The `services/documents/docx.ts` renderer
may stay for internal/tests.
