import type { AllAnswers, ConfirmedPcn } from "@/types";
import { formatUkDate, formatUkTime } from "@/lib/format/ukDate";

/**
 * Variables inserted into approved paragraphs. Names match those used in
 * the approved paragraph texts from the Master Developer Pack.
 *
 * The pack's variable table (Part 3) plus the two variable names that
 * appear inside approved paragraphs: {{permission_source}} in PP-AUTH-003,
 * and {{alleged_term}} in PP-SIGN-012. All other placeholders are drawn
 * from the pack's Part 3 PCN data variables.
 *
 * Date/time values are formatted for UK letter prose. Canonical ISO
 * values stay on the ConfirmedPcn / analysis layer — this map is
 * presentation only.
 */
export const SUPPORTED_VARIABLES = [
  "vrm",
  "pcn_number",
  "operator_name",
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
  "case_stage",
  "permission_source",
  "alleged_term",
] as const;

export type SupportedVariable = (typeof SUPPORTED_VARIABLES)[number];

export type VariableMap = Partial<Record<SupportedVariable, string>>;

export function buildVariableMap(pcn: ConfirmedPcn, answers: AllAnswers): VariableMap {
  const strOrUndef = (v: unknown): string | undefined =>
    v == null ? undefined : String(v);
  const dateOrUndef = (v: string | null | undefined): string | undefined =>
    formatUkDate(v) ?? undefined;
  const timeOrUndef = (v: string | null | undefined): string | undefined =>
    formatUkTime(v) ?? undefined;
  return {
    vrm: pcn.vrm,
    pcn_number: pcn.pcn_number,
    operator_name: pcn.operator_name,
    parking_location: pcn.parking_location,
    parking_event_date: dateOrUndef(pcn.parking_event_date),
    notice_issue_date: dateOrUndef(pcn.notice_issue_date),
    notice_received_date: dateOrUndef(pcn.notice_received_date),
    notice_route: pcn.notice_route,
    entry_time: timeOrUndef(pcn.entry_time),
    exit_time: timeOrUndef(pcn.exit_time),
    total_recorded_duration: strOrUndef(pcn.total_recorded_duration),
    charge_amount: strOrUndef(pcn.charge_amount),
    alleged_breach: pcn.alleged_breach,
    case_stage: pcn.case_stage,
    permission_source: answers.branch.authorisation?.permission_source,
    // {{alleged_term}} — prefer the customer's own wording, fall back to
    // the operator's alleged breach on the PCN.
    alleged_term: answers.core.alleged_breach ?? pcn.alleged_breach,
  };
}

export interface VariableReplaceResult {
  text: string;
  unresolved: string[];
}

/**
 * Replace {{var}} placeholders with values from the variable map.
 *
 * Any placeholder that cannot be resolved is reported in `unresolved`.
 * The caller MUST NOT emit text with unresolved placeholders as the final
 * appeal. `/api/generate` returns HTTP 422 in that case.
 */
export function replaceVariables(text: string, vars: VariableMap): VariableReplaceResult {
  const unresolved: string[] = [];
  const out = text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, name: string) => {
    const key = name.trim() as SupportedVariable;
    if (!SUPPORTED_VARIABLES.includes(key)) {
      unresolved.push(name);
      return whole;
    }
    const value = vars[key];
    if (value == null || value === "") {
      unresolved.push(name);
      return whole;
    }
    return value;
  });
  return { text: out, unresolved: unique(unresolved) };
}

function unique<T>(a: T[]): T[] {
  return Array.from(new Set(a));
}
