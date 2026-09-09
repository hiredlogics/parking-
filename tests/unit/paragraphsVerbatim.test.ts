/**
 * @vitest-environment node
 *
 * Pack fidelity guard.
 *
 * For every paragraph in the approved library, this test:
 *   1. Locates the paragraph's section in the client's Master Developer Pack
 *      text extract (checked-in fixture: tests/fixtures/pack.extract.txt),
 *   2. Extracts the pack's canonical wording,
 *   3. Normalises whitespace on both sides, and
 *   4. Asserts that the library text matches the pack text exactly.
 *
 * Any drift from the pack (a stray word, a rewritten phrase, a swapped
 * synonym) will fail this test immediately.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PARAGRAPH_LIBRARY } from "@/paragraphs/library";

const FIXTURE = path.resolve(__dirname, "../fixtures/pack.extract.txt");
const rawPackText = fs.readFileSync(FIXTURE, "utf8");

/**
 * Remove page headers ("Private Parking Appeal Automation — MASTER
 * Developer Pack | Page N") and page footers ("-- N of 17 --") so that
 * paragraphs which cross a page boundary are contiguous.
 */
const packText = rawPackText
  .split(/\n/)
  .filter((line) => !/^--\s*\d+\s+of\s+\d+\s*--\s*$/.test(line.trim()))
  .filter(
    (line) =>
      !/^Private Parking Appeal Automation — MASTER Developer Pack \| Page \d+\s*$/.test(
        line.trim(),
      ),
  )
  .join("\n");

/** Collapse all whitespace runs into a single space. */
function ws(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Extract the canonical body of a paragraph from the pack text.
 * The pack lays each paragraph out as:
 *   PP-XYZ-N — Title
 *   Trigger: ...
 *   <body text spanning multiple lines>
 * The next paragraph header is another `PP-XYZ-N` line (or the "PART 9"
 * heading). Everything between is the body.
 */
function packBodyFor(id: string): string | null {
  const idIdx = packText.indexOf(`${id} —`);
  if (idIdx < 0) return null;
  // Find the "Trigger: …" line that follows this paragraph's title.
  // A blank line may sit between the title and the trigger if the
  // paragraph spans a page boundary (the page-header / page-footer lines
  // are stripped above, but leave a blank line).
  const triggerRel = packText.substring(idIdx).search(/\nTrigger:[^\n]*\n/);
  if (triggerRel < 0) return null;
  const afterTriggerLine = packText.substring(idIdx).indexOf("\n", triggerRel + 1);
  if (afterTriggerLine < 0) return null;
  const bodyStart = idIdx + afterTriggerLine + 1;
  // Find the next paragraph header or the PART 9 boundary.
  const nextHeaderRel = packText
    .substring(bodyStart)
    .search(/\n(?:PP-[A-Z]+-[A-Z0-9]+ —|PART 9 —)/);
  const endAbs = nextHeaderRel < 0 ? packText.length : bodyStart + nextHeaderRel;
  return packText.substring(bodyStart, endAbs);
}

describe("approved paragraphs match the pack verbatim", () => {
  for (const p of PARAGRAPH_LIBRARY.filter((x) => x.active)) {
    it(`${p.id} — ${p.title}`, () => {
      const pack = packBodyFor(p.id);
      expect(pack, `paragraph ${p.id} not found in pack fixture`).not.toBeNull();
      const packNormalised = ws(pack ?? "");
      const libNormalised = ws(p.text);
      expect(libNormalised).toBe(packNormalised);
    });
  }
});
