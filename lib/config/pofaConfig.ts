/**
 * Live admin read for PoFA's statutory day-count thresholds.
 *
 * The thresholds live on the POFA issue's `config_json` column — Admin
 * data, editable with no redeploy — while the arithmetic that applies
 * them (working-day counting, boundary tolerance, deemed-service dates)
 * stays generic code (lib/analysis/pofa.ts). Falls back to the
 * statutory defaults when there is no database or no override, so a
 * no-DB path (tests, offline dev) behaves identically to today.
 */
import { hasDb } from "@/lib/db/pool";
import { getServiceByCode, listIssues } from "@/lib/config/adminRepo";
import { DEFAULT_POFA_CONFIG, type PofaConfig } from "@/lib/analysis/pofa";

const TTL_MS = 15_000;
let cached: { value: PofaConfig; expiresAt: number } | null = null;

function fromConfigJson(configJson: Record<string, unknown>): Partial<PofaConfig> {
  const out: Partial<PofaConfig> = {};
  const p9 = configJson.paragraph9Days;
  const p8 = configJson.paragraph8Days;
  const tol = configJson.boundaryToleranceDays;
  if (typeof p9 === "number" && p9 > 0) out.paragraph9Days = p9;
  if (typeof p8 === "number" && p8 > 0) out.paragraph8Days = p8;
  if (typeof tol === "number" && tol >= 0) out.boundaryToleranceDays = tol;
  return out;
}

/** Admin-configured PoFA thresholds, cached briefly to bound DB round trips. */
export async function loadPofaConfig(): Promise<PofaConfig> {
  if (!hasDb()) return DEFAULT_POFA_CONFIG;
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const service = await getServiceByCode("PRIVATE_PARKING_INITIAL_APPEAL");
    if (!service) return DEFAULT_POFA_CONFIG;
    const issues = await listIssues(service.id);
    const pofaIssue = issues.find((i) => i.code === "POFA");
    const value: PofaConfig = {
      ...DEFAULT_POFA_CONFIG,
      ...(pofaIssue ? fromConfigJson(pofaIssue.configJson) : {}),
    };
    cached = { value, expiresAt: now + TTL_MS };
    return value;
  } catch {
    return DEFAULT_POFA_CONFIG;
  }
}

/** Test/admin-save hook — force the next read to hit the database. */
export function invalidatePofaConfigCache(): void {
  cached = null;
}
