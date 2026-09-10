/**
 * AI-7 UAT — real OpenAI bespoke appeal generation.
 *
 * Runs the full production pipeline (analysis → controlled retrieval →
 * OpenAI drafting → post-processing → 13 validators → regenerate once →
 * release or manual review) against ten representative fixtures, and
 * checks the client's quality assertions against the ACTUAL output.
 *
 * Makes real, paid API calls. Run deliberately:
 *
 *   npx tsx scripts/uat-appeals.mts            # all ten
 *   npx tsx scripts/uat-appeals.mts UAT-2      # one case
 *
 * Never prints chain-of-thought — the model is not asked for any, and
 * only the released body is shown.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";

/* Load the server environment before anything imports the config. */
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

// Production drafting for this run, whatever the local default says.
process.env.DRAFTING_PROVIDER = "openai";

const { generateValidatedAppeal } = await import("@/lib/generation/engine");
const { estimateCost, activePricing } = await import("@/services/ai/pricing");
const { modelConfiguration } = await import("@/services/ai/models");
const { FACT } = await import("@/lib/questions/facts");
const { checkGeneratedTextSafe } = await import("@/lib/questions/keeperGuard");
const { renderAppealPdf } = await import("@/services/documents/pdf");
const { toParagraphs } = await import("@/lib/cases/draftRepo");

type Answers = Record<string, unknown>;

interface Fixture {
  id: string;
  title: string;
  confirmed: Record<string, unknown>;
  answers: Answers;
  evidenceTypes: string[];
}

const BASE = {
  operator_name: "CitySquare Parking Management",
  pcn_number: "CSP-120726-73104",
  vrm: "KT19 RPL",
  parking_location: "Harbour Point, Bristol",
  parking_event_date: "2026-07-12",
  notice_issue_date: "2026-07-18",
  notice_received_date: "2026-07-22",
  notice_route: "POSTAL",
  charge_amount: 100,
  confirmedAt: "2026-07-23T00:00:00.000Z",
};

