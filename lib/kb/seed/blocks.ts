import type { DraftingBlock } from "../types";
import { PARAGRAPH_LIBRARY } from "@/paragraphs/library";
import type { RouteFamily } from "@/types/caseState";

/**
 * Appendix A drafting building blocks.
 *
 * Two sources:
 *   1. NEW_AI_BLOCKS below — the ten AI-* blocks introduced by V2 that
 *      have no V1 equivalent, transcribed verbatim from Appendix A.
 *   2. The existing V1 `PARAGRAPH_LIBRARY`, imported unchanged.
 *
 * Import policy for the V1 library (see docs/V2_CONFORMANCE_REPORT.md
 * §2.2): Appendix A lists 60 of the 87 existing blocks. The 27 not
 * listed are imported with status = "REVIEW" rather than deleted, so an
 * administrator decides. Deleting approved legal wording without an
 * instruction to do so is the riskier action, and V2 §19 explicitly
 * provides ACTIVE/REVIEW/DISABLED for exactly this purpose.
 */

/** Block IDs listed in V2 Appendix A. Anything else → REVIEW. */
export const V2_APPENDIX_A_IDS: ReadonlySet<string> = new Set([
  // Intro
  "PP-INTRO-001", "PP-INTRO-002",
  // PoFA
  "PP-POFA-001", "PP-POFA-002", "PP-POFA-003", "PP-POFA-004",
  "PP-POFA-005A", "PP-POFA-005B", "PP-POFA-005C", "PP-POFA-005D",
  "PP-POFA-005E", "PP-POFA-006", "PP-POFA-007",
  // Payment
  "PP-PAY-001", "PP-PAY-002", "PP-PAY-003", "PP-PAY-004", "PP-PAY-005",
  "PP-PAY-006",
  // Keying
  "PP-KEY-001", "PP-KEY-002", "PP-KEY-003", "PP-KEY-004",
  // Consideration
  "PP-CON-001", "PP-CON-002", "PP-CON-003", "PP-CON-004", "PP-CON-005",
  // Grace
  "PP-GRACE-001", "PP-GRACE-002", "PP-GRACE-003", "PP-GRACE-004",
  "PP-GRACE-005",
  // ANPR
  "PP-ANPR-001", "PP-ANPR-002", "PP-ANPR-003", "PP-ANPR-004",
  "PP-ANPR-005", "PP-ANPR-007", "PP-ANPR-008", "PP-ANPR-010",
  "PP-ANPR-011",
  // Authorisation
  "PP-AUTH-001", "PP-AUTH-002", "PP-AUTH-004", "PP-AUTH-006",
  "PP-AUTH-008",
  // Signage
  "PP-SIGN-001", "PP-SIGN-002", "PP-SIGN-004", "PP-SIGN-005",
  "PP-SIGN-011",
  // Landowner
  "PP-LAND-001", "PP-LAND-002", "PP-LAND-005", "PP-LAND-006",
  "PP-LAND-008",
  // Closing
  "PP-END-001", "PP-END-002", "PP-END-003",
  // New AI blocks
  "AI-BREAK-001", "AI-BREAK-002",
  "AI-RES-001", "AI-RES-002", "AI-RES-003", "AI-RES-004",
  "AI-EQ-001", "AI-HOSP-001", "AI-ACT-001", "AI-EVCH-001",
]);

function vars(text: string): string[] {
  return Array.from(new Set(text.match(/\{\{[a-z_]+\}\}/g) ?? [])).map((v) =>
    v.replace(/[{}]/g, ""),
  );
}

const nb = { status: "ACTIVE" as const, version: 1, inV2Appendix: true };

/**
 * The ten blocks introduced by V2 Appendix A. Text transcribed verbatim
 * from the pack — do not reword.
 */
