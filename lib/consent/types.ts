/**
 * The three confirmations Terms section 16 requires before a
 * Self-Service purchase, plus the acknowledgement that follows from the
 * third.
 *
 * Every field is required and must arrive as an explicit `true`. There
 * is deliberately no default and no optional marker: an absent field is
 * a refusal, not an omission.
 */
export interface ConsentInput {
  informationAccuracyConfirmed: boolean;
  termsPrivacyAccepted: boolean;
  immediateSupplyConsent: boolean;
}

export interface PurchaseConsentRecord {
  id: string;
  caseId: string;
  customerId: string;
  serviceType: string;
  termsVersion: string;
  privacyPolicyVersion: string;
  informationAccuracyConfirmed: boolean;
  termsPrivacyAccepted: boolean;
  immediateSupplyConsent: boolean;
  cancellationRightAcknowledged: boolean;
  acceptedAt: string;
  paymentId: string | null;
  providerSessionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  withdrawnAt: string | null;
  createdAt: string;
}

/** Technical audit metadata captured alongside the consent. */
export interface ConsentAuditMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * True only when all three confirmations were actively given.
 *
 * Written as an explicit `=== true` chain rather than a truthiness check
 * so a string "false", a 1, or any other coerced value cannot satisfy
 * consent.
 */
export function isConsentComplete(input: Partial<ConsentInput>): boolean {
  return (
    input.informationAccuracyConfirmed === true &&
    input.termsPrivacyAccepted === true &&
    input.immediateSupplyConsent === true
  );
}

/** Which confirmations are missing, for a precise server-side error. */
export function missingConsents(input: Partial<ConsentInput>): string[] {
  const missing: string[] = [];
  if (input.informationAccuracyConfirmed !== true) {
    missing.push("informationAccuracyConfirmed");
  }
  if (input.termsPrivacyAccepted !== true) missing.push("termsPrivacyAccepted");
  if (input.immediateSupplyConsent !== true) {
    missing.push("immediateSupplyConsent");
  }
  return missing;
}
