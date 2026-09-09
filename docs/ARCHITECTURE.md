# Architecture

**Single source of truth:** `Private_Parking_Appeal_Automation_MASTER_Developer_Pack.pdf`
(supplied by the client, in the repository root). All questions, variables,
rules, paragraph IDs and approved wording match that document exactly.

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│  UI (React / Next.js App Router)                            │
│  app/, components/, features/appeal/*                       │
│  - Pure presentation + client-side state                    │
│  - Zero legal decisions                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Domain / business logic                                    │
│  rules/, lib/, paragraphs/                                  │
│  - Deterministic rules engine (rules/engine.ts)             │
│  - Assembly + ID-only deduplication + variable replacement  │
│  - Keeper-safe validator and transformer (Part 10)          │
│  - Canonical paragraph library — verbatim from pack Part 8  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Services                                                   │
│  services/{extraction,storage,documents}/                   │
│  - DocumentExtractionProvider (mock + real placeholder)     │
│  - StorageProvider (in-memory + S3-ready interface)         │
│  - PDF / DOCX renderers                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Types (types/)                                             │
│  Variable names align with pack Part 3 / Part 5             │
└─────────────────────────────────────────────────────────────┘
```

## Invariants

- **Rules and paragraphs never live in React components.** Rule tests and
  paragraph selection happen in `rules/` and `lib/assembly.ts`; a
  component only ever *reads* what those modules produce.
- **The paragraph library is canonical.** No code path may rewrite
  paragraph text. The only allowed transformations are:
  1. selection by rule (`PP-Rxxx`),
  2. variable substitution (`{{vrm}}`, `{{permission_source}}`, …), and
  3. deduplication by paragraph ID (Set semantics).
- **AI does not decide legal outcomes.** The
  `DocumentExtractionProvider` is the only place OCR/AI is allowed; its
  output is not usable in the rules engine until the customer has
  confirmed it on `/appeal/confirm`.
- **Global keeper rule** (Part 10). The system never identifies or
  implies the driver. Every active paragraph in the library is covered
  by a unit invariant to be keeper-safe as written. Any free-text input
  is passed through the Part 10 approved transformations before it is
  inserted into a variable. The final assembled body is passed through
  `validateKeeperSafe()`; if it fails, generation is blocked.

## Data flow

1. `POST /api/extract` receives the uploaded PCN and returns the pack's
   Part 3 variables.
2. The client stores those in the appeal session
   (`features/appeal/store.ts`) with per-field confidence.
3. `/appeal/confirm` lets the user edit before **confirming**. Only the
   confirmed values are used downstream.
4. `/appeal/questions` renders CQ01–CQ06 (Part 4) and the pack's Part 5
   branches (Keeper/PoFA, Payment, Keying, Consideration, Grace, ANPR,
   Authorisation, Signage, Landowner). Branches are selected by
   `features/appeal/branchLogic.ts`. Changing an earlier core answer
   invalidates now-irrelevant branch answers.
5. `/appeal/evidence` uploads via `POST /api/evidence`. The storage
   provider is swappable.
6. `/appeal/review` runs `evaluate()` locally to show the active routes.
7. `/appeal/result` runs `evaluate()` + `assembleAppeal()` and calls
   `POST /api/generate` for PDF/DOCX. The API endpoint re-runs both to
   ensure the client cannot bypass keeper-safe or unresolved-variable
   checks.

## Server-side runtime

All API routes use the Node.js runtime (`runtime = "nodejs"`). PDF and
DOCX generation happens on the server so we never ship large libraries to
the browser.

## Extraction provider

The default extraction provider is `OpenAIExtractionProvider`
(`services/extraction/openaiProvider.ts`). It uses OpenAI's Responses
API with a strict JSON schema so the model can only return the
pack's Part 3 variable set plus `vehicle_make`. All extraction happens
in the `/api/extract` Route Handler on the Node.js runtime; the API
key is read from `OPENAI_API_KEY` on the server and never exposed to
the browser.

Selection rules (`getExtractionProvider()`):

1. If `EXTRACTION_PROVIDER=mock` is explicitly set → mock provider (tests).
2. Otherwise → OpenAI provider. If `OPENAI_API_KEY` is missing, the
   factory throws and `/api/extract` returns HTTP 500 with a clear
   error. There is no silent fallback to sample data.

The model is instructed to:

- extract only what is visibly present,
- return `null` for anything it cannot read confidently,
- never make legal decisions, never select rule / paragraph IDs, and
- never decide whether the appeal should succeed.

The customer must confirm/correct the extracted values on
`/appeal/confirm` before the deterministic rules engine can consume
them.

## Extension points

- **Alternative extraction provider:** implement
  `DocumentExtractionProvider` and register it in
  `services/extraction/index.ts`.
- **S3 (or any KV) evidence storage:** implement `StorageProvider` and
  swap `getStorageProvider()`.
- **Auth, Stripe, CRM, court workflows, Letter of Claim, POPLA/IAS:**
  intentionally not built. They are isolated behind the domain layer so
  they can be added without touching the rules engine or paragraph
  library.

## Testing strategy

- **Unit** (`tests/unit`): pure functions — rules, paragraph library
  invariants (every pack ID present, every paragraph keeper-safe),
  keeper-safe transformations for every Part 10 row, assembly, variables.
- **Worked examples** (`tests/unit/workedExamples.test.ts`): Part 11
  Examples A–D encoded as tests. Each asserts the pack's listed rule and
  paragraph IDs fire.
- **Integration** (`tests/integration`): full pipeline for every seeded
  scenario — evaluate → assemble → PDF + DOCX. Plus route-handler tests
  hit directly with fabricated `Request`s.
- **E2E** (`tests/e2e`): four scenario walk-throughs plus landing page
  checks, executed on Chromium at desktop, tablet, and mobile viewports.
  Assertions reference the pack's approved paragraph wording verbatim.
