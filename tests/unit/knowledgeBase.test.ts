import { describe, expect, it } from "vitest";
import { ALL_KB_MODULES } from "@/lib/kb/seed";
import { LEGAL_SOURCES } from "@/lib/kb/seed/sources";
import { CODE_VERSIONS, resolveCodeVersion } from "@/lib/kb/seed/codeVersions";
import {
  NEW_AI_BLOCKS,
  V2_APPENDIX_A_IDS,
  buildAllDraftingBlocks,
} from "@/lib/kb/seed/blocks";
import { NON_BINDING_STATUSES } from "@/lib/kb/types";
import { DRAFTING_PRIORITY } from "@/lib/kb/types";

/**
 * These tests encode the client pack as executable invariants:
 * AI Legal Knowledge Base V2 §1–§19 + Appendices A–C, and
 * Legal Authority & Source Register V1 §4, §16, §17.
 */

describe("KB module inventory (AI Legal Knowledge Base V2)", () => {
  it("contains exactly the 58 specified modules", () => {
    expect(ALL_KB_MODULES).toHaveLength(58);
  });

  it("has every module ID from the pack, with no duplicates", () => {
    const expected = [
      "KB-GOV-01", "KB-GOV-02", "KB-GOV-03", "KB-GOV-04", "KB-GOV-05",
      "KB-GOV-06", "KB-GOV-07",
      "KB-POFA-01", "KB-POFA-02", "KB-POFA-03", "KB-POFA-04", "KB-POFA-05",
      "KB-CON-01", "KB-CON-02",
      "KB-GRACE-01", "KB-GRACE-02",
      "KB-TIME-01",
      "KB-PAY-01", "KB-PAY-02", "KB-PAY-03",
      "KB-KEY-01", "KB-KEY-02",
      "KB-ANPR-01", "KB-ANPR-02", "KB-ANPR-03",
      "KB-EV-01",
      "KB-SIGN-01", "KB-SIGN-02", "KB-SIGN-03", "KB-SIGN-04",
      "KB-AUTH-01", "KB-AUTH-02", "KB-AUTH-03",
      "KB-CUST-01",
      "KB-BREAK-01", "KB-BREAK-02", "KB-BREAK-03",
      "KB-RES-01", "KB-RES-02", "KB-RES-03", "KB-RES-04", "KB-RES-05",
      "KB-RES-06", "KB-RES-07",
      "KB-EQ-01", "KB-EQ-02", "KB-EQ-03",
      "KB-HOSP-01", "KB-HOSP-02", "KB-HOSP-03",
      "KB-ACT-01", "KB-ACT-02", "KB-ACT-03",
      "KB-EVCH-01", "KB-INFRA-01",
      "KB-LAND-01", "KB-LAND-02", "KB-LAND-03",
    ].sort();
    const actual = ALL_KB_MODULES.map((m) => m.moduleId).sort();
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(actual.length);
  });

  it("gives every module a version, status and core proposition (KB-GOV-01)", () => {
    for (const m of ALL_KB_MODULES) {
      expect(m.version, m.moduleId).toBeGreaterThanOrEqual(1);
      expect(["ACTIVE", "REVIEW", "DISABLED"]).toContain(m.status);
      expect(m.coreProposition.length, m.moduleId).toBeGreaterThan(10);
      expect(m.lastLegalReview, m.moduleId).toBeTruthy();
    }
  });

  it("gives every non-governance module at least one use_when fact", () => {
    for (const m of ALL_KB_MODULES) {
      if (m.routeFamily === "GOVERNANCE") continue;
      expect(m.useWhen.length, m.moduleId).toBeGreaterThan(0);
    }
  });

  it("references only source IDs that exist in the register", () => {
    const known = new Set(LEGAL_SOURCES.map((s) => s.sourceId));
    for (const m of ALL_KB_MODULES) {
      for (const sid of m.sourceIds) {
        expect(known.has(sid), `${m.moduleId} -> ${sid}`).toBe(true);
      }
    }
  });

  it("references only drafting blocks that exist", () => {
    const known = new Set(buildAllDraftingBlocks().map((b) => b.blockId));
    for (const m of ALL_KB_MODULES) {
      for (const bid of m.blockIds) {
        expect(known.has(bid), `${m.moduleId} -> ${bid}`).toBe(true);
      }
    }
  });

  it("covers all eight route families introduced by V2", () => {
    const families = new Set(ALL_KB_MODULES.map((m) => m.routeFamily));
    for (const f of [
      "BREAKDOWN", "RESIDENTIAL", "EQUALITY", "HOSPITAL",
      "LOADING", "DROP_OFF", "EV_CHARGING", "INFRASTRUCTURE",
    ]) {
      expect(families.has(f as never), f).toBe(true);
    }
  });
});

