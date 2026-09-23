/**
 * Live validator configuration.
 *
 * Until now, `validation_rules` was write-only from the codebase's point
 * of view: an admin's UPSERT_VALIDATION edit landed in Postgres but
 * lib/validation/engine.ts never read it back, so disabling or
 * downgrading a validator did nothing. This closes that gap.
 *
 * VAL-DRIVER (keeper safety) is hard-locked ACTIVE/BLOCKING here as a
 * second, defence-in-depth enforcement point — the write-side guard is
 * in lib/config/adminRepo.ts's upsertValidationRule, but a row that
 * somehow got written with a different value must still not take
 * effect at read time.
 */
import { hasDb } from "@/lib/db/pool";
import { listValidationRules } from "@/lib/config/adminRepo";
import type { ValidationSeverity, ValidatorCode } from "@/lib/kb/types";

export const IMMUTABLE_VALIDATOR_CODES: readonly ValidatorCode[] = ["VAL-DRIVER"];

export interface ValidatorRuleConfig {
  status: string;
  severity: ValidationSeverity;
}

const TTL_MS = 15_000;
let cache: { at: number; byCode: Map<string, ValidatorRuleConfig> } | null = null;
let inflight: Promise<Map<string, ValidatorRuleConfig>> | null = null;

async function loadMap(): Promise<Map<string, ValidatorRuleConfig>> {
  const rows = await listValidationRules();
  const map = new Map<string, ValidatorRuleConfig>();
  for (const row of rows) {
    if (IMMUTABLE_VALIDATOR_CODES.includes(row.code as ValidatorCode)) {
      map.set(row.code, { status: "ACTIVE", severity: "BLOCKING" });
      continue;
    }
    map.set(row.code, {
      status: row.status,
      severity: row.severity === "WARNING" ? "WARNING" : "BLOCKING",
    });
  }
  return map;
}

/** Current validator config, keyed by code. Empty map if unavailable. */
export async function loadValidatorConfig(): Promise<Map<string, ValidatorRuleConfig>> {
  if (!hasDb()) return new Map();
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.byCode;
  if (inflight) return inflight;
  inflight = loadMap()
    .then((byCode) => {
      cache = { at: Date.now(), byCode };
      return byCode;
    })
    .catch((err) => {
      console.warn("[validation/ruleConfig] could not load live validator config:", err);
      return new Map<string, ValidatorRuleConfig>();
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function invalidateValidatorConfigCache(): void {
  cache = null;
}
