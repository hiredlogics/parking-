# V2 Conformance Report — Client Rules vs Current Build

**Date:** 2026-09-08

**Source documents read in full (all four):**

| Document | Content |
| --- | --- |
| `Private_Parking_Appeal_Automation_MASTER_Developer_Pack_V2_AI.docx` | Parts 1–15 (AI-generated appeals) |
| `Private_Parking_AI_Legal_Knowledge_Base_COMPLETE_V2.docx` | Sections 1–19 + Appendices A, B, C |
| `Private_Parking_Legal_Authority_Source_Register_V1.docx` | Sections 1–17 |
| `Private_Parking_Appeal_Automation_COMPLETE_HANDOVER_PACK.pdf` | All three combined (31 pages) — content verified identical |

---

## 0. Headline finding

**The V2 pack explicitly supersedes the architecture this application is currently built on.**

The app implements **V1**: a deterministic Master Trigger/Decision Rule Table (`PP-R001..PP-R033`) that selects approved paragraph IDs and assembles them.

V2 Part 14 states this is superseded:

> **SUPERSEDE from Version 1:** the Master Trigger/Decision Rule Table as the primary drafting engine, fixed branch-question implementation, paragraph-ID assembly as the final drafting method, and the old build phases requiring implementation of every trigger before generation.

V2 requires: `UPLOAD → AI EXTRACTION → CUSTOMER CONFIRMATION → ADAPTIVE QUESTIONS → AI ISSUE ANALYSIS → APPROVED KNOWLEDGE RETRIEVAL → BESPOKE DRAFT → VALIDATION → FINAL APPEAL`

Critically, V2 does **not** discard the rules engine — it **demotes** it:

> Rules engine is primary legal selector → **Rules/validators act as guardrails and hard checks**
> Paragraph library is final wording → **Library becomes controlled legal/factual knowledge source**

So the existing engine is retained as a safety layer, not deleted.

---

## 1. Scorecard

| # | V2 requirement | Status | Evidence in repo |
| --- | --- | --- | --- |
| 1 | Scope = initial private parking appeals only | **EXISTS** | `case_stage = INITIAL_OPERATOR_APPEAL` |
| 2 | Non-negotiable keeper rule | **PARTIAL** | `lib/keeperSafe.ts` — strong, but only one of eleven validators |
| 3 | PCN upload (all pages) + evidence | **PARTIAL** | Single-file upload; multi-page not supported |
| 4 | AI extraction + document classification | **PARTIAL** | `services/extraction/openaiProvider.ts`; **no `document_type`, no `operator_ata`, no `evidence_inventory`, no `extraction_confidence` gate** |
| 5 | Customer confirmation screen | **EXISTS** | `app/appeal/confirm/page.tsx` |
| 6 | Adaptive questions, ONE at a time, 3–6 total | **MISSING** | `app/appeal/questions/page.tsx` = 796-line fixed form, all questions visible |
| 7 | Never re-ask established facts | **MISSING** | No missing-fact engine |
| 8 | AI issue analysis → primary/secondary routes | **PARTIAL** | Deterministic `evaluate()`; no JSON analysis contract |
| 9 | Controlled KB with 58 modules | **MISSING** | 0 of 58 KB modules exist |
| 10 | Bespoke AI drafting from modules | **MISSING** | `lib/assembly.ts` concatenates paragraph IDs |
| 11 | Independent validation pass (11 validators) | **MISSING** | 1 of 11 (keeper-safe ≈ VAL-DRIVER) |
| 12 | Blocking failure → regenerate or manual review | **MISSING** | No manual review state |
| 13 | PDF + evidence list + submission guidance + CRM | **PARTIAL** | PDF/DOCX exist; no evidence list/guidance sections |
| 14 | Legal source register + 9 status flags | **MISSING** | No `legal_sources` table |
| 15 | Code version control by event date | **MISSING** | No version metadata anywhere |
| 16 | Jurisdiction exclusions routing | **MISSING** | No Scotland/byelaw/council/hire gates |
| 17 | Retrieval output schema (KB §18) | **MISSING** | |
| 18 | Admin edits modules/sources/Code/prompts without deploy | **PARTIAL** | `/admin/appeal-logic` edits V1 rules/paragraphs only |
| 19 | Prompt separation + versioning | **MISSING** | One extraction prompt, unversioned |
| 20 | Mandatory Legal QA (source_id audit, quotes off) | **MISSING** | |

