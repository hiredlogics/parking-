/**
 * Seed Admin configuration from the existing product knowledge.
 *
 * Idempotent. Maps current hard-coded issues/facts/modules into
 * Postgres so the generic engine can load them without code deploys.
 */
import {
  upsertService,
  upsertIssue,
  upsertIssueFact,
  linkIssueKnowledge,
  upsertEmailTemplate,
  upsertValidationRule,
  insertPromptIfAbsent,
} from "@/lib/config/adminRepo";
import { FACT } from "@/lib/questions/facts";
import { ensureSchema } from "@/lib/db/schema";

const PRIVATE_PARKING = "PRIVATE_PARKING_INITIAL_APPEAL";

/** Real validator codes (lib/kb/types.ts ALL_VALIDATOR_CODES), with labels. */
const VALIDATOR_SEEDS: Array<{ code: string; label: string }> = [
  { code: "VAL-DRIVER", label: "Keeper-safe wording (driver never identified)" },
  { code: "VAL-FACT", label: "Fact-grounded claims only" },
  { code: "VAL-EVIDENCE", label: "Evidence claimed as enclosed must actually be available" },
  { code: "VAL-POFA", label: "PoFA defect claims require route-specific verification" },
  { code: "VAL-CODE", label: "Code rule/version applied only with a valid applicability check" },
  { code: "VAL-RES", label: "Lease/tenancy wording must be accurate, not invented" },
  { code: "VAL-BREAK", label: "Breakdown frustration claims require genuine-prevention facts" },
  { code: "VAL-EQ", label: "Equality Act grounds require supporting facts" },
  { code: "VAL-ANPR", label: "ANPR calibration/maintenance claims require a factual trigger" },
  { code: "VAL-STAGE", label: "No POPLA/IAS/court language in an initial operator appeal" },
  { code: "VAL-CONFLICT", label: "No contradictory dates, payment, duration, permit or account facts" },
  { code: "VAL-REPETITION", label: "No repeating the same point across multiple grounds" },
  { code: "VAL-UNSUPPORTED", label: "Every legal proposition/authority must be in approved material" },
];

interface IssueSeed {
  code: string;
  label: string;
  sortOrder: number;
  triggerTags: string[];
  facts: Array<{
    factKey: string;
    reasonCode: string;
    priority: number;
    evidenceTypes?: string[];
  }>;
  moduleIds: string[];
}

