import type { KbModule } from "@/lib/kb/types";
import type { JudgeInput } from "./types";
import { MAX_SELECTED_MODULES } from "./types";
import { groundableFactKeys } from "./schema";

/**
 * What the judge is shown.
 *
 * The module contracts go in verbatim — `coreProposition`, `useWhen`,
 * `doNotUseWhen`, `evidenceNeeded`, `aiMustCheck`, `legalBasis`. That is
 * the knowledge graph "telling the LLM exactly what the rules are", and
 * it is the whole reason a judge can outperform the fact-gate closures:
 * the closures test a handful of fact keys, whereas DO NOT USE WHEN is
 * prose a reader can actually apply.
 *
 * Facts are shown as key = value so the judge can reason about the case,
 * but the output schema only lets it return KEYS. It reads values and
 * cites references.
 */

export const JUDGE_SYSTEM_PROMPT = [
  "You decide which legal grounds a UK private parking appeal should argue.",
  "",
  "You are given the case facts and a set of approved knowledge modules. Each module states what it is permitted to argue (CORE PROPOSITION), the facts required before it may be relied on (USE WHEN), and the facts that forbid it (DO NOT USE WHEN).",
  "",
  "Your job, in order:",
  "1. Understand what actually happened in this case.",
  "2. For each candidate module, decide whether this case's established facts satisfy its USE WHEN and violate none of its DO NOT USE WHEN.",
  "3. Give each one a confidence reflecting how strongly the established facts support it.",
  "4. Name the fact keys the ground rests on.",
  "",
  "Hard rules:",
  "- NEVER identify, infer or imply who was driving. This is a registered-keeper appeal.",
  "- You may only rely on facts you were given. If a module's USE WHEN needs a fact that is absent, it does not apply — an absent fact is not a fact in your favour.",
  "- Ground each applying module in fact keys. A ground naming a key you were not given is discarded.",
  "- Do not invent legal propositions. You choose among the modules; you do not write new ones.",
  `- Prefer few strong grounds to many weak ones. At most ${MAX_SELECTED_MODULES} will be used, and a weak secondary ground must not dilute a strong primary ground.`,
  "- A module offered as PREVIOUSLY REFUSED was excluded by a mechanical fact check that may be over-narrow. You may select it, but only on the module's own stated terms — apply USE WHEN and DO NOT USE WHEN exactly as strictly as for any other module.",
  "",
  "Return every candidate you considered, including the ones you reject, with applies set to false.",
].join("\n");

function renderModule(m: KbModule, refused: boolean): string {
  const lines: string[] = [];
  lines.push(`### ${m.moduleId}${refused ? "  [PREVIOUSLY REFUSED]" : ""}`);
  lines.push(`Topic: ${m.topic}`);
  lines.push(`Route family: ${m.routeFamily}`);
  lines.push(`CORE PROPOSITION: ${m.coreProposition}`);
  if (m.useWhen.length > 0) {
    lines.push(`USE WHEN: ${m.useWhen.join(" | ")}`);
  }
  if (m.doNotUseWhen.length > 0) {
    lines.push(`DO NOT USE WHEN: ${m.doNotUseWhen.join(" | ")}`);
  }
  if (m.aiMustCheck.length > 0) {
    lines.push(`MUST CHECK: ${m.aiMustCheck.join(" | ")}`);
  }
  if (m.evidenceNeeded.length > 0) {
    lines.push(`EVIDENCE NEEDED: ${m.evidenceNeeded.join(" | ")}`);
  }
  if (m.legalBasis) lines.push(`LEGAL BASIS: ${m.legalBasis}`);
  if (m.draftingNotes) lines.push(`NOTES: ${m.draftingNotes}`);
  return lines.join("\n");
}

export function buildJudgeUserPrompt(input: JudgeInput): string {
  const { analysis, facts } = input;
  const sections: string[] = [];

  sections.push("## THE CASE");
  sections.push(
    [
      `Driver status: ${analysis.driverStatus}`,
      `PoFA route: ${analysis.pofa.route}`,
      `PoFA timing: ${analysis.pofa.timingStatus}${
        analysis.pofa.paragraph ? ` (paragraph ${analysis.pofa.paragraph})` : ""
      }`,
      analysis.pofa.confirmedContentDefects.length > 0
        ? `PoFA content defects established: ${analysis.pofa.confirmedContentDefects.join(", ")}`
        : "PoFA content defects established: none",
      `Applicable Code version: ${analysis.codeVersion ?? "unresolved"}`,
    ].join("\n"),
  );

  sections.push("## ESTABLISHED FACTS");
  const groundable = new Set(groundableFactKeys(facts));
  const factLines: string[] = [];
  for (const k of [...facts.known].sort()) {
    if (!groundable.has(k)) continue;
    const v = facts.values[k];
    factLines.push(
      `${k} = ${Array.isArray(v) ? v.join(", ") : String(v)}  [${facts.provenance[k]}]`,
    );
  }
  for (const t of [...facts.tags].sort()) factLines.push(`${t}  [circumstance]`);
  for (const e of [...facts.evidence].sort()) {
    factLines.push(`${e}  [evidence uploaded]`);
  }
  sections.push(
    factLines.length > 0
      ? factLines.join("\n")
      : "(nothing established beyond the notice)",
  );

  if (analysis.prohibitedClaims.length > 0) {
    sections.push("## CLAIMS ALREADY FORBIDDEN ON THESE FACTS");
    sections.push(
      [
        "These have been ruled out by the safety layer. Do not select a module whose core proposition is one of them.",
        ...analysis.prohibitedClaims.map((c) => `- ${c}`),
      ].join("\n"),
    );
  }

  sections.push("## CANDIDATE MODULES");
  const refusedIds = new Set(input.overridable.map((m) => m.moduleId));
  const all = [...input.eligible, ...input.overridable];
  sections.push(
    all.length > 0
      ? all.map((m) => renderModule(m, refusedIds.has(m.moduleId))).join("\n\n")
      : "(none)",
  );

  sections.push("## YOUR TASK");
  sections.push(
    [
      "Read the case. Then judge every candidate module above.",
      `Select at most ${MAX_SELECTED_MODULES} that this case's facts genuinely support, and reject the rest.`,
      "Use only the fact keys listed under ESTABLISHED FACTS.",
    ].join("\n"),
  );

  return sections.join("\n\n");
}
