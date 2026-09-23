import type {
  DocumentFactCandidate,
  EvidenceUnderstanding,
  EvidenceUnderstandingProvider,
} from "./types";
import { factsInScope } from "./scope";
import { FACT } from "@/lib/facts/facts";

/**
 * MockEvidenceUnderstandingProvider
 *
 * ⚠ Not for production. Wired in only when EVIDENCE_PROVIDER=mock, which
 * tests/setup.ts sets for the whole suite so no test can make a paid,
 * non-deterministic call.
 *
 * Returns a fixed, plausible reading per evidence category so the
 * downstream pipeline (admission, tagging, gating, retrieval) can be
 * exercised end to end. Every value it returns is inside the registry
 * vocabulary — a test that wants to prove the admission checks work
 * supplies its own out-of-vocabulary candidate rather than relying on
 * this provider misbehaving.
 */
const READINGS: Record<
  string,
  { summary: string; facts: Array<[string, unknown, string]> }
> = {
  payment_receipt: {
    summary: "A card payment receipt for a parking session.",
    facts: [
      [FACT.PAYMENT_MADE, "YES", "Receipt shows a completed payment."],
      [FACT.PAYMENT_METHOD, "machine", "Receipt is machine-printed."],
      [FACT.PAYMENT_EVIDENCE, "YES", "The receipt itself is the record."],
    ],
  },
  app_screenshot: {
    summary: "A parking app screenshot showing a session.",
    facts: [
      [FACT.PAYMENT_MADE, "YES", "Session shown as active and paid."],
      [FACT.PAYMENT_METHOD, "app", "The record is from a parking app."],
      [FACT.PAYMENT_EVIDENCE, "YES", "The app record is available."],
    ],
  },
  permit: {
    summary: "A resident parking permit.",
    facts: [
      [FACT.PERMISSION_HELD, "YES", "Permit is issued and in date."],
      [FACT.PERMISSION_SOURCE, "resident_permit", "Issued to a resident."],
      [FACT.AUTHORISATION_EVIDENCE, "YES", "The permit document is available."],
    ],
  },
  authorisation_evidence: {
    summary: "An assured shorthold tenancy agreement including parking.",
    facts: [
      [FACT.OCCUPIER_STATUS, "tenant", "Agreement names the occupier as tenant."],
      [FACT.AGREEMENT_UPLOADED, "YES", "The agreement itself was supplied."],
      [FACT.BAY_ALLOCATED, "YES", "Agreement allocates a numbered space."],
      [FACT.BAY_REFERENCE, "14", "Space 14 is identified in the agreement."],
      [
        FACT.PARKING_RIGHT_EVIDENCE,
        "YES",
        "The instrument granting the right was supplied.",
      ],
    ],
  },
  signage_photo: {
    summary: "Photographs of the site entrance signage.",
    facts: [
      [
        FACT.SIGNAGE_ISSUE_BASIS,
        ["charge_not_prominent"],
        "The charge amount is in small print below the main panel.",
      ],
    ],
  },
  anpr_evidence: {
    summary: "A record of the vehicle's movements on the day.",
    facts: [
      [FACT.VISIT_COUNT, 2, "Two separate arrivals are recorded."],
      [
        FACT.VEHICLE_LEFT_SITE_EVIDENCE,
        "YES",
        "The vehicle is recorded away from the site between visits.",
      ],
    ],
  },
  breakdown_evidence: {
    summary: "A roadside recovery attendance report.",
    facts: [
      [FACT.BREAKDOWN_OCCURRED, "YES", "Recovery was called to the vehicle."],
      [
        FACT.BREAKDOWN_PREVENTED_DEPARTURE,
        "YES",
        "Report records the vehicle as immobile pending recovery.",
      ],
      [FACT.RECOVERY_ATTENDANCE, "YES", "A recovery operator attended."],
    ],
  },
  location_evidence: {
    summary: "Independent evidence of the vehicle's location.",
    facts: [
      [
        FACT.VEHICLE_LEFT_SITE_EVIDENCE,
        "YES",
        "The vehicle is shown elsewhere during the alleged stay.",
      ],
    ],
  },
};

export class MockEvidenceUnderstandingProvider
  implements EvidenceUnderstandingProvider
{
  readonly id = "mock-evidence-v1";
  readonly displayName = "Mock Evidence Reader (test-only)";

  async derive(input: {
    name: string;
    mimeType: string;
    bytes: Uint8Array | ArrayBuffer;
    evidenceType: string;
  }): Promise<EvidenceUnderstanding> {
    const scope = new Set(factsInScope(input.evidenceType));
    const reading = READINGS[input.evidenceType];

    const facts: DocumentFactCandidate[] = (reading?.facts ?? [])
      .filter(([k]) => scope.has(k as string))
      .map(([factKey, value, basis]) => ({
        factKey: factKey as string,
        value: value as DocumentFactCandidate["value"],
        basis: basis as string,
        confidence: 0.9,
      }));

    return {
      facts,
      typeMismatch: false,
      documentSummary:
        reading?.summary ?? `An uncategorised upload (${input.evidenceType}).`,
      providerId: this.id,
      readAt: new Date().toISOString(),
      warnings: [
        "Mock evidence reading — fixture data, not the actual document.",
      ],
    };
  }
}
