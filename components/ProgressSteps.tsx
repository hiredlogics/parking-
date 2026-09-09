import Link from "next/link";

export type StepKey = "upload" | "confirm" | "questions" | "evidence" | "review" | "result";

const STEPS: { key: StepKey; label: string; href: string }[] = [
  { key: "upload", label: "Upload", href: "/appeal/upload" },
  { key: "confirm", label: "Confirm", href: "/appeal/confirm" },
  { key: "questions", label: "Questions", href: "/appeal/questions" },
  { key: "evidence", label: "Evidence", href: "/appeal/evidence" },
  { key: "review", label: "Review", href: "/appeal/review" },
  { key: "result", label: "Appeal", href: "/appeal/result" },
];

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l4.5 4.5L20 6" />
    </svg>
  );
}

/**
 * Six-step progress indicator used across the appeal workflow. Matches
 * the landing-page design system (light background, pink accent).
 * Completed steps show a check + are clickable back-links; the current
 * step is highlighted in pink; upcoming steps are neutral.
 */
export function ProgressSteps({ current }: { current: StepKey }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);
  return (
    <nav aria-label="Appeal progress" className="border-b border-brand-borderSoft bg-white">
      <div className="container-page py-4">
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-3 text-[12px] sm:text-[13px]">
          {STEPS.map((s, i) => {
            const state: "done" | "active" | "todo" =
              i < currentIndex ? "done" : i === currentIndex ? "active" : "todo";
            const dotClass =
              state === "done"
                ? "bg-brand-pink text-white border-brand-pink"
                : state === "active"
                  ? "bg-brand-pinkLight text-brand-pink border-brand-pink"
                  : "bg-white text-brand-mute border-brand-border";
            const labelClass =
              state === "active"
                ? "text-brand-text font-semibold"
                : state === "done"
                  ? "text-brand-text/80"
                  : "text-brand-mute";

            const body = (
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold ${dotClass}`}
                >
                  {state === "done" ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={`whitespace-nowrap ${labelClass}`}>{s.label}</span>
              </div>
            );
            return (
              <li key={s.key} className="flex items-center gap-1 sm:gap-2">
                {state === "done" ? (
                  <Link
                    href={s.href}
                    className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink"
                  >
                    {body}
                  </Link>
                ) : (
                  <div aria-current={state === "active" ? "step" : undefined}>
                    {body}
                  </div>
                )}
                {i < STEPS.length - 1 && (
                  <span aria-hidden="true" className="h-px w-4 bg-brand-border sm:w-8" />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
