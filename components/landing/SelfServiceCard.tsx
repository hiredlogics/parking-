import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "./Icons";

export interface SelfServiceCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  price: string;
  ctaHref: string;
  ctaLabel?: string;
  testId?: string;
  disabled?: boolean;
}

export function SelfServiceCard({
  icon,
  title,
  description,
  price,
  ctaHref,
  ctaLabel = "Generate Appeal",
  testId,
  disabled = false,
}: SelfServiceCardProps) {
  const inner = (
    <>
      {ctaLabel} <ArrowRightIcon className="h-3.5 w-3.5" />
    </>
  );
  return (
    <article className="flex flex-col rounded-xl border border-brand-border border-b-[3px] border-b-brand-pink bg-white p-6 text-center shadow-card transition duration-300 hover:-translate-y-0.5 hover:shadow-cardHover sm:p-7">
      <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-pinkLight text-brand-pink">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-brand-text">{title}</h3>
      <p className="mt-2 flex-1 text-[14px] leading-relaxed text-brand-mute">
        {description}
      </p>
      <p className="mt-5 text-[28px] font-black tracking-tight text-brand-pink">
        {price}
      </p>
      <div className="mt-5 flex justify-center">
        {disabled ? (
          <button
            type="button"
            className="btn-brand-outline cursor-not-allowed opacity-50"
            disabled
          >
            {inner}
          </button>
        ) : (
          <Link href={ctaHref} className="btn-brand-outline" data-testid={testId}>
            {inner}
          </Link>
        )}
      </div>
    </article>
  );
}
