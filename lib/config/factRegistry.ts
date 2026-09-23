/**
 * Live read of the fact vocabulary.
 *
 * Admin rows in `case_facts_registry` take precedence; lib/facts/registry.ts
 * is the floor when there is no database or the fact has no row. Cached
 * briefly to bound DB round trips, the same way lib/config/pofaConfig.ts
 * reads PoFA thresholds.
 *
 * A row may only ever WIDEN a vocabulary, never narrow one. Narrowing at
 * runtime would retroactively invalidate values already stored on live
 * cases — a case whose `occupier_status` is "leaseholder" would silently
 * stop matching its own module gates the moment an admin trimmed the
 * list. Widening cannot break a stored value, so it is safe to honour.
 */
import { hasDb } from "@/lib/db/pool";
import { listFactRegistry } from "@/lib/config/factRegistryRepo";
import {
  FACT_REGISTRY,
  factRegistryValues,
  type FactRegistryEntry,
} from "@/lib/facts/registry";

const TTL_MS = 15_000;
let cached: { value: Map<string, FactRegistryEntry>; expiresAt: number } | null =
  null;

function codeFloor(): Map<string, FactRegistryEntry> {
  return new Map(FACT_REGISTRY.map((e) => [e.factKey, e]));
}

/** The effective vocabulary: code floor merged with any admin widening. */
export async function loadFactRegistry(): Promise<
  Map<string, FactRegistryEntry>
> {
  if (!hasDb()) return codeFloor();
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  const merged = codeFloor();
  try {
    for (const row of await listFactRegistry()) {
      const floor = merged.get(row.factKey);
      if (!floor) {
        merged.set(row.factKey, row);
        continue;
      }
      const union = new Set([...floor.allowedValues, ...row.allowedValues]);
      merged.set(row.factKey, {
        ...floor,
        label: row.label || floor.label,
        guidance: row.guidance ?? floor.guidance,
        allowedValues: [...union].sort(),
      });
    }
    cached = { value: merged, expiresAt: now + TTL_MS };
    return merged;
  } catch {
    return codeFloor();
  }
}

/**
 * The values this fact accepts, or null when it is free-form.
 *
 * Use this wherever a fact value needs validating or a model needs
 * constraining to the real value space.
 */
export async function allowedValuesForFact(
  factKey: string,
): Promise<string[] | null> {
  const registry = await loadFactRegistry();
  const entry = registry.get(factKey);
  if (!entry) return factRegistryValues(factKey);
  return entry.allowedValues.length > 0 ? [...entry.allowedValues] : null;
}

/** Test/admin-save hook — force the next read to hit the database. */
export function invalidateFactRegistryCache(): void {
  cached = null;
}
