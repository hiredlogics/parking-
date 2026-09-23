# Where the rules live, and how to change them

**Audience:** the product owner (who needs to know what they can change without a
developer) and any developer picking this codebase up.

This document answers three questions:

1. **Where is every legal/appeal rule defined today?**
2. **Which rules can be changed in Postgres, and how?**
3. **What is missing** compared with what the client specification requires?

It complements [RULE_ENGINE.md](RULE_ENGINE.md), which documents only the
deterministic Master Pack rule table (`PP-R001`–`PP-R033`) and says nothing about
configuration. Where the two disagree, this document is the current one.

> **The one-sentence answer.** There are **seven** independent layers that decide
> what a generated appeal says. Exactly **four things** can be changed today
> through an admin screen. The rest is either an authenticated API call with no
> screen, a raw SQL statement with no writer at all, or TypeScript requiring a
> developer deploy.

---

## Part 1 — The seven rule layers

Everything that shapes an appeal sits in one of these. Read this table first; the
rest of the document expands each row.

| # | Layer | What it decides | Defined in | Read at runtime from | Who can change it |
|---|---|---|---|---|---|
| 1 | **Knowledge base** (58 modules, 19 legal sources, 10 drafting-block families) | The legal propositions the appeal is *allowed* to argue | `lib/kb/seed/` (code) → seeded into Postgres | **Postgres** (`kb_modules`, `legal_sources`, `drafting_blocks`, `code_versions`) | ⚠️ DB only — no writer wired up for module text; status via API |
| 2 | **Module & block eligibility gates** (51 + 29) | Which of those modules a given case may use | `lib/retrieval/gates.ts` — TypeScript closures | **the TypeScript constants** | ❌ Developer deploy only |
| 3 | **Prohibited claims** (20 always + ~27 conditional) | What the letter must *never* assert | `lib/analysis/prohibited.ts` | **the TypeScript constants** | ❌ Developer deploy only |
| 4 | **Route requirements & triggers** (19 families) | Which facts a ground needs before it can be argued | `lib/facts/requirements.ts` **and** Postgres `issues` / `issue_required_facts` — both live | mixed (see §5.3) | ⚠️ DB half is API-only, no screen |
| 5 | **Master Pack rules & paragraphs** (71 rules, 87 paragraphs) | The deterministic rules-letter path | `rules/rules.ts`, `paragraphs/library.ts` → seeded into Postgres | **Postgres for metadata, code for conditions** | ✅ **Admin screen** (on/off + paragraph wording) |
| 6 | **Validators & release checklist** (13 + 14) | What blocks a letter from being released | `lib/validation/validators.ts`, `releaseChecklist.ts` | code for logic, **Postgres for severity/status** | ⚠️ severity/status via API, no screen |
| 7 | **Facts, defaults & thresholds** (69 facts, PoFA day counts) | The vocabulary and the assumptions | `lib/facts/registry.ts`, `lib/analysis/pofa.ts` → partly Postgres | mixed | ⚠️ widen-only / raw SQL |

**The critical thing to understand:** layer 2 runs *regardless of what is in
Postgres*. Even if you configure a rule perfectly in the database, the hardcoded
gates in `lib/retrieval/gates.ts` still filter the result afterwards. That is why
"configure it in the admin panel" does not currently work for eligibility.

---

## Part 2 — What you can change today, with no developer, through a screen

This is the honest list. Four things.

### 2.1 The drafting prompt
`/admin/config` → prompt textarea. Writes `prompts` table (`purpose = DRAFTING`),
versioned. Read live by the drafting layer via `getActivePrompt()`.

### 2.2 The "appeal ready" customer email
`/admin/config` → subject / body. Writes `email_templates` (`code = APPEAL_READY`).

### 2.3 Master Pack rules on/off — all 71
`/admin/appeal-logic`. Writes `appeal_rules.active`.

**Important limitation, and the screen says so honestly:** only the on/off switch
is editable. The *condition* that decides when a rule fires (`test` in
`rules/rules.ts`) is a TypeScript predicate and is never stored in the database.
See `lib/appealLogic.ts` — it merges DB metadata over code conditions.

