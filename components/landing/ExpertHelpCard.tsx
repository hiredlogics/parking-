import Link from "next/link";
import type { ReactNode } from "react";

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
    <article className="flex flex-col rounded-lg border border-brand-border bg-white p-6 text-center shadow-card transition hover:shadow-cardHover">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center text-brand-text/85">
        {icon}
      </div>
      <h3 className="text-[15px] font-bold text-brand-text">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-brand-mute">
        {description}
      </p>
      <div className="mt-5 flex justify-center">
        <Link href={ctaHref} className="btn-brand-outline">
          {ctaLabel}
        </Link>
      </div>
    </article>
  );
}
