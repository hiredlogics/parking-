/**
 * Complete AI cost for one appeal.
 *
 * The earlier UAT harness measured drafting only, because that is the
 * one provider that returns usage on its result. Extraction and
 * question generation record usage to `ai_usage` instead, so the honest
 * way to get a whole-appeal figure is to run one real case end to end
 * and then read the per-operation totals back out of the database.
 *
 * That also means this exercises the AI-4 usage tracking rather than
 * measuring around it: if a provider fails to attribute a call to the
 * case, the total here will be visibly short.
 *
 * Makes REAL, PAID API calls. Run deliberately:
 *   npx tsx scripts/uat-full-cost.mts
 *
 * The PCN is generated rather than committed as a fixture, so no real
 * customer document is needed to reproduce the measurement.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import { randomUUID } from "node:crypto";
import { getSql, hasDb } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";
import * as caseRepo from "@/lib/cases/repo";
import { createCustomerAccount } from "@/lib/db/repos";
import { getExtractionProvider } from "@/services/extraction";
import { nextDynamicQuestion } from "@/lib/questions/dynamicEngine";
import { applyAnswerToFact } from "@/lib/questions/applyAnswer";
import { generateValidatedAppeal } from "@/lib/generation/engine";
import { getCaseAIUsage } from "@/lib/ai/usage";
import { modelConfiguration, modelFor } from "@/services/ai/models";
import { activePricing } from "@/services/ai/pricing";
import { FACT } from "@/lib/questions/facts";
import type { AnswerMap } from "@/lib/questions/types";
import type { ConfirmedPcn } from "@/types";

/* ------------------------------------------------------------------ */
/* The notice                                                          */
/* ------------------------------------------------------------------ */

const NOTICE = {
  operator: "CitySquare Parking Management",
  pcn: "CSP-120726-73104",
  vrm: "KT19 RPL",
  location: "Harbour Point, Bristol BS1 5TY",
  eventDate: "12 July 2026",
  issueDate: "18 July 2026",
  breach: "Failure to make a valid payment for the period of parking",
  amount: "£100.00",
  reduced: "£60.00",
  entry: "10:42",
  exit: "12:19",
};

async function buildPcnPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 780;
  const line = (text: string, size = 11, useBold = false) => {
    page.drawText(text, { x: 50, y, size, font: useBold ? bold : font });
    y -= size + 7;
  };

  line("NOTICE TO KEEPER", 18, true);
  y -= 6;
  line(NOTICE.operator, 13, true);
  line("Parking Charge Notice issued under the Protection of Freedoms Act 2012");
  y -= 10;
  line(`Notice number: ${NOTICE.pcn}`, 11, true);
  line(`Vehicle registration mark: ${NOTICE.vrm}`, 11, true);
  y -= 6;
  line(`Date of parking event: ${NOTICE.eventDate}`);
  line(`Date this notice was issued: ${NOTICE.issueDate}`);
  line(`Location: ${NOTICE.location}`);
  y -= 6;
  line(`Time of entry: ${NOTICE.entry}`);
  line(`Time of exit: ${NOTICE.exit}`);
  y -= 10;
  line("Reason for issue:", 11, true);
  line(NOTICE.breach);
  y -= 10;
  line(`Amount payable: ${NOTICE.amount}`, 11, true);
  line(`Reduced to ${NOTICE.reduced} if paid within 14 days of issue.`);
  y -= 14;
  line("We are a member of the British Parking Association Approved Operator Scheme.");
  line("You have the right to appeal to us, and thereafter to POPLA.");

  return doc.save();
}

/* ------------------------------------------------------------------ */
/* Deterministic answers, keyed by the fact the engine asks for        */
/* ------------------------------------------------------------------ */