### 2.4 Master Pack paragraph wording — all 87
`/admin/appeal-logic`. Writes `appeal_paragraphs.title`, `.text`, `.active`.
Guarded by `validateKeeperSafe()` so an edit cannot introduce driver-identifying
wording. This is the one place you can genuinely change what the letter *says*
without a deploy.

### Not on this list
`/admin/settings` is a **non-functional mock** — the inputs use `defaultValue`
and there are zero `fetch()` calls. Nothing it displays is saved anywhere. It
should either be built or removed; leaving it looks like configuration that
exists.

Services and issues appear on `/admin/config` as **read-only lists** with no edit
controls.

---

## Part 3 — In Postgres, changeable, but only via an API call (no screen)

These work today, and are not code — but they need a developer or an HTTP client
because no admin page calls them.

| What | Endpoint | Table |
|---|---|---|
| Enable/disable a KB module | `POST /api/admin/kb/status` | `kb_modules.status` |
| Enable/disable a drafting block | `POST /api/admin/kb/status` | `drafting_blocks.status` |
| Allow a case-law **quotation** (KB-GOV-06) | `POST /api/admin/kb/status` | `legal_sources.quotation_enabled` |
| Validator severity / on-off | `POST /api/admin/config` (`UPSERT_VALIDATION`) | `validation_rules` |
| AI model per operation | `POST /api/admin/ai-config` | `ai_model_config` |
| Services, issues, required facts, issue→knowledge links | `POST /api/admin/config` | `services`, `issues`, `issue_required_facts`, `issue_knowledge` |

Two safety carve-outs worth knowing about, both deliberate:

- **`VAL-DRIVER` cannot be disabled or downgraded.** It is hard-locked
  ACTIVE/BLOCKING at both the write and the read path
  (`IMMUTABLE_VALIDATOR_CODES`). The keeper-safety rule is non-negotiable in the
  specification, so it is non-negotiable in the config layer too.
- **A validator that throws fails closed** and cannot be suppressed by config.

---

## Part 4 — In Postgres, read live, but with no writer at all (raw SQL only)

This is the most important section, because **this is where the legal conditions
were designed to live** and the wiring was never finished.

| Column / table | What it is for | Status |
|---|---|---|
| `issues.applicability_json` / `exclusion_json` | The declarative condition tree that decides when a ground applies — the intended replacement for the hardcoded gates | **read** by `lib/engine/issueEngine.ts`; falls back to `trigger_tags` when empty. Never seeded, never written. `setIssueApplicability()` exists in `lib/config/adminRepo.ts:252` with **zero callers** |
| `issues.config_json` | PoFA day thresholds (paragraph 9 = 14 days, paragraph 8 = 28 days, boundary tolerance) | **read** by `lib/config/pofaConfig.ts`. Never seeded — so all three numbers currently come from the TypeScript defaults |
| `kb_modules.use_when` / `do_not_use_when` / `core_proposition` | The legal content of a module | **read live from Postgres**. `updateKbModuleContent()` exists at `lib/kb/repo.ts:258` — with revision archiving — and has **zero callers** |
| `fact_defaults` | Controlled assumptions (e.g. "registered keeper, driver not identified") | **read** by `lib/rules/factDefaults.ts`. `upsertFactDefault()` has **zero callers** |
| `kb_modules.applicability_json` / `exclusion_json`, `drafting_blocks.applicability_json` / `exclusion_json` | Per-module condition trees | **dead schema** — `rowToModule`/`rowToBlock` don't even select these columns |
| `issue_revisions` | Non-destructive issue history | `restoreIssueRevision()` has **zero callers** |

So: the tables are correct, the read paths are correct, and the write functions
are already written. What is missing is a route and a screen that call them.

---

## Part 5 — TypeScript only: a developer deploy is required

