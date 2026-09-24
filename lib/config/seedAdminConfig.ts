/**
 * Seed Admin configuration from the existing product knowledge.
 *
 * Idempotent. Maps current hard-coded issues/facts/modules into
 * Postgres so the generic engine can load them without code deploys.
 */
import { createHash } from "node:crypto";
import {
  upsertService,
  upsertIssue,
  upsertIssueFact,
  linkIssueKnowledge,
  upsertEmailTemplate,
  upsertValidationRule,
  insertPromptIfAbsent,
  upsertFactDefault,
  setIssueApplicability,
} from "@/lib/config/adminRepo";
import { upsertFactRegistryEntry } from "@/lib/config/factRegistryRepo";
import { BUILT_IN_FACT_DEFAULTS } from "@/lib/rules/factDefaults";
import { FACT } from "@/lib/facts/facts";
import { FACT_REGISTRY } from "@/lib/facts/registry";
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
      { factKey: FACT.SIGNAGE_ISSUE_BASIS, reasonCode: "SIGNAGE_BASIS_UNRESOLVED", priority: 20 },
    ],
    moduleIds: ["KB-SIGN-01", "KB-SIGN-02", "KB-SIGN-03", "KB-SIGN-04"],
  },
];

/**
 * Memoizes the seeding run within a process (fast path for repeat calls),
 * mirroring lib/db/schema.ts's `ensured` promise.
 *
 * A COARSE SKIP WOULD BE WRONG; A CONTENT FINGERPRINT IS NOT
 * ----------------------------------------------------------
 * This used to replay the whole sequence on every cold start, on the
 * reasoning that ISSUE_SEEDS grows over the codebase's lifetime, so
 * "the service row exists" does not imply "every current seed row
 * exists" — a database seeded under an older version of this file would
 * silently miss newly added issues forever. That reasoning is right
 * about a coarse probe and it still holds.
 *
 * What it under-counted is the cost. The replay is not "a handful" of
 * no-op round trips: it is one per fact-registry entry (~60), per issue,
 * per required fact, per knowledge link, per validator and per prompt —
 * over two hundred, and against Neon at ~235ms each that is the
 * dominant term in every cold start. It was enough on its own to push
 * unrelated tests past a five-second timeout.
 *
 * So the skip is keyed on a hash of the content this function would
 * write, not on the existence of a row. Adding an issue, a required
 * fact, a default or a registry entry changes the hash and the seed
 * replays in full — which is exactly the case the original comment was
 * protecting. A database already carrying this content does nothing.
 *
 * Only fields the upserts actually set are hashed, so an admin editing
 * a status or widening a vocabulary does not make the seed look stale
 * and trigger a pointless re-run.
 */
const SEED_FINGERPRINT_KEY = "admin_config_seed_fingerprint";

function adminSeedFingerprint(): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        service: PRIVATE_PARKING,
        issues: ISSUE_SEEDS.map((i) => ({
          code: i.code,
          label: i.label,
          sortOrder: i.sortOrder,
          triggerTags: i.triggerTags,
          facts: i.facts.map(
            (f) => `${f.factKey}:${f.reasonCode}:${f.priority}:${(f.evidenceTypes ?? []).join(",")}`,
          ),
          modules: i.moduleIds,
        })),
        registry: FACT_REGISTRY.map(
          (e) => `${e.factKey}:${e.valueType}:${e.allowedValues.join("|")}`,
        ),
        defaults: BUILT_IN_FACT_DEFAULTS.map(
          (d) => `${d.id}:${d.factKey}:${JSON.stringify(d.defaultValue)}:${d.priority}`,
        ),
        validators: VALIDATOR_SEEDS.map((v) => v.code),
        /*
         * Bumped by hand when a step below changes in a way the data
         * above does not describe — the `scenarios` retirement, the
         * AUTHORISATION applicability patch, and allegation-driven
         * PAYMENT_KEYING / ANPR / GRACE / CONSIDERATION applicability.
         */
        revision: 4,
      }),
    )
    .digest("hex");
}