---

## 2. Drafting blocks (Appendix A) — exact delta

Computed programmatically against `paragraphs/library.ts`.

- Current library: **87** blocks
- V2 Appendix A: **70** blocks
- Shared: **60**

### 2.1 MISSING — must be added (10)

All ten are **new AI-route blocks** with no V1 equivalent:

| ID | Route |
| --- | --- |
| `AI-BREAK-001` | Breakdown / current Code route |
| `AI-BREAK-002` | Breakdown / contract (frustration) analysis |
| `AI-RES-001` | Residential primacy |
| `AI-RES-002` | Unfettered / express right |
| `AI-RES-003` | Allocated bay |
| `AI-RES-004` | Derogation from grant |
| `AI-EQ-001` | Equality Act reasonable adjustment / additional time |
| `AI-HOSP-001` | Hospital / clinical delay |
| `AI-ACT-001` | Loading / unloading |
| `AI-EVCH-001` | EV charging |

These carry new variables not in the current variable set: `{{lease_or_tenancy}}`, `{{bay_reference}}`.

### 2.2 In V1 library but NOT listed in V2 Appendix A (27) — **CLIENT DECISION REQUIRED**

`PP-ANPR-006`, `PP-ANPR-009`, `PP-ANPR-012`, `PP-AUTH-003`, `PP-AUTH-005`, `PP-AUTH-007`, `PP-AUTH-009`, `PP-AUTH-010`, `PP-AUTH-011`, `PP-CON-006`, `PP-EV-001`, `PP-GRACE-006`, `PP-GRACE-008`, `PP-LAND-003`, `PP-LAND-004`, `PP-LAND-007`, `PP-LAND-009`, `PP-PAY-003A`, `PP-PAY-004A`, `PP-SIGN-003`, `PP-SIGN-006`, `PP-SIGN-007`, `PP-SIGN-008`, `PP-SIGN-009`, `PP-SIGN-010`, `PP-SIGN-012`, `PP-SIGN-013`

V2 describes Appendix A as blocks *"inherited from the original developer pack and expanded"* — i.e. a **curated subset**. It does not say to delete the rest.

**Recommendation:** do not delete. Import with `status = REVIEW` (V2 §19 provides `ACTIVE/REVIEW/DISABLED`) so an administrator decides. Deleting approved legal wording without instruction is the riskier action.

---

## 3. Knowledge base — 58 modules, all missing

| Section | Modules | Count |
| --- | --- | --- |
| 1. Governance | `KB-GOV-01..07` | 7 |
| 3. PoFA | `KB-POFA-01..05` | 5 |
| 4. Consideration/Grace/Time | `KB-CON-01..02`, `KB-GRACE-01..02`, `KB-TIME-01` | 5 |
| 5. Payment/Keying | `KB-PAY-01..03`, `KB-KEY-01..02` | 5 |
| 6. ANPR/Evidence | `KB-ANPR-01..03`, `KB-EV-01` | 4 |
| 7. Signage | `KB-SIGN-01..04` | 4 |
| 8. Authorisation | `KB-AUTH-01..03`, `KB-CUST-01` | 4 |
| 9. **Breakdown (new)** | `KB-BREAK-01..03` | 3 |
| 10. **Residential (new)** | `KB-RES-01..07` | 7 |
| 11. **Equality (new)** | `KB-EQ-01..03` | 3 |
| 12. **Hospital (new)** | `KB-HOSP-01..03` | 3 |
| 13. **Activity (new)** | `KB-ACT-01..03` | 3 |
| 14. **EV / Infrastructure (new)** | `KB-EVCH-01`, `KB-INFRA-01` | 2 |
| 15. Landowner | `KB-LAND-01..03` | 3 |
| | **Total** | **58** |

Each module requires these fields (V2 Part 8 / KB §19):
`module_id`, `topic`, `use_when`, `do_not_use_when`, `legal_basis`, `core_proposition`, `ai_must_check`, `evidence_needed`, `drafting_notes`, `version`, `effective_from`, `effective_to`, `status`, `source_ids`, `last_legal_review`, `change_notes`.

The current `appeal_paragraphs` table has **none** of the applicability fields (`use_when`, `do_not_use_when`, `effective_from/to`, `source_ids`).