describe("Hard prohibitions carried into module metadata", () => {
  it("KB-GRACE-01 forbids a universal 10-minute rule", () => {
    const m = ALL_KB_MODULES.find((x) => x.moduleId === "KB-GRACE-01")!;
    expect(m.draftingNotes).toMatch(/10 minutes/i);
  });

  it("KB-CON-01 forbids merging consideration with grace", () => {
    const m = ALL_KB_MODULES.find((x) => x.moduleId === "KB-CON-01")!;
    expect(m.draftingNotes).toMatch(/not merge consideration/i);
  });

  it("KB-BREAK-01 forbids automatic frustration", () => {
    const m = ALL_KB_MODULES.find((x) => x.moduleId === "KB-BREAK-01")!;
    expect(m.draftingNotes).toMatch(/automatic frustration/i);
  });

  it("KB-RES-02 forbids 'unfettered' unless the document supports it", () => {
    const m = ALL_KB_MODULES.find((x) => x.moduleId === "KB-RES-02")!;
    expect(m.draftingNotes).toMatch(/unfettered/i);
  });

  it("KB-EQ-01 forbids equating a Blue Badge with the statutory test", () => {
    const m = ALL_KB_MODULES.find((x) => x.moduleId === "KB-EQ-01")!;
    expect(m.draftingNotes).toMatch(/Blue Badge/i);
  });

  it("KB-ANPR-03 forbids generic calibration allegations", () => {
    const m = ALL_KB_MODULES.find((x) => x.moduleId === "KB-ANPR-03")!;
    expect(m.draftingNotes).toMatch(/calibration/i);
  });

  it("KB-LAND-01 keeps authority proportionate at initial appeal", () => {
    const m = ALL_KB_MODULES.find((x) => x.moduleId === "KB-LAND-01")!;
    expect(m.draftingNotes).toMatch(/not falsely assert/i);
  });
});

