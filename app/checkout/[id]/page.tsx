"use client";

import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { JourneyHeader } from "@/components/app/JourneyHeader";
import { ProgressSteps } from "@/components/ProgressSteps";
import {
  confirmDemoPayment,
  fetchCase,
  fetchPaymentState,
  type PaymentStateView,
} from "@/features/appeal/caseSync";
import type { CustomerCaseState } from "@/lib/cases/types";

/**
 * Secure payment — matches client mockup.
 * Amount is always from the live payment state (never hardcoded).
 */
export default function CheckoutPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const caseId = params?.id ?? "";

  const [payment, setPayment] = useState<PaymentStateView | null>(null);
  const [appealCase, setAppealCase] = useState<CustomerCaseState | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<"card" | "paypal">("card");

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    (async () => {
      const [payRes, caseRes] = await Promise.all([
        fetchPaymentState(caseId, true),
        fetchCase(caseId),
      ]);
      if (cancelled) return;

      if (!payRes.ok) {
        if (payRes.code === "UNAUTHENTICATED") {
          router.push(`/signin?next=${encodeURIComponent(`/checkout/${caseId}`)}`);
          return;
        }
        setError(payRes.message);
        setLoading(false);
        return;
      }
      setPayment(payRes.data.payment);
      if (caseRes.ok) setAppealCase(caseRes.data.case);
      setLoading(false);

      if (payRes.data.payment.status === "PAID") {
        router.replace(`/checkout/${caseId}/success`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, router]);

  const completePayment = async () => {
    setError(null);
    setPaying(true);
    const res = await confirmDemoPayment(caseId);
    if (!res.ok) {
      setPaying(false);
      if (res.code === "UNAUTHENTICATED") {
        router.push(`/signin?next=${encodeURIComponent(`/checkout/${caseId}`)}`);
        return;
      }
      setError(res.message);
      return;
    }
    router.push(`/checkout/${caseId}/success`);
  };

  const price = payment?.amount ?? 0;
  const isDemo = payment?.provider === "demo";
  const priceLabel = `£${price.toFixed(2)}`;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <JourneyHeader />
      <ProgressSteps current="result" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-8 pt-6 sm:px-6 sm:pt-8">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-brand-text sm:text-[26px]">
            Secure payment
          </h1>
          <p className="mt-2 text-[14px] text-brand-mute">
            Complete your payment to generate your appeal.
          </p>
        </div>

        {loading ? (
          <div className="mt-6 h-48 animate-pulse rounded-2xl bg-brand-canvas" />
        ) : error && !payment ? (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {error}
          </div>
        ) : payment ? (
          <>
            {/* Card payment */}
            <button
              type="button"
              onClick={() => setMethod("card")}
              className="mt-6 flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="flex items-center gap-3">
                <Radio checked={method === "card"} />
                <span className="text-[15px] font-semibold text-brand-text">Card payment</span>
              </span>
              <CardBrandLogos />
            </button>

            {method === "card" && (
              <div className="mt-4 space-y-3">
                {isDemo ? (
                  <p className="rounded-xl bg-brand-pinkPale px-3.5 py-2.5 text-[13px] text-brand-text">
                    Demo checkout — no real card is charged. Tap pay to generate your appeal.
                  </p>
                ) : null}
                <div>
                  <label className="text-[13px] font-bold text-brand-text">Card number</label>
                  <div className="relative mt-1.5">
                    <input
                      className="w-full rounded-xl border border-brand-border bg-white px-3.5 py-2.5 pr-10 text-[14px] placeholder:text-brand-mute/55"
                      placeholder="1234 1234 1234 1234"
                      inputMode="numeric"
                      autoComplete="cc-number"
                      disabled={isDemo}
                      readOnly={isDemo}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-brand-mute">
                      <CardIcon />
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[13px] font-bold text-brand-text">Expiry date</label>
                    <input
                      className="mt-1.5 w-full rounded-xl border border-brand-border bg-white px-3.5 py-2.5 text-[14px] placeholder:text-brand-mute/55"
                      placeholder="MM / YY"
                      autoComplete="cc-exp"
                      disabled={isDemo}
                      readOnly={isDemo}
                    />
                  </div>
                  <div>
                    <label className="text-[13px] font-bold text-brand-text">CVC</label>
                    <input
                      className="mt-1.5 w-full rounded-xl border border-brand-border bg-white px-3.5 py-2.5 text-[14px] placeholder:text-brand-mute/55"
                      placeholder="123"
                      autoComplete="cc-csc"
                      disabled={isDemo}
                      readOnly={isDemo}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* PayPal */}
            <button
              type="button"
              onClick={() => setMethod("paypal")}
              className="mt-5 flex w-full items-center justify-between gap-3 border-t border-brand-borderSoft pt-5 text-left"
            >
              <span className="flex items-center gap-3">
                <Radio checked={method === "paypal"} />
                <span className="text-[15px] font-semibold text-brand-text">PayPal</span>
              </span>
              <PayPalMark />
            </button>

            {method === "paypal" && (
              <p className="mt-3 text-[13px] text-brand-mute">
                {isDemo
                  ? "PayPal is shown for layout only in demo mode — use card payment to continue."
                  : "You will be redirected to PayPal to complete payment securely."}
              </p>
            )}

            <div className="mt-8 flex items-center justify-between text-[15px]">
              <span className="text-brand-mute">Amount to pay</span>
              <span className="font-bold text-brand-text">{priceLabel}</span>
            </div>

            {error && (
              <p role="alert" className="mt-3 text-[13px] font-medium text-red-700">
                {error}
              </p>
            )}

            <div className="mt-4">
              <button
                type="button"
                data-testid="complete-demo-payment"
                onClick={() => void completePayment()}
                disabled={paying || payment.status === "PAID" || !isDemo || method !== "card"}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-brand-pinkDark disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LockIcon />
                {paying
                  ? "Preparing your appeal…"
                  : payment.status === "PAID"
                    ? "Payment complete"
                    : `Pay and generate appeal`}
              </button>
              <p className="mt-3 flex items-start justify-center gap-1.5 text-center text-[11.5px] leading-snug text-brand-mute">
                <LockIcon className="mt-0.5 h-3 w-3 shrink-0" />
                Payments are processed securely by Stripe. We do not store your card details.
              </p>
            </div>

            {appealCase && (
              <p className="mt-4 text-center text-[12px] text-brand-mute">
                Ref {appealCase.publicId}
                {appealCase.confirmed?.pcn_number
                  ? ` · PCN ${appealCase.confirmed.pcn_number}`
                  : ""}
              </p>
            )}

            <div className="mt-4 text-center">
              <Link href="/appeal/review" className="text-[13px] font-medium text-brand-mute hover:text-brand-text">
                ← Back to review
              </Link>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

function Radio({ checked }: { checked: boolean }) {
  return (
    <span
      className={[
        "inline-flex h-5 w-5 items-center justify-center rounded-full border-2",
        checked ? "border-brand-pink" : "border-[#D1D5DB]",
      ].join(" ")}
    >
      {checked && <span className="h-2.5 w-2.5 rounded-full bg-brand-pink" />}
    </span>
  );
}

function LockIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

function CardBrandLogos() {
  return (
    <span className="flex items-center gap-1.5" aria-hidden="true">
      <span className="rounded bg-[#1A1F71] px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
        VISA
      </span>
      <span className="rounded bg-[#EB001B] px-1.5 py-0.5 text-[9px] font-bold text-white">
        MC
      </span>
      <span className="rounded bg-[#006FCF] px-1.5 py-0.5 text-[9px] font-bold text-white">
        AMEX
      </span>
    </span>
  );
}

function PayPalMark() {
  return (
    <span className="text-[15px] font-bold italic tracking-tight">
      <span className="text-[#003087]">Pay</span>
      <span className="text-[#009CDE]">Pal</span>
    </span>
  );
}
