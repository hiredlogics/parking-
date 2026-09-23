/**
 * @vitest-environment node
 *
 * The fact vocabulary must survive the question engine.
 *
 * `lib/questions/bank.ts` is currently the only statement of what values
 * a fact accepts, via `answerContract.canonicalValuesFor`. Deleting it
 * would strand every consumer that validates a fact value, so the
 * vocabulary was extracted into `lib/facts/registry.ts`. These tests are
 * the proof that the extraction is faithful — they will keep passing
 * once the bank is gone, and they fail loudly if the two drift apart
 * while both still exist.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FACT, SCENARIO_TAGS } from "@/lib/facts/facts";
import {
  canonicalValuesFor,
  hasFixedVocabulary,
} from "@/lib/questions/answerContract";
import {
  FACT_REGISTRY,
  factRegistryEntry,
  factRegistryValues,
} from "@/lib/facts/registry";

/*
 * `scenarios` is a deliberate widening: the registry carries all of
 * SCENARIO_TAGS, while the bank offered only 8 of them as options. See
 * the header of lib/facts/registry.ts.
 */
const DELIBERATE_WIDENINGS = new Set<string>([FACT.SCENARIOS]);

describe("fact registry: faithful extraction from the question bank", () => {
  it("covers every fact key in the FACT registry", () => {
    const registered = new Set(FACT_REGISTRY.map((e) => e.factKey));
    const missing = Object.values(FACT).filter((k) => !registered.has(k));
    expect(missing).toEqual([]);
  });

  it("carries no fact key that is not in the FACT registry", () => {
    const known = new Set<string>(Object.values(FACT));
    const strays = FACT_REGISTRY.filter((e) => !known.has(e.factKey));
    expect(strays.map((e) => e.factKey)).toEqual([]);
  });

  it("reproduces the bank's vocabulary exactly for every enumerated fact", () => {
    for (const fact of Object.values(FACT)) {
      if (DELIBERATE_WIDENINGS.has(fact)) continue;
      const bank = canonicalValuesFor(fact);
      const registry = factRegistryValues(fact);
      expect(registry, `vocabulary for "${fact}"`).toEqual(bank);
    }
  });

  it("widens only `scenarios`, and widens it to the full tag vocabulary", () => {
    const registry = factRegistryValues(FACT.SCENARIOS) ?? [];
    expect(registry).toEqual([...SCENARIO_TAGS].sort());
    // The widening is real, not cosmetic: the bank offered strictly fewer.
    const bank = canonicalValuesFor(FACT.SCENARIOS) ?? [];
    expect(bank.length).toBeLessThan(registry.length);
    for (const v of bank) expect(registry).toContain(v);
  });

  it("agrees with the bank on which facts are enumerated at all", () => {
    for (const fact of Object.values(FACT)) {
      if (DELIBERATE_WIDENINGS.has(fact)) continue;
      const enumerated = (factRegistryValues(fact) ?? []).length > 0;
      expect(enumerated, `"${fact}" enumerated?`).toBe(hasFixedVocabulary(fact));
    }
  });

  it("gives an enumerated fact an enum value type and a free-form fact a non-enum one", () => {
    for (const entry of FACT_REGISTRY) {
      const enumerated = entry.allowedValues.length > 0;
      const isEnumType =
        entry.valueType === "ENUM" || entry.valueType === "MULTI_ENUM";
      expect(isEnumType, `${entry.factKey} (${entry.valueType})`).toBe(
        enumerated,
      );
    }
  });

  it("never exposes the mutable array behind the registry", () => {
    const first = factRegistryValues(FACT.JURISDICTION)!;
    first.push("MADE_UP");
    expect(factRegistryValues(FACT.JURISDICTION)).not.toContain("MADE_UP");
  });

  it("labels and guidance are data, not question wording", () => {
    for (const entry of FACT_REGISTRY) {
      expect(entry.label, entry.factKey).not.toMatch(/\?$/);
      // Guidance explains why a fact is material; it must never be the
      // question itself, or deleting the bank would smuggle the
      // questionnaire back in through config.
      if (entry.guidance) {
        expect(entry.guidance, entry.factKey).not.toMatch(/\?\s*$/);
      }
    }
  });
});

describe("fact registry: live read degrades without a database", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns the code floor when there is no database", async () => {
    vi.doMock("@/lib/db/pool", () => ({
      hasDb: () => false,
      getSql: () => {
        throw new Error("must not be called without a database");
      },
    }));
    const { loadFactRegistry, allowedValuesForFact } = await import(
      "@/lib/config/factRegistry"
    );
    const registry = await loadFactRegistry();
    expect(registry.size).toBe(FACT_REGISTRY.length);
    expect(await allowedValuesForFact(FACT.JURISDICTION)).toEqual(
      factRegistryValues(FACT.JURISDICTION),
    );
    expect(await allowedValuesForFact(FACT.VRM)).toBeNull();
  });

  it("falls back to the code floor when the database read throws", async () => {
    vi.doMock("@/lib/db/pool", () => ({ hasDb: () => true, getSql: () => ({}) }));
    vi.doMock("@/lib/config/factRegistryRepo", () => ({
      listFactRegistry: async () => {
        throw new Error("connection refused");
      },
    }));
    const { loadFactRegistry } = await import("@/lib/config/factRegistry");
    const registry = await loadFactRegistry();
    expect(registry.size).toBe(FACT_REGISTRY.length);
    expect(registry.get(FACT.OCCUPIER_STATUS)?.allowedValues).toEqual(
      factRegistryEntry(FACT.OCCUPIER_STATUS)?.allowedValues,
    );
  });

  it("honours an admin row that widens a vocabulary", async () => {
    vi.doMock("@/lib/db/pool", () => ({ hasDb: () => true, getSql: () => ({}) }));
    vi.doMock("@/lib/config/factRegistryRepo", () => ({
      listFactRegistry: async () => [
        {
          factKey: FACT.OCCUPIER_STATUS,
          label: "Occupier status",
          valueType: "ENUM",
          allowedValues: ["shared_owner"],
          guidance: null,
          source: "ANSWER",
          evidenceTypes: [],
          driverIdentifying: false,
          status: "ACTIVE",
        },
      ],
    }));
    const { allowedValuesForFact } = await import("@/lib/config/factRegistry");
    const values = (await allowedValuesForFact(FACT.OCCUPIER_STATUS)) ?? [];
    expect(values).toContain("shared_owner");
    // and keeps every code-floor value
    for (const v of factRegistryValues(FACT.OCCUPIER_STATUS) ?? []) {
      expect(values).toContain(v);
    }
  });

  it("cannot narrow a vocabulary, because a stored case value would stop matching its gates", async () => {
    vi.doMock("@/lib/db/pool", () => ({ hasDb: () => true, getSql: () => ({}) }));
    vi.doMock("@/lib/config/factRegistryRepo", () => ({
      listFactRegistry: async () => [
        {
          factKey: FACT.OCCUPIER_STATUS,
          label: "Occupier status",
          valueType: "ENUM",
          allowedValues: ["tenant"], // an admin trimming the list
          guidance: null,
          source: "ANSWER",
          evidenceTypes: [],
          driverIdentifying: false,
          status: "ACTIVE",
        },
      ],
    }));
    const { allowedValuesForFact } = await import("@/lib/config/factRegistry");
    const values = (await allowedValuesForFact(FACT.OCCUPIER_STATUS)) ?? [];
    expect(values).toContain("leaseholder");
    expect(values).toContain("tenant");
  });
});
