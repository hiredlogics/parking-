import type { ReactNode } from "react";

export interface BenefitItemProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export function BenefitItem({ icon, title, description }: BenefitItemProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-white/80">
        {icon}
      </span>
      <div>
        <p className="text-[13.5px] font-bold text-white">{title}</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-white/60">
          {description}
        </p>
      </div>
    </div>
  );
}
