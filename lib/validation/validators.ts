import { NON_BINDING_STATUSES, type ValidationIssue } from "@/lib/kb/types";
import { validateKeeperSafe } from "@/lib/keeperSafe";
import { FACT, factStr } from "@/lib/facts/facts";
import { ASSERTABLE_PROVENANCE } from "@/lib/facts/types";
import type { VerifiedFact } from "@/lib/analysis/types";
import { findAll, issue, type Validator, type ValidatorContext } from "./context";

/**
 * The twelve validators.
 *
 * Sources: MASTER Developer Pack V2 Part 10 (validation layer) and AI
 * Legal Knowledge Base V2 §17 (mandatory validator rules).
 *
 * Severity policy:
 *   BLOCKING — must prevent release. Used for anything unsafe, unfounded
 *              or legally wrong.
 *   WARNING  — recorded for review but does not block. Used only for
 *              quality issues that cannot mislead the operator.
 */

/* ============================ VAL-DRIVER ============================ */

/** Wording that identifies or strongly implies who was driving. */
const DRIVER_IMPLICATION_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\bthe\s+keeper\s+(?:was\s+driving|drove|parked)\b/gi, why: "states the keeper was driving" },
  { re: /\bthe\s+appellant\s+(?:was\s+driving|drove|parked\s+the)\b/gi, why: "states the appellant drove" },
  { re: /\bthe\s+registered\s+keeper\s+(?:was\s+driving|drove)\b/gi, why: "states the registered keeper drove" },
  { re: /\bwhen\s+(?:he|she|they)\s+(?:parked|drove|arrived\s+in\s+the\s+vehicle)\b/gi, why: "attributes driving to a person" },
  { re: /\bmy\s+client\s+(?:was\s+driving|drove|parked)\b/gi, why: "attributes driving to the client" },
  { re: /\bthe\s+driver\s+(?:was|is)\s+the\s+(?:keeper|appellant|registered\s+keeper)\b/gi, why: "equates driver with keeper" },
  { re: /\bI\s+(?:was\s+driving|drove|parked|paid|overstayed)\b/g, why: "first-person driver admission" },
];

const valDriver: Validator = {
  code: "VAL-DRIVER",
  description:
    "Draft identifies or strongly implies who drove where the driver remains unidentified.",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    // Only engaged where the driver has NOT been formally identified.
    if (ctx.analysis.driverStatus !== "UNIDENTIFIED") return issues;

    // Reuse the canonical keeper-safe scan.
    const safety = validateKeeperSafe(ctx.body);
    for (const v of safety.violations) {
      issues.push({
        code: "VAL-DRIVER",
        severity: "BLOCKING",
        message: `Draft contains driver-identifying wording (${v.label}).`,
        excerpt: v.excerpt.replace(/\s+/g, " ").trim(),
      });
    }

    // Plus "strongly implies" constructions the transform table misses.
    for (const { re, why } of DRIVER_IMPLICATION_PATTERNS) {
      for (const m of findAll(ctx.body, re)) {
        issues.push(
          issue("VAL-DRIVER", "BLOCKING", `Draft ${why}.`, ctx.body, m),
        );
      }
    }
    return issues;
  },
};

/* ============================= VAL-FACT ============================= */

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Every textual form of a date we may legitimately emit. */
function dateForms(isoLike: string): string[] {
  const t = Date.parse(isoLike);
  if (Number.isNaN(t)) return [isoLike.toLowerCase()];
  const d = new Date(t);
  const day = d.getUTCDate();
  const month = d.getUTCMonth();
  const year = d.getUTCFullYear();
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    `${year}-${pad(month + 1)}-${pad(day)}`,
    `${day} ${MONTHS[month]} ${year}`,
    `${pad(day)} ${MONTHS[month]} ${year}`,
    `${day}/${pad(month + 1)}/${year}`,
    `${pad(day)}/${pad(month + 1)}/${year}`,
    `${day}.${pad(month + 1)}.${year}`,
  ].map((s) => s.toLowerCase());
}