let seeded: Promise<void> | null = null;

/**
 * Ensure an issue's applicability includes circumstance + allegation leaves.
 *
 * Idempotent: only writes when a required allegation leaf is missing.
 * Existing leaves are preserved (except explicitly dropped tags).
 */
async function ensureAllegationApplicability(input: {
  issueId: string;
  circumstanceTags: string[];
  allegationCategoryTags: string[];
  allegationIssueTags?: string[];
  dropTags?: string[];
  changeNote: string;
}): Promise<void> {
  const { getSql } = await import("@/lib/db/pool");
  const rows = (await getSql().query(
    `SELECT applicability_json FROM issues WHERE id = $1`,
    [input.issueId],
  )) as unknown as
    | { rows?: Array<{ applicability_json: unknown }> }
    | Array<{ applicability_json: unknown }>;
  const row = (Array.isArray(rows) ? rows : (rows.rows ?? []))[0];
  const current = (row?.applicability_json ?? null) as { any?: unknown[] } | null;
  const leaves = Array.isArray(current?.any) ? [...current!.any!] : [];

  const drop = new Set(input.dropTags ?? []);
  const kept = leaves.filter((l) => {
    if (typeof l !== "object" || l === null) return true;
    const tag = (l as { tag?: string }).tag;
    return !tag || !drop.has(tag);
  });

  const hasAllAllegation = input.allegationCategoryTags.every((tag) =>
    kept.some(
      (l) =>
        typeof l === "object" &&
        l !== null &&
        (l as { tag?: string }).tag === tag,
    ),
  );
  if (hasAllAllegation) return;

  const merged = [
    ...kept,
    ...input.circumstanceTags.map((tag) => ({ tag })),
    ...input.allegationCategoryTags.map((tag) => ({ tag })),
    ...(input.allegationIssueTags ?? []).map((tag) => ({ tag })),
  ].filter(
    (l, i, arr) =>
      arr.findIndex((o) => JSON.stringify(o) === JSON.stringify(l)) === i,
  );

  await setIssueApplicability({
    issueId: input.issueId,
    applicabilityCondition: { any: merged },
    changeNote: input.changeNote,
    changedBy: "SEED",
  });
}

