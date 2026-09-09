# Parking Appeals Group — Private Parking Appeals Demo

A standalone Next.js 15 demo of a UK Private Parking Appeals Automation
Platform, built **strictly** from the client-supplied
[`Private_Parking_Appeal_Automation_MASTER_Developer_Pack.pdf`](Private_Parking_Appeal_Automation_MASTER_Developer_Pack.pdf).

The pack is treated as the single source of truth for:

- questions (Parts 4 and 5),
- variables (Part 3),
- rules (Part 6, `PP-R001..PP-R033`),
- paragraph mapping (Part 7),
- approved paragraph library (Part 8, verbatim),
- assembly and deduplication rules (Part 9),
- keeper-safe transformations (Part 10),
- worked examples (Part 11, encoded as tests).

No AI is used to make legal decisions. AI is confined to
`DocumentExtractionProvider`, which only extracts and classifies uploaded
documents. All legal outcomes come from a deterministic rules engine.

- **Live pages:** `/`, `/start`, `/appeal/{upload,confirm,questions,evidence,review,result}`.
- **Formats:** PDF (`pdf-lib`) and Word (`docx`).
- **Tests:** unit, integration and Playwright E2E on desktop / tablet / mobile.

> This is a demo. It is not legal advice. Court, IAS/POPLA, debt-recovery,
> Letter of Claim, WordPress, Stripe, CRM, S3, and production auth are
> deliberately out of Phase 1 scope per the pack and are left behind
> clear extension points.

## Getting started

```bash
npm install
npm run dev             # http://localhost:3000
npm run build && npm start
```

If your machine is behind a private npm registry, the project-local
`.npmrc` pins the public registry so install works out of the box.

## Verification commands

```bash
npm run lint            # ESLint — must be clean
npm run typecheck       # tsc --noEmit — must be clean
npm run test            # Vitest unit + integration
npm run test:unit
npm run test:integration
npm run test:e2e        # Playwright (desktop, tablet, mobile)
npm run build           # Next.js production build
```

Playwright browsers only need to be downloaded once:

```bash
npm run test:e2e:install
```

## Project layout

```
app/                 Next.js App Router pages and API routes
components/          Reusable UI (SiteHeader, ProgressSteps, Logo)
features/            Feature-scoped client code (appeal store, question blocks)
lib/                 Business logic: assembly, keeper-safe, variables, demo scenarios
paragraphs/          Approved paragraph library — verbatim from pack Part 8
rules/               Deterministic rules engine — PP-R001..PP-R033 from pack Part 6
services/
  documents/         PDF and DOCX renderers
  extraction/        DocumentExtractionProvider (mock + real placeholder)
  storage/           StorageProvider (memory now, S3 later)
types/               Shared TypeScript types
tests/
  unit/              Vitest unit tests (incl. workedExamples.test.ts)
  integration/       Vitest integration tests (routes, full pipeline)
  e2e/               Playwright E2E specs
docs/                ARCHITECTURE, DEMO_FLOW, RULE_ENGINE, TEST_REPORT
```

The legal domain (paragraphs, rules, keeper-safe, assembly) is fully
isolated from React. React components only *render* what the domain
layer computes.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DEMO_FLOW.md](docs/DEMO_FLOW.md)
- [docs/RULE_ENGINE.md](docs/RULE_ENGINE.md)
- [docs/TEST_REPORT.md](docs/TEST_REPORT.md)
- [docs/CURRENT_STATE_AND_GAP_ANALYSIS.md](docs/CURRENT_STATE_AND_GAP_ANALYSIS.md) — production roadmap baseline
- [docs/PHASE1_PLAN.md](docs/PHASE1_PLAN.md) — case foundation (in progress)

## Environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Then fill in:

- **`OPENAI_API_KEY`** — required for real PCN uploads. Vision model
  `gpt-4o` by default. Never exposed in the browser.
- **`POSTGRES_URL`** — required for the CRM + authentication. On Vercel
  this is auto-populated by the Neon (or Vercel Postgres) integration;
  locally, paste the connection string from your Neon dashboard.
- **`SESSION_PASSWORD`** — required for admin sessions. Generate with
  `openssl rand -base64 48`. Must be ≥ 32 characters.
- **`OPENAI_MODEL`** — optional. Override the extraction model.
- **`EXTRACTION_PROVIDER`** — optional. `mock` forces the fixture-only
  extractor for automated tests / offline demos.

`.env`, `.env.local` and every `.env.*` (except `.env.example`) are
gitignored.

## Database & Authentication (Neon Postgres)

The CRM and portal are backed by a real Postgres database via
[`@neondatabase/serverless`](https://neon.tech). Every admin action
persists to `POSTGRES_URL`, so two browsers see the same data.

Provisioning on Vercel (one-time, ~30 seconds):

1. Open your project → **Storage** tab → **Create Database** → **Neon**
2. Accept the defaults and click **Continue**
3. Vercel populates `POSTGRES_URL` automatically on the project's
   Production, Preview and Development environments
4. Add a `SESSION_PASSWORD` under **Settings → Environment Variables**
   (generate with `openssl rand -base64 48`)
5. Trigger a redeploy — on the first `/api/*` request the schema is
   created automatically and the demo dataset + a default admin user
   are seeded

Default admin (auto-created on first request):

- Email: `admin@parkingappealsgroup.co.uk`
- Password: `changeme` (change it after first login)

You can also register your own admin from `/login` → **Register** tab.

### Auth surface

- `POST /api/auth/register` — creates a new admin, sets the session cookie
- `POST /api/auth/login` — signs in an admin
- `POST /api/auth/logout` — clears the session
- `GET  /api/auth/me` — returns the current session (`{ user, hasDb }`)
- `middleware.ts` guards `/admin/*` and redirects to `/login` when the
  session cookie is missing

Cookies are HTTP-only, `SameSite=Lax`, `Secure` in production, encrypted
by [`iron-session`](https://github.com/vvo/iron-session). Passwords are
hashed with `bcryptjs` (cost 10).

### Data surface

- `GET  /api/crm/state` — the authenticated admin's whole CRM snapshot
- `POST /api/crm/mutate` — one mutation (or a batch); requires auth
- `POST /api/public/intake` — creates a client + appeal + payment for
  the unauthenticated customer flow (only accepts the whitelisted intake
  shape)

## Extension points

- **Alternative OCR / extraction provider:** implement
  `DocumentExtractionProvider` and register it in the factory
  (`services/extraction/index.ts`).
- **S3 evidence storage:** implement `StorageProvider` and swap
  `getStorageProvider()`.
- **Stripe payments, WordPress, POPLA/IAS, court workflows, debt
  recovery, Letter of Claim:** intentionally not built. No shim is baked
  into the domain logic, so any of these can be added without touching
  the rules engine or paragraph library.
# parking-