function normaliseToken(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Provenance a fact must carry to license a concrete value in the
 * draft. Defined in lib/facts/types.ts because the grounds judge
 * enforces the same rule when checking a ground's grounding facts, and
 * the two must not be able to drift apart.
 */
const ALLOWED_VALUE_PROVENANCE: ReadonlySet<VerifiedFact["source"]> =
  ASSERTABLE_PROVENANCE;

/** Build the set of concrete values the draft is permitted to state. */
function allowedValues(ctx: ValidatorContext): Set<string> {
  const allowed = new Set<string>();
  const push = (v: unknown) => {
    if (v === null || v === undefined) return;
    const s = String(v);
    if (s.trim().length === 0) return;
    allowed.add(normaliseToken(s));
    allowed.add(normaliseToken(s.replace(/\s+/g, "")));
    // Dates get every renderable form.
    if (/^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
      for (const f of dateForms(s)) allowed.add(f);
    }
    // Money and durations.
    if (/^\d+(\.\d+)?$/.test(s)) {
      allowed.add(`£${s}`);
      allowed.add(`£${Number(s).toFixed(2)}`);
      allowed.add(Number(s).toFixed(2));
    }
  };

  for (const f of ctx.analysis.verifiedFacts) {
    if (f.field.startsWith("__")) continue;
    if (!ALLOWED_VALUE_PROVENANCE.has(f.source)) continue;
    if (Array.isArray(f.value)) f.value.forEach(push);
    else push(f.value);
  }
  for (const v of Object.values(ctx.variables)) push(v);
  return allowed;
}

/** Legal propositions that are never permitted (Part 9 / Source Register §6). */
const OBSOLETE_ARGUMENT_PATTERNS: Array<{ re: RegExp; why: string }> = [
  {
    re: /\bgenuine\s+pre[- ]estimate\s+of\s+loss\b/gi,
    why: "uses the obsolete 'genuine pre-estimate of loss' argument",
  },
  {
    re: /\b(?:unlawful|unenforceable)\s+penalty\b/gi,
    why: "uses the obsolete 'unlawful penalty' argument",
  },
  {
    re: /\bcharge\s+must\s+(?:reflect|equal)\s+(?:the\s+)?(?:operator'?s?\s+)?(?:actual\s+)?(?:financial\s+)?loss\b/gi,
    why: "asserts the charge must equal the operator's loss, which Beavis rejects",
  },
  {
    re: /\bevery\s+(?:£\s?\d+\s+)?(?:parking\s+)?charge\s+is\s+automatically\s+valid\b/gi,
    why: "asserts every charge is automatically valid",
  },
];

const valFact: Validator = {
  code: "VAL-FACT",
  description:
    "A material factual assertion cannot be traced to the notice, evidence or a confirmed answer.",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    const allowed = allowedValues(ctx);

    // 1. Obsolete / prohibited legal propositions.
    for (const { re, why } of OBSOLETE_ARGUMENT_PATTERNS) {
      for (const m of findAll(ctx.body, re)) {
        issues.push(issue("VAL-FACT", "BLOCKING", `Draft ${why}.`, ctx.body, m));
      }
    }

    // 2. Concrete values that are not in the established fact set.
    const checks: Array<{ re: RegExp; label: string }> = [
      { re: /\b\d{4}-\d{2}-\d{2}\b/g, label: "date" },
      {
        re: new RegExp(`\\b\\d{1,2}\\s+(?:${MONTHS.join("|")})\\s+\\d{4}\\b`, "gi"),
        label: "date",
      },
      { re: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, label: "date" },
      { re: /£\s?\d+(?:\.\d{2})?/g, label: "amount" },
      { re: /\b[A-Z]{2}\d{2}\s?[A-Z]{3}\b/g, label: "vehicle registration" },
    ];

    for (const { re, label } of checks) {
      for (const m of findAll(ctx.body, re)) {
        const token = normaliseToken(m[0]);
        const compact = normaliseToken(m[0].replace(/\s+/g, ""));
        if (allowed.has(token) || allowed.has(compact)) continue;
        issues.push(
          issue(
            "VAL-FACT",
            "BLOCKING",
            `Draft states a ${label} ("${m[0].trim()}") that is not established by the notice, evidence or a confirmed answer.`,
            ctx.body,
            m,
          ),
        );
      }
    }
    return issues;
  },
};

/* =========================== VAL-EVIDENCE =========================== */

const ENCLOSURE_PATTERNS: RegExp[] = [
  /\b(?:is|are)\s+(?:enclosed|attached)\b/gi,
  /\benclosed\s+(?:herewith|with\s+this\s+appeal|evidence)\b/gi,
  /\bsupplied\s+with\s+this\s+appeal\b/gi,
  /\bprovided\s+with\s+this\s+appeal\b/gi,
  /\battached\s+to\s+this\s+appeal\b/gi,
  /\bI\s+(?:enclose|attach)\b/gi,
  /\bplease\s+find\s+(?:enclosed|attached)\b/gi,
  /\bthe\s+enclosed\s+\w+/gi,
];

const valEvidence: Validator = {
  code: "VAL-EVIDENCE",
  description: "Draft says evidence is enclosed when it is not available.",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    if (ctx.evidence.size > 0) return issues;
    for (const re of ENCLOSURE_PATTERNS) {
      for (const m of findAll(ctx.body, re)) {
        issues.push(
          issue(
            "VAL-EVIDENCE",
            "BLOCKING",
            "Draft refers to enclosed or attached evidence, but no evidence is available on this case.",
            ctx.body,
            m,
          ),
        );
      }
    }
    return issues;
  },
};

