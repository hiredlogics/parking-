"use client";

import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app/AppHeader";
import { CheckIcon, LockIcon, ShieldIcon } from "@/components/landing/Icons";
import {
  confirmDemoPayment,
  fetchCase,
  fetchPaymentState,
  type PaymentStateView,
} from "@/features/appeal/caseSync";
import type { CustomerCaseState } from "@/lib/cases/types";

/**
 * Checkout for a case.
 *
 * `[id]` is the case id. Payment state comes from the server on every
 * load — the page never assumes an outcome, and the "paid" decision is
 * made by the payment provider, not here.
 *
 * With the demo provider the button asks the server to settle. With
 * Stripe the customer never reaches this page; they are sent to Stripe's
 * hosted checkout instead.
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

      // Already settled — don't show a payment button for a paid case.
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

  return (
    <div className="app-shell">
      <AppHeader />
      <main className="container-page py-8 sm:py-10 lg:py-12">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-[1.15fr,1fr]">
          <section className="app-card">
            <div className="mb-6">
              <span className="app-badge">
                <LockIcon className="h-3.5 w-3.5" />{" "}
                {isDemo ? "Secure demo checkout" : "Secure checkout"}
              </span>
              <h1 className="mt-3 text-[24px] font-black tracking-tight sm:text-[28px]">
                Complete Your Payment
              </h1>
              <p className="mt-2 text-[13.5px] text-brand-mute">
                Your appeal is prepared and checked immediately after payment.
                You will be able to read it and download it straight away.
              </p>
            </div>

            {loading ? (
              <div className="h-40 animate-pulse rounded-xl bg-brand-canvas" />
            ) : error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                {error}
              </div>
            ) : payment ? (
              <>
                <div className="rounded-xl border border-brand-borderSoft bg-brand-canvas p-4 text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-brand-mute">Reference</span>
                    <span className="font-mono text-brand-text">
                      {appealCase?.publicId ?? caseId}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-brand-mute">Service</span>
                    <span className="font-semibold text-brand-text">
                      {payment.description ?? "Appeal Builder"}
                    </span>
                  </div>
                </div>

                {isDemo && (
                  <div className="mt-5 rounded-xl border border-brand-pink/30 bg-brand-pinkPale p-4 text-[13.5px] text-brand-text">
                    <p className="font-semibold">
                      Demo payment — not a real charge
                    </p>
                    <p className="mt-1 text-brand-mute">
                      No card is taken. The server records the payment, then
                      prepares and validates your appeal.
                    </p>
                  </div>
                )}

                <div className="mt-6 flex items-center gap-3 text-[12px] text-brand-mute">
                  <ShieldIcon className="h-4 w-4 text-brand-pink" />
                  Your appeal is only written after the server confirms payment.
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={completePayment}
                    disabled={paying || payment.status === "PAID" || !isDemo}
                    className="btn-brand-primary w-full sm:w-auto"
                    data-testid="complete-demo-payment"
                  >
                    {paying
                      ? "Preparing your appeal…"
                      : payment.status === "PAID"
                        ? "Payment complete"
                        : `Complete Demo Payment · £${price.toFixed(2)}`}
                  </button>
                  <Link href="/appeal/review" className="btn-brand-ghost w-full sm:w-auto">
                    Back to summary
                  </Link>
                </div>
              </>
            ) : null}
          </section>

          <aside className="app-card h-fit">
            <h2 className="text-[16px] font-black tracking-tight">Order summary</h2>
            {payment && (
              <>
                <ul className="mt-3 space-y-2 text-[13px]">
                  <li className="flex justify-between gap-2">
                    <span className="text-brand-mute">Service</span>
                    <span className="font-semibold text-brand-text">
                      {payment.description ?? "Appeal Builder"}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span className="text-brand-mute">PCN reference</span>
                    <span className="font-mono">
                      {appealCase?.confirmed?.pcn_number ?? "—"}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span className="text-brand-mute">Vehicle</span>
                    <span className="font-mono">
                      {appealCase?.confirmed?.vrm ?? "—"}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span className="text-brand-mute">Operator</span>
                    <span className="truncate">
                      {appealCase?.confirmed?.operator_name ?? "—"}
                    </span>
                  </li>
                  {appealCase && appealCase.groundLabels.length > 0 && (
                    <li className="flex justify-between gap-2">
                      <span className="text-brand-mute">Grounds identified</span>
                      <span>{appealCase.groundLabels.length}</span>
                    </li>
                  )}
                  <li className="flex justify-between gap-2">
                    <span className="text-brand-mute">Evidence attached</span>
                    <span>{appealCase?.evidence.length ?? 0}</span>
                  </li>
                </ul>
                <div className="mt-4 flex items-center justify-between border-t border-brand-borderSoft pt-3 text-[15px] font-black">
                  <span>Total</span>
                  <span>£{price.toFixed(2)}</span>
                </div>
                <ul className="mt-4 space-y-1.5 text-[12px] text-brand-mute">
                  {[
                    "Bespoke appeal written for your case",
                    "Independently checked before release",
                    "Instant PDF download",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-green text-white">
                        <CheckIcon className="h-3 w-3" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
