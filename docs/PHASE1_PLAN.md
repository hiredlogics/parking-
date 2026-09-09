# Phase 1 Plan — Architecture foundation

**Goal:** Introduce a durable Case State model and migration discipline **without** breaking the live demo appeal flow, CRM, or payment lock.

## In scope

1. Document current state (done: `CURRENT_STATE_AND_GAP_ANALYSIS.md`).
2. Add TypeScript `CaseState` + provenance types.
3. Add idempotent SQL migration files + runner (alongside existing `ensureSchema`).
4. Add additive tables: `appeal_cases`, `case_facts`, `case_answers`, `case_documents_meta`, `case_events`, `generation_jobs`.
5. Public case ID helper: `CASE-YYYY-NNNNNN`.
6. Extend `.env.example` with future R2 / Stripe / VPS placeholders (commented).
7. Remove empty obsolete API directories.
8. Keep all existing customer/admin routes working unchanged.

## Out of scope (later phases)

- Adaptive one-question UI
- R2 implementation
- Stripe
- LLM drafting / KB admin
- Docker/VPS compose

## Migration safety

- No `DROP TABLE` on CRM tables.
- New tables only.
- Existing Zustand appeal session remains source of truth for the demo UI until Phase 4 dual-write.

## Success criteria

- `npm run typecheck` / `lint` / unit tests / build pass.
- Demo flow `/appeal/*` → checkout → unlock unchanged.
- Migrations apply cleanly on empty and existing Neon DBs.