const ISSUE_SEEDS: IssueSeed[] = [
  {
    code: "PAYMENT_KEYING",
    label: "Payment / Keying Error",
    sortOrder: 10,
    triggerTags: ["payment", "keying", "vrm_error"],
    facts: [
      { factKey: FACT.SCENARIOS, reasonCode: "GROUNDS_UNIDENTIFIED", priority: 10 },
      { factKey: FACT.PAYMENT_MADE, reasonCode: "PAYMENT_STATUS_UNRESOLVED", priority: 15 },
      { factKey: FACT.PAYMENT_METHOD, reasonCode: "PAYMENT_METHOD_UNRESOLVED", priority: 20 },
      { factKey: FACT.VRM_ENTERED, reasonCode: "VRM_ENTRY_UNRESOLVED", priority: 30 },
      { factKey: FACT.KEYING_ERROR, reasonCode: "VRM_ENTRY_UNRESOLVED", priority: 35 },
      { factKey: FACT.PAYMENT_EVIDENCE, reasonCode: "PAYMENT_EVIDENCE_UNRESOLVED", priority: 40, evidenceTypes: ["receipt"] },
    ],
    moduleIds: ["KB-PAY-01", "KB-PAY-02", "KB-PAY-03", "KB-KEY-01", "KB-KEY-03"],
  },
  {
    code: "BREAKDOWN",
    label: "Breakdown / Immobilisation",
    sortOrder: 20,
    triggerTags: ["breakdown", "immobilised"],
    facts: [
      { factKey: FACT.SCENARIOS, reasonCode: "GROUNDS_UNIDENTIFIED", priority: 10 },
      { factKey: FACT.BREAKDOWN_NATURE, reasonCode: "BREAKDOWN_NATURE_UNRESOLVED", priority: 20 },
      { factKey: FACT.BREAKDOWN_PREVENTED_DEPARTURE, reasonCode: "BREAKDOWN_STATUS_UNRESOLVED", priority: 30 },
      { factKey: FACT.RECOVERY_ATTENDANCE, reasonCode: "BREAKDOWN_STATUS_UNRESOLVED", priority: 35 },
      { factKey: FACT.BREAKDOWN_EVIDENCE, reasonCode: "BREAKDOWN_EVIDENCE_UNRESOLVED", priority: 40, evidenceTypes: ["recovery_report", "garage_invoice"] },
    ],
    moduleIds: ["KB-BREAK-01", "KB-BREAK-02", "KB-BREAK-03"],
  },
  {
    code: "ANPR",
    label: "ANPR / Double visit",
    sortOrder: 30,
    triggerTags: [
      "anpr_disputed",
      "multiple_visits_same_day",
      "anpr",
      "double_visit",
    ],
    facts: [
      { factKey: FACT.SCENARIOS, reasonCode: "GROUNDS_UNIDENTIFIED", priority: 10 },
      {
        factKey: FACT.ANPR_IMAGES_ON_NOTICE,
        reasonCode: "ANPR_IMAGES_UNRESOLVED",
        priority: 15,
      },
      {
        factKey: FACT.CONTINUOUS_PRESENCE,
        reasonCode: "ANPR_PRESENCE_UNRESOLVED",
        priority: 20,
      },
      {
        factKey: FACT.VISIT_COUNT,
        reasonCode: "VISIT_COUNT_UNRESOLVED",
        priority: 25,
      },
      {
        factKey: FACT.VEHICLE_LEFT_SITE_EVIDENCE,
        reasonCode: "ANPR_EVIDENCE_UNRESOLVED",
        priority: 30,
      },
      {
        factKey: FACT.TIMESTAMP_DISCREPANCY,
        reasonCode: "ANPR_TIMESTAMP_UNRESOLVED",
        priority: 35,
      },
      {
        factKey: FACT.ANPR_DISPUTE_DETAIL,
        reasonCode: "ANPR_DETAIL_UNRESOLVED",
        priority: 40,
      },
    ],
    moduleIds: ["KB-ANPR-01", "KB-ANPR-02", "KB-ANPR-03"],
  },
  {
    code: "CONSIDERATION",
    label: "Consideration period",
    sortOrder: 40,
    triggerTags: ["consideration"],
    facts: [
      { factKey: FACT.SCENARIOS, reasonCode: "GROUNDS_UNIDENTIFIED", priority: 10 },
      { factKey: FACT.INITIAL_PERIOD_REASON, reasonCode: "CONSIDERATION_PERIOD_UNRESOLVED", priority: 20 },
    ],
    moduleIds: ["KB-CONSID-01"],
  },
  {
    code: "GRACE",
    label: "Grace period",
    sortOrder: 50,
    triggerTags: ["grace"],
    facts: [
      { factKey: FACT.SCENARIOS, reasonCode: "GROUNDS_UNIDENTIFIED", priority: 10 },
      // Align with Q-GRACE-EXIT (exit_delay_reason), not an unused departure_delay key.
      { factKey: FACT.EXIT_DELAY_REASON, reasonCode: "GRACE_PERIOD_UNRESOLVED", priority: 20 },
    ],
    moduleIds: ["KB-GRACE-01"],
  },
  {
    code: "RESIDENTIAL",
    label: "Residential / Lease",
    sortOrder: 60,
    triggerTags: ["residential", "lease"],
    facts: [
      { factKey: FACT.SCENARIOS, reasonCode: "GROUNDS_UNIDENTIFIED", priority: 10 },
      { factKey: FACT.OCCUPIER_STATUS, reasonCode: "OCCUPIER_STATUS_UNRESOLVED", priority: 20 },
      { factKey: FACT.AGREEMENT_UPLOADED, reasonCode: "AGREEMENT_EVIDENCE_UNRESOLVED", priority: 30, evidenceTypes: ["lease", "tenancy"] },
    ],
    moduleIds: ["KB-RES-01", "KB-RES-02", "KB-RES-03", "KB-RES-04", "KB-RES-06"],
  },
  {
    code: "AUTHORISATION",
    label: "Authorisation / Permit",
    sortOrder: 70,
    triggerTags: ["permit", "authorisation"],
    facts: [
      { factKey: FACT.SCENARIOS, reasonCode: "GROUNDS_UNIDENTIFIED", priority: 10 },
      { factKey: FACT.PERMISSION_HELD, reasonCode: "PERMISSION_STATUS_UNRESOLVED", priority: 20 },
      { factKey: FACT.PERMISSION_SOURCE, reasonCode: "PERMISSION_SOURCE_UNRESOLVED", priority: 30 },
    ],
    moduleIds: ["KB-AUTH-01", "KB-AUTH-02"],
  },
  {
    code: "EQUALITY",
    label: "Equality Act",
    sortOrder: 80,
    triggerTags: ["equality", "disability"],
    facts: [
      { factKey: FACT.SCENARIOS, reasonCode: "GROUNDS_UNIDENTIFIED", priority: 10 },
      { factKey: FACT.ADDITIONAL_TIME_NEEDED, reasonCode: "EQUALITY_NEED_UNRESOLVED", priority: 20 },
    ],
    moduleIds: ["KB-EQ-01", "KB-EQ-02", "KB-EQ-03"],
  },
  {
    code: "POFA",
    label: "Keeper liability (PoFA)",
    sortOrder: 90,
    triggerTags: ["pofa", "keeper"],
    facts: [
      { factKey: FACT.REGISTERED_KEEPER, reasonCode: "KEEPER_STATUS_UNRESOLVED", priority: 10 },
      { factKey: FACT.DRIVER_IDENTIFIED, reasonCode: "DRIVER_NOTIFICATION_STATUS_UNRESOLVED", priority: 20 },
    ],
    moduleIds: ["KB-POFA-01", "KB-POFA-02", "KB-POFA-03", "KB-POFA-04", "KB-POFA-05"],
  },
  {
    code: "SIGNAGE",
    label: "Signage",
    sortOrder: 100,
    triggerTags: ["signage"],
    facts: [
      { factKey: FACT.SCENARIOS, reasonCode: "GROUNDS_UNIDENTIFIED", priority: 10 },
      { factKey: FACT.SIGNAGE_ISSUE_BASIS, reasonCode: "SIGNAGE_BASIS_UNRESOLVED", priority: 20 },
    ],
    moduleIds: ["KB-SIGN-01", "KB-SIGN-02", "KB-SIGN-03", "KB-SIGN-04"],
  },
];

