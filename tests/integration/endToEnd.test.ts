import { describe, expect, it } from "vitest";
import { DEMO_SCENARIOS } from "@/lib/demoScenarios";
import { evaluate } from "@/rules";
import { assembleAppeal } from "@/lib/assembly";
import { validateKeeperSafe } from "@/lib/keeperSafe";
import { renderAppealPdf } from "@/services/documents/pdf";
import { renderAppealDocx } from "@/services/documents/docx";
import type { ConfirmedPcn } from "@/types";

/**
 * Full-pipeline integration tests. For every seeded demo scenario
 * (including Part 11 worked examples A–D), evaluate → assemble → render
 * PDF & DOCX and verify:
 *   - Every expected rule from the pack fired.
 *   - Every expected paragraph from the pack is present.
 *   - The body is keeper-safe.
 *   - No unresolved variables.
 *   - No leaked internal IDs.
 *   - PDF and DOCX are valid file formats.
 */
describe("integration: full pipeline for every demo scenario", () => {
  for (const s of DEMO_SCENARIOS) {
    it(`[${s.id}] rules + paragraphs + assembly + PDF/DOCX`, async () => {
      const pcn: ConfirmedPcn = { ...s.pcn, confirmedAt: new Date().toISOString() };
      const evaluation = evaluate({ pcn, answers: s.suggestedAnswers, evidence: [] });
      const appeal = assembleAppeal(pcn, s.suggestedAnswers, [], evaluation);

      for (const ruleId of s.expectedRuleIds) {
        expect(evaluation.matchedRuleIds, `${s.id} missing rule ${ruleId}`).toContain(ruleId);
      }

      for (const pid of s.expectedParagraphIds) {
        expect(
          evaluation.matchedParagraphIds,
          `${s.id} missing paragraph ${pid}`,
        ).toContain(pid);
      }

      // Keeper-safe body.
      const check = validateKeeperSafe(appeal.body);
      expect(check.ok, `${s.id} keeper-safe violation: ${JSON.stringify(check.violations)}`).toBe(true);

      expect(appeal.unresolvedVariables, `${s.id} unresolved variables`).toEqual([]);

      // No leaked IDs in body.
      expect(appeal.body).not.toMatch(/\bPP-(?:INTRO|POFA|PAY|KEY|CON|GRACE|ANPR|AUTH|SIGN|LAND|EV|END)-[A-Z0-9]+\b/);
      expect(appeal.body).not.toMatch(/\bPP-R\d+\b/);

      // Documents render.
      const pdfBytes = await renderAppealPdf({ pcn, answers: s.suggestedAnswers, evidence: [], appeal });
      const docxBytes = await renderAppealDocx({ pcn, answers: s.suggestedAnswers, evidence: [], appeal });
      expect(pdfBytes.byteLength).toBeGreaterThan(1000);
      expect(docxBytes.byteLength).toBeGreaterThan(1000);
      expect(String.fromCharCode(...pdfBytes.slice(0, 5))).toBe("%PDF-");
      expect(docxBytes[0]).toBe(0x50);
      expect(docxBytes[1]).toBe(0x4b);
    });
  }
});

describe("integration: multi-ground assembly", () => {
  it("payment + keying + signage — three routes, PP-INTRO-001 once at the top", () => {
    const pcn: ConfirmedPcn = {
      confirmedAt: new Date().toISOString(),
      operator_name: "Britannia Parking Ltd",
      pcn_number: "BR/2026/9000",
      vrm: "MK18 EEP",
      parking_location: "Multi Ground Site",
      parking_event_date: "2026-07-01",
      notice_issue_date: "2026-07-05",
      notice_route: "WINDSCREEN",
      charge_amount: 100,
      alleged_breach: "Unauthorised parking after 6pm",
      case_stage: "INITIAL_OPERATOR_APPEAL",
    };
    const answers = {
      core: {
        registered_keeper: "YES" as const,
        driver_identified: "NO" as const,
        scenarios: ["payment_made" as const, "vrm_error" as const, "signage_issue" as const],
      },
      branch: {
        payment: {
          parking_payment_made: "YES" as const,
          payment_evidence_uploaded: "YES" as const,
        },
        keying: {
          vrm_error: "YES" as const,
          vrm_error_type: "MINOR" as const,
          payment_confirmed: "YES" as const,
        },
        signage: { entrance_sign_visible: "NO" as const },
      },
    };
    const ev = evaluate({ pcn, answers, evidence: [] });
    const appeal = assembleAppeal(pcn, answers, [], ev);

    expect(ev.activeRoutes).toEqual(
      expect.arrayContaining(["KEEPER_ROUTE", "PAYMENT_ROUTE", "KEYING_ERROR_ROUTE", "SIGNAGE_ROUTE"]),
    );

    const intros = appeal.paragraphs.filter((p) => p.id === "PP-INTRO-001");
    expect(intros).toHaveLength(1);
    expect(appeal.paragraphs[0].id).toBe("PP-INTRO-001");
    expect(appeal.paragraphs[appeal.paragraphs.length - 1].id).toBe("PP-END-001");
  });
});
