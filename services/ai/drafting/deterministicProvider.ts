import type { DraftResult, DraftingContext, DraftingProvider } from "../types";

/**
 * Deterministic drafting fallback.
 *
 * Assembles the approved blocks that the retrieval layer authorised, in
 * drafting-priority order, with variable substitution already applied.
 *
 * IMPORTANT HONESTY NOTE: this provider is legally safe but it is NOT
 * bespoke. It reports `bespoke: false`, and the engine surfaces that so
 * the V2 acceptance criterion ("generated appeals are bespoke and
 * coherent rather than visibly stitched paragraphs") is not silently
 * claimed as met. It exists so the flow keeps working with no API key
 * configured, and as a safe fallback if the model call fails.
 */
export class DeterministicDraftingProvider implements DraftingProvider {
  readonly id = "deterministic-draft";
  readonly displayName = "Deterministic assembly (fallback)";
  readonly bespoke = false;

  async draft(context: DraftingContext): Promise<DraftResult> {
    const warnings: string[] = [
      "Draft produced by deterministic assembly, not bespoke AI drafting. Paragraphs are approved wording in priority order.",
    ];

    // Rank blocks by the route order the analysis already established.
    const routeRank = new Map<string, number>();
    context.analysis.assessments.forEach((a, i) => routeRank.set(a.route, i));

    const rankOf = (routeFamily: string): number => {
      if (routeFamily === "INTRO") return -100;
      if (routeFamily === "CLOSING") return 1000;
      return routeRank.get(routeFamily) ?? 500;
    };

    const ordered = [...context.blocks].sort((a, b) => {
      const ra = rankOf(a.routeFamily);
      const rb = rankOf(b.routeFamily);
      return ra - rb || a.blockId.localeCompare(b.blockId);
    });

    const seen = new Set<string>();
    const paragraphs: string[] = [];
    for (const b of ordered) {
      if (seen.has(b.blockId)) continue;
      seen.add(b.blockId);
      const text = substitute(b.text, context.variables);
      // Drop any block whose variables could not be resolved rather than
      // emitting a placeholder into a customer document.
      if (/\{\{[a-z_]+\}\}/i.test(text)) {
        warnings.push(
          `Omitted a block because a required detail was unavailable: ${b.title}.`,
        );
        continue;
      }
      paragraphs.push(text);
    }

    if (paragraphs.length === 0) {
      throw new Error(
        "No approved wording was available to assemble a draft.",
      );
    }

    return {
      body: paragraphs.join("\n\n"),
      providerId: this.id,
      promptVersion: "none",
      model: null,
      bespoke: false,
      moduleIds: context.modules.map((m) => m.moduleId),
      warnings,
    };
  }
}

function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([a-z_]+)\}\}/gi, (whole, key: string) => {
    const v = vars[key];
    return v && v.trim().length > 0 ? v : whole;
  });
}