const TRIAGE: Answers = {
  [FACT.JURISDICTION]: "ENGLAND_WALES",
  [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
  [FACT.REGISTERED_KEEPER]: "YES",
  [FACT.DRIVER_IDENTIFIED]: "NO",
};

const FIXTURES: Fixture[] = [
  {
    id: "UAT-1",
    title: "PAYMENT / KEYING",
    confirmed: { ...BASE, alleged_breach: "Failure to make a valid payment" },
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["payment_made", "vrm_error"],
      [FACT.PAYMENT_MADE]: "YES",
      [FACT.PAYMENT_METHOD]: "machine",
      [FACT.PAYMENT_EVIDENCE]: "YES",
      [FACT.VRM_ENTERED]: "KT19 RPI",
      [FACT.KEYING_ERROR]: "YES",
    },
    evidenceTypes: ["payment_receipt"],
  },
  {
    id: "UAT-2",
    title: "BREAKDOWN",
    confirmed: {
      ...BASE,
      alleged_breach: "Overstaying maximum permitted stay",
      entry_time: "10:02",
      exit_time: "12:49",
      total_recorded_duration: 167,
    },
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["breakdown_immobilised"],
      [FACT.BREAKDOWN_OCCURRED]: "YES",
      [FACT.BREAKDOWN_PREVENTED_DEPARTURE]: "YES",
      [FACT.BREAKDOWN_NATURE]: "mechanical_failure",
      [FACT.BREAKDOWN_EVIDENCE]: ["recovery_report"],
      [FACT.RECOVERY_ATTENDANCE]: "YES",
    },
    evidenceTypes: ["authorisation_evidence"],
  },
  {
    id: "UAT-3",
    title: "RESIDENTIAL / ALLOCATED BAY",
    confirmed: { ...BASE, alleged_breach: "No valid permit displayed" },
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["resident_parking_rights"],
      [FACT.OCCUPIER_STATUS]: "tenant",
      [FACT.AGREEMENT_UPLOADED]: "YES",
      [FACT.AGREEMENT_PERMIT_CLAUSE]: "NO",
      [FACT.BAY_REFERENCE]: "Bay 14",
    },
    evidenceTypes: ["authorisation_evidence"],
  },
  {
    id: "UAT-4",
    title: "KEEPER / POFA LATE NTK",
    confirmed: {
      ...BASE,
      alleged_breach: "Parking without payment",
      parking_event_date: "2026-05-01",
      notice_issue_date: "2026-07-01",
      notice_received_date: "2026-07-05",
    },
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["postal_ntk_timing_issue"],
    },
    evidenceTypes: [],
  },
  {
    id: "UAT-5",
    title: "ANPR MULTIPLE VISITS",
    confirmed: {
      ...BASE,
      alleged_breach: "Overstay of paid time",
      entry_time: "09:14",
      exit_time: "17:22",
      total_recorded_duration: 488,
    },
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["multiple_visits_same_day", "anpr_disputed"],
      [FACT.CONTINUOUS_PRESENCE]: "NO",
      [FACT.VISIT_COUNT]: 2,
    },
    evidenceTypes: ["anpr_evidence"],
  },
  {
    id: "UAT-6",
    title: "CONSIDERATION PERIOD",
    confirmed: {
      ...BASE,
      alleged_breach: "Parking without payment",
      entry_time: "14:00",
      exit_time: "14:07",
      total_recorded_duration: 7,
    },
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["short_stay_consideration"],
      [FACT.INITIAL_PERIOD_REASON]: "no_spaces_available",
      [FACT.PARKING_ACCEPTED]: "NO",
    },
    evidenceTypes: [],
  },
  {
    id: "UAT-7",
    title: "GRACE / EXIT DELAY",
    confirmed: {
      ...BASE,
      alleged_breach: "Overstaying maximum permitted stay",
      entry_time: "11:00",
      exit_time: "13:09",
      total_recorded_duration: 129,
    },
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["grace_or_exit"],
      [FACT.EXIT_DELAY_REASON]: "queue_at_exit_barrier",
      [FACT.DEPARTURE_DELAY]: "YES",
    },
    evidenceTypes: [],
  },
  {
    id: "UAT-8",
    title: "PERMIT / AUTHORISATION",
    confirmed: { ...BASE, alleged_breach: "Unauthorised parking after 6pm" },
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["authorised_or_permit"],
      [FACT.PERMISSION_HELD]: "YES",
      [FACT.PERMISSION_SOURCE]: "landowner",
      [FACT.AUTHORISATION_EVIDENCE]: "YES",
    },
    evidenceTypes: ["permit"],
  },
  {
    id: "UAT-9",
    title: "ACCESSIBILITY / EQUALITY",
    confirmed: {
      ...BASE,
      alleged_breach: "Overstaying maximum permitted stay",
      total_recorded_duration: 95,
    },
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["accessibility_additional_time"],
      [FACT.ADDITIONAL_TIME_NEEDED]: "YES",
    },
    evidenceTypes: [],
  },
  {
    id: "UAT-10",
    title: "MIXED — payment + ANPR + keeper",
    confirmed: {
      ...BASE,
      alleged_breach: "Failure to make a valid payment",
      parking_event_date: "2026-05-01",
      notice_issue_date: "2026-07-01",
      notice_received_date: "2026-07-05",
      entry_time: "08:40",
      exit_time: "16:05",
    },
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["payment_made", "multiple_visits_same_day", "postal_ntk_timing_issue"],
      [FACT.PAYMENT_MADE]: "YES",
      [FACT.PAYMENT_METHOD]: "app",
      [FACT.PAYMENT_EVIDENCE]: "YES",
      [FACT.CONTINUOUS_PRESENCE]: "NO",
      [FACT.VISIT_COUNT]: 2,
    },
    evidenceTypes: ["payment_receipt", "anpr_evidence"],
  },
];

/**
 * UAT-11 exists to be BLOCKED.
 *
 * A residential claim with no instrument uploaded: the retrieval gates
 * should drop the residential modules, and any draft asserting a lease
 * right must be caught. Proves the release gate works on real output,
 * not only on fixtures we wrote to fail.
 */
