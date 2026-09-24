/**
 * Production readiness probe — no secrets printed.
 * Run: npx tsx scripts/production-readiness.mts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  let v = m[2];
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  process.env[m[1].trim()] = v;
}

function present(key: string): boolean {
  return Boolean(process.env[key]?.trim());
}

function status(key: string, required = false): string {
  const ok = present(key);
  return `${ok ? "OK" : required ? "MISSING" : "optional"}  ${key}`;
}

let failed = 0;

console.log("\n=== Environment (.env.local) ===");
const hasDb = present("POSTGRES_URL") || present("DATABASE_URL");
console.log(hasDb ? "OK  POSTGRES_URL|DATABASE_URL" : "MISSING  POSTGRES_URL|DATABASE_URL");
if (!hasDb) failed++;
for (const k of [
  "SESSION_PASSWORD",
  "ADMIN_PASSWORD",
  "ADMIN_EMAIL",
  "OPENAI_API_KEY",
]) {
  console.log(status(k, true));
  if (!present(k)) failed++;
}
// APP_URL is required on Vercel (verified separately via `vercel env ls`).
// Local .env.local may omit it; do not fail the probe for that alone.
for (const k of ["APP_URL", "NEXT_PUBLIC_APP_URL"]) {
  console.log(
    present(k)
      ? `OK  ${k}`
      : `optional  ${k} (must be set on Vercel — already listed in production env)`,
  );
}
for (const k of [
  "APP_ENV",
  "DRAFTING_PROVIDER",
  "EXTRACTION_PROVIDER",
  "RULES_LETTER_PRIMARY",
  "STORAGE_PROVIDER",
  "R2_ACCOUNT_ID",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "EMAIL_FROM_ADDRESS",
  "PAYMENTS_ENABLED",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
]) {
  console.log(status(k, false));
}

console.log("\n=== Drafting provider resolution ===");
const { getDraftingProvider, resetDraftingProvider } = await import(
  "../services/ai/drafting"
);
resetDraftingProvider();
try {
  const p = getDraftingProvider();
  console.log("default provider id:", p.id);
  console.log("bespoke:", p.bespoke);
} catch (e) {
  console.log("FAIL drafting provider:", e instanceof Error ? e.message : e);
  failed++;
}

console.log("\n=== OpenAI live smoke (Smart Parking PoFA) ===");
if (!present("OPENAI_API_KEY")) {
  console.log("FAIL — OPENAI_API_KEY not set");
  failed++;
} else {
  process.env.DRAFTING_PROVIDER = "openai";
  resetDraftingProvider();
  const live = getDraftingProvider();
  console.log("forced provider:", live.id, "bespoke:", live.bespoke);
  if (!live.bespoke || !/openai/i.test(live.id)) {
    console.log("FAIL — expected OpenAI bespoke provider");
    failed++;
  }

  const { draftAppeal } = await import("../lib/drafting/engine");
  const { analyseCase } = await import("../lib/analysis/engine");
  const { loadPofaConfig } = await import("../lib/config/pofaConfig");
  const { FACT } = await import("../lib/facts/facts");
  const { loadKbCatalog } = await import("../lib/kb/catalog");

  const confirmed = {
    uk_jurisdiction: "ENGLAND_WALES",
    notice_route: "POSTAL",
    case_stage: "INITIAL_OPERATOR_APPEAL",
    confirmedAt: "2026-09-24T00:00:00.000Z",
    operator_name: "Smart Parking Ltd",
    pcn_number: "SP62712518",
    vrm: "FD18BOF",
    parking_location: "B&M Chatham",
    parking_event_date: "2026-08-10",
    notice_issue_date: "2026-08-27",
    entry_time: "19:06",
    exit_time: "20:41",
    total_recorded_duration: 95,
    charge_amount: 90,
    alleged_breach: "Parked without payment recorded by ANPR",
  } as const;

  const answers = {
    [FACT.REGISTERED_KEEPER]: "YES",
    [FACT.DRIVER_IDENTIFIED]: "NO",
  };

  const analysis = analyseCase({
    confirmed: confirmed as never,
    answers,
    evidenceTypes: [],
    evidenceRefs: [],
    pofaConfig: await loadPofaConfig(),
  });
  const catalog = await loadKbCatalog();

  const drafted = await draftAppeal({
    confirmed: confirmed as never,
    answers,
    evidenceTypes: [],
    analysis,
    modules: catalog.modules,
    sources: catalog.sources,
    blocks: catalog.blocks,
  });

  const body = drafted.body ?? "";
  const hasEvent =
    /10\s+August\s+2026|10\/08\/2026|2026-08-10|10th\s+August/i.test(body);
  const hasNotice =
    /27\s+August\s+2026|27\/08\/2026|2026-08-27|27th\s+August/i.test(body);
  console.log("draft ok?:", drafted.ok);
  console.log("blocked?:", drafted.blockedReason ?? "none");
  console.log("provider:", drafted.draft?.providerId ?? live.id);
  console.log("body chars:", body.length);
  console.log("mentions event date?:", hasEvent);
  console.log("mentions notice date?:", hasNotice);
  console.log("preview:", body.slice(0, 320).replace(/\s+/g, " "));
  if (!drafted.ok || body.length < 200) {
    console.log("FAIL — live draft insufficient");
    failed++;
  }
}

console.log("\n=== PDF / email / portal wiring ===");
const checks: Array<[string, string]> = [
  ["lib/appeals/autoRelease.ts", "renderAppealPdf"],
  ["lib/appeals/autoRelease.ts", "queueAppealReadyEmail"],
  ["lib/email/outbox.ts", "queueAppealReadyEmail"],
  ["lib/email/templates/appealReady.ts", "buildAppealReadyEmail"],
  ["services/documents/pdf.ts", "renderAppealPdf"],
  ["app/api/cases/[id]/document/route.ts", "GET"],
  ["app/api/portal/overview/route.ts", "GET"],
  ["app/portal/page.tsx", "export"],
  ["app/checkout/[id]/success/page.tsx", "download"],
];
for (const [file, needle] of checks) {
  const p = path.join(root, file);
  const exists = fs.existsSync(p);
  const text = exists ? fs.readFileSync(p, "utf8") : "";
  const hit = exists && text.includes(needle);
  console.log(`${hit ? "OK" : "FAIL"}  ${file} (${needle})`);
  if (!hit) failed++;
}

console.log("\n=== PDF render smoke ===");
try {
  const { renderAppealPdf } = await import("../services/documents/pdf");
  const confirmed = {
    uk_jurisdiction: "ENGLAND_WALES",
    notice_route: "POSTAL",
    case_stage: "INITIAL_OPERATOR_APPEAL",
    confirmedAt: "2026-09-24T00:00:00.000Z",
    operator_name: "Smart Parking Ltd",
    pcn_number: "SP62712518",
    vrm: "FD18BOF",
    parking_location: "B&M Chatham",
    parking_event_date: "2026-08-10",
    notice_issue_date: "2026-08-27",
    charge_amount: 90,
    alleged_breach: "Parked without payment recorded by ANPR",
  };
  const bytes = await renderAppealPdf({
    pcn: confirmed as never,
    evidence: [],
    appeal: {
      body: "The parking event occurred on 10 August 2026 and the notice was issued on 27 August 2026. This is a readiness probe.",
      paragraphs: [
        {
          id: "p1",
          text: "The parking event occurred on 10 August 2026 and the notice was issued on 27 August 2026.",
        },
      ],
    } as never,
    caseReference: "READINESS-SMOKE",
  });
  console.log("OK  PDF bytes:", bytes.byteLength);
  if (bytes.byteLength < 500) {
    console.log("FAIL — PDF too small");
    failed++;
  }
} catch (e) {
  console.log("FAIL PDF:", e instanceof Error ? e.message : e);
  failed++;
}

console.log("\n=== DB connectivity ===");
try {
  const { getSql } = await import("../lib/db/pool");
  const sql = getSql();
  const r = await sql.query("SELECT 1 AS ok");
  const rows = Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? []);
  console.log("OK  postgres SELECT 1 →", JSON.stringify(rows[0] ?? r));
} catch (e) {
  console.log("FAIL db:", e instanceof Error ? e.message : e);
  failed++;
}

console.log(
  failed === 0
    ? "\nREADINESS PROBE PASSED"
    : `\nREADINESS PROBE FAILED (${failed})`,
);
process.exit(failed === 0 ? 0 : 1);
