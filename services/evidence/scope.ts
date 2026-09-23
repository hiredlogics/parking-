import { FACT } from "@/lib/facts/facts";
import { factRegistryEntry } from "@/lib/facts/registry";

/**
 * What each evidence category is allowed to establish.
 *
 * Without this, a model reading a payment receipt could return
 * `occupier_status: "tenant"` and a model reading a photograph of a sign
 * could return `payment_made: "YES"`. The scope is not a prompt
 * instruction — it is enforced when merging, so a provider that ignores
 * it achieves nothing.
 *
 * Scopes follow what the document can physically show. A permit shows
 * whether permission existed and from whom; it says nothing about the
 * ANPR sequence. A tenancy agreement shows occupancy and what the
 * instrument says about parking; it says nothing about payment.
 */
export const EVIDENCE_FACT_SCOPE: Record<string, string[]> = {
  payment_receipt: [
    FACT.PAYMENT_MADE,
    FACT.PAYMENT_METHOD,
    FACT.PAYMENT_EVIDENCE,
    FACT.VRM_ENTERED,
  ],
  app_screenshot: [
    FACT.PAYMENT_MADE,
    FACT.PAYMENT_METHOD,
    FACT.PAYMENT_EVIDENCE,
    FACT.VRM_ENTERED,
    FACT.MACHINE_OR_APP_ISSUE,
  ],
  permit: [
    FACT.PERMISSION_HELD,
    FACT.PERMISSION_SOURCE,
    FACT.AUTHORISATION_EVIDENCE,
  ],
  authorisation_evidence: [
    FACT.OCCUPIER_STATUS,
    FACT.AGREEMENT_UPLOADED,
    FACT.AGREEMENT_PERMIT_CLAUSE,
    FACT.BAY_ALLOCATED,
    FACT.BAY_REFERENCE,
    FACT.COMMUNAL_SPACE,
    FACT.THIRD_PARTY_OPERATOR_CLAUSE,
    FACT.PARKING_RIGHT_EVIDENCE,
    FACT.PERMISSION_SOURCE,
  ],
  signage_photo: [FACT.SIGNAGE_ISSUE_BASIS],
  anpr_evidence: [
    FACT.CONTINUOUS_PRESENCE,
    FACT.VISIT_COUNT,
    FACT.TIMESTAMP_DISCREPANCY,
    FACT.VEHICLE_LEFT_SITE_EVIDENCE,
  ],
  breakdown_evidence: [
    FACT.BREAKDOWN_OCCURRED,
    FACT.BREAKDOWN_NATURE,
    FACT.BREAKDOWN_PREVENTED_DEPARTURE,
    FACT.RECOVERY_ATTENDANCE,
    FACT.REPAIR_CARRIED_OUT,
    FACT.TIME_OF_FAILURE,
    FACT.BREAKDOWN_EVIDENCE,
  ],
  location_evidence: [
    FACT.VEHICLE_LEFT_SITE_EVIDENCE,
    FACT.CONTINUOUS_PRESENCE,
  ],
  /*
   * "Other" is deliberately empty. An uncategorised upload could be
   * anything, so there is no document type to reason from and no honest
   * scope to grant. It still reaches a human reviewer.
   */
  other: [],
};

export function factsInScope(evidenceType: string): string[] {
  return EVIDENCE_FACT_SCOPE[evidenceType] ?? [];
}

/**
 * Strict JSON schema for one evidence category.
 *
 * Every property comes from the fact registry, so the enums handed to
 * the model ARE the value space the rest of the system compares against
 * — the payoff for extracting the vocabulary out of the question bank.
 * A fact with no fixed vocabulary is free-form and typed from the
 * registry's value type instead.
 */
export function schemaForEvidenceType(evidenceType: string): {
  name: string;
  schema: Record<string, unknown>;
} | null {
  const facts = factsInScope(evidenceType);
  if (facts.length === 0) return null;

  const properties: Record<string, unknown> = {};
  for (const factKey of facts) {
    const entry = factRegistryEntry(factKey);
    if (!entry) continue;
    const description = entry.guidance
      ? `${entry.label}. ${entry.guidance}`
      : entry.label;

    if (entry.allowedValues.length > 0) {
      if (entry.valueType === "MULTI_ENUM") {
        properties[factKey] = {
          type: ["array", "null"],
          items: { type: "string", enum: [...entry.allowedValues] },
          description: `${description} Return null if the document does not show this.`,
        };
      } else {
        properties[factKey] = {
          type: ["string", "null"],
          enum: [...entry.allowedValues, null],
          description: `${description} Return null if the document does not show this.`,
        };
      }
      continue;
    }

    const jsonType =
      entry.valueType === "NUMBER"
        ? "integer"
        : entry.valueType === "BOOLEAN"
          ? "boolean"
          : "string";
    properties[factKey] = {
      type: [jsonType, "null"],
      description: `${description} Return null if the document does not show this.`,
    };
  }

  const factKeys = Object.keys(properties);

  return {
    name: `evidence_${evidenceType}`,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["document_summary", "type_matches_category", "facts", "basis"],
      properties: {
        document_summary: {
          type: "string",
          description:
            "One sentence describing what this document actually is.",
        },
        type_matches_category: {
          type: "boolean",
          description: `True if this document really is a ${evidenceType.replace(/_/g, " ")}. False if it is something else.`,
        },
        facts: {
          type: "object",
          additionalProperties: false,
          required: factKeys,
          properties,
          description:
            "Only what the document itself shows. Null for anything not visibly present.",
        },
        basis: {
          type: "object",
          additionalProperties: false,
          required: factKeys,
          properties: Object.fromEntries(
            factKeys.map((k) => [
              k,
              {
                type: ["string", "null"],
                description: `What in the document supports the value given for ${k}. Null when that fact is null.`,
              },
            ]),
          ),
          description:
            "For each fact returned, the wording or feature of the document that supports it.",
        },
      },
    },
  };
}
