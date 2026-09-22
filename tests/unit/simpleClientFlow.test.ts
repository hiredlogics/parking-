/**
 * Simple client flow — what a real customer experiences:
 *   1. Upload notice → extract + classify
 *   2. Confirm facts → Case Intelligence
 *   3. Answer a few questions
 *   4. Rules engine builds the appeal letter
 *
 * No Playwright, no payment, no admin. Just the product spine.
 */
import { describe, expect, it } from "vitest";
import { MockDocumentExtractionProvider } from "@/services/extraction/mockProvider";
import { assessDocumentDeterministic } from "@/lib/triage/deterministic";
import { triageBlocksAppealJourney } from "@/types/triage";
import { buildCaseIntelligence } from "@/lib/cases/caseIntelligence";
import { buildRulesBasedLetter } from "@/lib/appeals/rulesLetter";
import { FACT } from "@/lib/questions/facts";
import type { ConfirmedPcn } from "@/types";
import type { AnswerMap } from "@/lib/questions/types";

describe("simple client flow: upload → classify → rules appeal", () => {
  it("payment notice becomes a real rules letter", async () => {
    // 1. User uploads a notice (mock AI extract — same shape as production)
    const extractor = new MockDocumentExtractionProvider();
    const extracted = await extractor.extract({
      name: "payment-notice.png",
      mimeType: "image/png",
      bytes: new Uint8Array([1, 2, 3, 4]),
      hint: "payment",
    });

    expect(extracted.raw.operator_name).toBeTruthy();
    expect(extracted.raw.pcn_number).toBeTruthy();
    expect(extracted.providerId).toBe("mock-v1");

    // 2. AI / deterministic classify — is this a normal initial PCN?
    const triage = assessDocumentDeterministic({
      operatorName: extracted.raw.operator_name,
      allegedBreach: extracted.raw.alleged_breach,
      parkingLocation: extracted.raw.parking_location,
    });
    expect(triage.serviceDecision).toBe("PRIVATE_PARKING_INITIAL_APPEAL_OK");
    expect(triageBlocksAppealJourney(triage)).toBe(false);

    // 3. Customer confirms extracted facts
    const confirmed: ConfirmedPcn = {
      ...extracted.raw,
      notice_route: extracted.raw.notice_route ?? "POSTAL",
      case_stage: "INITIAL_OPERATOR_APPEAL",
      confirmedAt: new Date().toISOString(),
    };

    const intelligence = buildCaseIntelligence({
      confirmed,
      answers: {},
      documentUnderstanding: {
        documentType: triage.documentKind,
        senderName: triage.senderName,
        parkingOperatorName: triage.parkingOperatorName,
        caseStage: triage.caseStage,
        serviceDecision: triage.serviceDecision,
      },
    });
    expect(intelligence.version).toBeTruthy();
    expect(intelligence.facts).toBeTruthy();

    // 4. Customer answers (keeper + paid + receipt) — short questionnaire
    const answers: AnswerMap = {
      [FACT.JURISDICTION]: "ENGLAND_WALES",
      [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
      [FACT.REGISTERED_KEEPER]: "YES",
      [FACT.DRIVER_IDENTIFIED]: "NO",
      [FACT.SCENARIOS]: ["payment_made"],
      [FACT.PAYMENT_MADE]: "YES",
      [FACT.PAYMENT_EVIDENCE]: "YES",
    };

    // 5. Rules appeal generated (Master Pack paragraphs — not free AI prose)
    const letter = await buildRulesBasedLetter({
      confirmed,
      answers,
      evidenceTypes: ["payment_receipt"],
    });

    expect(letter.body.length).toBeGreaterThan(200);
    expect(letter.matchedParagraphIds.length).toBeGreaterThan(0);
    expect(letter.matchedParagraphIds.some((id) => id.startsWith("PP-"))).toBe(
      true,
    );
    expect(letter.keeperSafe).toBe(true);
    expect(letter.activeRoutes.length).toBeGreaterThan(0);

    // Sanity: letter mentions the case, not internal triage jargon
    expect(letter.body.toLowerCase()).not.toMatch(/debt recovery plus/);
    expect(letter.body).not.toMatch(/NOT_SUPPORTED/);
  });

  it("debt recovery letter is classified and stopped — no appeal letter", async () => {
    const triage = assessDocumentDeterministic({
      operatorName: "Debt Recovery Plus Ltd",
      allegedBreach: "Parking charge unpaid",
      parkingLocation: "Retail Park",
      extraText: "Instructed to recover charge. paydrp.co.uk",
    });

    expect(triage.serviceDecision).toBe("NOT_SUPPORTED");
    expect(triageBlocksAppealJourney(triage)).toBe(true);
  });
});