export async function ensureAdminConfigSeeded(): Promise<void> {
  if (seeded) return seeded;
  seeded = (async () => {
    await ensureSchema();

    const fingerprint = adminSeedFingerprint();
    const { getSql } = await import("@/lib/db/pool");
    const sql = getSql();
    const probe = (await sql.query(
      `SELECT value FROM system_meta WHERE key = $1`,
      [SEED_FINGERPRINT_KEY],
    )) as unknown as
      | { rows?: Array<{ value: string | null }> }
      | Array<{ value: string | null }>;
    const existing = (Array.isArray(probe) ? probe : (probe.rows ?? []))[0];
    if (existing?.value === fingerprint) return;

    const service = await upsertService({
      code: PRIVATE_PARKING,
      name: "Private Parking Initial Appeal",
      description: "First-stage private parking operator appeal",
      paymentRequired: true,
      amountPence: 1199,
      status: "ACTIVE",
      seedOnly: true,
    });

    /*
     * Fact vocabulary. Mirrors lib/facts/registry.ts into
     * `case_facts_registry` so an admin can widen a value space without
     * a deploy. seedOnly, because the loader unions these rows with the
     * code floor at read time — a stale row can therefore never narrow
     * the live vocabulary, and an admin's additions are never clobbered.
     */
    const evidenceByFact = new Map<string, string[]>();
    for (const seed of ISSUE_SEEDS) {
      for (const f of seed.facts) {
        if (f.evidenceTypes?.length) evidenceByFact.set(f.factKey, f.evidenceTypes);
      }
    }
    for (const entry of FACT_REGISTRY) {
      await upsertFactRegistryEntry({
        factKey: entry.factKey,
        label: entry.label,
        valueType: entry.valueType,
        allowedValues: entry.allowedValues,
        guidance: entry.guidance,
        source: entry.source,
        evidenceTypes: evidenceByFact.get(entry.factKey) ?? [],
        // Keeper safety is enforced by lib/questions/keeperGuard.ts on
        // wording, and every fact seeded here comes from a bank proven
        // keeper-safe by checkBankKeeperSafe. Nothing is flagged here;
        // the column exists for facts an admin adds later.
        driverIdentifying: false,
        status: "ACTIVE",
        seedOnly: true,
      });
    }

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

    /*
     * Retire `scenarios` as a required fact, everywhere.
     *
     * It was required by TRIAGE_SCOPE and by nine of the ten issues, at
     * the top of each one's priority order — so it was the first thing
     * any fact-gap question would have put to a customer. And what it
     * asks is "which of these appeal reasons applies to you?", which is
     * the question the system is supposed to answer on the customer's
     * behalf: they are not the lawyer, and a customer guessing at legal
     * grounds picks the wrong ones.
     *
     * The fact itself stays live and still matters — module gates in
     * lib/retrieval/gates.ts key on its tags. It is now written by the
     * allegation classifier and by the customer's own account of what
     * happened, never collected as a menu of grounds. Asking it is
     * additionally blocked in code by NEVER_ASK in lib/facts/gapResolver.ts,
     * so restoring a row here cannot bring the question back.
     *
     * Same mechanism as the DEPARTURE_DELAY retirement above: seedOnly
     * upserts cannot update an existing row, so retiring is an explicit
     * status change.
     */
    {
      const { getSql } = await import("@/lib/db/pool");
      await getSql().query(
        `UPDATE issue_required_facts
            SET status = 'INACTIVE', updated_at = NOW()
          WHERE fact_key = $1 AND status = 'ACTIVE'`,
        [FACT.SCENARIOS],
      );
    }

    /*
     * Let a permit allegation open the authorisation issue.
     *
     * AUTHORISATION's applicability was `{any:[{tag:"authorised_or_permit"}]}` —
     * a customer circumstance tag only. Since circumstance tags came
     * from `scenarios`, and `scenarios` was the appeal-reason menu that
     * has now been retired, nothing could open the issue at all: a
     * notice reading "No valid permit displayed" produced zero active
     * issues and therefore zero grounds.
     *
     * The trigger is the NO_PERMIT allegation category specifically,
     * not the routes it opens. "Unauthorised parking" classifies to the
     * same routes but is a conclusion rather than a stated requirement,
     * and must keep its existing behaviour of opening nothing — that is
     * what stops a hospital notice starting a permit interview, and
     * tests/unit/triageSpine.acceptance.test.ts holds the line.
     *
     * RESIDENTIAL is deliberately NOT given the same treatment at all.
     * Its facts are occupier status and a lease, and no allegation
     * wording should open a tenancy interview — that one still waits
     * for the customer to describe residential circumstances.
     *
     * Written as "add the leaf if it is absent" so an admin who has
     * since widened the condition keeps their work, and so this does
     * not rewrite the row on every boot.
     */
    {
      const authorisation = await upsertIssue({
        serviceId: service.id,
        code: "AUTHORISATION",
        label: "Authorisation / Permit",
        sortOrder: 70,
        triggerTags: ["permit", "authorisation"],
        status: "ACTIVE",
        seedOnly: true,
      });
      await ensureAllegationApplicability({
        issueId: authorisation.id,
        circumstanceTags: ["authorised_or_permit"],
        allegationCategoryTags: ["allegation_category:no_permit"],
        dropTags: ["allegation:authorisation"],
        changeNote:
          "Open on a NO_PERMIT allegation only; scenarios menu retired.",
      });
    }

    /*
     * Allegation-driven issues that used to open only from customer tags.
     *
     * Without these leaves, a notice that clearly alleges non-payment or
     * overstay activates nothing, fact-gap asks nothing, and drafting
     * falls through to generic keeper/PoFA wording. Customer circumstance
     * tags remain additional triggers — they are not removed.
     */
    {
      const payment = await upsertIssue({
        serviceId: service.id,
        code: "PAYMENT_KEYING",
        label: "Payment / Keying Error",
        sortOrder: 10,
        triggerTags: ["payment", "keying", "vrm_error"],
        status: "ACTIVE",
        seedOnly: true,
      });
      await ensureAllegationApplicability({
        issueId: payment.id,
        circumstanceTags: ["payment", "keying", "vrm_error", "payment_made"],
        allegationCategoryTags: [
          "allegation_category:no_payment",
          "allegation_category:no_validation",
        ],
        allegationIssueTags: ["allegation:payment_keying"],
        changeNote:
          "Open PAYMENT_KEYING from NO_PAYMENT / NO_VALIDATION allegations.",
      });
    }
    {
      const anpr = await upsertIssue({
        serviceId: service.id,
        code: "ANPR",
        label: "ANPR / Double visit",
        sortOrder: 30,
        triggerTags: [
          "anpr_disputed",
          "multiple_visits_same_day",
          "anpr",
          "double_visit",
        ],
        status: "ACTIVE",
        seedOnly: true,
      });
      await ensureAllegationApplicability({
        issueId: anpr.id,
        circumstanceTags: [
          "anpr_disputed",
          "multiple_visits_same_day",
          "anpr",
          "double_visit",
        ],
        allegationCategoryTags: [
          "allegation_category:overstay",
          "allegation_category:anpr_duration",
        ],
        allegationIssueTags: ["allegation:anpr"],
        changeNote:
          "Open ANPR from OVERSTAY / ANPR_DURATION allegations.",
      });
    }
    {
      const grace = await upsertIssue({
        serviceId: service.id,
        code: "GRACE",
        label: "Grace period",
        sortOrder: 50,
        triggerTags: ["grace"],
        status: "ACTIVE",
        seedOnly: true,
      });
      await ensureAllegationApplicability({
        issueId: grace.id,
        circumstanceTags: ["grace", "grace_or_exit"],
        allegationCategoryTags: ["allegation_category:overstay"],
        allegationIssueTags: ["allegation:grace"],
        changeNote: "Open GRACE from OVERSTAY allegations.",
      });
    }
    {
      const consideration = await upsertIssue({
        serviceId: service.id,
        code: "CONSIDERATION",
        label: "Consideration period",
        sortOrder: 40,
        triggerTags: ["consideration"],
        status: "ACTIVE",
        seedOnly: true,
      });
      await ensureAllegationApplicability({
        issueId: consideration.id,
        circumstanceTags: ["consideration", "short_stay_consideration"],
        allegationCategoryTags: ["allegation_category:overstay"],
        allegationIssueTags: ["allegation:consideration"],
        changeNote: "Open CONSIDERATION from OVERSTAY allegations.",
      });
    }

    /*
     * Fact defaults.
     *
     * `lib/rules/factDefaults.ts` describes these as "seeded into
     * fact_defaults on first admin config seed", but nothing ever did —
     * the rows in the live database were created by hand. That matters
     * because the issue engine takes the database's defaults INSTEAD of
     * the code floor when any row exists (see `defaultRules` in
     * lib/engine/issueEngine.ts), so a default added to the floor alone
     * would never fire on an installation that has any row at all.
     *
     * seedOnly, so an admin's edit to a default is never clobbered.
     */
    for (const d of BUILT_IN_FACT_DEFAULTS) {
      await upsertFactDefault({
        id: d.id.replace(/^builtin_/, "fd_"),
        factKey: d.factKey,
        condition: d.condition,
        defaultValue: d.defaultValue,
        reasonCode: d.reasonCode,
        priority: d.priority,
        status: "ACTIVE",
        seedOnly: true,
      });
    }

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

    // Recorded last, so an interrupted seed replays rather than
    // declaring itself complete with rows missing.
    await sql.query(
      `INSERT INTO system_meta (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [SEED_FINGERPRINT_KEY, fingerprint],
    );
  })();
  try {
    await seeded;
  } catch (err) {
    seeded = null; // allow retry on next call
    throw err;
  }
}