describe("Legal source register (Source Register V1 §16, §17)", () => {
  it("has unique source IDs", () => {
    const ids = LEGAL_SOURCES.map((s) => s.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("disables quotation by default for all case law (KB-GOV-06)", () => {
    const cases = LEGAL_SOURCES.filter(
      (s) =>
        s.status === "BINDING_APPELLATE_CASE" ||
        s.status === "PERSUASIVE_CASE",
    );
    expect(cases.length).toBeGreaterThanOrEqual(3);
    for (const c of cases) {
      expect(c.quotationEnabled, c.sourceId).toBe(false);
    }
  });

  it("registers Beavis, Saeed and Jopson with the correct authority level", () => {
    const beavis = LEGAL_SOURCES.find((s) => s.sourceId === "SRC-CASE-BEAVIS-2015")!;
    const saeed = LEGAL_SOURCES.find((s) => s.sourceId === "SRC-CASE-SAEED-2001")!;
    const jopson = LEGAL_SOURCES.find((s) => s.sourceId === "SRC-CASE-JOPSON-2016")!;
    expect(beavis.status).toBe("BINDING_APPELLATE_CASE");
    expect(saeed.status).toBe("BINDING_APPELLATE_CASE");
    // Jopson is a county court appeal — persuasive only, never binding.
    expect(jopson.status).toBe("PERSUASIVE_CASE");
    expect(jopson.authorityLevel).toBe("PERSUASIVE_AUTHORITY");
  });

  it("flags the Euro Car Parks case as an open investigation only", () => {
    const ecp = LEGAL_SOURCES.find(
      (s) => s.sourceId === "SRC-CMA-ECP-INVESTIGATION",
    )!;
    expect(ecp.status).toBe("OPEN_INVESTIGATION");
    expect(NON_BINDING_STATUSES).toContain(ecp.status);
  });

  it("tags the withdrawn 2022 Code and the 2025 consultation as non-binding", () => {
    const withdrawn = LEGAL_SOURCES.find(
      (s) => s.sourceId === "SRC-GOV-CODE-2022-WITHDRAWN",
    )!;
    const consult = LEGAL_SOURCES.find(
      (s) => s.sourceId === "SRC-MHCLG-CONSULT-2025",
    )!;
    expect(withdrawn.status).toBe("WITHDRAWN");
    expect(consult.status).toBe("GOVERNMENT_PROPOSAL");
    expect(NON_BINDING_STATUSES).toContain(withdrawn.status);
    expect(NON_BINDING_STATUSES).toContain(consult.status);
  });

  it("keeps the Parking (Code of Practice) Act 2019 distinct from the industry Code", () => {
    const act = LEGAL_SOURCES.find(
      (s) => s.sourceId === "SRC-PARKING-COP-ACT-2019",
    )!;
    expect(act.status).toBe("BINDING_LEGISLATION");
    expect(act.notes).toMatch(/must NOT be confused/i);
  });
});

describe("Code version resolution (Source Register V1 §4)", () => {
  it("stores every band with effective dates", () => {
    expect(CODE_VERSIONS).toHaveLength(4);
    for (const c of CODE_VERSIONS) {
      expect(c.transitionStatus).toBeTruthy();
      expect(c.ataApplicability).toBeTruthy();
    }
  });

  it("applies BPA Version 9 between 1 Feb 2024 and 1 Oct 2024", () => {
    const v = resolveCodeVersion("2024-06-15", "BPA");
    expect(v?.version).toBe("9");
  });

  it("applies Single Code V1 between 1 Oct 2024 and 17 Feb 2025", () => {
    const v = resolveCodeVersion("2024-12-01");
    expect(v?.version).toBe("1");
  });

  it("applies Single Code V1.1 from 17 Feb 2025 onward", () => {
    expect(resolveCodeVersion("2025-02-17")?.version).toBe("1.1");
    expect(resolveCodeVersion("2026-09-01")?.version).toBe("1.1");
  });

  it("does not apply the Single Code retrospectively before Feb 2024", () => {
    const v = resolveCodeVersion("2023-06-01");
    expect(v?.version).toBe("PRE_SINGLE_CODE");
  });

  it("returns null when the event date is unknown so a missing fact is raised", () => {
    expect(resolveCodeVersion(null)).toBeNull();
    expect(resolveCodeVersion(undefined)).toBeNull();
    expect(resolveCodeVersion("not-a-date")).toBeNull();
  });

  it("marks V1.1 as published 13 April 2026 with effect from 17 Feb 2025", () => {
    const v11 = CODE_VERSIONS.find((c) => c.version === "1.1")!;
    expect(v11.publishedAt).toBe("2026-04-13");
    expect(v11.effectiveFrom).toBe("2025-02-17");
    expect(v11.transitionStatus).toBe("CURRENT");
  });
});

describe("Drafting blocks (Appendix A)", () => {
  const blocks = buildAllDraftingBlocks();

  it("adds the ten new AI-* blocks introduced by V2", () => {
    expect(NEW_AI_BLOCKS).toHaveLength(10);
    const ids = NEW_AI_BLOCKS.map((b) => b.blockId).sort();
    expect(ids).toEqual([
      "AI-ACT-001", "AI-BREAK-001", "AI-BREAK-002", "AI-EQ-001",
      "AI-EVCH-001", "AI-HOSP-001", "AI-RES-001", "AI-RES-002",
      "AI-RES-003", "AI-RES-004",
    ]);
  });

  it("covers all 70 Appendix A block IDs", () => {
    expect(V2_APPENDIX_A_IDS.size).toBe(70);
    const present = new Set(blocks.map((b) => b.blockId));
    for (const id of V2_APPENDIX_A_IDS) {
      expect(present.has(id), id).toBe(true);
    }
  });

  it("marks Appendix A blocks ACTIVE and unlisted V1 blocks REVIEW", () => {
    for (const b of blocks) {
      if (V2_APPENDIX_A_IDS.has(b.blockId)) {
        expect(b.status, b.blockId).toBe("ACTIVE");
        expect(b.inV2Appendix, b.blockId).toBe(true);
      } else {
        expect(b.status, b.blockId).toBe("REVIEW");
        expect(b.inV2Appendix, b.blockId).toBe(false);
      }
    }
  });

  it("does not delete the 27 inherited V1 blocks", () => {
    const review = blocks.filter((b) => b.status === "REVIEW");
    expect(review).toHaveLength(27);
  });

  it("extracts template variables, including the two new V2 variables", () => {
    const res1 = blocks.find((b) => b.blockId === "AI-RES-001")!;
    const res3 = blocks.find((b) => b.blockId === "AI-RES-003")!;
    expect(res1.variables).toContain("lease_or_tenancy");
    expect(res3.variables).toContain("bay_reference");
  });

  it("keeps every block text non-empty and free of module IDs", () => {
    for (const b of blocks) {
      expect(b.text.trim().length, b.blockId).toBeGreaterThan(20);
      // Customer-facing wording must never leak KB module identifiers.
      expect(b.text, b.blockId).not.toMatch(/\bKB-[A-Z]+-\d/);
    }
  });
});

describe("Drafting priority (KB §16)", () => {
  it("ranks dispositive keeper-liability and residential rights first", () => {
    expect(DRAFTING_PRIORITY.POFA).toBe(1);
    expect(DRAFTING_PRIORITY.RESIDENTIAL).toBe(1);
  });

  it("keeps landowner authority last at initial operator appeal", () => {
    const values = Object.values(DRAFTING_PRIORITY);
    expect(DRAFTING_PRIORITY.LANDOWNER).toBe(Math.max(...values));
  });

  it("places signage below strong fact-specific grounds", () => {
    expect(DRAFTING_PRIORITY.SIGNAGE).toBeGreaterThan(DRAFTING_PRIORITY.PAYMENT);
    expect(DRAFTING_PRIORITY.SIGNAGE).toBeGreaterThan(DRAFTING_PRIORITY.BREAKDOWN);
  });
});
