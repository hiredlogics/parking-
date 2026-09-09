# Test Report

Aligned with the client-supplied
`Private_Parking_Appeal_Automation_MASTER_Developer_Pack.pdf`. All checks
green.

## Summary

| Check | Command | Result |
| --- | --- | --- |
| Lint (ESLint via Next) | `npm run lint` | Pass — 0 warnings, 0 errors |
| Type-check (TypeScript) | `npm run typecheck` | Pass — 0 errors |
| Unit tests (Vitest) | `npm run test:unit` | Pass — 42 / 42 |
| Integration tests (Vitest) | `npm run test:integration` | Pass — 11 / 11 |
| E2E tests (Playwright) | `npm run test:e2e` | Pass — 18 / 18 (6 specs × 3 viewports) |
| Production build (Next.js) | `npm run build` | Pass — 14 routes, 102 kB shared JS |

Total automated tests: **71 / 71 passing.**

## Worked-examples parity (pack Part 11)

`tests/unit/workedExamples.test.ts` encodes each pack example as a test.
Each asserts the specified rules fire *and* the specified paragraph IDs
appear in the evaluation output.

- **Example A — Payment + Minor Keying Error.** Fires `PP-R006`,
  `PP-R008`; includes `PP-PAY-001`, `PP-PAY-002`, `PP-KEY-001`,
  `PP-KEY-002`, `PP-KEY-004`.
- **Example B — Multiple Visits / ANPR.** Fires `PP-R012`, `PP-R013`,
  `PP-R014`; includes `PP-ANPR-001`, `002`, `003`, `004`, `005`, `012`.
- **Example C — Keeper + Confirmed Late Postal NTK.** Fires `PP-R001`,
  `PP-R004`, `PP-R005B`; includes `PP-INTRO-001`, `PP-INTRO-002`,
  `PP-POFA-001`, `PP-POFA-003`, `PP-POFA-006`, `PP-POFA-007`.
- **Example D — Paid Parking + Short Exit Period.** Fires `PP-R011`,
  `PP-R011A`; includes `PP-GRACE-001`, `PP-GRACE-005`, `PP-GRACE-006`.

## Unit test coverage

`tests/unit/`:

- `keeperSafe.test.ts` — every row of pack Part 10 verified as a positive
  test; the validator rejects the driver-first-person patterns; approved
  paragraphs with legitimate statutory references (e.g. `PP-POFA-005E`)
  are not flagged.
- `paragraphLibrary.test.ts` — every pack-cited paragraph ID is present
  in the library; every active paragraph is keeper-safe as written;
  placeholders only use supported variable names.
- `rulesEngine.test.ts` — engine invariants; `PP-R001`, `PP-R003`,
  keying-error preconditions, universal-10-minute rule *not* implemented
  (Part 9 rule 8), consideration + grace *not* merged (Part 9 rule 7),
  `PP-EV-001` gating.
- `assembly.test.ts` — priority ordering (intro first, closing last),
  keeper-safe body, no leaked IDs, `PP-INTRO-002` only on the keeper
  route.
- `variables.test.ts` — Part 3 variables resolve; `permission_source` and
  `alleged_term` resolve; unresolved placeholders reported.
- `workedExamples.test.ts` — Part 11 Examples A–D (see above).
- `extraction.test.ts`, `storage.test.ts` — mock provider and in-memory
  storage sanity checks.

## Integration test coverage

`tests/integration/`:

- `endToEnd.test.ts` — full pipeline for every seeded scenario
  (evaluate → assemble → PDF + DOCX). Verifies pack-listed rules fire,
  pack-listed paragraphs are present, body is keeper-safe, no unresolved
  variables, no leaked IDs, PDF starts with `%PDF-`, DOCX starts with
  the `PK` zip magic. Also a multi-route case activating keeper +
  payment + keying + signage in one appeal.
- `apiRoutes.test.ts` — direct route-handler invocation. `POST /api/extract`
  returns a valid result for allowed mime types and 415 for unsupported.
  `POST /api/generate` returns a real PDF for Example A and a real DOCX
  for Example C.

## E2E test coverage

`tests/e2e/` runs each spec on three Chromium-based projects: **desktop**
(1440 × 900), **tablet** (1024 × 1366), **mobile** (Pixel 5).

- `landing.spec.ts` — hero renders, CTA navigates, progress steps render.
- `paymentKeying.spec.ts` — Example A journey; assertions include
  verbatim paragraph text from the pack; PDF download works.
- `anpr.spec.ts` — Example B journey; each of PP-ANPR-001, 002, 003,
  004, 005, 012 appears in the preview.
- `signage.spec.ts` — Signage journey; `{{alleged_term}}` substituted
  with "Unauthorised parking after 6pm" from the PCN.
- `keeperPofa.spec.ts` — Example C journey; PP-INTRO-002 + PoFA-001, 003,
  006, 007 all present; no first-person driver wording.

## How to reproduce

```bash
npm install                # one-off
npm run test:e2e:install   # one-off — installs Playwright's Chromium

npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
```

Each command must exit with code 0 before the demo is release-ready.

## Known limitations

- The mock extraction provider does not actually run OCR. Real OCR is a
  drop-in via `DocumentExtractionProvider`.
- Storage is in-memory only. S3 (or any KV) is a drop-in via
  `StorageProvider`.
- Debt recovery, Letter of Claim, County Court workflows and case
  updates are out of Phase 1 scope per the pack. They are intentionally
  not built and are isolated behind the domain layer so they can be
  added without touching the rules engine.
