# Rule Engine

**Single source of truth:** `Private_Parking_Appeal_Automation_MASTER_Developer_Pack.pdf`
(supplied by the client) — specifically Parts 3–11.

Deterministic. Pure. No AI. Never asks who was driving.

## Contract

```ts
evaluate(input: RuleInput): RuleEvaluation
```

```ts
interface RuleInput {
  pcn: ConfirmedPcn;        // customer-confirmed only
  answers: AllAnswers;      // core + branch answers
  evidence: EvidenceItem[]; // enclosed evidence items
}

interface RuleEvaluation {
  matchedRuleIds: string[];        // e.g. ["PP-R001", "PP-R008", "PP-R008-MINOR"]
  matchedParagraphIds: string[];   // approved paragraph IDs from the pack
  activeRoutes: Route[];           // KEEPER_ROUTE, PAYMENT_ROUTE, …
  warnings: string[];              // e.g. Part 9 rule 7 note
  decisionTrace: RuleTraceEntry[]; // audit log of every rule considered
}
```

Every rule is a **pure function of the input**. No time-based logic, no
network, no LLM.

## Universal paragraphs (Part 9)

- **PP-INTRO-001** is emitted by `PP-R001` — the unidentified-driver
  keeper route. Every appeal built via this system is in the keeper's
  name, so this is effectively always present.
- **PP-INTRO-002** is emitted by `PP-R001` too — the driver-not-identified
  intro paragraph. It only appears when `driver_identified = NO`.
- **PP-POFA-001** is emitted by `PP-R002` whenever the keeper route is
  active.
- **PP-EV-001** is appended by the engine whenever ≥ 1 evidence item is
  enclosed with the appeal.
- **PP-END-001** is always appended by the engine (Part 9 rule 12
  compliant — the letter body never contains its ID).

## Rule table (Part 6)

Rules match the pack exactly. Sub-rules such as `PP-R005A-VEHICLE_LAND_PERIOD`
implement the "specific applicable defect" branches called for by rule
`PP-R005A`.

| Rule ID | Route | Paragraphs | When |
|---|---|---|---|
| `PP-R001` | KEEPER_ROUTE | PP-INTRO-001, PP-INTRO-002 | registered_keeper = YES AND driver_identified = NO |
| `PP-R002` | KEEPER_ROUTE | PP-POFA-001 | KEEPER_ROUTE active |
| `PP-R003` | KEEPER_ROUTE | PP-POFA-002 | Above + notice_to_keeper_received = NO |
| `PP-R004` | KEEPER_ROUTE | PP-POFA-003 | notice_route = POSTAL AND postal timing failure confirmed |
| `PP-R005` | KEEPER_ROUTE | PP-POFA-004 | notice_route = WINDSCREEN AND NTK timing failure confirmed |
| `PP-R005A` (+ sub-rules) | KEEPER_ROUTE | PP-POFA-005A / B / C / D / E | specific Schedule 4 content defect confirmed |
| `PP-R005B` | KEEPER_ROUTE | PP-POFA-006, PP-POFA-007 | any valid PoFA failure + driver not identified |
| `PP-R006` (+ evidence) | PAYMENT_ROUTE | PP-PAY-001 (+ PP-PAY-002) | parking_payment_made = YES |
| `PP-R007A` (+ evidence) | PAYMENT_ROUTE | PP-PAY-003 (+ PP-PAY-003A) | attempted + machine_problem |
| `PP-R007B` (+ evidence) | PAYMENT_ROUTE | PP-PAY-004 (+ PP-PAY-004A) | attempted + payment_system_problem |
| `PP-R007C` | PAYMENT_ROUTE | PP-PAY-005 | attempted + not completed + factual reason |
| `PP-R008` (+ MINOR/OTHER_VEHICLE/CONFIRMED) | KEYING_ERROR_ROUTE | PP-KEY-001 + 002/003 + 004 | payment_made + vrm_error |
| `PP-R009`/`PP-R010` (+ reason sub-rules) | CONSIDERATION_ROUTE | PP-CON-001..006 | short_stay + factual reason |
| `PP-R011`/`PP-R011A` | GRACE_ROUTE | PP-GRACE-001..006/008 | period ended + grace applicable |
| `PP-R012` (+ ELSEWHERE) | ANPR_DOUBLE_VISIT | PP-ANPR-003, 005 (+ 004) | multiple_visits_same_day |
| `PP-R013` | ANPR_ROUTE | PP-ANPR-001, 002 | duration disputed + ANPR |
| `PP-R014` | ANPR_ROUTE | PP-ANPR-012 | external evidence contradicts ANPR |
| `PP-R015` | ANPR_ROUTE | PP-ANPR-010, 011 | incomplete sequence / pairing suspected |
| `PP-R016` | ANPR_ROUTE | PP-ANPR-007, 009 | timestamp discrepancy |
| `PP-R017` | ANPR_ROUTE | PP-ANPR-008 | VRM image or reading disputed |
| `PP-R018`..`PP-R022` (+ sub-rules) | AUTHORISATION_ROUTE | PP-AUTH-001..011 | permit / visitor / customer variations |
| `PP-R023`..`PP-R028` (+ sub-rules) | SIGNAGE_ROUTE | PP-SIGN-001..013 | credible signage issue |
| `PP-R029`..`PP-R033` | LANDOWNER | PP-LAND-001..009 | authority challenged |

The full rule table lives in [`rules/rules.ts`](../rules/rules.ts).

## Assembly & deduplication (Part 9)

- Paragraphs are ordered by `priority`. Intro (10–15) < PoFA (50–70) <
  primary factual grounds (100–200) < secondary signage / authority /
  landowner (260–316) < evidence (400) < closing (900+).
- **Deduplication is by paragraph ID only.** A paragraph is never dropped
  because it shares a factual anchor with another. Example A in Part 11
  explicitly lists both `PP-PAY-001` and `PP-KEY-001` even though both
  assert that a payment was made.
- Consideration and grace are never merged (Part 9 rule 7); a warning is
  emitted if both routes are active.
- Universal "10 minutes = cancellation" is not implemented; the grace
  paragraphs only fire when the pack's specific conditions are met.
- Permit-held is not treated as automatic cancellation; `PP-AUTH-002` is
  part of a broader assessment.
- Landowner authority at the initial appeal stage is a concise proof
  request (Part 9 rule 11) — `PP-LAND-001` / `PP-LAND-002` — not an
  unsupported claim that authority does not exist.
- No `£100 unlawful penalty` argument is generated (Part 9 rule 10).
- Rule IDs and paragraph IDs never appear in the customer-facing appeal
  body (Part 9 rule 12) — verified by unit and E2E tests.

## Variable substitution (Part 3)

All Part 3 PCN data variables are supported, plus `permission_source` and
`alleged_term` used by `PP-AUTH-003` and `PP-SIGN-012`. Any placeholder
that cannot be resolved **blocks generation** — `/api/generate` returns
HTTP 422.

## Keeper-safe validation (Part 10)

`lib/keeperSafe.ts` implements the Part 10 approved transformations for
free-text customer input, plus a validator that scans the final assembled
body. Every active paragraph in the library is separately covered by an
invariant test to be keeper-safe. The validator's unsafe patterns target
first-person driver wording and driver-identification prompts; legitimate
statutory references (e.g. `PP-POFA-005E`) are not affected.