---

## 4. Validators — 11 required, 1 partially present

| Validator | Blocks release if… | Status |
| --- | --- | --- |
| `VAL-DRIVER` | Draft identifies/implies who drove | **PARTIAL** (`validateKeeperSafe`) |
| `VAL-FACT` | Material fact not traceable to source | MISSING |
| `VAL-EVIDENCE` | Says evidence enclosed when absent | MISSING |
| `VAL-POFA` | PoFA defect alleged without route verification | MISSING |
| `VAL-CODE` | Code rule applied without event-date check | MISSING |
| `VAL-RES` | Lease wording invented / rights overstated | MISSING |
| `VAL-BREAK` | Breakdown = automatic frustration | MISSING |
| `VAL-EQ` | Equality ground without relevant facts | MISSING |
| `VAL-ANPR` | Generic calibration allegation, no trigger | MISSING |
| `VAL-STAGE` | POPLA/IAS/court language at initial appeal | MISSING |
| `VAL-CONFLICT` | Contradictory dates/payment/duration/permit | MISSING |

V2 requires drafting and validation be **separate passes/prompts**, and a failed validation must not be silently ignored.

---

## 5. Route families — 10 present, 18 required

Current `types/rules.ts`:
`KEEPER_ROUTE`, `PAYMENT_ROUTE`, `KEYING_ERROR_ROUTE`, `CONSIDERATION_ROUTE`, `GRACE_ROUTE`, `ANPR_ROUTE`, `ANPR_DOUBLE_VISIT`, `AUTHORISATION_ROUTE`, `SIGNAGE_ROUTE`, `LANDOWNER`

**Missing 8:** `BREAKDOWN`, `RESIDENTIAL`, `EQUALITY`, `HOSPITAL`, `LOADING`, `DROP_OFF`, `EV_CHARGING`, `INFRASTRUCTURE` (plus `PERMIT` as distinct from `AUTHORIZATION`).

Repo-wide grep confirms **zero** occurrences of `BREAKDOWN`, `RESIDENTIAL`, `EQUALITY`, `HOSPITAL`, `EV_CHARGING`, `frustration`, `tenancy`, `derogation`, `quiet enjoyment`.

`types/caseState.ts` (added in Phase 1) already declares the full 18-family union — schema is ready, logic is not.

---

## 6. Legal source register — entirely missing

### 6.1 Nine status flags
`BINDING_LEGISLATION`, `BINDING_APPELLATE_CASE`, `PERSUASIVE_CASE`, `INDUSTRY_CODE_CURRENT`, `INDUSTRY_CODE_HISTORIC`, `GOVERNMENT_PROPOSAL`, `WITHDRAWN`, `REGULATOR_GUIDANCE`, `OPEN_INVESTIGATION`

### 6.2 Core legislation to seed
- Protection of Freedoms Act 2012, s56 & Sch 4 — `BINDING_LEGISLATION`
- Consumer Rights Act 2015 — `BINDING_LEGISLATION`
- Equality Act 2010, ss20/29 & Sch 2 — `BINDING_LEGISLATION`
- Parking (Code of Practice) Act 2019 — `BINDING_LEGISLATION` (framework; **not** the industry Code)
- DMCCA 2024 — `BINDING_LEGISLATION` (no technical claims unless module enabled)

### 6.3 Case law
| Case | Status | Rule |
| --- | --- | --- |
| ParkingEye v Beavis [2015] UKSC 67 | `BINDING_APPELLATE_CASE` | Kills generic "penalty / not a genuine pre-estimate of loss". Must **not** be used to say every £100 charge is automatically valid. |
| Saeed v Plustrade [2001] EWCA Civ 2011 | `BINDING_APPELLATE_CASE` | Derogation from grant — only where the actual instrument grants a parking right |
| Jopson v Homeguard Services (Oxford CC, 2016) | `PERSUASIVE_CASE` | **Disabled by default**; only if verified transcript stored & admin-enabled |

Per Source Register §17, **case-law quotations are disabled by default** — paraphrase verified propositions only.

