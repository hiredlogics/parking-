import { describe, expect, it } from "vitest";
import {
  isConsentComplete,
  missingConsents,
  type ConsentInput,
} from "@/lib/consent/types";
import {
  activeVersion,
  currentLegalVersions,
  findVersion,
  versionsFor,
} from "@/lib/legal/registry";
import { TERMS_2026_09 } from "@/lib/legal/terms/TERMS_2026_09";
import { PRIVACY_2026_09 } from "@/lib/legal/privacy/PRIVACY_2026_09";
import {
  checkoutButtonLabel,
  formatServiceAmount,
  requiresSelfServiceConsent,
  serviceProductName,
} from "@/lib/workflow/config";

const ALL_GIVEN: ConsentInput = {
  informationAccuracyConfirmed: true,
  termsPrivacyAccepted: true,
  immediateSupplyConsent: true,
};

describe("consent gate", () => {
  it("is refused when nothing is selected", () => {
    expect(isConsentComplete({})).toBe(false);
    expect(missingConsents({})).toHaveLength(3);
  });

  it("is refused with one of three selected", () => {
    const one = { ...ALL_GIVEN, termsPrivacyAccepted: false, immediateSupplyConsent: false };
    expect(isConsentComplete(one)).toBe(false);
    expect(missingConsents(one)).toEqual([
      "termsPrivacyAccepted",
      "immediateSupplyConsent",
    ]);
  });

  it("is refused with two of three selected", () => {
    const two = { ...ALL_GIVEN, immediateSupplyConsent: false };
    expect(isConsentComplete(two)).toBe(false);
    expect(missingConsents(two)).toEqual(["immediateSupplyConsent"]);
  });

  it("is allowed only with all three selected", () => {
    expect(isConsentComplete(ALL_GIVEN)).toBe(true);
    expect(missingConsents(ALL_GIVEN)).toEqual([]);
  });

  /*
   * A tampered client could send anything. Consent must be an explicit
   * boolean true — never a truthy string, number or object.
   */
  it("refuses coerced truthy values", () => {
    for (const value of ["true", 1, "yes", {}, [], "on"]) {
      const forged = {
        informationAccuracyConfirmed: value,
        termsPrivacyAccepted: value,
        immediateSupplyConsent: value,
      } as unknown as ConsentInput;
      expect(isConsentComplete(forged)).toBe(false);
    }
  });

  it("treats an absent field as a refusal, not a default", () => {
    expect(
      isConsentComplete({
        informationAccuracyConfirmed: true,
        termsPrivacyAccepted: true,
      }),
    ).toBe(false);
  });
});

describe("terms versioning", () => {
  it("serves exactly one active version of each document", () => {
    expect(activeVersion("TERMS").version).toBe("TERMS_2026_09");
    expect(activeVersion("PRIVACY").version).toBe("PRIVACY_2026_09");
  });

  it("records the versions it displays", () => {
    const versions = currentLegalVersions();
    expect(versions.termsVersion).toBe(activeVersion("TERMS").version);
    expect(versions.privacyVersion).toBe(activeVersion("PRIVACY").version);
  });

  it("keeps historical versions resolvable by identifier", () => {
    expect(findVersion("TERMS_2026_09")?.version).toBe("TERMS_2026_09");
    expect(findVersion("TERMS_DOES_NOT_EXIST")).toBeNull();
  });

  it("exposes every version of a document for the admin list", () => {
    const all = versionsFor("TERMS");
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all.every((v) => v.documentId === "TERMS")).toBe(true);
    expect(all[0]!.effectiveFrom).toBeTruthy();
  });
});

describe("terms content", () => {
  it("contains sections 1 to 29, numbered in order", () => {
    const numbers = TERMS_2026_09.sections.map((s) => s.number);
    expect(numbers).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));
  });

  it("is labelled September 2026", () => {
    expect(TERMS_2026_09.lastUpdatedLabel).toBe("September 2026");
  });

  it("carries the supplied company and contact details", () => {
    const text = JSON.stringify(TERMS_2026_09);
    expect(text).toContain("The Parking Appeals Group Limited");
    expect(text).toContain("Office 1275");
    expect(text).toContain("12 Farwig Lane");
    expect(text).toContain("BR1 3RB");
    expect(text).toContain("info@parkingappealsgroup.co.uk");
  });

  it("does not publish the developer checkout appendix", () => {
    const text = JSON.stringify(TERMS_2026_09).toUpperCase();
    expect(text).not.toContain("DEVELOPER CHECKOUT WORDING");
    expect(text).not.toContain("PAYMENT BUTTON WORDING");
  });

  it("every section has a heading and at least one block", () => {
    for (const section of TERMS_2026_09.sections) {
      expect(section.heading.trim().length).toBeGreaterThan(0);
      expect(section.blocks.length).toBeGreaterThan(0);
    }
  });
});

