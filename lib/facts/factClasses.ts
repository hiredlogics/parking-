/**
 * Fact classes for validation and drafting provenance.
 *
 * DOCUMENT_FACT     — extracted / confirmed from the notice or evidence docs
 * CUSTOMER_FACT     — genuine customer answers
 * DERIVED_LEGAL_FACT — computed from document facts by a recorded rule
 *                      (PoFA deadline, days late, Code version, …)
 *
 * VAL-FACT allows DOCUMENT, CUSTOMER, and DERIVED_LEGAL when the
 * derivation is recorded on the analysis. It still blocks invented
 * values and unsupported assertions.
 */
import type { FactSource } from "@/lib/facts/types";

export type FactClass =
  | "DOCUMENT_FACT"
  | "CUSTOMER_FACT"
  | "DERIVED_LEGAL_FACT";

export function factClassFromSource(source: FactSource): FactClass | null {
  switch (source) {
    case "notice":
    case "document":
      return "DOCUMENT_FACT";
    case "answer":
      return "CUSTOMER_FACT";
    case "computed":
      return "DERIVED_LEGAL_FACT";
    case "system_default":
    case "inferred":
      return null;
    default:
      return null;
  }
}

export interface DerivedLegalFactRecord {
  field: string;
  value: string | number;
  /** Legal rule / schedule that licenses the derivation. */
  rule: string;
  /** Human-readable calculation path for the audit trail. */
  calculation: string;
  /** ISO inputs used. */
  inputs: Record<string, string | number | null>;
}