### 5.1 Module and block eligibility gates — `lib/retrieval/gates.ts`
**51 `MODULE_GATES` + 29 `BLOCK_GATES` = 80 predicates.** Each is a closure
`(GateInput) => boolean`. Read directly from the constants by
`lib/retrieval/engine.ts`. There is no DB override and no cache-from-DB.

Note that five modules are switched **permanently off in code**:
`KB-KEY-02`, `KB-RES-05`, `KB-EQ-03`, `KB-HOSP-03`, `KB-LAND-03` (each is
`() => false`). An administrator cannot turn these on.

### 5.2 Prohibited claims — `lib/analysis/prohibited.ts`
**20 always-prohibited claim codes** plus ~27 conditional branches. There is no
table for this at all — a grep for "prohibited" across `lib/db/` returns nothing.

These matter more than they look. A prohibition is what stops the letter making an
unsupported assertion; it is lifted only when a fact or tag positively proves the
proposition. Changing one is a legal-safety decision, which is a defensible reason
for it to require review — but it should be *reviewed configuration*, not a deploy.

### 5.3 Route requirements and triggers — `lib/facts/requirements.ts` (620 lines)
`TRIAGE_REQUIREMENTS` + `ROUTE_REQUIREMENTS` across 19 route families (~36 fact
requirements, each with a reason code, priority and evidence types), plus
`ROUTE_TRIGGERS` (19 tag→route mappings).

This layer is **duplicated**: `issue_required_facts` in Postgres is the intended
replacement, `lib/facts/missing.ts` is already marked
`@deprecated Phase 5 — superseded by lib/engine/issueEngine`, and both paths run
today. That duplication should be resolved, not left.

### 5.4 Validators — `lib/validation/validators.ts` (13 validators)
All detection logic — regexes, fact cross-checks, contradiction detection — is
code. Only `severity` and `status` are configurable (§3).
`lib/validation/releaseChecklist.ts` has **14 pre-release checks** with no config
hook at all.

### 5.5 PoFA arithmetic — `lib/analysis/pofa.ts`
Working-day counting, deemed service, boundary tolerance, the Scotland/NI
jurisdiction gate and the hire-vehicle gate are all code. **This is deliberate
and should stay that way** — a boundary-date bug is a safety property, not a
preference. Only the three day-count *numbers* should be configurable, and the
mechanism for that already exists (§4) but is unreachable.

### 5.6 The Master Pack rule conditions
All 71 `test` predicates in `rules/rules.ts`. Documented as intentional:
*"Rule conditions are never stored in the database — they stay as code. Only
metadata is CRM-editable."*

---

## Part 6 — How to define a rule in future

### 6.1 The mechanism already exists
`lib/rules/conditions.ts` is a complete, generic condition evaluator. Its own
header states the intent plainly: *"Adding PAYMENT, ANPR, GRACE, POFA or a
brand-new ground needs a row, not a deploy."*

It has three properties chosen specifically because admins would be editing live
data: evaluation is **total** (a malformed node is `false` with a recorded reason,
never a thrown error), **validated** at save time by `validateCondition()`, and
**traceable** (every evaluation returns the leaves that decided it).

Available operators: `eq`, `neq`, `in`, `nin`, `exists`, `absent`, `gt`, `gte`,
`lt`, `lte`, `contains`, `truthy`, `falsy`.

Available node types:

| Node | Meaning |
|---|---|
| `{ all: [...] }` | every child must match (empty list matches) |
| `{ any: [...] }` | at least one child must match |
| `{ not: ... }` | negation |
| `{ fact, op, value }` | compare a case fact |
| `{ tag }` | a circumstance tag is present |
| `{ evidence }` | an evidence type is on the case |
| `{ daysBetween: { from, to }, op, value }` | whole days between two date facts — this is what lets PoFA windows and grace periods be configured rather than coded |
| `{ always: true }` | unconditional |

### 6.2 Worked example — "PoFA postal NTK sent late"

Today this lives in `gates.ts` as a closure. As configuration it is a row in
`issues.applicability_json`:

