# Current State & Gap Analysis

**Date:** 2026-09-08  
**Repository:** Parking Appeals Group — Private Parking Appeals Demo  
**Purpose:** Baseline audit before production architecture evolution (Phases 1–12).

---

## 1. Stack (what exists today)

| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | Next.js 15 App Router, React 19, TypeScript, Tailwind | Standalone app; WP only links in |
| State (customer appeal) | Zustand + `localStorage` | Not server-authoritative |
| State (CRM UI) | Zustand hydrated from `/api/crm/*` | Optimistic + sync |
| Backend | Next.js Route Handlers (`runtime = "nodejs"`) | No separate worker process |
| Database | Neon Postgres via `@neondatabase/serverless` | Idempotent `CREATE TABLE IF NOT EXISTS` — **no Prisma/Drizzle migrations** |
| ORM | None — raw SQL + typed repos | |
| Object storage | `MemoryStorageProvider` only | S3 interface exists; **no R2** |
| AI | OpenAI Vision (extraction only) | Rules remain deterministic |
| Payments | `DemoPaymentService` | **No Stripe** |
| Email | Nodemailer / SMTP | Works when env set |
| Auth | iron-session + bcrypt; admin hardcoded; customer register/login | |
| PDF / DOCX | `pdf-lib`, `docx` | Server-side |
| Hosting today | Vercel + Neon | Target later: Linux VPS — avoid Vercel-only APIs |
| Docker / Nginx | **Missing** | |

---

## 2. Frontend structure

### Marketing / entry
- `/` — branded landing (Header, Hero, Appeal Builder, Expert Help, How It Works, Trustpilot, Testimonials, Bottom CTA)
- `/start` — start appeal entry
- `/signup`, `/signin` — customer auth
- `/login` — admin-only (hardcoded credentials)

### Customer appeal journey (client Zustand)
| Route | Role |
| --- | --- |
| `/appeal/upload` | PCN upload → `POST /api/extract` |
| `/appeal/confirm` | Edit/confirm extracted fields |
| `/appeal/questions` | **Fixed** CQ01–CQ06 + conditional branch forms (many questions on one page) |
| `/appeal/evidence` | Evidence upload → `POST /api/evidence` |
| `/appeal/review` | Summary + local `evaluate()` |
| `/appeal/result` | Protected preview (no full text) → create order → checkout |
| `/checkout/[id]` | Demo one-click payment |
| `/checkout/[id]/success` | Full appeal + PDF/DOCX after `PAID` |

### Portal
- `/portal/*` — dashboard, cases, appeals, documents, messages, invoices, settings (customer-scoped via `/api/portal/state`)

### Admin CRM
- `/admin` dashboard, cases Kanban, case/client detail, finance, reports, settings, help, community
- `/admin/appeal-builder` — operational UI
- `/admin/appeal-logic` — override pack rules/paragraphs in DB

**Reusable:** landing components, `AppHeader`, `ProgressSteps`, admin/portal shells, auth forms, brand CSS tokens.

**Demo / obsolete risk:** CRM seeds court/bailiff/CCJ case types in UI while product scope is **private parking initial operator appeals only**. Empty dirs: `app/api/generate/`, `app/api/public/intake/` (handlers removed).

---

## 3. Backend / API structure

| Endpoint | Status |
| --- | --- |
| `POST /api/extract` | EXISTS — OpenAI / mock provider |
| `POST /api/evidence` | EXISTS — memory storage |
| `POST /api/orders/create` | EXISTS — pending order + input snapshot |
| `GET /api/orders/[id]` | EXISTS — preview vs unlocked gate |
| `POST /api/orders/[id]/pay` | EXISTS — demo capture + CRM + email |
| `GET /api/orders/[id]/document` | EXISTS — paid-only PDF/DOCX |
| `GET/POST /api/crm/*` | EXISTS — admin CRM |
| `GET /api/portal/state` | EXISTS — customer slice |
| Auth routes | EXISTS — admin + customer |
| `POST /api/admin/appeal-rules` / `appeal-paragraphs` | EXISTS |
| `POST /api/cases` … case lifecycle APIs | **MISSING** |
| `POST /api/webhooks/stripe` | **MISSING** |
| Generation job / status poll | **MISSING** |
| `POST /api/generate` | **REMOVED** (correct — was unpaid PDF hole) |

---

## 4. Database (Postgres)