/* ============================= VAL-POFA ============================= */

const POFA_DEFECT_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\bnot\s+delivered\s+within\b/gi, why: "alleges a delivery timing failure" },
  { re: /\bfailed\s+to\s+satisfy\s+a\s+condition\b/gi, why: "alleges a statutory condition was not satisfied" },
  { re: /\bdid\s+not\s+(?:meet|comply\s+with)\s+the\s+applicable\s+statutory\b/gi, why: "alleges statutory non-compliance" },
  { re: /\bfails\s+to\s+provide\s+the\s+route-specific\s+information\b/gi, why: "alleges a content defect" },
  { re: /\bdoes\s+not\s+(?:contain|comply\s+with)\s+(?:a\s+)?compliant\b/gi, why: "alleges a content defect" },
  { re: /\bnon[- ]compliant\s+with\s+(?:the\s+)?(?:Protection\s+of\s+Freedoms|Schedule\s+4)\b/gi, why: "makes a generic PoFA non-compliance allegation" },
  { re: /\bliability\s+cannot\s+be\s+transferred\b/gi, why: "concludes liability cannot be transferred" },
  { re: /\bhas\s+(?:therefore\s+)?failed\s+to\s+establish\s+keeper\s+liability\b/gi, why: "concludes keeper liability is not established" },
];

const valPofa: Validator = {
  code: "VAL-POFA",
  description: "A PoFA defect is alleged without route-specific verification.",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    const p = ctx.analysis.pofa;
    const defectEstablished =
      p.timingStatus === "FAILED" || p.confirmedContentDefects.length > 0;

    /*
     * An established timing failure must be shown, not merely asserted.
     *
     * "The Notice to Keeper was not given within the statutory period"
     * is an unanswerable sentence to an operator: it states a conclusion
     * with nothing for them to check, and it reads as boilerplate
     * because it is indistinguishable from boilerplate. The dates are
     * the whole argument — they are what makes the point verifiable
     * against the operator's own notice.
     *
     * Blocking rather than a warning: a letter that alleges the defect
     * without the dates is weaker than one that never raised it, since
     * it invites a flat denial on the strongest ground available.
     */
    if (p.timingStatus === "FAILED") {
      const allegesTiming = findAll(
        ctx.body,
        /\bnot\s+(?:given|delivered|served)\s+within\b/gi,
      );
      if (allegesTiming.length > 0) {
        const eventDate = ctx.variables.parking_event_date;
        const noticeDate = ctx.variables.notice_issue_date;
        const statesDate = (value: string | undefined): boolean =>
          typeof value === "string" &&
          value.trim().length > 0 &&
          ctx.body.includes(value);
        const missing: string[] = [];
        if (!statesDate(eventDate)) missing.push("the parking event date");
        if (!statesDate(noticeDate)) missing.push("the notice date");
        if (missing.length > 0) {
          issues.push(
            issue(
              "VAL-POFA",
              "BLOCKING",
              `Draft alleges the Notice to Keeper was served out of time but does not state ${missing.join(" or ")}. An established timing failure must show the dates it is calculated from.`,
              ctx.body,
              allegesTiming[0],
            ),
          );
        }
      }
    }

    if (defectEstablished) return issues;

    for (const { re, why } of POFA_DEFECT_PATTERNS) {
      for (const m of findAll(ctx.body, re)) {
        issues.push(
          issue(
            "VAL-POFA",
            "BLOCKING",
            `Draft ${why}, but no Schedule 4 defect has been verified (timing status: ${p.timingStatus}, confirmed content defects: ${p.confirmedContentDefects.length}).`,
            ctx.body,
            m,
          ),
        );
      }
    }

    // Keeper liability failing never makes the charge itself void.
    for (const m of findAll(
      ctx.body,
      /\b(?:the\s+)?(?:parking\s+)?charge\s+is\s+(?:therefore\s+)?(?:void|invalid|unenforceable)\b/gi,
    )) {
      issues.push(
        issue(
          "VAL-POFA",
          "BLOCKING",
          "Draft asserts the charge itself is void. A Schedule 4 failure affects transfer of liability to the keeper only.",
          ctx.body,
          m,
        ),
      );
    }
    return issues;
  },
};

/* ============================= VAL-CODE ============================= */

const CODE_REFERENCE_PATTERNS: RegExp[] = [
  /\bCode\s+of\s+Practice\b/gi,
  /\bSingle\s+Code\b/gi,
  /\bconsideration\s+period\b/gi,
  /\bgrace\s+period\b/gi,
  /\bAppeals\s+Charter\b/gi,
  /\bkeying[- ]error\s+requirements\b/gi,
];

