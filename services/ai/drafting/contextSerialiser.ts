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

function factDisplay(
  facts: Array<{ field: string; value: unknown }>,
  field: string,
): string | null {
  const hit = facts.find((f) => f.field === field);
  if (!hit || hit.value == null || hit.value === "") return null;
  return displayValue(field, hit.value);
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

  /*
   * The issues the engine identified, ahead of the route families.
   *
   * Routes are a drafting taxonomy; issues are what the admin
   * configuration decided this case raises. Naming them explicitly
   * stops the model inferring the grounds from the module list, which
   * is a guess it should never have been asked to make.
   */
  if (ctx.activeIssues && ctx.activeIssues.length > 0) {
    lines.push("");
    lines.push("=== IDENTIFIED ISSUES (decided by the rules engine) ===");
    lines.push(ctx.activeIssues.join(", "));
    const substantive = ctx.substantiveIssues ?? [];
    lines.push(
      substantive.length > 0
        ? `Argue these grounds: ${substantive.join(", ")}. POFA and TRIAGE_SCOPE are procedural context, not the argument.`
        : "No conduct issue was identified; the argument rests on the established keeper-liability defect below.",
    );
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

  const parkingEvent =
    factDisplay(a.verifiedFacts, "parking_event_date") ??
    (ctx.variables.parking_event_date
      ? formatUkDate(ctx.variables.parking_event_date) ??
        ctx.variables.parking_event_date
      : null);
  const noticeIssue =
    factDisplay(a.verifiedFacts, "notice_issue_date") ??
    (ctx.variables.notice_issue_date
      ? formatUkDate(ctx.variables.notice_issue_date) ??
        ctx.variables.notice_issue_date
      : null);
  const noticeRoute =
    factDisplay(a.verifiedFacts, "notice_route") ??
    ctx.variables.notice_route ??
    null;

  if (parkingEvent) lines.push(`parking_event_date: ${parkingEvent}`);
  if (noticeIssue) lines.push(`notice_issue_date: ${noticeIssue}`);
  if (noticeRoute) lines.push(`notice_route: ${noticeRoute}`);

  if (a.pofa.timingStatus === "FAILED") {
    const given =
      formatUkDate(a.pofa.noticeGivenDate) ?? a.pofa.noticeGivenDate;
    const deadline = formatUkDate(a.pofa.deadline) ?? a.pofa.deadline;
    lines.push(
      `TIMING FAILURE ESTABLISHED — you MUST substantiate it in the letter using these exact values (do not merely assert that a timing failure exists):`,
    );
    if (a.pofa.paragraph) {
      lines.push(
        `Schedule 4 paragraph engaged: ${a.pofa.paragraph} (${
          a.pofa.paragraph === "9"
            ? "postal Notice to Keeper — 14-day period from the parking event"
            : "Notice to Keeper following a Notice to Driver — 28-day period"
        }).`,
      );
    }
    if (parkingEvent) {
      lines.push(`Parking event date (from the notice): ${parkingEvent}.`);
    }
    if (noticeIssue) {
      lines.push(`Notice issue / printed date (from the notice): ${noticeIssue}.`);
    }
    if (given) {
      lines.push(
        `Date the notice is treated as given (deemed delivery applied): ${given}.`,
      );
    }
    if (deadline) {
      lines.push(`Statutory deadline for giving the notice: ${deadline}.`);
    }
    if (typeof a.pofa.daysLate === "number") {
      lines.push(
        `Days after the deadline the notice is treated as given: ${a.pofa.daysLate}.`,
      );
    }
    for (const r of a.pofa.reasons) {
      lines.push(`Analysis note: ${r}`);
    }
    lines.push(
      "In the letter: set out the parking event date and the notice dates, explain the sequence and why the timing requirement was not met, then conclude that keeper liability under Schedule 4 is not established. Do not write only that a timing failure 'has already been established'.",
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
  lines.push("=== SUBSTANTIATION REQUIREMENT ===");
  lines.push(
    "For each ground you include: (1) name the ground, (2) cite the exact VERIFIED FACTS that support it, (3) explain how those facts engage the approved rule/proposition, (4) state the consequence. Generic assertions without this case's dates, amounts or other values are not acceptable.",
  );

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

  if (ctx.ragRules && ctx.ragRules.texts.length > 0) {
    lines.push("");
    lines.push("=== RETRIEVED RULES (RAG — separate vector store) ===");
    lines.push(
      "These rule excerpts were retrieved from the approved rules vector store for this case. Use them only where they fit the verified facts. Do not invent further legal propositions.",
    );
    ctx.ragRules.texts.forEach((t, i) => {
      lines.push("");
      lines.push(`[R${i + 1}] ${t}`);
    });
  }

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
  lines.push(
    "End-of-parking grace applies only to a short exit delay after a permitted period. Do not argue grace for a long continuous recorded stay (e.g. multi-hour) unless a short quantified overstay is established in VERIFIED FACTS.",
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

  const intel = ctx.intelligence;
  if (intel) {
    if (intel.sender && intel.operator && intel.sender !== intel.operator) {
      lines.push("");
      lines.push("=== DOCUMENT ORIGIN ===");
      lines.push(`This document was sent by ${intel.sender}.`);
      lines.push(`The parking operator is ${intel.operator}.`);
      lines.push(
        "Address the appeal to the parking operator, never to the sender.",
      );
    }
    if (intel.technicalFindings.length > 0) {
      lines.push("");
      lines.push(
        "=== TECHNICAL GROUNDS ALREADY ESTABLISHED FROM THE DOCUMENT ===",
      );
      lines.push(
        "These were derived from the notice itself, not from the customer. Lead with them.",
      );
      for (const f of intel.technicalFindings) {
        lines.push(`- ${f.ground} (${f.confidence})`);
        for (const r of f.reasons) lines.push(`    ${formatIsoDatesInProse(r)}`);
      }
    }
  }

  const aa = ctx.appealAnalysis;
  if (aa) {
    lines.push("");
    lines.push("=== APPEAL ANALYSIS (sole drafting authority — do not invent grounds) ===");
    lines.push(`Primary ground: ${aa.primary_ground ?? "none"}`);
    if (aa.secondary_grounds.length > 0) {
      lines.push(`Secondary grounds: ${aa.secondary_grounds.join(", ")}`);
    }
    lines.push(`Code version: ${aa.code_version ?? "unresolved"}`);
    if (aa.pofa) {
      lines.push(
        `PoFA: paragraph ${aa.pofa.paragraph ?? "?"} status=${aa.pofa.timingStatus} deadline=${aa.pofa.deadline ?? "n/a"} given=${aa.pofa.noticeGivenDate ?? "n/a"} daysLate=${aa.pofa.daysLate ?? "n/a"}`,
      );
      for (const r of aa.pofa.reasons) {
        lines.push(`  - ${formatIsoDatesInProse(r)}`);
      }
      if (aa.pofa.timingStatus === "FAILED") {
        lines.push(
          "REQUIRED: When arguing PoFA timing, you MUST state the parking event date, the notice issue date, the statutory deadline, the deemed given date, and that the notice was late by the recorded number of days. Do not write a bare 'timing failure' conclusion without those dates.",
        );
      }
    }
    lines.push("Supporting facts (use these concrete values; do not invent others):");
    for (const [k, v] of Object.entries(aa.supporting_facts)) {
      if (v === null || v === undefined || v === "") continue;
      lines.push(`  - ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    }
    if (aa.knowledge_modules.length > 0) {
      lines.push(
        `Approved modules: ${aa.knowledge_modules.map((m) => m.moduleId).join(", ")}`,
      );
    }
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

/**
 * Rewrite bare ISO dates inside free-text reasons so the model is never
 * handed "2026-09-01" next to "9 July 2026". Presentation only.
 */
function formatIsoDatesInProse(text: string): string {
  return text.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (iso) => formatUkDate(iso) ?? iso);
}