export const NEW_AI_BLOCKS: DraftingBlock[] = [
  {
    ...nb,
    blockId: "AI-BREAK-001",
    title: "Breakdown / Current Code Route",
    routeFamily: "BREAKDOWN",
    text:
      "The vehicle became mechanically immobilised during the relevant period. The incident was outside the ordinary control of the person responsible for the vehicle and materially prevented timely departure/compliance. The operator is requested to apply the breakdown/emergency provisions of the current applicable Code/Appeals Charter to the enclosed evidence and cancel the charge where those provisions are satisfied.",
    variables: [],
    usageNotes:
      "Requires KB-BREAK-01/02/03 and evidence of genuine immobilisation. Only reference enclosed evidence that actually exists (VAL-EVIDENCE).",
  },
  {
    ...nb,
    blockId: "AI-BREAK-002",
    title: "Breakdown / Contract Analysis",
    routeFamily: "BREAKDOWN",
    text:
      "The alleged breach arose, if at all, only because an unforeseen mechanical event prevented the vehicle from being moved as required. The operator is requested to address the legal effect of that supervening event and the evidence of genuine immobilisation rather than treating the additional presence as a voluntary decision to remain parked.",
    variables: [],
    usageNotes:
      "Frustration/impossibility framing. Never state breakdown automatically frustrates a contract (VAL-BREAK).",
  },
  {
    ...nb,
    blockId: "AI-RES-001",
    title: "Residential Primacy",
    routeFamily: "RESIDENTIAL",
    text:
      "The vehicle was parked pursuant to pre-existing residential parking rights evidenced by the uploaded {{lease_or_tenancy}}. The operator's signage cannot simply be assumed to vary or extinguish rights already granted under that agreement. The operator is requested to address the specific parking clause and explain the contractual basis on which the later parking scheme is said to override or modify it.",
    variables: ["lease_or_tenancy"],
    usageNotes:
      "Requires an uploaded instrument (KB-RES-01). If a regulations/permit clause exists it must be addressed, not omitted (KB-RES-06).",
  },
  {
    ...nb,
    blockId: "AI-RES-002",
    title: "Unfettered / Express Right",
    routeFamily: "RESIDENTIAL",
    text:
      "The relevant agreement grants a right to park in terms that do not contain the restriction now alleged. The operator is requested to address the scope of that grant and identify any valid contractual mechanism said to have introduced the additional restriction. Use only when the uploaded instrument genuinely supports this proposition.",
    variables: [],
    usageNotes:
      "Never use the word 'unfettered' unless the document supports it (KB-RES-02, VAL-RES).",
  },
  {
    ...nb,
    blockId: "AI-RES-003",
    title: "Allocated Bay",
    routeFamily: "RESIDENTIAL",
    text:
      "The relevant agreement grants or identifies parking rights connected with the allocated space {{bay_reference}}. The operator must address those pre-existing rights before treating the vehicle as an unauthorised user of that space.",
    variables: ["bay_reference"],
    usageNotes:
      "Requires a bay/space identified in the uploaded instrument (KB-RES-03).",
  },
  {
    ...nb,
    blockId: "AI-RES-004",
    title: "Derogation from Grant",
    routeFamily: "RESIDENTIAL",
    text:
      "The uploaded agreement confers a parking benefit. Where the later parking arrangement substantially interferes with the exercise of that granted right, the operator is requested to address the principle that a grantor cannot substantially deprive the grantee of the benefit already conferred. Use only after legal/factual validation.",
    variables: [],
    usageNotes:
      "KB-RES-04 only. Not boilerplate for every residential appeal. Saeed v Plustrade quotation remains disabled by default (KB-GOV-06).",
  },
  {
    ...nb,
    blockId: "AI-EQ-001",
    title: "Reasonable Adjustment / Additional Time",
    routeFamily: "EQUALITY",
    text:
      "The circumstances required additional time connected with a disability-related need. The operator is requested to consider whether its service and enforcement process required a reasonable adjustment rather than determining the charge solely by automated timestamps.",
    variables: [],
    usageNotes:
      "Requires relevant disability-related facts (KB-EQ-01/02/03, VAL-EQ). Never promise cancellation. Do not request excessive medical detail.",
  },
  {
    ...nb,
    blockId: "AI-HOSP-001",
    title: "Hospital / Clinical Delay",
    routeFamily: "HOSPITAL",
    text:
      "The parking event was connected with verified hospital/medical attendance and the timing issue arose from the identified clinical/emergency circumstances. The operator should apply the site's relevant exemption/validation rules and any applicable Code or Equality Act obligations.",
    variables: [],
    usageNotes:
      "Requires verified attendance (KB-HOSP-01/02). Never invent medical facts.",
  },
  {
    ...nb,
    blockId: "AI-ACT-001",
    title: "Loading / Unloading",
    routeFamily: "LOADING",
    text:
      "The vehicle's presence was connected with genuine loading/unloading activity. The operator should assess the actual site terms and the factual distinction between temporary stopping for that activity and ordinary parking, rather than assuming that every stationary period is parking.",
    variables: [],
    usageNotes:
      "KB-ACT-01/02. Do not assume loading is always exempt on private land.",
  },
  {
    ...nb,
    blockId: "AI-EVCH-001",
    title: "EV Charging",
    routeFamily: "EV_CHARGING",
    text:
      "The vehicle's presence was connected with a genuine charging session. The operator should distinguish the charging terms from any separate parking terms and reconcile the charge-session records with the allegation.",
    variables: [],
    usageNotes: "KB-EVCH-01. Requires a charging session record.",
  },
];

/** Map a V1 paragraph category onto a V2 route family bucket. */
function routeForLegacyId(id: string): RouteFamily | "INTRO" | "CLOSING" {
  if (id.startsWith("PP-INTRO")) return "INTRO";
  if (id.startsWith("PP-END")) return "CLOSING";
  if (id.startsWith("PP-POFA")) return "POFA";
  if (id.startsWith("PP-PAY")) return "PAYMENT";
  if (id.startsWith("PP-KEY")) return "KEYING";
  if (id.startsWith("PP-CON")) return "CONSIDERATION";
  if (id.startsWith("PP-GRACE")) return "GRACE";
  if (id.startsWith("PP-ANPR")) return "ANPR";
  if (id.startsWith("PP-AUTH")) return "AUTHORIZATION";
  if (id.startsWith("PP-SIGN")) return "SIGNAGE";
  if (id.startsWith("PP-LAND")) return "LANDOWNER";
  if (id.startsWith("PP-EV")) return "EV_CHARGING";
  return "CLOSING";
}

/**
 * All drafting blocks to seed: the ten new AI blocks plus the existing
 * V1 library, with blocks absent from Appendix A marked REVIEW.
 */
export function buildAllDraftingBlocks(): DraftingBlock[] {
  const legacy: DraftingBlock[] = PARAGRAPH_LIBRARY.map((p) => {
    const inAppendix = V2_APPENDIX_A_IDS.has(p.id);
    return {
      blockId: p.id,
      title: p.title,
      routeFamily: routeForLegacyId(p.id),
      text: p.text,
      variables: vars(p.text),
      status: inAppendix ? ("ACTIVE" as const) : ("REVIEW" as const),
      version: 1,
      inV2Appendix: inAppendix,
      usageNotes: inAppendix
        ? p.trigger
        : `Inherited from V1 but not listed in V2 Appendix A. Imported as REVIEW pending administrator decision. Original trigger: ${p.trigger}`,
    };
  });
  return [...NEW_AI_BLOCKS, ...legacy];
}