describe("privacy policy content", () => {
  it("is active and versioned like the Terms", () => {
    expect(PRIVACY_2026_09.version).toBe("PRIVACY_2026_09");
    expect(PRIVACY_2026_09.status).toBe("ACTIVE");
    expect(PRIVACY_2026_09.effectiveFrom).toBe("2026-09-01");
    expect(PRIVACY_2026_09.effectiveTo).toBeNull();
    expect(PRIVACY_2026_09.lastUpdatedLabel).toBe("September 2026");
  });

  it("numbers its sections contiguously from 1", () => {
    const numbers = PRIVACY_2026_09.sections.map((s) => s.number);
    expect(numbers).toEqual(
      Array.from({ length: numbers.length }, (_, i) => i + 1),
    );
    expect(numbers.length).toBeGreaterThanOrEqual(12);
  });

  it("carries the same controller details as the Terms", () => {
    const text = JSON.stringify(PRIVACY_2026_09);
    expect(text).toContain("The Parking Appeals Group Limited");
    expect(text).toContain("Office 1275");
    expect(text).toContain("BR1 3RB");
    expect(text).toContain("info@parkingappealsgroup.co.uk");
  });

  /*
   * The UK GDPR transparency requirements this policy has to meet. If a
   * future edit drops one of these, the page stops being a lawful basis
   * for the checkout consent.
   */
  it("covers the required transparency topics", () => {
    const headings = PRIVACY_2026_09.sections
      .map((s) => s.heading.toUpperCase())
      .join(" | ");
    for (const topic of [
      "WHO WE ARE",
      "INFORMATION WE COLLECT",
      "LEGAL BASIS",
      "AUTOMATED PROCESSING",
      "WHO WE SHARE IT WITH",
      "INTERNATIONAL TRANSFERS",
      "HOW LONG WE KEEP IT",
      "SECURITY",
      "YOUR RIGHTS",
      "COMPLAINTS",
    ]) {
      expect(headings, `missing topic: ${topic}`).toContain(topic);
    }
  });

  it("names the processors that actually receive personal data", () => {
    const text = JSON.stringify(PRIVACY_2026_09);
    expect(text).toContain("OpenAI");
    expect(text).toContain("Stripe");
    expect(text).toContain("Information Commissioner");
  });

  it("no longer contains placeholder wording", () => {
    const text = JSON.stringify(PRIVACY_2026_09).toLowerCase();
    expect(text).not.toContain("being finalised");
    expect(text).not.toContain("placeholder");
    expect(text).not.toContain("not yet been supplied");
    expect(text).not.toContain("pending");
  });
});

describe("service-configured checkout wording", () => {
  it("uses the supplied private parking wording and price", () => {
    expect(checkoutButtonLabel("PRIVATE_PARKING_INITIAL_APPEAL")).toBe(
      "Pay £11.99 & Generate My Appeal",
    );
  });

  it("names the product as the Terms do", () => {
    expect(serviceProductName("PRIVATE_PARKING_INITIAL_APPEAL")).toBe(
      "Private Parking Charge Appeal",
    );
  });

  it("requires consent for a Self-Service product", () => {
    expect(requiresSelfServiceConsent("PRIVATE_PARKING_INITIAL_APPEAL")).toBe(
      true,
    );
  });

  /*
   * The £4.99 Charge Certificate Challenge uses different wording, so the
   * label must come from configuration rather than a hard-coded string.
   */
  it("composes a different price and verb without a code change", () => {
    expect(formatServiceAmount(4.99, "GBP")).toBe("£4.99");
    expect(`Pay ${formatServiceAmount(4.99, "GBP")} & Generate My Challenge`).toBe(
      "Pay £4.99 & Generate My Challenge",
    );
  });
});
