import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "./Icons";

export interface SelfServiceCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  ctaHref: string;
  ctaLabel?: string;
  testId?: string;
  disabled?: boolean;
}

export function SelfServiceCard({
  icon,
  title,
  description,
  ctaHref,
  ctaLabel = "Generate Appeal",
  testId,
  disabled = false,
}: SelfServiceCardProps) {
  const Cta = (
    <span className="btn-brand-outline inline-flex items-center gap-2">
      {ctaLabel} <ArrowRightIcon className="h-3.5 w-3.5" />
    </span>
  );
  return (
    <article className="flex flex-col rounded-lg border border-brand-border bg-white p-6 text-center shadow-card transition hover:shadow-cardHover sm:p-7">
      <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-pinkLight text-brand-pink">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-brand-text">{title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-brand-mute">
        {description}
      </p>
      <div className="mt-6 flex justify-center">
        {disabled ? (
          <button type="button" className="btn-brand-outline opacity-50 cursor-not-allowed" disabled>
            {ctaLabel} <ArrowRightIcon className="h-3.5 w-3.5" />
          </button>
        ) : (
          <Link href={ctaHref} data-testid={testId}>
            {Cta}
          </Link>
        )}
      </div>
    </article>
  );
}
