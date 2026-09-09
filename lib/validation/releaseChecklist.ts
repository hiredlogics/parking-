import { FACT, factStr } from "@/lib/questions/facts";
import type { ValidatorContext } from "./context";

/**
 * Appendix C — Release Checklist.
 *
 * A final gate distinct from the twelve validators. The validators look
 * for things that are WRONG in the draft; this checklist confirms the
 * things that must be RIGHT before release.
 */
export interface ChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface ReleaseChecklist {
  passed: boolean;
  items: ChecklistItem[];
  failedIds: string[];
}

export function runReleaseChecklist(ctx: ValidatorContext): ReleaseChecklist {
  const { body, analysis, facts, evidence } = ctx;
  const items: ChecklistItem[] = [];

  const add = (id: string, label: string, passed: boolean, detail?: string) =>
    items.push({ id, label, passed, detail });

  // 1. Reference details match the source document.
  const pcnNumber = factStr(facts, FACT.PCN_NUMBER);
  const vrm = factStr(facts, FACT.VRM);
  const refsPresent =
    (!pcnNumber || body.includes(pcnNumber)) && (!vrm || body.includes(vrm));
  add(
    "REFERENCES_MATCH",
    "PCN number and vehicle registration match the source document",
    refsPresent,
    refsPresent ? undefined : "The draft does not carry the confirmed PCN number or VRM.",
  );

  // 2. Driver not identified on an unidentified-driver keeper route.
  add(
    "DRIVER_NOT_IDENTIFIED",
    "Driver has not been identified or implied",
    analysis.driverStatus !== "UNIDENTIFIED" ||
      !/\bI\s+(?:drove|parked|paid)\b/.test(body),
  );

  // 3. Every ground has an active module behind it.
  const hasModules = ctx.modules.length > 0;
  add(
    "GROUNDS_HAVE_MODULES",
    "Every legal ground has an active knowledge module",
    hasModules,
    hasModules ? undefined : "No approved knowledge module supports this draft.",
  );

  // 4. PoFA checks verified before any defect is stated.
  const allegesDefect = /\bnot\s+delivered\s+within\b|\bfailed\s+to\s+satisfy\s+a\s+condition\b/i.test(
    body,
  );
  const defectVerified =
    analysis.pofa.timingStatus === "FAILED" ||
    analysis.pofa.confirmedContentDefects.length > 0;
  add(
    "POFA_VERIFIED",
    "PoFA route, timing and content checks verified before any defect is stated",
    !allegesDefect || defectVerified,
  );

  // 5. Applicable Code version resolved.
  add(
    "CODE_VERSION_RESOLVED",
    "Applicable Code version and transition status resolved",
    analysis.codeVersion !== null,
    analysis.codeVersion ?? "Unresolved",
  );

  // 6. Breakdown route uses real evidence and promises nothing automatic.
  const mentionsBreakdown = /\bmechanically\s+immobilised\b|\bbreakdown\b/i.test(body);
  const breakdownOk =
    !mentionsBreakdown ||
    (facts.tags.has("breakdown_immobilised") &&
      !/\bautomatically\s+(?:frustrat|void|cancel)/i.test(body));
  add(
    "BREAKDOWN_EVIDENCED",
    "Breakdown route uses actual facts and promises no automatic frustration",
    breakdownOk,
  );

  // 7. Residential route rests on the actual instrument.
  const mentionsResidential = /\b(?:lease|tenancy)\b/i.test(body);
  const residentialOk =
    !mentionsResidential || factStr(facts, FACT.AGREEMENT_UPLOADED) === "YES";
  add(
    "RESIDENTIAL_GROUNDED",
    "Residential route relies on an actual uploaded lease or tenancy",
    residentialOk,
  );

  // 8. ANPR allegations are fact-specific.
  const genericAnpr = /\bcalibration\s+records?\b/i.test(body);
  add(
    "ANPR_FACT_SPECIFIC",
    "ANPR allegations are fact-specific with no generic calibration claim",
    !genericAnpr || factStr(facts, FACT.CONTINUOUS_PRESENCE) !== null,
  );

  // 9. Evidence said to be enclosed actually exists.
  const claimsEnclosure = /\b(?:enclosed|attached|supplied\s+with\s+this\s+appeal)\b/i.test(
    body,
  );
  add(
    "EVIDENCE_EXISTS",
    "Evidence said to be enclosed actually exists",
    !claimsEnclosure || evidence.size > 0,
  );

  // 10. No obsolete penalty argument.
  add(
    "NO_OBSOLETE_PENALTY",
    "No obsolete pre-estimate-of-loss or unlawful-penalty argument",
    !/\bgenuine\s+pre[- ]estimate\s+of\s+loss\b|\b(?:unlawful|unenforceable)\s+penalty\b/i.test(
      body,
    ),
  );

  // 11. Suitable for an initial operator appeal.
  add(
    "CORRECT_STAGE",
    "Letter is suitable for an initial operator appeal",
    !/\bPOPLA\b|\bIAS\b|\bcounty\s+court\b|\btribunal\b/i.test(body),
  );

  // 12. Concise and coherent.
  const paragraphs = body.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const words = body.split(/\s+/).filter(Boolean).length;
  const concise = paragraphs.length >= 2 && paragraphs.length <= 14 && words <= 1400;
  add(
    "CONCISE_AND_COHERENT",
    "Letter is concise and coherent",
    concise,
    `${paragraphs.length} paragraphs, ${words} words`,
  );

  const failedIds = items.filter((i) => !i.passed).map((i) => i.id);
  return { passed: failedIds.length === 0, items, failedIds };
}