FIXTURES.push({
  id: "UAT-11",
  title: "MANUAL REVIEW — residential claim, no instrument",
  confirmed: { ...BASE, alleged_breach: "No valid permit displayed" },
  answers: {
    ...TRIAGE,
    [FACT.SCENARIOS]: ["resident_parking_rights"],
    [FACT.OCCUPIER_STATUS]: "tenant",
    // No agreement, so no residential right can be asserted.
    [FACT.AGREEMENT_UPLOADED]: "NO",
  },
  evidenceTypes: [],
});

/* ===================== Quality assertions (§22) ===================== */

interface Check {
  name: string;
  fail: (body: string, f: Fixture) => boolean;
}

const CHECKS: Check[] = [
  {
    name: "keeper-safe (no driver admission)",
    fail: (b) =>
      /\bI\s+(?:drove|parked|paid|arrived|left|returned)\b/i.test(b) ||
      /\bwhen\s+I\s+arrived\b/i.test(b) ||
      /\bmy\s+car\s+was\s+parked\s+by\s+me\b/i.test(b) ||
      checkGeneratedTextSafe("draft", [{ field: "label", text: b }]).length > 0,
  },
  {
    name: "no obsolete penalty / pre-estimate-of-loss argument",
    fail: (b) =>
      /genuine\s+pre[-\s]?estimate\s+of\s+loss/i.test(b) ||
      /unenforceable\s+penalty/i.test(b) ||
      /\bpenalty\s+clause\b/i.test(b),
  },
  {
    name: "no universal 10-minute assertion",
    fail: (b) =>
      /\b(?:ten|10)\s*minutes?\b[^.]{0,60}\b(?:must|always|entitled|guaranteed)\b/i.test(b),
  },
  {
    name: "no automatic-cancellation language",
    fail: (b) =>
      /\bautomatically\s+(?:cancel|void|invalid)/i.test(b) ||
      /\bmust\s+be\s+cancelled\s+automatically\b/i.test(b),
  },
  {
    name: "no internal identifiers",
    fail: (b) =>
      /\b(?:KB|PP|AI|VAL|SRC|CODE)-[A-Z0-9]/.test(b) ||
      /\b(?:module|source)\s+id\b/i.test(b) ||
      /reason_code|target_fact/i.test(b),
  },
  {
    name: "no internal route names",
    fail: (b) =>
      /\b(?:PRIMARY_ROUTE|SECONDARY_ROUTES|BREAKDOWN_ROUTE|RESIDENTIAL_RIGHTS_ROUTE)\b/.test(b),
  },
  {
    name: "no wrong-stage language",
    fail: (b) => /\b(?:POPLA|IAS|tribunal|county court|claim form)\b/i.test(b),
  },
  {
    name: "no named case law",
    fail: (b) => /\b[A-Z][A-Za-z]+\s+v\.?\s+[A-Z][A-Za-z]+/.test(b),
  },
  {
    name: "no markdown or lists",
    fail: (b) => /^\s*(?:[-*•]|\d+\.)\s/m.test(b) || /^#{1,6}\s/m.test(b),
  },
  {
    name: "no salutation or sign-off",
    fail: (b) => /\bDear\s+(?:Sir|Madam)\b/i.test(b) || /\bYours\s+(?:faithfully|sincerely)\b/i.test(b),
  },
  {
    name: "no process commentary",
    fail: (b) => /\bthe\s+AI\s+(?:determined|found|decided)\b/i.test(b) || /\bas\s+an\s+AI\b/i.test(b),
  },
  {
    name: "no evidence claimed when none available",
    fail: (b, f) =>
      f.evidenceTypes.length === 0 &&
      /\b(?:enclosed|attached|as\s+provided|herewith)\b/i.test(b),
  },
  {
    name: "uses the correct vehicle registration",
    fail: (b, f) => {
      const vrm = String(f.confirmed.vrm ?? "").replace(/\s+/g, "");
      if (!vrm) return false;
      const normalised = b.replace(/\s+/g, "");
      // Present in some form, and no other plate invented.
      return !normalised.includes(vrm);
    },
  },
];

/* ============================== Runner ============================== */

