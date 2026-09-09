import type { ValidationIssue, ValidationResult, ValidatorCode } from "@/lib/kb/types";
import { ALL_VALIDATOR_CODES } from "@/lib/kb/types";
import { VALIDATORS } from "./validators";
import type { ValidatorContext } from "./context";

export const VALIDATOR_VERSION = "validator-v1";

/**
 * Independent validation pass (V2 Part 10, KB §17).
 *
 * Runs every validator over the finished draft. A single BLOCKING issue
 * fails the run, and a failed run must never be released — that decision
 * is enforced by the generation orchestrator, not left to the caller.
 */
export interface ValidationRun extends ValidationResult {
  /** Issues grouped by validator, including validators that passed. */
  byValidator: Record<ValidatorCode, ValidationIssue[]>;
  blockingCount: number;
  warningCount: number;
  /** Validators that produced no issues. */
  passed: ValidatorCode[];
}

export function validateDraft(ctx: ValidatorContext): ValidationRun {
  const byValidator = Object.fromEntries(
    ALL_VALIDATOR_CODES.map((c) => [c, [] as ValidationIssue[]]),
  ) as Record<ValidatorCode, ValidationIssue[]>;

  const issues: ValidationIssue[] = [];

  for (const validator of VALIDATORS) {
    let found: ValidationIssue[];
    try {
      found = validator.run(ctx);
    } catch (err) {
      // A validator that throws must fail closed, never silently pass.
      found = [
        {
          code: validator.code,
          severity: "BLOCKING",
          message: `Validator ${validator.code} failed to run: ${
            err instanceof Error ? err.message : "unknown error"
          }. Failing closed.`,
        },
      ];
    }
    byValidator[validator.code] = found;
    issues.push(...found);
  }

  const blockingCount = issues.filter((i) => i.severity === "BLOCKING").length;
  const warningCount = issues.filter((i) => i.severity === "WARNING").length;
  const passed = ALL_VALIDATOR_CODES.filter(
    (c) => byValidator[c].length === 0,
  );

  return {
    status: blockingCount > 0 ? "FAIL" : "PASS",
    issues,
    validatorVersion: VALIDATOR_VERSION,
    byValidator,
    blockingCount,
    warningCount,
    passed,
  };
}

/** Compact summary suitable for feeding back to a drafting model. */
export function summariseForRegeneration(run: ValidationRun): string {
  const blocking = run.issues.filter((i) => i.severity === "BLOCKING");
  if (blocking.length === 0) return "";
  const lines = [
    "Your previous draft was REJECTED by the independent validator. Fix every point below and rewrite the whole letter.",
    "",
  ];
  for (const i of blocking) {
    lines.push(`- [${i.code}] ${i.message}`);
    if (i.excerpt) lines.push(`  Offending text: "${i.excerpt}"`);
  }
  return lines.join("\n");
}
