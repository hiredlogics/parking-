import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "./Icons";

export interface ExpertHelpCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  ctaHref: string;
  ctaLabel?: string;
}

export function ExpertHelpCard({
  icon,
  title,
  description,
  ctaHref,
  ctaLabel = "Get Help",
}: ExpertHelpCardProps) {
  return (
    <article className="flex flex-col rounded-xl border border-brand-border border-b-[3px] border-b-brand-helpGreen bg-white p-6 text-center shadow-card transition duration-300 hover:-translate-y-0.5 hover:shadow-cardHover">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-helpGreenPale text-brand-helpGreen">
        {icon}
      </div>
      <h3 className="text-[16px] font-bold text-brand-text">{title}</h3>
      <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-brand-mute">
        {description}
      </p>
      <div className="mt-5 flex justify-center">
        <Link
          href={ctaHref}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-brand-helpGreen bg-white px-5 py-2.5 text-[12.5px] font-semibold uppercase tracking-wide text-brand-helpGreen transition hover:bg-brand-helpGreenPale"
        >
          {ctaLabel} <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}