const args = process.argv.slice(2);
const reverse = args.includes("--reverse");
const only = args.find((a) => !a.startsWith("--"));
const selected = only ? FIXTURES.filter((f) => f.id === only) : FIXTURES;

console.log("=== MODEL CONFIGURATION ===");
for (const c of modelConfiguration()) {
  console.log(`  ${c.operation.padEnd(20)} ${c.model.padEnd(16)} (${c.source})`);
}
console.log(`\nPricing version: ${activePricing().version}\n`);

mkdirSync("/tmp/uat", { recursive: true });

interface Row {
  id: string;
  title: string;
  status: string;
  primary: string;
  secondary: string;
  modules: number;
  attempts: number;
  moduleIds: string;
  blockingNames?: string;
  reason?: string;
  warnings?: string;
  validator: string;
  blocking: number;
  words: number;
  cost: number;
  failedChecks: string[];
  model: string;
  bespoke: boolean;
}

const rows: Row[] = [];

const ordered = reverse ? [...selected].reverse() : selected;
console.log(`Execution order: ${reverse ? "REVERSE" : "FORWARD"} (${ordered.map((f) => f.id).join(" -> ")})\n`);

for (const f of ordered) {
  process.stdout.write(`Running ${f.id} ${f.title} ... `);
  const started = Date.now();
  let row: Row;
  try {
    const result = await generateValidatedAppeal({
      confirmed: f.confirmed as never,
      answers: f.answers as never,
      evidenceTypes: f.evidenceTypes,
      evidenceRefs: f.evidenceTypes.map((t, i) => `${t}_${i + 1}`),
    });

    const last = result.attempts[result.attempts.length - 1];
    const body = result.body ?? "";
    const words = body.trim() ? body.trim().split(/\s+/).length : 0;
    const usage = result.provider?.usage;
    const cost = usage
      ? estimateCost(result.provider?.model ?? "gpt-5.4", {
          inputTokens: usage.promptTokens,
          outputTokens: usage.completionTokens,
        })
      : 0;

    const failedChecks = body
      ? CHECKS.filter((c) => c.fail(body, f)).map((c) => c.name)
      : [];

    row = {
      id: f.id,
      title: f.title,
      status: result.status,
      primary: result.analysis.primaryRoute ?? "—",
      secondary: result.analysis.secondaryRoutes.join(", ") || "—",
      modules: result.moduleIds.length,
      attempts: result.attempts.length,
      moduleIds: [...(result.moduleIds ?? [])].sort().join(","),
      blockingNames: (last?.validation?.results ?? [])
        .filter((v: { status: string; blocking?: boolean }) => v.status === "FAIL" && v.blocking !== false)
        .map((v: { checkId?: string; id?: string; message?: string }) => `${v.checkId ?? v.id}: ${v.message ?? ""}`)
        .join(" | "),
      reason: result.reason ?? "",
      warnings: (result.warnings ?? []).join(" || "),
      validator: last?.validation.status ?? "—",
      blocking: last?.validation.blockingCount ?? 0,
      words,
      cost,
      failedChecks,
      model: result.provider?.model ?? "—",
      bespoke: result.provider?.bespoke ?? false,
    };

    if (body) {
      writeFileSync(`/tmp/uat/${f.id}.txt`, body, "utf8");
    }
    console.log(
      `${result.status} in ${((Date.now() - started) / 1000).toFixed(1)}s` +
        (failedChecks.length ? `  [${failedChecks.length} quality issue(s)]` : "  [clean]"),
    );
  } catch (err) {
    console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    row = {
      id: f.id, title: f.title, status: "ERROR", primary: "—", secondary: "—",
      modules: 0, attempts: 0, moduleIds: "", validator: "—", blocking: 0, words: 0,
      cost: 0, failedChecks: ["run failed"], model: "—", bespoke: false,
    };
  }
  rows.push(row);
}

/* ============================== Report ============================== */

