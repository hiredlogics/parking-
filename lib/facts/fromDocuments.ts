import { FACT } from "./facts";
import { factRegistryEntry } from "./registry";
import type { AnswerMap, AnswerValue, FactSource } from "./types";
import { factsInScope } from "@/services/evidence/scope";
import type { DocumentFactCandidate } from "@/services/evidence/types";

/**
 * Admitting document-read facts into the answer map.
 *
 * This is the enforcement boundary for everything services/evidence/
 * returns. A provider's output is a CANDIDATE set; nothing it says is
 * self-certifying. Four checks, all structural:
 *
 *   1. SCOPE       the fact must be one the document's own category can
 *                  show. A payment receipt cannot establish occupancy.
 *   2. VOCABULARY  an enumerated fact's value must be in the registry's
 *                  value space. This is why the vocabulary was
 *                  extracted out of the question bank first.
 *   3. SHAPE       a multi-value fact must arrive as an array, a number
 *                  as a number. A string "2" is not a visit count.
 *   4. DEFERENCE   a fact the notice or the customer already
 *                  established is never overwritten.
 *
 * A candidate that fails any check is dropped and reported, never
 * repaired. Repairing an out-of-vocabulary value would be guessing what
 * the model meant, which is the fabrication this layer exists to stop.
 */

export interface AdmittedDocumentFacts {
  /** Facts admitted, ready to merge into the answer map. */
  answers: AnswerMap;
  /** Provenance for each admitted key — always "document". */
  provenance: Partial<Record<string, FactSource>>;
  /** Scenario tags the admitted facts establish. */
  tags: string[];
  /** Audit record of what was admitted and why. */
  admitted: Array<{ factKey: string; value: AnswerValue; basis: string }>;
  /** Audit record of what was refused and why. */
  rejected: Array<{ factKey: string; value: AnswerValue; reason: string }>;
}

function inVocabulary(factKey: string, value: AnswerValue): boolean {
  const entry = factRegistryEntry(factKey);
  if (!entry) return false;
  if (entry.allowedValues.length === 0) {
    // Free-form: check shape only.
    if (entry.valueType === "NUMBER") return typeof value === "number";
    if (entry.valueType === "BOOLEAN") return typeof value === "boolean";
    return typeof value === "string" && value.trim().length > 0;
  }
  const allowed = new Set(entry.allowedValues);
  if (entry.valueType === "MULTI_ENUM") {
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((v) => typeof v === "string" && allowed.has(v))
    );
  }
  return typeof value === "string" && allowed.has(value);
}

/**
 * Scenario tags established by document-read facts.
 *
 * Each rule requires the specific fact that makes the tag's own
 * proposition true, because a tag both opens module gates and lifts a
 * prohibition (see lib/facts/fromEvidence.ts). Reading the document is
 * what makes these derivations available at all: an unread permit upload
 * cannot support `authorised_or_permit`, but a permit the provider has
 * read and reported as covering the site can.
 */
function tagsFromFacts(values: AnswerMap): string[] {
  const out = new Set<string>();
  const str = (k: string) =>
    typeof values[k] === "string" ? (values[k] as string) : null;

  if (str(FACT.PAYMENT_MADE) === "YES") out.add("payment_made");
  if (str(FACT.PAYMENT_MADE) === "ATTEMPTED_FAILED") {
    out.add("payment_attempted_failed");
  }
  if (str(FACT.PERMISSION_HELD) === "YES") out.add("authorised_or_permit");
  if (
    ["tenant", "leaseholder", "owner_occupier"].includes(
      str(FACT.OCCUPIER_STATUS) ?? "",
    )
  ) {
    out.add("resident_parking_rights");
  }
  if (str(FACT.BREAKDOWN_PREVENTED_DEPARTURE) === "YES") {
    out.add("breakdown_immobilised");
  }
  if (str(FACT.TIMESTAMP_DISCREPANCY) === "YES") out.add("anpr_disputed");
  if (typeof values[FACT.VISIT_COUNT] === "number" &&
    (values[FACT.VISIT_COUNT] as number) > 1) {
    out.add("multiple_visits_same_day");
  }
  const basis = values[FACT.SIGNAGE_ISSUE_BASIS];
  if (Array.isArray(basis) && basis.length > 0) out.add("signage_issue");

  return [...out].sort();
}

/**
 * Admit what a set of read documents established.
 *
 * `alreadyEstablished` is the fact set as it stands from the notice and
 * the customer's own answers. Anything present there wins.
 */
export function admitDocumentFacts(input: {
  candidates: Array<{ evidenceType: string; facts: DocumentFactCandidate[] }>;
  alreadyEstablished: AnswerMap;
}): AdmittedDocumentFacts {
  const answers: AnswerMap = {};
  const provenance: Partial<Record<string, FactSource>> = {};
  const admitted: AdmittedDocumentFacts["admitted"] = [];
  const rejected: AdmittedDocumentFacts["rejected"] = [];

  for (const doc of input.candidates) {
    const scope = new Set(factsInScope(doc.evidenceType));
    for (const c of doc.facts) {
      if (c.value === null || c.value === undefined) continue;

      if (!scope.has(c.factKey)) {
        rejected.push({
          factKey: c.factKey,
          value: c.value,
          reason: `A ${doc.evidenceType} cannot establish "${c.factKey}".`,
        });
        continue;
      }
      if (!inVocabulary(c.factKey, c.value)) {
        rejected.push({
          factKey: c.factKey,
          value: c.value,
          reason: `Value is outside the registered vocabulary for "${c.factKey}".`,
        });
        continue;
      }
      const existing = input.alreadyEstablished[c.factKey];
      if (existing !== undefined && existing !== null && existing !== "") {
        rejected.push({
          factKey: c.factKey,
          value: c.value,
          reason: `Already established as "${String(existing)}" by the notice or the customer.`,
        });
        continue;
      }
      // Two documents disagreeing: the first admitted value stands and
      // the conflict is recorded, rather than the later file winning by
      // upload order.
      if (answers[c.factKey] !== undefined && answers[c.factKey] !== c.value) {
        rejected.push({
          factKey: c.factKey,
          value: c.value,
          reason: `Another document already established "${String(answers[c.factKey])}".`,
        });
        continue;
      }

      answers[c.factKey] = c.value;
      provenance[c.factKey] = "document";
      admitted.push({ factKey: c.factKey, value: c.value, basis: c.basis });
    }
  }

  return {
    answers,
    provenance,
    tags: tagsFromFacts(answers),
    admitted,
    rejected,
  };
}