/**
 * Memoizes the seeding run within a process (fast path for repeat calls),
 * mirroring lib/db/schema.ts's `ensured` promise.
 *
 * Deliberately no persisted "already seeded, skip everything" probe:
 * unlike the DDL in schema.ts, ISSUE_SEEDS grows over the codebase's
 * lifetime, so "the service row exists" does not imply "every current
 * seed row exists" for a database seeded under an older version of this
 * file — a coarse skip would silently leave newly added issues/facts
 * missing forever. Every upsert below is seedOnly (insert-if-absent), so
 * replaying the full sequence on each cold start is always safe and
 * backfills anything genuinely new; it just costs a handful of no-op
 * round trips once a database is fully caught up, which is cheap next
 * to schema.ts's ~90-statement DDL replay.
 */
let seeded: Promise<void> | null = null;

export async function ensureAdminConfigSeeded(): Promise<void> {
  if (seeded) return seeded;
  seeded = (async () => {
    await ensureSchema();

    const service = await upsertService({
      code: PRIVATE_PARKING,
      name: "Private Parking Initial Appeal",
      description: "First-stage private parking operator appeal",
      paymentRequired: true,
      amountPence: 1199,
      status: "ACTIVE",
      seedOnly: true,
    });

    for (const seed of ISSUE_SEEDS) {
      const issue = await upsertIssue({
        serviceId: service.id,
        code: seed.code,
        label: seed.label,
        sortOrder: seed.sortOrder,
        triggerTags: seed.triggerTags,
        status: "ACTIVE",
        seedOnly: true,
      });
      for (const f of seed.facts) {
        await upsertIssueFact({
          issueId: issue.id,
          factKey: f.factKey,
          reasonCode: f.reasonCode,
          priority: f.priority,
          evidenceTypes: f.evidenceTypes ?? [],
          status: "ACTIVE",
          seedOnly: true,
        });
      }
      for (const mid of seed.moduleIds) {
        await linkIssueKnowledge(issue.id, mid, "ACTIVE", true);
      }
    }

    // Force-refresh ANPR relation chain (seedOnly skips updates on existing DBs).
    const anprSeed = ISSUE_SEEDS.find((s) => s.code === "ANPR");
    if (anprSeed) {
      const anpr = await upsertIssue({
        serviceId: service.id,
        code: anprSeed.code,
        label: anprSeed.label,
        sortOrder: anprSeed.sortOrder,
        triggerTags: anprSeed.triggerTags,
        status: "ACTIVE",
        seedOnly: false,
      });
      for (const f of anprSeed.facts) {
        await upsertIssueFact({
          issueId: anpr.id,
          factKey: f.factKey,
          reasonCode: f.reasonCode,
          priority: f.priority,
          evidenceTypes: f.evidenceTypes ?? [],
          status: "ACTIVE",
          seedOnly: false,
        });
      }
    }

    // Force-refresh GRACE so exit_delay_reason replaces stale departure_delay.
    const graceSeed = ISSUE_SEEDS.find((s) => s.code === "GRACE");
    if (graceSeed) {
      const grace = await upsertIssue({
        serviceId: service.id,
        code: graceSeed.code,
        label: graceSeed.label,
        sortOrder: graceSeed.sortOrder,
        triggerTags: graceSeed.triggerTags,
        status: "ACTIVE",
        seedOnly: false,
      });
      for (const f of graceSeed.facts) {
        await upsertIssueFact({
          issueId: grace.id,
          factKey: f.factKey,
          reasonCode: f.reasonCode,
          priority: f.priority,
          evidenceTypes: f.evidenceTypes ?? [],
          status: "ACTIVE",
          seedOnly: false,
        });
      }
      // Retire the old fact key so it is not still asked.
      const { getSql } = await import("@/lib/db/pool");
      await getSql().query(
        `UPDATE issue_required_facts
         SET status = 'INACTIVE', updated_at = NOW()
         WHERE issue_id = $1 AND fact_key = $2`,
        [grace.id, FACT.DEPARTURE_DELAY],
      );
    }

    // Triage / scope facts as a synthetic issue for questioning completeness
    const triage = await upsertIssue({
      serviceId: service.id,
      code: "TRIAGE_SCOPE",
      label: "Triage and scope",
      sortOrder: 1,
      triggerTags: ["triage", "scope"],
      status: "ACTIVE",
      seedOnly: true,
    });
    for (const f of [
      { factKey: FACT.JURISDICTION, reasonCode: "JURISDICTION_UNRESOLVED", priority: 1 },
      { factKey: FACT.VEHICLE_HIRE_STATUS, reasonCode: "VEHICLE_STATUS_UNRESOLVED", priority: 2 },
      { factKey: FACT.REGISTERED_KEEPER, reasonCode: "KEEPER_STATUS_UNRESOLVED", priority: 3 },
      { factKey: FACT.DRIVER_IDENTIFIED, reasonCode: "DRIVER_NOTIFICATION_STATUS_UNRESOLVED", priority: 4 },
      // Circumstances before allegation-led questionnaires (AUTHORISATION /
      // RESIDENTIAL / PERMIT). Spine: understand → circumstances → issues.
      { factKey: FACT.SCENARIOS, reasonCode: "GROUNDS_UNIDENTIFIED", priority: 5 },
    ]) {
      await upsertIssueFact({
        issueId: triage.id,
        factKey: f.factKey,
        reasonCode: f.reasonCode,
        priority: f.priority,
        status: "ACTIVE",
        seedOnly: true,
      });
    }

    // Force-ensure SCENARIOS on TRIAGE_SCOPE even if the issue was seeded earlier
    // without it (seedOnly would otherwise leave the gap).
    await upsertIssueFact({
      issueId: triage.id,
      factKey: FACT.SCENARIOS,
      reasonCode: "GROUNDS_UNIDENTIFIED",
      priority: 5,
      status: "ACTIVE",
      seedOnly: false,
    });

    await upsertEmailTemplate({
      code: "APPEAL_READY",
      subject: "Your parking appeal is ready",
      bodyText: `Hi {{customerName}},

Your personalised parking appeal is ready.

Attached:
- Final Appeal letter (PDF)
- Submission instructions (PDF)

Next steps:
1. Open the Final Appeal PDF and check your details.
2. Follow the submission instructions to send it to the parking company.
3. Keep a copy for your records.

Parking Appeals Group`,
      bodyHtml: `<!-- Managed by lib/email/templates/appealReady.ts — branded HTML is built at send time. -->`,
      status: "ACTIVE",
      seedOnly: true,
    });

    // Seed every real validator code (lib/kb/types.ts ALL_VALIDATOR_CODES) so
    // an admin sees — and can act on — the validators that actually run.
    // VAL-DRIVER is seeded ACTIVE/BLOCKING like the rest, but the engine
    // (lib/validation/ruleConfig.ts) refuses to let it be disabled or
    // downgraded regardless of what this row says.
    for (const seed of VALIDATOR_SEEDS) {
      await upsertValidationRule({
        code: seed.code,
        label: seed.label,
        severity: "BLOCKING",
        status: "ACTIVE",
        seedOnly: true,
      });
    }

    await insertPromptIfAbsent({
      purpose: "DRAFTING",
      name: "Default drafting prompt",
      body: "Draft a keeper-safe private parking appeal using only the approved knowledge provided.",
      changeNotes: "Bootstrap seed",
    });
    await insertPromptIfAbsent({
      purpose: "QUESTIONING",
      name: "Default questioning prompt",
      body: "Ask one clear customer question for the missing material fact. Do not invent legal requirements.",
      changeNotes: "Bootstrap seed",
    });
  })();
  try {
    await seeded;
  } catch (err) {
    seeded = null; // allow retry on next call
    throw err;
  }
}
