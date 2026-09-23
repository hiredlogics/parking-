import type { KnownFacts } from "@/lib/facts/types";
import { ASSERTABLE_PROVENANCE } from "@/lib/facts/types";

/**
 * The judge's output schema, generated per case.
 *
 * Two of its enums are the point. `module_id` is restricted to the
 * candidate modules for THIS case, and `grounding_fact_keys` to the
 * facts actually established on it with assertable provenance. So the
 * two failure modes that matter — inventing a module, and grounding a
 * ground in a fact nobody established — are refused by the decoder
 * before the response is even returned.
 *
 * lib/judge/select.ts re-checks both regardless. The schema makes the
 * mistake hard; the selector makes it impossible. A provider that
 * ignores the schema, or a future provider on an API without strict
 * decoding, must not be able to weaken the guarantee.
 */

export interface JudgeSchemaSpec {
  name: string;
  schema: Record<string, unknown>;
  /** Fact keys offered to the model, for the audit record. */
  groundingKeys: string[];
}

/** Facts a ground may legitimately rest on, as keys. */
export function groundableFactKeys(facts: KnownFacts): string[] {
  const keys = new Set<string>();
  for (const k of facts.known) {
    const p = facts.provenance[k];
    if (p && ASSERTABLE_PROVENANCE.has(p)) keys.add(k);
  }
  // Circumstance tags and evidence categories establish grounds in their
  // own right, and carry the provenance of whatever set them.
  for (const t of facts.tags) keys.add(t);
  for (const e of facts.evidence) keys.add(e);
  return [...keys].sort();
}

export function judgeSchema(input: {
  candidateModuleIds: string[];
  facts: KnownFacts;
}): JudgeSchemaSpec {
  const moduleIds = [...new Set(input.candidateModuleIds)].sort();
  const groundingKeys = groundableFactKeys(input.facts);

  return {
    name: "grounds_judgement",
    groundingKeys,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["case_understanding", "grounds"],
      properties: {
        case_understanding: {
          type: "string",
          description:
            "Your reading of what actually happened in this case, in two or three sentences, before you decide anything. Neutral wording: never name or imply the driver.",
        },
        grounds: {
          type: "array",
          description:
            "One entry for each candidate module you considered, including those you reject.",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "module_id",
              "applies",
              "confidence",
              "grounding_fact_keys",
              "reasoning",
            ],
            properties: {
              module_id:
                moduleIds.length > 0
                  ? { type: "string", enum: moduleIds }
                  : { type: "string" },
              applies: {
                type: "boolean",
                description:
                  "True only if this case's established facts satisfy the module's USE WHEN and none of its DO NOT USE WHEN.",
              },
              confidence: {
                type: "number",
                description:
                  "0 to 1. How strongly the established facts support arguing this ground. Not how likely the appeal is to succeed.",
              },
              grounding_fact_keys: {
                type: "array",
                description:
                  "The fact keys this ground rests on. Keys only, never values. Every key must be one you were given; a ground naming any other key is discarded.",
                items:
                  groundingKeys.length > 0
                    ? { type: "string", enum: groundingKeys }
                    : { type: "string" },
              },
              reasoning: {
                type: "string",
                description:
                  "Why, in one or two sentences, referring to the facts by name. Internal only.",
              },
            },
          },
        },
      },
    },
  };
}