```json
{
  "all": [
    { "fact": "notice_route", "op": "eq", "value": "POSTAL" },
    { "fact": "driver_identified", "op": "eq", "value": "NO" },
    { "not": { "tag": "notice_to_driver_first" } },
    {
      "daysBetween": { "from": "parking_event_date", "to": "notice_issue_date" },
      "op": "gt",
      "value": 14
    }
  ]
}
```

Change the statutory window from 14 days to something else and you edit `value`.
No deploy.

### 6.3 Worked example — "residential rights, but only with the instrument"

```json
{
  "all": [
    { "tag": "resident_parking_rights" },
    { "evidence": "authorisation_evidence" },
    { "fact": "agreement_uploaded", "op": "eq", "value": "YES" }
  ]
}
```

This is exactly the specification's requirement that residential rights be
*"derived from the uploaded instrument, not from resident status alone"* — and it
is expressible as data.

### 6.4 What has to be built to make §6.2 and §6.3 actually work

Three pieces, in this order. None of them is large.

1. **Seed `applicability_json` for the 10 issues** by translating the existing
   gate predicates into condition trees. This is the real work — it is a
   legal-review exercise, not a coding one, and the translation must be verified
   case-by-case against `tests/integration/pipelineAccuracy.test.ts`, whose
   central invariant is *defined by* `gates.ts`.
2. **Expose the four orphaned writers** through `/api/admin/config`:
   `setIssueApplicability`, `updateKbModuleContent`, `upsertFactDefault`,
   `restoreIssueRevision`.
3. **Make `retrieveKnowledge` consult the DB condition trees** instead of the
   hardcoded gates, with the gates kept as a *comparator* recorded in the audit
   trail during transition — not deleted on day one. Until this step, step 1 and
   step 2 have no effect on output, because the gates run regardless.

Then build the screens: KB module editor, validator list, issue condition editor.

---

## Part 7 — Gap analysis against the client specification

These are the specification's own words, with what is actually true today.

| Requirement | Source | Status |
|---|---|---|
| *"Admin controls for module wording, legal sources, Code versions, prompts and validation rules without application rewrites"* | Handover pack, **Part 13 Phase 10** | ⚠️ **Partly.** Prompts ✅. Validation rules API-only. Module wording and legal sources have no writer. Code versions have no writer. |
| *"Admin can update modules, Code versions and drafting/validation instructions without rebuilding the application"* | Handover pack, **Part 15 Acceptance Criteria** | ❌ **Not met** for modules and Code versions |
| *"Structured knowledge-base storage with module versioning and admin editing"* | Handover pack, **Part 13 Phase 4** | ⚠️ Storage and versioning ✅ (`kb_modules` + `kb_module_revisions`); **admin editing** ❌ |
| *"The knowledge base must be editable independently of application code. Each module should have version, effective_from, effective_to, status (ACTIVE/REVIEW/DISABLED), source reference, last legal review date and change notes"* | KB **§19 Administration / Update Policy** | ✅ **Schema fully matches** — `kb_modules` has every one of those columns, plus non-destructive revision history. ❌ No edit path. |
| *"administrators should be able to disable or replace a module without a developer deployment"* | KB **§19** | ⚠️ **Disable** ✅ (API). **Replace** ❌ |
| *"Case law must not be quoted or named automatically unless the authority and proposition have been separately verified and enabled by an administrator"* | **KB-GOV-06** | ✅ Implemented — `quotation_enabled` defaults to FALSE, admin API flips it, retrieval enforces it |
| *"Where the legal position depends on the event date, notice route, operator/ATA or transition arrangements, the system must resolve applicability before drafting"* | **KB-GOV-05** | ✅ Implemented — `lib/retrieval/engine.ts:85-90,201` filters modules by `effective_from`/`effective_to` against the parking event date |
| *"store Code provisions as versioned records with effective_from, effective_to, transition_status, operator/ATA applicability and source URL. Never hard-code a grace/consideration/keying rule without that metadata"* | Source Register **§4** | ⚠️ **Schema ✅** (`code_versions` has all five fields, seeded with the BPA transition timeline). But the grace/consideration rules themselves are still gate predicates in code, so the metadata is not what decides them. |
| *"Every source_id must carry jurisdiction, authority level, effective dates and status"* | Source Register **§17** | ✅ `legal_sources` has all four; retrieval refuses non-binding sources (`NON_BINDING_STATUSES`) |
| *"A weak secondary ground must not dilute a strong primary ground"* / *"Do not stack every possible ground"* | **KB-GOV-07**, Drafting Priority §6 rule 5 | ❌ **Not implemented.** `retrieveKnowledge` applies no cap — every eligible module is retained, so eligibility *is* the letter's content. This is what Phase 5's `MAX_SELECTED_MODULES = 6` addresses. |
| *"Never identify or infer the driver"* | **NON-NEGOTIABLE**, Part 9 | ✅ Hard-locked — `VAL-DRIVER` cannot be disabled or downgraded by configuration |