const valCode: Validator = {
  code: "VAL-CODE",
  description:
    "A Code rule or version is applied without an event-date / operator applicability check.",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    const referencesCode = CODE_REFERENCE_PATTERNS.some((re) =>
      findAll(ctx.body, re).length > 0,
    );

    if (referencesCode && !ctx.analysis.codeVersion) {
      const m = findAll(ctx.body, CODE_REFERENCE_PATTERNS[0])[0] ?? null;
      issues.push(
        issue(
          "VAL-CODE",
          "BLOCKING",
          "Draft relies on the industry Code but the applicable version could not be resolved from the parking event date.",
          ctx.body,
          m,
        ),
      );
    }

    // A named version must match the resolved one.
    for (const m of findAll(ctx.body, /\bversion\s+(\d+(?:\.\d+)?)\b/gi)) {
      const named = m[1];
      if (
        ctx.analysis.codeVersion &&
        !ctx.analysis.codeVersion.includes(named)
      ) {
        issues.push(
          issue(
            "VAL-CODE",
            "BLOCKING",
            `Draft names Code version ${named} but the version applicable to this parking event is ${ctx.analysis.codeVersion}.`,
            ctx.body,
            m,
          ),
        );
      }
    }

    // The universal 10-minute rule is never permitted.
    for (const m of findAll(
      ctx.body,
      /\b(?:10|ten)\s+minutes?\b[^.]{0,60}\b(?:always|automatically|must|cancel)/gi,
    )) {
      issues.push(
        issue(
          "VAL-CODE",
          "BLOCKING",
          "Draft applies a universal 10-minute cancellation rule, which is prohibited.",
          ctx.body,
          m,
        ),
      );
    }
    return issues;
  },
};

/* ============================== VAL-RES ============================== */

const RES_RIGHTS_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\bpre[- ]existing\s+(?:residential\s+)?parking\s+rights\b/gi, why: "asserts pre-existing parking rights" },
  { re: /\bthe\s+(?:lease|tenancy)\s+(?:grants|provides|confers)\b/gi, why: "asserts what the lease grants" },
  { re: /\ballocated\s+(?:space|bay)\s+\S+/gi, why: "identifies an allocated space" },
  { re: /\bderogat\w+\s+from\s+(?:its\s+)?grant\b/gi, why: "relies on derogation from grant" },
  { re: /\bquiet\s+enjoyment\b/gi, why: "relies on quiet enjoyment" },
];

const valRes: Validator = {
  code: "VAL-RES",
  description:
    "Lease or tenancy wording is invented, paraphrased inaccurately, or rights are overstated.",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    const uploaded = factStr(ctx.facts, FACT.AGREEMENT_UPLOADED) === "YES";
    const permitClause =
      factStr(ctx.facts, FACT.AGREEMENT_PERMIT_CLAUSE) === "YES";

    if (!uploaded) {
      for (const { re, why } of RES_RIGHTS_PATTERNS) {
        for (const m of findAll(ctx.body, re)) {
          issues.push(
            issue(
              "VAL-RES",
              "BLOCKING",
              `Draft ${why}, but no lease, tenancy or parking grant has been provided.`,
              ctx.body,
              m,
            ),
          );
        }
      }
    }

    // "unfettered" requires the instrument to genuinely support it.
    for (const m of findAll(ctx.body, /\bunfettered\b/gi)) {
      if (!uploaded || permitClause) {
        issues.push(
          issue(
            "VAL-RES",
            "BLOCKING",
            'Draft uses "unfettered" without an uploaded instrument that supports an unrestricted right.',
            ctx.body,
            m,
          ),
        );
      }
    }

    // Where a permit/regulations clause exists it must be confronted.
    if (uploaded && permitClause) {
      const confronts =
        /\bpermit\b/i.test(ctx.body) ||
        /\bregulations\b/i.test(ctx.body) ||
        /\bparking\s+controls\b/i.test(ctx.body);
      const assertsPrimacy = RES_RIGHTS_PATTERNS.some(
        (p) => findAll(ctx.body, p.re).length > 0,
      );
      if (assertsPrimacy && !confronts) {
        issues.push({
          code: "VAL-RES",
          severity: "BLOCKING",
          message:
            "The agreement contains a permit or regulations clause, but the draft asserts residential rights without addressing that clause.",
        });
      }
    }

    // Quiet enjoyment must never be framed as immunity from regulation.
    for (const m of findAll(
      ctx.body,
      /\bquiet\s+enjoyment\b[^.]{0,80}\b(?:immun\w+|free\s+from\s+all|any\s+parking\s+regulation)/gi,
    )) {
      issues.push(
        issue(
          "VAL-RES",
          "BLOCKING",
          "Draft treats quiet enjoyment as freedom from all parking regulation.",
          ctx.body,
          m,
        ),
      );
    }
    return issues;
  },
};