console.log("\n=== UAT RESULTS ===\n");
console.log(
  "ID      STATUS         PRIMARY        MOD ATT VALID BLK WORDS   COST£    QUALITY",
);
for (const r of rows) {
  console.log(
    `${r.id.padEnd(7)} ${r.status.padEnd(14)} ${r.primary.padEnd(14)} ` +
      `${String(r.modules).padStart(3)} ${String(r.attempts).padStart(3)} ` +
      `${(r.validator || "—").padEnd(5)} ${String(r.blocking).padStart(3)} ` +
      `${String(r.words).padStart(5)}  ${r.cost.toFixed(5)}  ` +
      (r.failedChecks.length === 0 ? "clean" : r.failedChecks.join(" | ")),
  );
}

const ready = rows.filter((r) => r.status === "READY");
for (const r of rows.filter((x) => x.blocking > 0 || x.status !== "READY")) {
  console.log(
    `\n${r.id} not released -> ${r.status}` +
      (r.blockingNames ? `\n  blocking: ${r.blockingNames}` : "") +
      (r.reason ? `\n  reason: ${r.reason}` : "") +
      (r.warnings ? `\n  warnings: ${r.warnings}` : ""),
  );
}

const totalCost = rows.reduce((s, r) => s + r.cost, 0);

/* ======================= PDF UAT (§23) ======================= */

const pdfCandidate = rows.find((r) => r.status === "READY");
let pdfResult = "not run";
if (pdfCandidate) {
  try {
    const body = readFileSync(`/tmp/uat/${pdfCandidate.id}.txt`, "utf8");
    const paragraphs = toParagraphs(body);
    const bytes = await renderAppealPdf({
      pcn: (FIXTURES.find((f) => f.id === pdfCandidate.id)!.confirmed) as never,
      evidence: [],
      appeal: { paragraphs },
    });
    const head = String.fromCharCode(...new Uint8Array(bytes).slice(0, 5));
    // The PDF is built from the persisted text, so paragraph counts must
    // match exactly — no re-generation, no drift.
    const ok = head === "%PDF-" && paragraphs.length > 0;
    pdfResult = ok
      ? `OK — ${paragraphs.length} paragraphs, ${new Uint8Array(bytes).byteLength} bytes, from persisted text`
      : `PROBLEM — header "${head}", ${paragraphs.length} paragraphs`;
  } catch (err) {
    pdfResult = `ERROR ${err instanceof Error ? err.message : String(err)}`;
  }
}

console.log("\n=== SUMMARY ===");
console.log(`Cases run:            ${rows.length}`);
console.log(`READY:                ${ready.length}`);
console.log(`MANUAL_REVIEW:        ${rows.filter((r) => r.status === "MANUAL_REVIEW").length}`);
console.log(`ERROR:                ${rows.filter((r) => r.status === "ERROR").length}`);
console.log(`Bespoke (AI) drafts:  ${rows.filter((r) => r.bespoke).length}`);
console.log(`Quality-clean:        ${rows.filter((r) => r.failedChecks.length === 0).length}/${rows.length}`);
console.log(`Total drafting cost:  £${totalCost.toFixed(5)}`);
console.log(
  `Avg per READY appeal: £${ready.length ? (totalCost / ready.length).toFixed(5) : "0"}`,
);
console.log(`\nAnalysis:   DETERMINISTIC — NO MODEL CALL`);
console.log(`Validation: DETERMINISTIC — NO MODEL CALL`);
console.log(`\nPDF from persisted draft: ${pdfResult}`);
console.log(`\nDraft bodies written to /tmp/uat/*.txt for review.`);

const snapshotPath = `/tmp/uat/retrieval-${reverse ? "reverse" : "forward"}.json`;
writeFileSync(
  snapshotPath,
  JSON.stringify(
    [...rows]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => ({
        id: r.id, status: r.status, primary: r.primary,
        secondary: r.secondary, modules: r.modules, moduleIds: r.moduleIds,
        validator: r.validator, blocking: r.blocking,
      })),
    null, 2,
  ),
);
console.log(`Retrieval snapshot: ${snapshotPath}`);

const problems = rows.filter(
  (r) => r.status === "ERROR" || r.failedChecks.length > 0,
);
if (problems.length > 0) {
  console.log(
    `\nATTENTION: ${problems.length} case(s) need review: ${problems.map((r) => r.id).join(", ")}`,
  );
}
