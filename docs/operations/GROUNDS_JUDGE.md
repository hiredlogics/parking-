# Grounds judge — operating guide

The grounds judge decides **which** of the legally eligible grounds an appeal
actually argues. It does not decide what is eligible: structured retrieval runs
first and always does that.

> Note: `.env.example` is gitignored in this repo (`.gitignore:20` matches
> `.env*`), so these variables are documented here rather than only there. If
> you are setting up a new environment, copy them from this file.

## Why it exists

Two requirements in the client specification had no implementation:

- **KB-GOV-07** — *"A weak secondary ground must not dilute a strong primary
  ground."*
- **Drafting Priority rule 5** — *"Do not stack every possible ground. Omit weak,
  contradictory or unsupported modules."*

`retrieveKnowledge` applied no cap. Every eligible module was retained, so
*eligibility was the letter's content*. The judge is the selection step that was
missing, plus a ceiling of `MAX_SELECTED_MODULES = 6`.

## The two variables

### `GROUNDS_PROVIDER` — who decides

| Value | Behaviour |
|---|---|
| `deterministic` *(default)* | The judge does not run. Every eligible module is argued. Identical to behaviour before the judge existed. |
| `shadow` | The judge runs. Its decision, and its disagreement with the deterministic result, are written to `retrieval_runs`. **The deterministic result still ships.** |
| `llm` | The judge's selection ships. A judge failure routes the case to `MANUAL_REVIEW`. |

Rollback is this one variable. No deploy.

### `GROUNDS_JUDGE` — which implementation

| Value | Behaviour |
|---|---|
| `mock` | Deterministic stand-in, no network. CI uses this. |
| `off` / `none` | No judge, even in `shadow`/`llm`. |
| unset | OpenAI on the `ANALYSIS` operation, if `OPENAI_API_KEY` is set. |

With no API key there is no judge and the pipeline stays deterministic. There is
deliberately **no weaker fallback** — a half-working judge that silently selects
nothing is the failure this layer exists to prevent.

## Rollout order

1. **`shadow` first.** Let it run over real traffic and read the agreement rate
   out of `retrieval_runs` (see the query below). Do not skip this.
2. Review the disagreements. `onlyJudge` is the interesting column: those are
   grounds the deterministic path missed. `onlyDeterministic` is the list of
   grounds the judge chose not to argue — check that each omission is one you'd
   defend.
3. Review `overrides`. These are modules the judge admitted **despite** the fact
   gate refusing them. A recurring override is evidence that a gate in
   `lib/retrieval/gates.ts` is too narrow, which is useful information whether or
   not you ever flip to `llm`.
4. Only then set `llm`.

## Reading the audit trail

Every non-deterministic run writes one row to `retrieval_runs`, which nothing had
ever written to before this phase.

```sql
-- Agreement rate in shadow mode
SELECT
  count(*)                                                 AS runs,
  count(*) FILTER (WHERE output_json->'comparison'->>'agreed' = 'true')     AS agreed,
  count(*) FILTER (WHERE output_json->'comparison'->>'routeAgreed' = 'true') AS route_agreed
FROM retrieval_runs
WHERE output_json->>'mode' = 'shadow';

-- Where the judge and the gates disagree, most recent first
SELECT created_at,
       case_id,
       output_json->'comparison'->'onlyJudge'         AS judge_added,
       output_json->'comparison'->'onlyDeterministic' AS judge_dropped,
       output_json->'judge'->'overrides'              AS gate_overrides
FROM retrieval_runs
WHERE output_json->'comparison'->>'agreed' = 'false'
ORDER BY created_at DESC
LIMIT 50;

-- Judge failures by kind
SELECT output_json->'judge'->>'failure' AS failure, count(*)
FROM retrieval_runs
WHERE output_json->'judge'->>'failure' IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC;
```

## What the judge cannot do

This matters more than what it can. Enforcement is in
[lib/judge/select.ts](../../lib/judge/select.ts) and is pure and deterministic —
a model verdict is a *proposal*, and nothing in it is trusted on its own account.

A proposed ground is refused if it:

- names a module that is not in the catalog (hallucinated id);
- names a module retrieval refused for a **hard** reason — `STATUS`,
  `EFFECTIVE_DATES`, `SOURCE_NON_BINDING`, `PROHIBITED`, `EVIDENCE_MISSING`;
- names a module retrieval never considered at all (`UNTRACED`);
- rests on a fact that is not established on the case;
- rests on a fact whose provenance is `system_default` or `inferred` — a
  provisional assumption must never become its own permission to argue from;
- is a governance module (those are system rules, never drafting content);
- falls beyond the 6-ground ceiling.

It **may** overturn exactly two rejections: `FACT_GATE` and `ROUTE`. Both are
computed from the answer-starved facts the judge exists to compensate for, and
`ROUTE` is stale by construction once routes derive from the selection. Every
such admission is recorded in `overrides`.

The grounding rule is worth restating because it is the load-bearing one: a
ground carries **fact keys, never fact values**. So a ground can be *dropped* for
being ungrounded, but it can never be *admitted* by the judge asserting a fact.
`ASSERTABLE_PROVENANCE` in [lib/facts/types.ts](../../lib/facts/types.ts) is
shared with VAL-FACT specifically so the judge and the validator cannot drift
apart on what counts as established.

## Release gate

`JUDGE_DECISION_RECORDED` is checklist item 13. In `llm` mode a letter is not
released unless the judge decision exists, did not fail, selected at least one
ground, and reached `retrieval_runs`.

The audit write itself is allowed to fail without throwing away a paid-for
appeal — `persistRetrievalRun` swallows its own errors — but the case then fails
the checklist and goes to review rather than shipping a letter no stored record
explains.

In `shadow` mode the item does not gate release, because the deterministic path
is what ships. Making shadow mode block releases would make it useless for its
only purpose.

## Failure modes

All route to `MANUAL_REVIEW`, never `FAILED` — the customer has paid, and a judge
outage is our problem. They are labelled distinctly so a spike in one is
diagnosable without reading letters.

| Label | Meaning |
|---|---|
| `JUDGE_TRANSPORT_FAILED` | Could not reach the model. |
| `JUDGE_SCHEMA_INVALID` | Response was unparseable or the wrong shape. |
| `JUDGE_SELECTED_NONE` | Ran, but nothing survived enforcement. |
| `JUDGE_CEILING_REJECTED_ALL` | Everything admitted fell outside the ceiling. |

## Cost

One `ANALYSIS` call per generation, and the prompt carries the full prose
contract of each candidate module. Usage is recorded to `ai_usage` against the
case id, so per-appeal cost stays visible in `getCaseAIUsage`. In `shadow` mode
you are paying for a call whose output does not ship — that is the price of
measuring agreement before trusting it, and it is why shadow is a stage rather
than a destination.