/* ============================= VAL-BREAK ============================= */

const valBreak: Validator = {
  code: "VAL-BREAK",
  description:
    "Breakdown is described as automatic frustration without facts showing genuine prevention.",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    const brokeDown = ctx.facts.tags.has("breakdown_immobilised");
    const prevented =
      factStr(ctx.facts, FACT.BREAKDOWN_PREVENTED_DEPARTURE) === "YES";

    // Automatic-frustration language is never permitted.
    for (const m of findAll(
      ctx.body,
      /\b(?:automatically|necessarily|always)\s+(?:frustrat\w+|void\w*|discharg\w+|cancel\w*)/gi,
    )) {
      issues.push(
        issue(
          "VAL-BREAK",
          "BLOCKING",
          "Draft states a breakdown automatically frustrates or voids the contract. The conclusion must follow the facts.",
          ctx.body,
          m,
        ),
      );
    }
    for (const m of findAll(
      ctx.body,
      /\bbreakdown\b[^.]{0,40}\b(?:automatically|always)\b/gi,
    )) {
      issues.push(
        issue(
          "VAL-BREAK",
          "BLOCKING",
          "Draft treats breakdown as an automatic cancellation ground.",
          ctx.body,
          m,
        ),
      );
    }

    // Frustration/impossibility requires established prevention.
    if (!brokeDown || !prevented) {
      for (const m of findAll(
        ctx.body,
        /\b(?:frustrat\w+|impossib\w+|supervening\s+event)\b/gi,
      )) {
        issues.push(
          issue(
            "VAL-BREAK",
            "BLOCKING",
            "Draft relies on frustration or impossibility, but it is not established that an event prevented departure or compliance.",
            ctx.body,
            m,
          ),
        );
      }
    }

    // Immobilisation claims need the underlying fact.
    if (!brokeDown) {
      for (const m of findAll(ctx.body, /\bmechanically\s+immobilised\b/gi)) {
        issues.push(
          issue(
            "VAL-BREAK",
            "BLOCKING",
            "Draft states the vehicle was mechanically immobilised, but no breakdown has been established.",
            ctx.body,
            m,
          ),
        );
      }
    }
    return issues;
  },
};

/* ============================== VAL-EQ ============================== */

const EQ_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /\bEquality\s+Act\b/gi, why: "invokes the Equality Act" },
  { re: /\breasonable\s+adjustment\b/gi, why: "relies on a reasonable-adjustment duty" },
  { re: /\bdisability[- ]related\b/gi, why: "relies on disability-related circumstances" },
];

const valEq: Validator = {
  code: "VAL-EQ",
  description: "An Equality Act ground is generated without relevant facts.",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    const hasFacts =
      ctx.facts.tags.has("accessibility_additional_time") &&
      factStr(ctx.facts, FACT.ADDITIONAL_TIME_NEEDED) !== null;

    if (!hasFacts) {
      for (const { re, why } of EQ_PATTERNS) {
        for (const m of findAll(ctx.body, re)) {
          issues.push(
            issue(
              "VAL-EQ",
              "BLOCKING",
              `Draft ${why}, but no disability-related facts have been established.`,
              ctx.body,
              m,
            ),
          );
        }
      }
    }

    // A Blue Badge is not the statutory test.
    for (const m of findAll(
      ctx.body,
      /\bBlue\s+Badge\b[^.]{0,60}\b(?:entitles|means|therefore|proves)\b/gi,
    )) {
      issues.push(
        issue(
          "VAL-EQ",
          "BLOCKING",
          "Draft equates Blue Badge possession with the statutory Equality Act test.",
          ctx.body,
          m,
        ),
      );
    }

    // The appeal must not promise cancellation.
    for (const m of findAll(
      ctx.body,
      /\b(?:must|will)\s+(?:therefore\s+)?be\s+cancelled\b/gi,
    )) {
      issues.push(
        issue(
          "VAL-EQ",
          "WARNING",
          "Draft asserts the charge must be cancelled. Outcome depends on the facts and law; prefer requesting cancellation.",
          ctx.body,
          m,
        ),
      );
    }
    return issues;
  },
};

/* ============================= VAL-ANPR ============================= */