const ANSWERS: Record<string, unknown> = {
  [FACT.JURISDICTION]: "ENGLAND_WALES",
  [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
  [FACT.REGISTERED_KEEPER]: "YES",
  [FACT.DRIVER_IDENTIFIED]: "NO",
  [FACT.NOTICE_ROUTE]: "POSTAL",
  [FACT.SCENARIOS]: ["payment_made", "vrm_error"],
  [FACT.PAYMENT_MADE]: "YES",
  [FACT.PAYMENT_METHOD]: "machine",
  [FACT.PAYMENT_EVIDENCE]: "YES",
  [FACT.VRM_ENTERED]: "KT19 RPI",
  [FACT.KEYING_ERROR]: "YES",
};

/** Answer for a fact, falling back to something type-appropriate. */
function answerFor(fact: string, question: { type: string; options?: Array<{ value: string }> }): unknown {
  if (fact in ANSWERS) return ANSWERS[fact];
  // Unmapped fact: take the first offered option, or decline.
  if (question.options && question.options.length > 0) return question.options[0].value;
  if (question.type === "boolean") return true;
  return null;
}

const money = (n: number) => `£${n.toFixed(5)}`;

async function main() {
  if (!hasDb()) throw new Error("DATABASE_URL is required to record usage.");
  await ensureSchema();

  console.log("=== MODEL CONFIGURATION ===");
  for (const c of modelConfiguration()) {
    console.log(`  ${c.operation.padEnd(20)} ${c.model.padEnd(16)} (${c.source})`);
  }
  console.log(`\nPricing version: ${activePricing().version}\n`);

  /* ---- A real customer and case, so usage can be attributed ---- */
  const email = `cost-probe-${Date.now()}@example.invalid`;
  const client = await createCustomerAccount({
    id: `cl_cost${Date.now().toString(36)}`,
    name: "Cost Probe",
    email,
    passwordHash: "not-a-login-account",
  });
  const appealCase = await caseRepo.createCase({ customerId: client.id });
  console.log(`Case ${appealCase.publicId} (${appealCase.id})\n`);

  /* ---- 1. EXTRACTION (real vision call) ---- */
  console.log("1. EXTRACTION");
  const pdf = await buildPcnPdf();
  console.log(`   notice PDF generated (${pdf.byteLength} bytes)`);

  const extractor = getExtractionProvider();
  const t0 = Date.now();
  const extraction = await extractor.extract({
    name: "notice-to-keeper.pdf",
    mimeType: "application/pdf",
    bytes: pdf,
    caseId: appealCase.id,
  });
  console.log(`   model: ${modelFor("EXTRACTION")}  in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const raw = extraction.raw;
  console.log(`   pcn_number:  ${raw.pcn_number ?? "—"}`);
  console.log(`   vrm:         ${raw.vrm ?? "—"}`);
  console.log(`   event_date:  ${raw.parking_event_date ?? "—"}`);
  console.log(`   issue_date:  ${raw.notice_issue_date ?? "—"}`);
  console.log(`   charge:      ${raw.charge_amount ?? "—"}`);
  console.log(`   breach:      ${String(raw.alleged_breach ?? "").slice(0, 60)}`);
  if (extraction.warnings.length > 0) {
    console.log(`   warnings:    ${extraction.warnings.join("; ").slice(0, 120)}`);
  }
  await caseRepo.saveExtraction(appealCase.id, extraction);

  /* ---- 2. CONFIRMATION (deterministic, no AI) ---- */
  /*
   * What the customer confirms: the extracted values, with only the
   * fields a notice cannot carry filled in.
   */
  const confirmed: ConfirmedPcn = {
    ...raw,
    notice_received_date: raw.notice_received_date ?? "2026-07-22",
    notice_route: raw.notice_route ?? "POSTAL",
    confirmedAt: new Date().toISOString(),
  };

  /* ---- 3. ADAPTIVE QUESTIONS (real AI, one at a time) ---- */
  console.log("\n2. QUESTION GENERATION");
  let answers: AnswerMap = {};
  let eligibleRoutes: string[] = [];
  const askedFacts: string[] = [];
  const askedLabels: string[] = [];
  const evidenceTypes = ["payment_receipt"];
  let asked = 0;

  for (let i = 0; i < 25; i++) {
    const outcome = await nextDynamicQuestion({
      caseId: appealCase.id,
      confirmed,
      answers,
      evidenceTypes,
      allegedBreach: confirmed.alleged_breach ?? null,
      askedFacts,
      askedLabels,
    });

    eligibleRoutes = [...(outcome.eligibleRoutes ?? [])];
    if (outcome.status !== "QUESTION_REQUIRED") {
      console.log(`   -> ${outcome.status}`);
      if (outcome.status === "MANUAL_REVIEW" || outcome.status === "OUT_OF_SCOPE") {
        console.log(`      ${JSON.stringify(outcome).slice(0, 200)}`);
      }
      break;
    }

    asked += 1;
    const { question, targetFact, provenance } = outcome;
    console.log(
      `   Q${asked} [${provenance.source ?? JSON.stringify(provenance)}] ${targetFact}: ${question.label.slice(0, 70)}`,
    );

    const value = answerFor(targetFact, question);
    const applied = applyAnswerToFact(answers, question, targetFact, value as never);
    if (!applied.ok) {
      console.log(`      !! rejected: ${applied.error}`);
      // Mark asked anyway so the loop cannot spin on one fact.
      answers = { ...answers, [`__askedfact:${targetFact}`]: true };
    } else {
      answers = applied.answers;
    }
    askedFacts.push(targetFact);
    askedLabels.push(question.label);
  }
  console.log(`   questions asked: ${asked}`);

  await caseRepo.saveAnswers(appealCase.id, {
    adaptiveAnswers: answers,
    askedQuestionIds: askedFacts,
    questioningComplete: true,
    missingFacts: [],
    candidateRoutes: eligibleRoutes as never,
  });

  /* ---- 4. DRAFTING + VALIDATION (real AI) ---- */
  console.log("\n3. DRAFTING + VALIDATION");
  const t1 = Date.now();
  const result = await generateValidatedAppeal({
    caseId: appealCase.id,
    confirmed,
    answers,
    evidenceTypes,
    evidenceRefs: evidenceTypes,
  });
  console.log(`   model: ${modelFor("DRAFTING")}  in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  console.log(`   status:          ${result.status}`);
  console.log(`   primary route:   ${result.analysis?.primaryRoute ?? "—"}`);
  console.log(`   modules used:    ${result.moduleIds?.length ?? 0}`);
  console.log(`   draft attempts:  ${result.attempts?.length ?? 0}`);
  const words = result.body ? result.body.split(/\s+/).filter(Boolean).length : 0;
  console.log(`   words:           ${words}`);

  /* ---- 5. COST, READ BACK FROM ai_usage ---- */
  const usage = await getCaseAIUsage(appealCase.id);
  const rows: Array<[string, typeof usage.extraction]> = [
    ["EXTRACTION", usage.extraction],
    ["QUESTION_GENERATION", usage.questioning],
    ["DRAFTING", usage.drafting],
    ["ANALYSIS", usage.analysis],
    ["VALIDATION", usage.validation],
  ];

  console.log("\n=== COMPLETE AI COST FOR ONE APPEAL ===\n");
  console.log(
    `${"PHASE".padEnd(22)}${"CALLS".padStart(6)}${"IN TOK".padStart(9)}${"OUT TOK".padStart(9)}${"COST".padStart(12)}`,
  );
  for (const [name, u] of rows) {
    console.log(
      name.padEnd(22) +
        String(u.calls).padStart(6) +
        String(u.inputTokens).padStart(9) +
        String(u.outputTokens).padStart(9) +
        money(u.estimatedCost).padStart(12),
    );
  }
  console.log("-".repeat(58));
  console.log(
    "TOTAL".padEnd(22) +
      String(usage.total.calls).padStart(6) +
      String(usage.total.inputTokens).padStart(9) +
      String(usage.total.outputTokens).padStart(9) +
      money(usage.total.estimatedCost).padStart(12),
  );
  console.log(`\nPricing version(s): ${usage.pricingVersions.join(", ")}`);
  console.log("Analysis and validation are deterministic — no model call, no cost.");
  console.log(
    "\nTest/UAT measurement on one case. Not a guaranteed production price:",
  );
  console.log("token counts vary with notice length, question count and regeneration.");

  /* ---- 6. Clean up the probe rows ---- */
  const sql = getSql();
  await sql.query(`DELETE FROM appeal_cases WHERE id = $1`, [appealCase.id]);
  await sql.query(`DELETE FROM clients WHERE id = $1`, [client.id]);
  console.log("\nProbe case and client removed (ai_usage cascades).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
