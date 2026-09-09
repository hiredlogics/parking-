import type { ReactNode } from "react";

export interface HowItWorksStepProps {
  number: number;
  icon: ReactNode;
  title: string;
  description: string;
}

/**
 * A single step in the "HOW IT WORKS" row.
 * Renders as: numbered pink outline circle (with icon), title below,
 * short description. Arrows between steps are drawn by the parent row
 * so we don't leak layout concerns into the individual step.
 */
export function HowItWorksStep({ number, icon, title, description }: HowItWorksStepProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-brand-pink/50 text-brand-pink">
          {icon}
        </span>
        <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-pink text-[11px] font-bold text-white shadow-card">
          {number}
        </span>
      </div>
      <div className="mt-4 text-[15px] font-bold text-brand-text">{title}</div>
      <p className="mt-1 max-w-[190px] text-[12.5px] leading-relaxed text-brand-mute">
        {description}
      </p>
    </div>
  );
}
