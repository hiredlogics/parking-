import type { GenerationContext } from "@/lib/questions/generated";
import { canonicalValuesFor } from "@/lib/questions/answerContract";

/**
 * Serialise the case for the question generator.
 *
 * Deliberately excludes anything that could identify a person: no
 * names, no addresses, no email. The generator needs to know WHAT is
 * established, not WHO the customer is.
 */

/** Notice fields safe to show — none identifies a person. */
const SAFE_CONFIRMED_KEYS = new Set([
  "operator_name",
  "pcn_number",
  "vrm",
  "parking_location",
  "parking_event_date",
  "notice_issue_date",
  "notice_received_date",
  "notice_route",
  "entry_time",
  "exit_time",
  "total_recorded_duration",
  "charge_amount",
  "alleged_breach",
  "operator_ata",
]);

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "unknown";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "none";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

export function serialiseQuestionContext(ctx: GenerationContext): string {
  const lines: string[] = [];

  lines.push("## CONFIRMED FROM THE NOTICE (never ask about these again)");
  const confirmed = Object.entries(ctx.confirmedFacts).filter(
    ([k, v]) =>
      SAFE_CONFIRMED_KEYS.has(k) && v !== null && v !== undefined && v !== "",
  );
  if (confirmed.length === 0) {
    lines.push("- nothing confirmed yet");
  } else {
    for (const [k, v] of confirmed) lines.push(`- ${k}: ${renderValue(v)}`);
  }

  lines.push("");
  lines.push("## ALREADY ANSWERED (never ask about these again)");
  const answered = Object.entries(ctx.answeredFacts).filter(
    ([k]) => !k.startsWith("__"),
  );
  if (answered.length === 0) {
    lines.push("- nothing answered yet");
  } else {
    for (const [k, v] of answered) lines.push(`- ${k}: ${renderValue(v)}`);
  }

  lines.push("");
  lines.push("## EVIDENCE UPLOADED");
  lines.push(
    ctx.evidenceTypes.length
      ? ctx.evidenceTypes.map((e) => `- ${e}`).join("\n")
      : "- none",
  );

  lines.push("");
  lines.push("## APPEAL ROUTES IN PLAY");
  lines.push(
    ctx.eligibleRoutes.length
      ? ctx.eligibleRoutes.map((r) => `- ${r}`).join("\n")
      : "- none identified yet",
  );

  lines.push("");
  lines.push("## OUTSTANDING MATERIAL FACTS (highest value first)");
  if (ctx.missing.length === 0) {
    lines.push("- none. Return SUFFICIENT_INFORMATION.");
  } else {
    for (const m of ctx.missing) {
      lines.push(
        `- fact: ${m.fact} | reason_code: ${m.reasonCode} | route: ${m.route}`,
      );
      lines.push(`  why it matters: ${m.rationale}`);

      /*
       * The fact's value space, where it has one.
       *
       * Without this the model invents plausible-looking option values
       * ("england", "pay_and_display_machine") that the answer-contract
       * validator then rejects. A measured run needed 13 generation
       * calls to produce 7 questions and fell back to the bank twice,
       * purely because the allowed values were never stated.
       */
      const values = canonicalValuesFor(m.fact);
      if (values) {
        lines.push(
          `  answer with single_choice or multi_choice using EXACTLY these option values: ${values
            .map((v) => `"${v}"`)
            .join(", ")} (you choose the customer-facing labels)`,
        );
      }
      /*
       * Approved knowledge, where retrieved. This is the ONLY legal
       * material the generator sees, and it exists so the model
       * understands the issue instead of inventing a requirement.
       * Deliberately carries no module or source identifiers.
       */
      for (const k of m.knowledge ?? []) {
        lines.push(`  approved position (${k.topic}): ${k.proposition}`);
        if (k.mustCheck.length > 0) {
          lines.push(`  must be established: ${k.mustCheck.join("; ")}`);
        }
        if (k.evidenceHelps.length > 0) {
          lines.push(`  supporting evidence: ${k.evidenceHelps.join("; ")}`);
        }
      }
    }
  }

  lines.push("");
  lines.push("## ALREADY ASKED (never repeat, even reworded)");
  if (ctx.askedLabels.length === 0) {
    lines.push("- nothing asked yet");
  } else {
    for (const l of ctx.askedLabels) lines.push(`- "${l}"`);
  }
  if (ctx.askedFacts.length > 0) {
    lines.push(`Facts already put to the customer: ${ctx.askedFacts.join(", ")}`);
  }

  if (ctx.feedback) {
    lines.push("");
    lines.push("## YOUR PREVIOUS ATTEMPT WAS REJECTED");
    lines.push(ctx.feedback);
    lines.push("Fix these problems. Do not repeat the same mistake.");
  }

  return lines.join("\n");
}
