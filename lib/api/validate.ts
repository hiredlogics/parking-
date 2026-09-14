/**
 * Hand-rolled request-body validation for admin API routes.
 *
 * No schema library — the project stays dependency-light and this
 * mirrors the typeof-check style already used in
 * app/api/admin/appeal-paragraphs/route.ts. Each helper returns a
 * Result rather than throwing, so a route can validate several fields
 * and report every failure, or use `required()` to bail on the first
 * one with a single try/catch.
 */

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; field: string; message: string };

export class ValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

/** Unwrap a Result, throwing ValidationError on failure. */
export function required<T>(result: ValidationResult<T>): T {
  if (!result.ok) throw new ValidationError(result.field, result.message);
  return result.value;
}

function get(body: Record<string, unknown>, field: string): unknown {
  return body[field];
}

/** A required, non-empty, trimmed string. */
export function str(
  body: Record<string, unknown>,
  field: string,
): ValidationResult<string> {
  const value = get(body, field);
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, field, message: `${field} is required.` };
  }
  return { ok: true, value: value.trim() };
}

/** An optional string. Present-but-empty is treated as null. */
export function optStr(
  body: Record<string, unknown>,
  field: string,
): ValidationResult<string | null> {
  const value = get(body, field);
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, field, message: `${field} must be a string.` };
  }
  const trimmed = value.trim();
  return { ok: true, value: trimmed.length > 0 ? trimmed : null };
}

/** An array of strings. Absent defaults to an empty array. */
export function strArray(
  body: Record<string, unknown>,
  field: string,
): ValidationResult<string[]> {
  const value = get(body, field);
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    return { ok: false, field, message: `${field} must be an array of strings.` };
  }
  return { ok: true, value: value as string[] };
}

/** A boolean, defaulting when absent. */
export function bool(
  body: Record<string, unknown>,
  field: string,
  fallback: boolean,
): ValidationResult<boolean> {
  const value = get(body, field);
  if (value === undefined) return { ok: true, value: fallback };
  if (typeof value !== "boolean") {
    return { ok: false, field, message: `${field} must be true or false.` };
  }
  return { ok: true, value };
}

/** A finite integer, defaulting when absent. Rejects NaN silently swallowed by Number(undefined). */
export function int(
  body: Record<string, unknown>,
  field: string,
  fallback: number,
): ValidationResult<number> {
  const value = get(body, field);
  if (value === undefined || value === null) return { ok: true, value: fallback };
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return { ok: false, field, message: `${field} must be an integer.` };
  }
  return { ok: true, value: num };
}

/** A string restricted to a fixed set of allowed values. */
export function enumOf<T extends string>(
  body: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
  fallback: T,
): ValidationResult<T> {
  const value = get(body, field);
  if (value === undefined || value === null) return { ok: true, value: fallback };
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    return {
      ok: false,
      field,
      message: `${field} must be one of: ${allowed.join(", ")}.`,
    };
  }
  return { ok: true, value: value as T };
}