**Present tables:** `admins`, `clients`, `cases`, `appeals`, `documents`, `tasks`, `notes`, `communications`, `activity`, `payments`, `system_meta`, `orders`, `appeal_rules`, `appeal_paragraphs`.

**Characteristics:**
- Text ISO timestamps; string IDs; some JSONB (`cases.extras`, `orders.input_snapshot`)
- Schema applied at runtime (`ensureSchema`) — not versioned migrations
- `cases` is CRM Kanban-oriented, **not** the target durable Case State model
- `documents` stores metadata only (name/mime/size) — **no storage_key / R2 pointer**
- `orders.input_snapshot` holds full appeal inputs for post-pay PDF regen (good pattern to keep)

**Missing vs target:** `users` (customers are `clients`), `case_facts`, `case_answers`, `case_evidence`, `case_routes`, `case_events`, `kb_modules`, `legal_sources`, `kb_module_sources`, `kb_versions`, `appeal_drafts`, `validation_runs`, `generation_jobs`, `stripe_events`, `manual_reviews`, `audit_events`, pgvector.

---

## 5. Uploads

| Aspect | Current |
| --- | --- |
| PCN | Multipart to `/api/extract`; bytes to OpenAI; session keeps base64 in localStorage |
| Evidence | `/api/evidence` → in-memory `StorageProvider` |
| MIME / size | Basic validation on routes |
| R2 / signed URLs | **MISSING** |
| Case-scoped keys `cases/{id}/…` | **MISSING** |

---

## 6. AI implementation

| Capability | Status |
| --- | --- |
| Extraction provider abstraction | EXISTS |
| OpenAI vision + structured JSON | EXISTS (Part 3 fields + `vehicle_make`) |
| Confirmation before rules | EXISTS |
| Adaptive one-question engine | **MISSING** — fixed multi-question UI |
| Analysis / drafting LLM | **MISSING** — deterministic rules + paragraph assembly |
| Independent validator LLM | **MISSING** — keeper-safe + unresolved vars only |
| Prompt versioning | **MISSING** |
| Unified `services/ai/*` | **PARTIAL** — extraction only under `services/extraction` |

**Important product tension:** Current system is **deterministic pack-faithful** (rules `PP-R001..033` + verbatim paragraphs). Target is **AI-assisted drafting from versioned KB modules**. Migration must keep pack fidelity as a legal safety net, not discard it blindly.

---

## 7. Questionnaire logic

- Core CQ01–CQ06 + Part 5 branches in `app/appeal/questions/page.tsx` (~800 lines)
- Branch visibility via `features/appeal/branchLogic.ts`
- Invalidate stale branch answers on core change — EXISTS
- **Shows many questions at once**, not one-at-a-time
- Does **not** skip questions already answered by confirmed extraction (e.g. notice route)
- Client-only persistence until order create

**Verdict:** NEEDS REFACTOR → adaptive question engine + server Case State.

---

## 8. Appeal generation

Pipeline today:
1. `evaluate()` — deterministic rules → routes + paragraph IDs  
2. `assembleAppeal()` — order, dedupe by ID, variable replace  
3. `validateKeeperSafe()` — block unsafe wording  
4. PDF/DOCX renderers  

Admin can override rules/paragraphs in DB (`lib/appealLogic.ts`).

**Missing:** job queue, draft storage separate from preview, LLM drafting, structured validation categories, KB retrieval.

---

## 9. Authentication

| Role | Mechanism |
| --- | --- |
| Admin | Hardcoded email/password (`ADMIN_EMAIL` / `ADMIN_PASSWORD` overrides); iron-session `kind=ADMIN` |
| Customer | Register/login on `clients.password_hash`; `kind=CUSTOMER` |
| Middleware | Cookie presence + `pag_kind` separates admin vs customer flows |
| Case ownership checks | Partial (orders/portal); not full case ACL model |

---

## 10. Payment

| Feature | Status |
| --- | --- |
| PaymentService abstraction | EXISTS |
| Demo capture | EXISTS |
| Server-side lock until paid | EXISTS (orders + document access) |
| Preview without full text | EXISTS |
| Stripe Checkout + webhooks + idempotency | **MISSING** |
| Entitlement not CSS-only | **EXISTS** (good — preserve) |

---

## 11. Gap analysis vs target

Legend: **EXISTS** · **PARTIAL** · **MISSING** · **NEEDS REFACTOR**

