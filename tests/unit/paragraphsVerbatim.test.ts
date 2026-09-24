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

/**
 * Paragraphs deliberately amended from the client's pack.
 *
 * READ THIS BEFORE ADDING AN ENTRY. The pack is the client's approved
 * legal wording, and the default answer to "the letter should say X" is
 * to ask them, not to edit it here. An entry in this map is a standing
 * request for sign-off on a pack amendment, not permission to rewrite.
 *
 * The client's own document extract (tests/fixtures/pack.extract.txt) is
 * never edited to match an amendment. Doing that would make this whole
 * suite report fidelity it is no longer checking, which is worse than
 * having no check: the divergence would exist and nothing would say so.
 * So amended paragraphs are held to a different, explicit assertion
 * below instead of being quietly excluded.
 *
 * `mustContain` keeps a real check on the amendment: the substance the
 * pack paragraph carried has to survive it.
 */
const AMENDED: Record<
  string,
  { reason: string; mustContain: string[] }
> = {
  "PP-POFA-003": {
    reason:
      "Client instruction: an established timing failure must state the " +
      "event and notice dates it is calculated from, and say why the " +
      "statutory period matters, rather than asserting the conclusion. " +
      "Pack amendment — awaiting sign-off.",
    mustContain: [
      "{{parking_event_date}}",
      "{{notice_issue_date}}",
      "Schedule 4 of the Protection of Freedoms Act 2012",
      "no Notice to Driver was issued",
    ],
  },
  "PP-POFA-004": {
    reason:
      "Same instruction as PP-POFA-003, applied to the windscreen route " +
      "so the two timing grounds behave alike. Pack amendment — awaiting " +
      "sign-off.",
    mustContain: [
      "{{parking_event_date}}",
      "{{notice_issue_date}}",
      "Schedule 4 of the Protection of Freedoms Act 2012",
      "Notice to Driver was issued",
    ],
  },
};

describe("approved paragraphs match the pack verbatim", () => {
  for (const p of PARAGRAPH_LIBRARY.filter((x) => x.active)) {
    const amendment = AMENDED[p.id];
    if (amendment) {
      it(`${p.id} — ${p.title} (amended: ${amendment.reason.slice(0, 40)}…)`, () => {
        const pack = packBodyFor(p.id);
        expect(
          pack,
          `paragraph ${p.id} not found in pack fixture`,
        ).not.toBeNull();

        // The amendment must still be an amendment. If the pack is ever
        // updated to match, this entry is stale and should be deleted
        // rather than left to rot as a permanent exemption.
        expect(
          ws(p.text),
          `${p.id} now matches the pack — remove it from AMENDED`,
        ).not.toBe(ws(pack ?? ""));

        for (const fragment of amendment.mustContain) {
          expect(
            p.text,
            `${p.id} amendment dropped required substance: ${fragment}`,
          ).toContain(fragment);
        }
      });
      continue;
    }

    it(`${p.id} — ${p.title}`, () => {
      const pack = packBodyFor(p.id);
      expect(pack, `paragraph ${p.id} not found in pack fixture`).not.toBeNull();
      const packNormalised = ws(pack ?? "");
      const libNormalised = ws(p.text);
      expect(libNormalised).toBe(packNormalised);
    });
  }
});
