# Demo Flow

Customer journey, page by page, aligned with the client pack's Part 2
workflow.

## 1. `/` — Landing

Hero, "How it works" (Upload → Confirm → Answer → Generate), benefits,
FAQ placeholder, footer. Dark theme with pink/purple accents. Note
prominent: **prepared without admission that the identity of the driver
is known**.

## 2. `/start`

Explains the next step and offers six seeded demo cases — four of which
are the Part 11 worked examples (A–D) plus two additional cases exercising
the signage and authorisation routes end-to-end.

## 3. `/appeal/upload`

Drag-and-drop dropzone plus keyboard-accessible file input. Accepts PDF /
JPG / PNG up to 12 MB. States: `idle`, `loading`, `error` (with Retry /
Back). On success the bytes are POSTed to `/api/extract` and the returned
Part 3 variables are stored in the session.

## 4. `/appeal/confirm`

Every Part 3 variable is rendered as an editable input. Per-field
extraction confidence pill (when the provider returns one). Required
fields: operator name, PCN number, VRM, location, parking event date.
Notice route uses the pack vocabulary: `POSTAL`, `WINDSCREEN`, `UNKNOWN`.
Case stage is fixed to `INITIAL_OPERATOR_APPEAL`.

## 5. `/appeal/questions`

- **CQ01–CQ06** (Part 4). CQ02 is the driver-identification question —
  its only answers are `YES` / `NO` / `UNSURE`. We never ask who was
  driving.
- **CQ05** is a multi-select over neutral scenario tags. Selecting a tag
  opens the corresponding branch.
- **Branches** (Part 5): Keeper/PoFA, Payment, Keying, Consideration,
  Grace/Exit, ANPR, Authorisation, Signage, Landowner. Each renders the
  pack's questions with variable names matching those in the rules
  engine.
- Changing an earlier core answer discards branch answers that are no
  longer relevant.

## 6. `/appeal/evidence`

Typed evidence uploads — payment receipt, app screenshot, permit,
signage photo, ANPR evidence, location evidence, authorisation evidence,
other. Any number of items with optional descriptions. Enclosing at
least one item triggers `PP-EV-001` in the appeal.

## 7. `/appeal/review`

Two-column summary: PCN details + active routes. Rules engine runs
client-side to show the routes. Displays any pack warnings (e.g. Part 9
rule 7 "consideration + grace kept as separate grounds").

## 8. `/appeal/result`

Full letter preview styled as a UK appeal letter. **Download PDF** and
**Download Word** trigger `POST /api/generate`. The server re-runs the
engine and blocks generation (HTTP 422) if any variables are unresolved
or keeper-safe validation fails.

The preview never shows internal rule IDs or paragraph IDs (Part 9 rule
12). Verified by unit and E2E tests.

## Seeded demo cases (`/start`)

| ID | Pack reference | Pack-listed IDs |
| --- | --- | --- |
| `payment_keying` | Example A — Payment + Minor Keying Error | PP-PAY-001, 002, PP-KEY-001, 002, 004 |
| `anpr_multiple_visits` | Example B — Multiple Visits / ANPR | PP-ANPR-001, 002, 003, 004, 005, 012 |
| `keeper_late_ntk` | Example C — Keeper + Confirmed Late Postal NTK | PP-INTRO-001, 002, PP-POFA-001, 003, 006, 007 |
| `paid_short_exit` | Example D — Paid Parking + Short Exit Period | PP-GRACE-001, 005, 006 |
| `signage` | (not in Part 11) | PP-SIGN-001, 002, 003, 004, 012, 013 |
| `permit` | (not in Part 11) | PP-AUTH-001, 002, 003, 010 |

The first four are validated by `tests/unit/workedExamples.test.ts` to
match the pack exactly. All six are validated end-to-end by
`tests/integration/endToEnd.test.ts`.

## Responsive breakpoints

Tailwind's `xs`, `sm-plus`, `md-plus`, `sm`, `md`, `lg`, `xl` classes are
used with fluid `container-page`. Playwright runs at 1440 (desktop),
1024 (tablet, Chromium-based) and Pixel 5 (mobile).

## Accessibility

Every form control has a real label; radio and checkbox groups use
`fieldset`/`legend`; the progress steps use `aria-current="step"`; focus
rings are visible via `:focus-visible`; keyboard navigation reaches every
control.