const valAnpr: Validator = {
  code: "VAL-ANPR",
  description:
    "A generic calibration or maintenance allegation is inserted without a factual trigger.",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    const specificDiscrepancy =
      factStr(ctx.facts, FACT.CONTINUOUS_PRESENCE) !== null;

    for (const m of findAll(
      ctx.body,
      /\b(?:calibration|maintenance)\s+(?:records?|certificates?|logs?)\b/gi,
    )) {
      if (!specificDiscrepancy) {
        issues.push(
          issue(
            "VAL-ANPR",
            "BLOCKING",
            "Draft demands calibration or maintenance records without a specific factual discrepancy.",
            ctx.body,
            m,
          ),
        );
      }
    }

    for (const m of findAll(
      ctx.body,
      /\bANPR\s+(?:is|systems?\s+(?:are|is))\s+(?:inherently\s+)?unreliable\b/gi,
    )) {
      issues.push(
        issue(
          "VAL-ANPR",
          "BLOCKING",
          "Draft makes a generic 'ANPR is unreliable' allegation with no factual basis.",
          ctx.body,
          m,
        ),
      );
    }

    // Entry-to-exit must never be equated with parking time.
    for (const m of findAll(
      ctx.body,
      /\bentry[- ]to[- ]exit\b[^.]{0,50}\b(?:is|equals)\s+(?:the\s+)?parking\s+(?:time|period)\b/gi,
    )) {
      issues.push(
        issue(
          "VAL-ANPR",
          "BLOCKING",
          "Draft equates the entry-to-exit interval with the period of parking.",
          ctx.body,
          m,
        ),
      );
    }
    return issues;
  },
};

/* ============================ VAL-STAGE ============================ */

const valStage: Validator = {
  code: "VAL-STAGE",
  description:
    "POPLA / IAS / court language appears in an initial operator appeal.",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    const patterns: Array<{ re: RegExp; why: string }> = [
      { re: /\bPOPLA\b/g, why: "names POPLA" },
      { re: /\bIAS\b/g, why: "names the IAS" },
      { re: /\bIndependent\s+Appeals\s+Service\b/gi, why: "names the Independent Appeals Service" },
      { re: /\bcounty\s+court\b/gi, why: "refers to the County Court" },
      { re: /\bclaim\s+form\b/gi, why: "refers to a claim form" },
      { re: /\bparticulars\s+of\s+claim\b/gi, why: "refers to particulars of claim" },
      { re: /\bdefence\b/gi, why: "uses litigation defence language" },
      { re: /\btribunal\b/gi, why: "refers to a tribunal" },
      { re: /\blitigation\b/gi, why: "refers to litigation" },
      { re: /\bletter\s+before\s+(?:action|claim)\b/gi, why: "refers to a letter before claim" },
      { re: /\bCPR\b/g, why: "cites the Civil Procedure Rules" },
    ];
    for (const { re, why } of patterns) {
      for (const m of findAll(ctx.body, re)) {
        issues.push(
          issue(
            "VAL-STAGE",
            "BLOCKING",
            `Draft ${why}, which is wrong-stage language for an initial operator appeal.`,
            ctx.body,
            m,
          ),
        );
      }
    }
    return issues;
  },
};

/* =========================== VAL-CONFLICT =========================== */

const valConflict: Validator = {
  code: "VAL-CONFLICT",
  description:
    "Draft contains contradictory dates, payment status, duration, permit status or account.",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    const f = ctx.facts;
    const paid = f.tags.has("payment_made");
    const attempted = f.tags.has("payment_attempted_failed");

    // Payment asserted when none was made.
    if (!paid) {
      for (const m of findAll(
        ctx.body,
        /\b(?:a\s+)?payment\s+was\s+made\b/gi,
      )) {
        issues.push(
          issue(
            "VAL-CONFLICT",
            "BLOCKING",
            "Draft states a payment was made, but that is not established on this case.",
            ctx.body,
            m,
          ),
        );
      }
    }

    // Both "payment made" and "payment did not complete" in one letter.
    if (paid && !attempted) {
      for (const m of findAll(
        ctx.body,
        /\b(?:transaction|payment)\s+could\s+not\s+be\s+completed\b/gi,
      )) {
        issues.push(
          issue(
            "VAL-CONFLICT",
            "BLOCKING",
            "Draft states the payment could not be completed while also relying on a completed payment.",
            ctx.body,
            m,
          ),
        );
      }
    }

    // Claiming no Notice to Keeper when one was received.
    const noNtk = f.tags.has("no_ntk_received");
    const hasIssueDate = f.known.has(FACT.NOTICE_ISSUE_DATE);
    if (!noNtk && hasIssueDate) {
      for (const m of findAll(
        ctx.body,
        /\bhas\s+not\s+received\s+a\s+Notice\s+to\s+Keeper\b/gi,
      )) {
        issues.push(
          issue(
            "VAL-CONFLICT",
            "BLOCKING",
            "Draft states no Notice to Keeper was received, but the notice details were confirmed from the document.",
            ctx.body,
            m,
          ),
        );
      }
    }

    // Permit asserted with no permission established.
    if (!f.tags.has("authorised_or_permit")) {
      for (const m of findAll(
        ctx.body,
        /\ba\s+valid\s+(?:parking\s+)?permit\s+(?:existed|was\s+held)\b/gi,
      )) {
        issues.push(
          issue(
            "VAL-CONFLICT",
            "BLOCKING",
            "Draft asserts a valid permit was held, but no permission has been established.",
            ctx.body,
            m,
          ),
        );
      }
    }

    // Multiple-visit wording without multiple visits.
    if (!f.tags.has("multiple_visits_same_day")) {
      for (const m of findAll(
        ctx.body,
        /\battended\s+the\s+location\s+on\s+more\s+than\s+one\s+separate\s+occasion\b/gi,
      )) {
        issues.push(
          issue(
            "VAL-CONFLICT",
            "BLOCKING",
            "Draft states the vehicle attended more than once, but only a single visit is established.",
            ctx.body,
            m,
          ),
        );
      }
    }
    return issues;
  },
};

