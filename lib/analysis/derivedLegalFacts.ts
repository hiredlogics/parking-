/**
 * Derived legal facts — PoFA timing / Code version values that drafting
 * may state because they are computed from document facts by a recorded
 * rule, not invented by the model.
 */
import type { PofaAnalysis, VerifiedFact } from "@/lib/analysis/types";
import type { DerivedLegalFactRecord } from "@/lib/facts/factClasses";

/**
 * Build assertable DERIVED_LEGAL_FACT entries from an established PoFA
 * analysis. Only emits values when timing has FAILED (or content defects
 * exist) so compliant notices do not license "late" wording.
 */
export function derivedLegalFactsFromPofa(
  pofa: PofaAnalysis,
  opts?: { codeVersion?: string | null },
): { verified: VerifiedFact[]; records: DerivedLegalFactRecord[] } {
  const verified: VerifiedFact[] = [];
  const records: DerivedLegalFactRecord[] = [];

  const push = (rec: DerivedLegalFactRecord) => {
    records.push(rec);
    verified.push({
      field: rec.field,
      value: rec.value,
      source: "computed",
    });
  };

  if (pofa.paragraph) {
    push({
      field: "pofa_paragraph",
      value: pofa.paragraph,
      rule: `PoFA Schedule 4 paragraph ${pofa.paragraph}`,
      calculation: `Notice route ${pofa.route} engages paragraph ${pofa.paragraph}.`,
      inputs: { notice_route: pofa.route },
    });
  }

  if (pofa.timingStatus === "FAILED") {
    if (pofa.deadline) {
      push({
        field: "pofa_deadline",
        value: pofa.deadline,
        rule: `PoFA Schedule 4 paragraph ${pofa.paragraph ?? "?"} timing`,
        calculation:
          "Statutory deadline for giving the Notice to Keeper, counted from the parking event date under Schedule 4.",
        inputs: {
          deadline: pofa.deadline,
          paragraph: pofa.paragraph,
        },
      });
    }
    if (pofa.noticeGivenDate) {
      push({
        field: "pofa_notice_given_date",
        value: pofa.noticeGivenDate,
        rule: "PoFA Schedule 4 deemed service (2nd working day after issue for postal)",
        calculation:
          "Deemed date the notice was given, applying postal deemed-service rules to the notice issue date.",
        inputs: {
          notice_given_date: pofa.noticeGivenDate,
          notice_route: pofa.route,
        },
      });
    }
    if (pofa.daysLate != null) {
      push({
        field: "pofa_days_late",
        value: pofa.daysLate,
        rule: `PoFA Schedule 4 paragraph ${pofa.paragraph ?? "?"} timing failure`,
        calculation: `Days by which the deemed given date falls after the statutory deadline (${pofa.daysLate} day(s)).`,
        inputs: {
          days_late: pofa.daysLate,
          deadline: pofa.deadline,
          notice_given_date: pofa.noticeGivenDate,
        },
      });
    }
  }

  if (opts?.codeVersion) {
    push({
      field: "applicable_code_version",
      value: opts.codeVersion,
      rule: "Industry Code version resolution (KB-GOV-05)",
      calculation:
        "Applicable Code version resolved from the parking event date and operator ATA.",
      inputs: { code_version: opts.codeVersion },
    });
  }

  return { verified, records };
}

/**
 * Presentation variables for derived PoFA dates (ISO). Callers that
 * format for UK prose should run these through formatUkDate.
 */
export function derivedPofaVariableValues(
  pofa: PofaAnalysis,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (pofa.timingStatus !== "FAILED") return out;
  if (pofa.deadline) out.pofa_deadline = pofa.deadline;
  if (pofa.noticeGivenDate) out.pofa_notice_given_date = pofa.noticeGivenDate;
  if (pofa.daysLate != null) out.pofa_days_late = String(pofa.daysLate);
  if (pofa.paragraph) out.pofa_paragraph = pofa.paragraph;
  return out;
}
