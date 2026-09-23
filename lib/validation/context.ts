import type { KbModule, LegalSource, ValidationIssue, ValidatorCode } from "@/lib/kb/types";
import type { IssueAnalysis } from "@/lib/analysis/types";
import type { KnownFacts } from "@/lib/facts/types";

/**
 * Independent validation pass.
 *
 * MASTER Developer Pack V2 Part 10 requires drafting and validation to
 * be SEPARATE operations. Nothing here imports the drafting layer or the
 * provider; validators receive only the finished text plus the case
 * state, so they can catch a drafter that ignored its instructions.
 */
export interface ValidatorContext {
  /** The finished draft body. */
  body: string;
  analysis: IssueAnalysis;
  /** Modules the retrieval layer authorised. */
  modules: KbModule[];
  sources: LegalSource[];
  facts: KnownFacts;
  /** Evidence types actually available on the case. */
  evidence: Set<string>;
  /** Resolved variable values. */
  variables: Record<string, string>;
  /**
   * Live admin config for each validator code, if loaded by the caller
   * (lib/validation/ruleConfig.ts). Absent means "run every validator at
   * its hard-coded severity" — the historical, still-safe behaviour.
   */
  ruleConfig?: Map<string, { status: string; severity: ValidationIssue["severity"] }>;
}

export interface Validator {
  code: ValidatorCode;
  /** What the validator checks, for the audit record. */
  description: string;
  run(ctx: ValidatorContext): ValidationIssue[];
}

/** Build an issue with a short surrounding excerpt for the audit trail. */
export function issue(
  code: ValidatorCode,
  severity: ValidationIssue["severity"],
  message: string,
  body?: string,
  match?: RegExpExecArray | null,
): ValidationIssue {
  const out: ValidationIssue = { code, severity, message };
  if (body && match) {
    const start = Math.max(0, match.index - 40);
    const end = Math.min(body.length, match.index + match[0].length + 40);
    out.excerpt = body.slice(start, end).replace(/\s+/g, " ").trim();
  }
  return out;
}

/** Find every match of a pattern, returning the match objects. */
export function findAll(body: string, pattern: RegExp): RegExpExecArray[] {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  const out: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push(m);
    if (m[0].length === 0) re.lastIndex += 1;
  }
  return out;
}