/* ========================== VAL-REPETITION ========================== */

function sentences(body: string): string[] {
  return body
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40);
}

/**
 * Significant words in a sentence — the ones that carry its point.
 */
function significantWords(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

/**
 * Fewest significant words a sentence needs before its containment in
 * another counts as repetition.
 *
 * The score below is min-normalised, which measures CONTAINMENT: "is
 * all of the shorter sentence's content also in the longer one?" That
 * is the right question for repetition, but it has a failure mode at
 * short lengths. A topic sentence such as "The alleged duration of
 * parking is disputed." carries four significant words, and any
 * detailed sentence about disputed durations contains most of them, so
 * it scored 0.75 against PP-ANPR-007 — which argues something entirely
 * different (that the timestamps themselves are unreliable and the
 * equipment should be verified). Both paragraphs belong in that letter,
 * and the validator was blocking the case outright.
 *
 * Eight keeps every genuine collision found in the pack, all of which
 * are restatements a dozen words or more long: PP-KEY-001/002 at 0.86
 * and PP-POFA-001/007 at 0.75. It only stops short openers from being
 * read as duplicates of the sentences that develop them.
 */
const MIN_SIGNIFICANT_WORDS = 8;

function similarity(a: string, b: string): number {
  const sa = significantWords(a);
  const sb = significantWords(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  if (Math.min(sa.size, sb.size) < MIN_SIGNIFICANT_WORDS) return 0;
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared += 1;
  return shared / Math.min(sa.size, sb.size);
}

const valRepetition: Validator = {
  code: "VAL-REPETITION",
  description: "The same point is repeated under multiple grounds.",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    const ss = sentences(ctx.body);
    for (let i = 0; i < ss.length; i++) {
      for (let j = i + 1; j < ss.length; j++) {
        const score = similarity(ss[i], ss[j]);
        if (score >= 0.85) {
          issues.push({
            code: "VAL-REPETITION",
            severity: "BLOCKING",
            message:
              "The same point is stated twice in near-identical terms. Each paragraph must add a distinct legal or factual point.",
            excerpt: ss[j].slice(0, 160),
          });
        } else if (score >= 0.65) {
          issues.push({
            code: "VAL-REPETITION",
            severity: "WARNING",
            message:
              "Two paragraphs overlap substantially. Consider merging them so the letter reads as one case.",
            excerpt: ss[j].slice(0, 160),
          });
        }
      }
    }
    return issues;
  },
};

/* ========================= VAL-UNSUPPORTED ========================= */

/**
 * Unsupported legal claims, and source governance.
 *
 * MASTER V2 Part 9: the AI may not invent a legal proposition, an
 * authority or a Code provision. Source Register §17: every proposition
 * needs a source, and anything WITHDRAWN, GOVERNMENT_PROPOSAL or
 * OPEN_INVESTIGATION must never be described as binding or current law.
 *
 * This is the last line of defence. The retrieval layer should already
 * have excluded non-binding sources, so anything caught here means the
 * drafter introduced material of its own.
 */

/** Named authorities the KB knows about, lower-cased. */
function permittedAuthorityNames(ctx: ValidatorContext): string[] {
  return ctx.sources.map((s) => s.title.toLowerCase());
}

/** Case-name shapes: "X v Y", with or without a citation. */
const CASE_CITATION =
  /\b([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,3})\s+v\.?\s+([A-Z][A-Za-z'’-]+(?:\s+[A-Za-z'’-]+){0,3})/g;

/** Statute shapes: "<Name> Act <year>". */
const STATUTE = /\b([A-Z][A-Za-z'’-]*(?:\s+[A-Z][A-Za-z'’-]*){0,5}\s+Act\s+(?:19|20)\d{2})/g;

/** Wording that asserts something is current binding law. */
const BINDING_ASSERTION =
  /\b(?:is|are|remains?|constitutes?)\s+(?:now\s+)?(?:current\s+)?(?:binding|the\s+law|statutory\s+law|legally\s+binding|in\s+force)\b|\bthe\s+law\s+(?:now\s+)?requires\b|\bstatute\s+requires\b/i;