### 6.4 CMA 2026 material
- CMA letter to government, 16 July 2026 — `REGULATOR_GUIDANCE`
- CMA press release, 16 July 2026 — `REGULATOR_GUIDANCE`
- Euro Car Parks investigation — `OPEN_INVESTIGATION` → **never** state ECP breached consumer law
- CMA37 updated guidance, 22 July 2026 — `REGULATOR_GUIDANCE`
- Withdrawn Feb 2022 government Code — `WITHDRAWN` → context only
- MHCLG 2025 consultation — `GOVERNMENT_PROPOSAL` → never "in force"

---

## 7. Code version control — missing, and required by event date

| Event date band | Applicable Code |
| --- | --- |
| Before 1 Feb 2024 | Earlier applicable ATA Code (no retrospective Single Code) |
| 1 Feb 2024 – before 1 Oct 2024 | BPA Version 9 |
| 1 Oct 2024 – before 17 Feb 2025 | Single Code Version 1 (+ transition) |
| 17 Feb 2025 onward | Single Code Version 1.1 (+ transition) |
| 13 Apr 2026 | Publication/foreword update — signage transition alignment |

Explicit developer requirement:

> Never hard-code a grace/consideration/keying rule without that metadata.

Required per-provision fields: `effective_from`, `effective_to`, `transition_status`, operator/ATA applicability, `source_url`.

---

## 8. Jurisdiction & exclusions — no gates exist

| Issue | Required behaviour |
| --- | --- |
| Scotland | PoFA Sch 4 keeper route must **not** be applied; separate jurisdiction logic |
| Byelaw / statutory land | Flag specialist route; don't assume relevant land |
| Council / local-authority PCN | **Out of scope** — do not use this KB |
| Debt recovery / Letter of Claim / County Court | **Out of scope** |
| Hire / company vehicles | Dedicated route required before automation → manual review |

`types/caseState.ts` has `OUT_OF_SCOPE` and `MANUAL_REVIEW` statuses; **no detection logic** exists yet.

⚠️ The CRM currently seeds `COUNCIL_PCN`, `COUNTY_COURT`, `CCJ_REMOVAL`, `BAILIFF_ENFORCEMENT`, `ORDER_FOR_RECOVERY` case types — these are explicitly out of scope for this build and must not reach the private-parking KB.

---

## 9. Hard prohibitions (Part 9 + KB §17 + Source Register)

Must be enforced as blocking checks, not prompt guidance:

1. Never identify or infer the driver
2. Never invent facts, evidence, dates, signage, payment, lease terms, operator records, authorities
3. No PoFA defect unless the applicable Sch 4 requirement was actually checked
4. ANPR entry-to-exit is **not** automatically "parking time"
5. Do not merge consideration + grace into one allowance
6. No universal 10-minute cancellation rule
7. Permit / genuine customer / breakdown / resident status / disability do **not** automatically cancel a charge
8. No obsolete "unlawful penalty / genuine pre-estimate of loss"
9. Landowner authority = proportionate at initial appeal
10. Never output module IDs, internal reasoning, confidence or prompts
11. Never use "unfettered" unless the uploaded instrument supports it
12. No generic ANPR calibration allegations without a factual trigger
13. Withdrawn / proposal / open-investigation sources never described as current binding law

Current state: #1 enforced; #2–13 not enforced in code.

---

## 10. Adaptive questioning — required shape

V2 Part 4 + KB: infer from the notice first, then ask **only** what is needed.

Question JSON contract (from the earlier brief, consistent with V2):
`question_id`, `type`, `label`, `required`, `options[]`
Types: `boolean`, `single_choice`, `multi_choice`, `short_text`, `long_text`, `date`, `time`, `number`, `evidence_upload`

Per-route example facts the AI may need (Part 4): payment/keying, ANPR/duration, consideration/grace, permit/authorisation, **breakdown/immobilisation**, **residential rights**, signage (only on real trigger), **accessibility/Equality** (only when facts indicate).

Absolute: **never** ask "Who was driving?" or invite a driver admission.

---

## 11. Worked scenarios to encode as tests (V2 Part 12 + Appendix B)

