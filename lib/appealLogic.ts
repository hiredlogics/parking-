import type { Paragraph, Rule } from "@/types";
import { RULES } from "@/rules";
import { PARAGRAPH_LIBRARY } from "@/paragraphs/library";
import { hasDb } from "@/lib/db/pool";
import {
  listParagraphOverrides,
  listRuleOverrides,
  seedParagraphIfMissing,
  seedRuleIfMissing,
} from "@/lib/db/repos";

/**
 * Merges the pack's rules (Part 6) and paragraph library (Part 8) with
 * whatever an admin has changed via the CRM (rule active/inactive,
 * paragraph title/text/active). rules/rules.ts and paragraphs/library.ts
 * remain the source of truth for anything not overridden — a fresh
 * database with no edits behaves identically to the static files.
 *
 * Rule *conditions* (the `test` predicate) are never stored in the
 * database — they stay as code. Only metadata is CRM-editable.
 */

let seeded: Promise<void> | null = null;

/** In-process caches — Rule.test cannot go through Redis JSON. */
let rulesCache: { at: number; value: Rule[] } | null = null;
let paragraphsCache: { at: number; value: Paragraph[] } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateAppealLogicCache(): void {
  rulesCache = null;
  paragraphsCache = null;
}

async function ensureAppealLogicSeeded(): Promise<void> {
  if (seeded) return seeded;
  seeded = (async () => {
    await Promise.all(
      RULES.map((r) =>
        seedRuleIfMissing({
          id: r.id,
          route: r.route ?? null,
          paragraphIds: r.paragraphIds,
          description: r.description,
        }),
      ),
    );
    await Promise.all(
      PARAGRAPH_LIBRARY.map((p) =>
        seedParagraphIfMissing({
          id: p.id,
          title: p.title,
          trigger: p.trigger,
          category: p.category,
          priority: p.priority,
          text: p.text,
        }),
      ),
    );
  })();
  try {
    await seeded;
  } catch (err) {
    seeded = null;
    throw err;
  }
}

export async function getEffectiveRules(): Promise<Rule[]> {
  if (!hasDb()) return RULES;
  if (rulesCache && Date.now() - rulesCache.at < CACHE_TTL_MS) {
    return rulesCache.value;
  }
  await ensureAppealLogicSeeded();
  const overrides = new Map((await listRuleOverrides()).map((o) => [o.id, o]));
  const value = RULES.map((r) => {
    const o = overrides.get(r.id);
    return o ? { ...r, active: o.active } : r;
  });
  rulesCache = { at: Date.now(), value };
  return value;
}

export async function getEffectiveParagraphs(): Promise<Paragraph[]> {
  if (!hasDb()) return PARAGRAPH_LIBRARY;
  if (paragraphsCache && Date.now() - paragraphsCache.at < CACHE_TTL_MS) {
    return paragraphsCache.value;
  }
  await ensureAppealLogicSeeded();
  const overrides = new Map((await listParagraphOverrides()).map((o) => [o.id, o]));
  const value = PARAGRAPH_LIBRARY.map((p) => {
    const o = overrides.get(p.id);
    return o ? { ...p, title: o.title, text: o.text, active: o.active } : p;
  });
  paragraphsCache = { at: Date.now(), value };
  return value;
}
