import type { DraftingContext } from "../types";
import {
  DATE_FACT_KEYS,
  TIME_FACT_KEYS,
  formatUkDate,
  formatUkTime,
} from "@/lib/format/ukDate";

/**
 * Present dates and times the way a UK letter writes them.
 *
 * The prompt instructs the model to reproduce supplied values exactly,
 * so an ISO string in this payload becomes an ISO string in customer
 * prose. Presentation only — the canonical values behind PoFA timing
 * and Code applicability are computed in the analysis layer and are not
 * touched here.
 */
function displayValue(field: string, value: unknown): string {
  if (typeof value === "string") {
    if (DATE_FACT_KEYS.has(field)) return formatUkDate(value) ?? value;
    if (TIME_FACT_KEYS.has(field)) return formatUkTime(value) ?? value;
  }
  return JSON.stringify(value);
}

/**
 * Serialise the approved drafting context into the user-message payload.
 *
 * Deliberately excludes anything the model must not see or repeat:
 *   - source IDs and module IDs are NOT included as identifiers the
 *     model could echo; module content is supplied as unlabelled
 *     propositions instead (KB §16 rule 7 / V2 Part 9 item 13).
 *   - retrieval scores and decision traces are never included.
 */
export function serialiseDraftingContext(ctx: DraftingContext): string {
  const a = ctx.analysis;
  const lines: string[] = [];

  lines.push("=== CASE REFERENCE DETAILS ===");
  for (const [k, v] of Object.entries(ctx.variables)) {
    if (!v || v.trim().length === 0) continue;
    const shown = DATE_FACT_KEYS.has(k)
      ? formatUkDate(v) ?? v
      : TIME_FACT_KEYS.has(k)
        ? formatUkTime(v) ?? v
        : v;
    lines.push(`${k}: ${shown}`);
  }

  lines.push("");
  lines.push("=== PRIMARY ROUTE ===");
  lines.push(a.primaryRoute ?? "NONE");
  if (a.secondaryRoutes.length > 0) {
    lines.push("");
    lines.push("=== SECONDARY ROUTES (in order) ===");
    lines.push(a.secondaryRoutes.join(", "));
  }

  lines.push("");
  lines.push("=== WHY EACH ROUTE IS IN PLAY ===");
  for (const asmt of a.assessments) {
    lines.push(`${asmt.route}: ${asmt.basis.join(" ")}`);
  }

  lines.push("");
  lines.push("=== VERIFIED FACTS (use these exact values; nothing else is established) ===");
  for (const f of a.verifiedFacts) {
    if (f.field.startsWith("__")) continue;
    lines.push(`${f.field} = ${displayValue(f.field, f.value)}  [${f.source}]`);
  }

  lines.push("");
  lines.push("=== KEEPER / NOTICE POSITION ===");
  lines.push(`driver_status: ${a.driverStatus}`);
  lines.push(`pofa_route: ${a.pofa.route}`);
  lines.push(
    `pofa_timing: ${a.pofa.timingStatus}` +
      (a.pofa.paragraph ? ` (paragraph ${a.pofa.paragraph})` : ""),
  );
  if (a.pofa.timingStatus === "FAILED") {
    lines.push(
      `An established timing failure may be relied upon: notice treated as given ${a.pofa.noticeGivenDate}, deadline ${a.pofa.deadline}.`,
    );
  } else {
    lines.push(
      "No Schedule 4 timing failure is established. You may state that keeper liability must be established, but you must NOT allege a timing or content defect.",
    );
  }
  if (a.codeVersion) {
    lines.push(`applicable_code_version: ${a.codeVersion}`);
  }

  lines.push("");
  lines.push("=== APPROVED KNOWLEDGE MODULES ===");
  lines.push(
    "These are the ONLY legal and factual propositions you may advance. Rewrite and combine them; do not add to them.",
  );
  ctx.modules.forEach((m, i) => {
    lines.push("");
    lines.push(`[${i + 1}] Topic: ${m.topic} (${m.routeFamily})`);
    lines.push(`Proposition: ${m.coreProposition}`);
    if (m.legalBasis) lines.push(`Legal basis: ${m.legalBasis}`);
    if (m.doNotUseWhen.length > 0) {
      lines.push(`Must not be used when: ${m.doNotUseWhen.join("; ")}`);
    }
    if (m.draftingNotes) lines.push(`Drafting limits: ${m.draftingNotes}`);
  });

  if (ctx.blocks.length > 0) {
    lines.push("");
    lines.push("=== APPROVED WORDING (paraphrase, merge and reorder — do not paste verbatim in sequence) ===");
    for (const b of ctx.blocks) {
      lines.push("");
      lines.push(b.text);
    }
  }

  if (ctx.rulesBasis) {
    const rb = ctx.rulesBasis;
    lines.push("");
    lines.push("=== CANDIDATE PACK MATERIAL (assess against verified facts) ===");
    lines.push(
      "These are candidate Master Pack triggers and approved wording that MAY apply. They are not instructions to assert every ground.",
    );
    lines.push(
      "Include a ground ONLY where VERIFIED FACTS and AVAILABLE EVIDENCE support it. Omit candidates whose factual preconditions are missing or contradicted.",
    );
    lines.push(
      "Customer situation selections are circumstances for context — they do NOT force a ground into the letter.",
    );
    if (rb.activeRoutes.length > 0) {
      lines.push(`Candidate routes: ${rb.activeRoutes.join(", ")}`);
    }
    if (rb.matchedRuleDescriptions.length > 0) {
      lines.push("");
      lines.push("--- Candidate rule triggers ---");
      for (const d of rb.matchedRuleDescriptions) {
        lines.push(`• ${d}`);
      }
    }
    if (rb.approvedParagraphTexts.length > 0) {
      lines.push("");
      lines.push("--- Approved wording to paraphrase only if factually supported ---");
      rb.approvedParagraphTexts.forEach((text, i) => {
        lines.push("");
        lines.push(`[Candidate ${i + 1}]`);
        lines.push(text);
      });
    }
  }

  // Surface customer-reported circumstances separately from established grounds.
  const circumstanceFields = [
    "scenarios",
    "situation_other",
    "exit_delay_reason",
    "initial_period_reason",
    "signage_issue_basis",
  ];
  const circumstanceLines: string[] = [];
  for (const f of a.verifiedFacts) {
    if (circumstanceFields.includes(f.field)) {
      circumstanceLines.push(
        `${f.field} = ${displayValue(f.field, f.value)}`,
      );
    }
  }
  if (circumstanceLines.length > 0) {
    lines.push("");
    lines.push(
      "=== CUSTOMER-REPORTED CIRCUMSTANCES (context only — not established grounds) ===",
    );
    lines.push(
      "Use these to understand what the customer experienced. Do not treat a selected category as proof that the corresponding legal ground applies.",
    );
    for (const line of circumstanceLines) lines.push(line);
  }

  lines.push("");
  lines.push("=== AVAILABLE EVIDENCE ===");
  lines.push(
    ctx.availableEvidence.length > 0
      ? ctx.availableEvidence.join(", ")
      : "NONE — you must not say any evidence is enclosed, attached or provided.",
  );

  lines.push("");
  lines.push("=== PROHIBITED CLAIMS (do not assert any of these) ===");
  for (const c of a.prohibitedClaims) lines.push(`- ${c}`);

  if (a.missingFacts.length > 0) {
    lines.push("");
    lines.push("=== NOT ESTABLISHED (never assert these) ===");
    for (const m of a.missingFacts) lines.push(`- ${m}`);
  }

  if (ctx.feedback && ctx.feedback.trim().length > 0) {
    lines.push("");
    lines.push("=== VALIDATOR FEEDBACK ON YOUR PREVIOUS ATTEMPT ===");
    lines.push(ctx.feedback.trim());
  }

  lines.push("");
  lines.push(
    "Now write the appeal body. Plain prose paragraphs only, no salutation, no sign-off, no headings, no lists, no identifiers.",
  );

  return lines.join("\n");
}
