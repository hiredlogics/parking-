"use client";

import Link from "next/link";
import type { ConsentInput } from "@/lib/consent/types";

/**
 * The three mandatory pre-payment confirmations (Terms section 16).
 *
 * Wording is reproduced exactly as supplied and must not be softened or
 * combined. All three start false and are only ever changed by the
 * customer's own click — nothing here defaults, preselects, remembers or
 * infers a value, and the state is never seeded from storage.
 */

export const EMPTY_CONSENT: ConsentInput = {
  informationAccuracyConfirmed: false,
  termsPrivacyAccepted: false,
  immediateSupplyConsent: false,
};

export function PurchaseConsent({
  value,
  onChange,
  disabled,
}: {
  value: ConsentInput;
  onChange: (next: ConsentInput) => void;
  disabled?: boolean;
}) {
  const set = (key: keyof ConsentInput) => (checked: boolean) =>
    onChange({ ...value, [key]: checked });

  return (
    <section
      data-testid="purchase-consent"
      aria-labelledby="purchase-consent-heading"
      className="mt-6 rounded-2xl border border-brand-border bg-white p-4 sm:p-5"
    >
      <h2
        id="purchase-consent-heading"
        className="text-[15px] font-bold text-brand-text"
      >
        Before you pay
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-brand-mute">
        Please confirm each of the following. All three are required.
      </p>

      <div className="mt-4 space-y-3.5">
        <ConsentCheckbox
          id="consent-accuracy"
          testId="consent-accuracy"
          checked={value.informationAccuracyConfirmed}
          onChange={set("informationAccuracyConfirmed")}
          disabled={disabled}
        >
          I confirm that the information and documents I have provided are
          complete and accurate.
        </ConsentCheckbox>

        <ConsentCheckbox
          id="consent-terms"
          testId="consent-terms"
          checked={value.termsPrivacyAccepted}
          onChange={set("termsPrivacyAccepted")}
          disabled={disabled}
        >
          I have read and agree to the{" "}
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand-pink underline underline-offset-2"
          >
            Terms &amp; Conditions
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand-pink underline underline-offset-2"
          >
            Privacy Policy
          </Link>
          . I understand that Parking Appeals Group cannot guarantee the
          outcome of my appeal or challenge.
        </ConsentCheckbox>

        <ConsentCheckbox
          id="consent-immediate-supply"
          testId="consent-immediate-supply"
          checked={value.immediateSupplyConsent}
          onChange={set("immediateSupplyConsent")}
          disabled={disabled}
        >
          I expressly consent to the immediate supply of my personalised
          digital document before the end of the 14-day cancellation period. I
          understand that once supply begins, I will lose my statutory right to
          cancel this purchase.
        </ConsentCheckbox>
      </div>
    </section>
  );
}

function ConsentCheckbox({
  id,
  testId,
  checked,
  onChange,
  disabled,
  children,
}: {
  id: string;
  testId: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        data-testid={testId}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer rounded border-brand-border text-brand-pink accent-brand-pink disabled:cursor-not-allowed"
      />
      <label
        htmlFor={id}
        className="cursor-pointer text-[13.5px] leading-relaxed text-brand-text"
      >
        {children}
      </label>
    </div>
  );
}