### The honest summary of the gap

The specification asks for a system where **legal content is data and the
application is the engine**. The database schema delivers that almost exactly —
`kb_modules`, `legal_sources`, `code_versions`, `issues.applicability_json`,
`fact_defaults`, `validation_rules` and the revision tables are a faithful
implementation of KB §19 and Source Register §4.

What is missing is the **middle third**: the write paths and the screens. Four
repository functions that would make most of this editable already exist and have
no callers. And one layer — the 80 hardcoded gates — sits *downstream* of all the
configuration and overrides it.

So the gap is not architectural. It is unfinished wiring, plus one layer that
needs to be migrated from code to data under legal review.

---

## Part 8 — Recommended order of work

1. **Expose the four orphaned writers** through `/api/admin/config`
   (`setIssueApplicability`, `updateKbModuleContent`, `upsertFactDefault`,
   `restoreIssueRevision`). Small, and it turns existing dead code into
   capability.
2. **Seed `issues.config_json`** with the three PoFA day counts so the statutory
   windows become configurable — currently they silently come from the
   TypeScript defaults.
3. **Build the KB module editor screen.** This is the single highest-value screen,
   because module text is the legal content of the letter and it is already
   DB-read with revision history.
4. **Migrate the gates to `applicability_json`**, issue by issue, keeping
   `gates.ts` as an audit comparator until agreement is proven on the golden
   corpus. This is the big one and needs legal review, not just engineering.
5. **Build the validator screen** (13 rows, severity + on/off) and the issue
   condition editor.
6. **Either build or delete `/admin/settings`** — a mock that looks like
   configuration is worse than no screen.

---

## Appendix — Quick file reference

| Looking for | File |
|---|---|
| Module eligibility gates | `lib/retrieval/gates.ts` |
| Prohibited claims | `lib/analysis/prohibited.ts` |
| Route requirements / triggers | `lib/facts/requirements.ts` |
| Fact vocabulary (69 facts) | `lib/facts/registry.ts` + `case_facts_registry` |
| KB module content | `lib/kb/seed/modules.core.ts`, `modules.new.ts` → `kb_modules` |
| Legal sources / Code versions | `lib/kb/seed/sources.ts`, `codeVersions.ts` |
| Master Pack rules / paragraphs | `rules/rules.ts`, `paragraphs/library.ts` |
| DB-override merge for the above | `lib/appealLogic.ts` |
| Condition evaluator (the future path) | `lib/rules/conditions.ts` |
| Issue engine (reads condition trees) | `lib/engine/issueEngine.ts` |
| Admin config repository | `lib/config/adminRepo.ts` |
| Admin config seeding | `lib/config/seedAdminConfig.ts` |
| Validators / release checklist | `lib/validation/validators.ts`, `releaseChecklist.ts` |
| PoFA arithmetic / thresholds | `lib/analysis/pofa.ts`, `lib/config/pofaConfig.ts` |
| Schema DDL | `lib/db/kbSchema.ts`, `ruleGraphSchema.ts`, `adminConfigSchema.ts`, `aiConfigSchema.ts` |