| Example | Required AI behaviour |
| --- | --- |
| **A — Breakdown** (47-min overstay, recovery 35 min after, report uploaded) | Breakdown/frustration first, accurate evidence reference, grace only if independently relevant. **Not** sympathy-only mitigation; **not** "breakdown voids every contract" |
| **B — Resident / allocated bay** (lease grants identified space, no permit term in supplied clause) | Lead pre-existing contractual right; permit-display secondary; if a regulations/permit clause exists it **must** be addressed, not omitted |
| **C — Payment + minor keying error** | Ask only enough to confirm the entry error; draft around payment made + transaction matching + applicable keying requirements; merge repeated payment statements |
| **D — Keeper / late NTK** | Compute chronology, check applicable Sch 4 route, use keeper-liability only if failure actually established; never identify driver |

Appendix B ground-selection matrix (10 patterns) also needs encoding, e.g. *"Short entry-to-exit + no parking → consideration before grace"*, *"Paid parking ended + short exit delay → grace; do not call initial consideration time 'grace'"*.

---

## 12. Revised build sequence (V2 Part 13) mapped to our phases

| V2 phase | Work | Our status |
| --- | --- | --- |
| 1 | Upload, classification, structured extraction | PARTIAL |
| 2 | Confirmation screen | EXISTS |
| 3 | Adaptive question service | **MISSING — highest value** |
| 4 | KB storage + module versioning + admin editing | MISSING |
| 5 | AI issue-analysis / retrieval | MISSING |
| 6 | AI bespoke drafting | MISSING |
| 7 | Independent validation w/ hard keeper rules | MISSING |
| 8 | Evidence refs, PDF, CRM persistence | PARTIAL |
| 9 | Scenario test suite per route + mixed grounds | PARTIAL |
| 10 | Admin controls without rewrites | PARTIAL |

Note V2 reorders vs the earlier 12-phase brief: **KB (V2 phase 4) comes before analysis/drafting**. Recommend following V2's order.

---

## 13. Acceptance criteria (V2 Part 15) — current pass/fail

| Criterion | Now |
| --- | --- |
| Short relevant question journey | ❌ long fixed form |
| Bespoke coherent appeals, not stitched paragraphs | ❌ stitched by design |
| No driver identification on keeper route | ✅ |
| Every assertion traceable to facts or approved module | ❌ no traceability record |
| Breakdown recognised as frustration/impossibility case | ❌ route absent |
| Residential analyses actual lease before permit args | ❌ route absent |
| PoFA/Code applied only when tests satisfied | ⚠️ PoFA cautious; Code has no version logic |
| Validator blocks unsupported evidence/invented lease/contradictions/wrong stage | ❌ 1 of 11 |
| Admin updates modules/Code/instructions without rebuild | ⚠️ V1 rules/paragraphs only |

**2 of 9 met.**

---

## 14. Decisions needed from the client

1. **27 V1 blocks not in V2 Appendix A** — import as `REVIEW` (recommended) or delete?
2. **Rules engine role** — confirm demotion to guardrail (V2 Part 14) while `PP-R001..033` stay as hard checks. Recommended: keep, since V2 says validators act as hard checks.
3. **Case-law quotation policy** — confirm quotations stay disabled by default and Jopson stays disabled until a verified transcript is supplied.
4. **Code version source of truth** — confirm seeding Single Code v1.1 (published 13 Apr 2026, effect from 17 Feb 2025) plus the four earlier bands, with admin editing thereafter.
5. **Out-of-scope CRM case types** — should `COUNCIL_PCN`, `COUNTY_COURT`, `CCJ_REMOVAL`, `BAILIFF_ENFORCEMENT`, `ORDER_FOR_RECOVERY` remain visible in the CRM as manual-only records, or be hidden from this build?
6. **Manual review destination** — who receives blocked/manual-review cases, and via what channel?
7. **Multi-page PCN upload** — V2 requires "all pages"; confirm max pages/size.

---

## 15. Recommended immediate sequence

1. **KB + source register schema + seed all 58 modules, 70 blocks, sources, Code versions** (V2 phases 4 + legal register) — everything downstream depends on this data existing.
2. **Adaptive question engine + one-question UI** (V2 phase 3) — the most visible gap vs the client's core complaint.
3. **Issue analysis + hybrid retrieval** (phase 5) returning the KB §18 schema.
4. **Bespoke drafting** (phase 6) grounded strictly in retrieved modules.
5. **11 validators as a separate pass** (phase 7) with blocking behaviour + manual review.
6. **Scenario tests** for Examples A–D and Appendix B matrix (phase 9).

Existing payment lock, PDF generation, auth and CRM persistence are reusable as-is.