| Target capability | Status | Notes |
| --- | --- | --- |
| Standalone app (no WP logic) | EXISTS | |
| Durable Case + public_id | PARTIAL | CRM cases ≠ appeal Case State |
| Structured Case State + provenance | MISSING | |
| Private R2 storage + signed URLs | MISSING | Interface ready |
| AI extraction + confirm | EXISTS | Extend schema / confidence |
| Adaptive one-question UI | NEEDS REFACTOR | |
| Never re-ask known facts | MISSING | |
| Keeper-safe drafting + validation | PARTIAL | Strong transformers; not full validator taxonomy |
| Issue analysis engine (JSON routes) | PARTIAL | Rules engine ≈ analysis; not LLM JSON contract |
| Versioned KB + legal sources | PARTIAL | Paragraph library ≈ static KB; no effective dating / admin KB CRUD as designed |
| Hybrid KB retrieval | MISSING | |
| Bespoke LLM draft from modules | MISSING | Assembly is template selection |
| Independent validator | PARTIAL | |
| Generation jobs + status poll | MISSING | |
| Payment lock | EXISTS | Swap Demo → Stripe |
| Stripe webhook unlock | MISSING | |
| Server-stored full appeal pre-pay | PARTIAL | Via `orders.input_snapshot` + regenerate |
| PDF in object storage | MISSING | Generated on demand |
| Admin case/KB/audit | PARTIAL | CRM + appeal-logic; not full audit/KB |
| Audit events | PARTIAL | CRM activity only |
| VPS / Docker / backups docs | MISSING | |
| Scenario test matrix (full) | PARTIAL | Pack worked examples + E2E exist |
| Out-of-scope routing (council/Scotland/hire) | MISSING | CRM types exist for court but not detection gates |

---

## 12. What to reuse (do not rebuild)

1. Branding / landing / admin–portal shells  
2. Extraction provider interface + OpenAI implementation  
3. Confirmation screen pattern  
4. Rules engine + verbatim paragraph library + worked-example tests (legal safety net)  
5. Keeper-safe transforms (`lib/keeperSafe.ts`)  
6. Assembly / variable replacement / PDF+DOCX renderers  
7. Order payment-lock pattern + DocumentAccessService  
8. PaymentService / EmailService abstractions  
9. iron-session customer/admin split  
10. StorageProvider interface → implement R2 behind it  

---

## 13. Destructive migration risks

| Risk | Mitigation |
| --- | --- |
| Replacing CRM `cases` with new case model | **Additive** new tables (`appeal_cases` / `case_state`) first; map CRM later |
| Dropping Zustand appeal store mid-flight | Keep until adaptive API is live; dual-write |
| Deleting paragraph library for LLM-only drafts | Keep pack library as approved modules v0; evolve KB on top |
| Switching Neon DDL to Prisma overnight | Introduce migrations alongside `ensureSchema`; no wipe |
| Enabling Stripe while Demo still demoing | Feature-flag `PAYMENT_PROVIDER=demo|stripe` |
| Vercel → VPS | Avoid Edge-only APIs; use Node runtime + standard Postgres URL |

**No destructive DROP recommended in Phase 1.**

---

## 14. Proposed Phase 1 file / schema changes (additive)

```
docs/CURRENT_STATE_AND_GAP_ANALYSIS.md   (this file)
docs/PHASE1_PLAN.md

types/caseState.ts                       CaseState, FactProvenance, enums
lib/cases/publicId.ts                    CASE-YYYY-NNNNNN generator
lib/db/migrations/001_case_foundation.sql
lib/db/migrate.ts                        runner (idempotent)
lib/db/schema.ts                         append new tables (compat with ensureSchema)

# New tables (names TBD final):
appeal_cases          — durable case row (public_id, stage, lock, payment…)
case_facts            — field + value + source + confidence + confirmed
case_answers          — adaptive Q&A
case_documents_meta   — storage_key, type, mime (R2-ready)
case_events           — audit trail
generation_jobs       — stub statuses for later phases

.env.example          — document R2/Stripe/VPS vars as commented placeholders
```

Phase 1 **does not** replace the questionnaire UI or Stripe yet.

---

## 15. Implementation order (confirmed)

Follow the brief Phases 1–12. Next executable work after this report:

**PHASE 1** — foundation types, migrations, case state model, env cleanup, empty-route cleanup.  
**PHASE 2** — R2 behind `StorageProvider`.  
**PHASE 3+** — extraction hardening → adaptive questions → KB → analysis → draft → validate → PDF store → Stripe → admin/audit → tests/VPS.
