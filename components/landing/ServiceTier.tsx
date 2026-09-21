import type { ReactNode } from "react";
import Link from "next/link";

export type ServiceTierStep = { title: string; detail?: string };

export interface ServiceTierProps {
  eyebrow: string;
  title: string;
  description: string;
  price?: string | null;
  priceNote?: string | null;
  steps: ServiceTierStep[];
  visual: ReactNode;
  ctaHref?: string;
  ctaLabel?: string;
  /** Alternate background for visual rhythm */
  tone?: "white" | "soft";
  reverse?: boolean;
}

/**
 * One service band — image | copy + price | numbered 1–4 steps.
 * Matches the Parking Appeals Group How It Works layout.
 */
export function ServiceTier({
  eyebrow,
  title,
  description,
  price,
  priceNote,
  steps,
  visual,
  ctaHref,
  ctaLabel,
  tone = "white",
  reverse = false,
}: ServiceTierProps) {
  return (
    <section
      className={
        tone === "soft" ? "bg-brand-canvas/80 py-12 sm:py-14" : "bg-white py-12 sm:py-14"
      }
    >
      <div className="container-page">
        <div
          className={[
            "grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12",
            reverse ? "lg:[&>*:first-child]:order-2" : "",
          ].join(" ")}
        >
          <div className="relative mx-auto w-full max-w-[340px] lg:mx-0">
            {visual}
          </div>

          <div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-brand-pink">
                  {eyebrow}
                </p>
                <h2 className="mt-2 font-display text-[24px] font-bold leading-tight tracking-tight text-brand-text sm:text-[28px]">
                  {title}
                </h2>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-brand-mute">
                  {description}
                </p>
                {ctaHref && ctaLabel ? (
                  <Link
                    href={ctaHref}
                    className="mt-5 inline-flex text-[13px] font-semibold text-brand-pink underline-offset-4 hover:underline"
                  >
                    {ctaLabel} →
                  </Link>
                ) : null}
              </div>

              {price ? (
                <div className="shrink-0 self-start rounded-xl border-2 border-brand-pink bg-white px-5 py-3 text-center shadow-card">
                  {priceNote ? (
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-mute">
                      {priceNote}
                    </p>
                  ) : null}
                  <p className="font-display text-[26px] font-bold leading-none text-brand-pink sm:text-[28px]">
                    {price}
                  </p>
                </div>
              ) : null}
            </div>

            <ol className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-6">
              {steps.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span
                    className="font-display text-[28px] font-bold leading-none text-brand-pink"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div className="pt-1">
                    <p className="text-[14px] font-semibold text-brand-text">
                      {step.title}
                    </p>
                    {step.detail ? (
                      <p className="mt-0.5 text-[13px] leading-snug text-brand-mute">
                        {step.detail}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