/** Non-binding material that must never be dressed as law. */
const NON_BINDING_MENTIONS: Array<{ re: RegExp; what: string }> = [
  { re: /\bconsultation\b/i, what: "a government consultation" },
  { re: /\bproposed\s+code\b/i, what: "a proposed Code" },
  { re: /\bwithdrawn\s+code\b/i, what: "a withdrawn Code" },
  { re: /\b2022\s+government\s+code\b/i, what: "the withdrawn 2022 government Code" },
  { re: /\bopen\s+investigation\b/i, what: "an open investigation" },
];

const valUnsupported: Validator = {
  code: "VAL-UNSUPPORTED",
  description:
    "A legal proposition, authority or Code provision is not supported by approved retrieved material.",
  run(ctx) {
    const issues: ValidationIssue[] = [];
    const permitted = permittedAuthorityNames(ctx);
    const moduleBasis = ctx.modules
      .map((m) => `${m.legalBasis ?? ""} ${m.coreProposition}`.toLowerCase())
      .join(" ");

    const isKnown = (name: string) => {
      const n = name.toLowerCase();
      return (
        permitted.some((p) => p.includes(n) || n.includes(p.split(",")[0])) ||
        moduleBasis.includes(n)
      );
    };

    // 1. Case authorities must come from the source register.
    for (const m of findAll(ctx.body, CASE_CITATION)) {
      const cited = `${m[1]} v ${m[2]}`;
      if (isKnown(cited) || isKnown(m[1])) continue;
      issues.push({
        code: "VAL-UNSUPPORTED",
        severity: "BLOCKING",
        message: `The draft cites "${cited}", which is not in the approved source register. Authorities may not be introduced by the drafter.`,
        excerpt: m[0],
      });
    }

    // 2. Statutes must come from the source register.
    for (const m of findAll(ctx.body, STATUTE)) {
      if (isKnown(m[1])) continue;
      issues.push({
        code: "VAL-UNSUPPORTED",
        severity: "BLOCKING",
        message: `The draft relies on "${m[1]}", which is not in the approved source register.`,
        excerpt: m[0],
      });
    }

    // 3. Source governance — Source Register §17.
    for (const { re, what } of NON_BINDING_MENTIONS) {
      const hit = re.exec(ctx.body);
      if (!hit) continue;
      // Mentioning it is allowed; presenting it as law is not.
      const nearby = contextAround(ctx.body, hit.index, 220);
      if (BINDING_ASSERTION.test(nearby)) {
        issues.push({
          code: "VAL-UNSUPPORTED",
          severity: "BLOCKING",
          message: `The draft presents ${what} as binding or current law. Withdrawn, proposed and under-investigation material is context only.`,
          excerpt: nearby.slice(0, 180),
        });
      }
    }

    // 4. A non-binding source must not be leaned on at all where the
    //    retrieval layer let one through.
    for (const source of ctx.sources) {
      if (!NON_BINDING_STATUSES.includes(source.status)) continue;
      const short = source.title.split(",")[0].toLowerCase();
      if (short.length < 6) continue;
      if (!ctx.body.toLowerCase().includes(short)) continue;
      issues.push({
        code: "VAL-UNSUPPORTED",
        severity: "BLOCKING",
        message: `The draft relies on "${source.title}", which is ${source.status} and may not be presented as a current requirement.`,
        excerpt: short,
      });
    }

    // 5. A Code requirement needs a resolved Code version behind it.
    if (
      /\bcode\s+(?:of\s+practice\s+)?(?:requires|mandates|provides\s+that|states\s+that)\b/i.test(
        ctx.body,
      ) &&
      !ctx.analysis.codeVersionId
    ) {
      issues.push({
        code: "VAL-UNSUPPORTED",
        severity: "BLOCKING",
        message:
          "The draft asserts a Code requirement, but no applicable Code version was resolved for the parking event date.",
        excerpt: "Code requirement without a resolved version",
      });
    }

    // 6. Every module-free draft is unsupported by definition.
    if (ctx.modules.length === 0) {
      issues.push({
        code: "VAL-UNSUPPORTED",
        severity: "BLOCKING",
        message:
          "No approved knowledge module supports this draft, so nothing in it is traceable to reviewed material.",
        excerpt: "no approved modules",
      });
    }

    return issues;
  },
};

/** Text either side of an index, for judging how a mention is used. */
function contextAround(body: string, index: number, radius: number): string {
  return body.slice(Math.max(0, index - radius), index + radius);
}

export const VALIDATORS: Validator[] = [
  valDriver,
  valFact,
  valEvidence,
  valPofa,
  valCode,
  valRes,
  valBreak,
  valEq,
  valAnpr,
  valStage,
  valConflict,
  valRepetition,
  valUnsupported,
];
