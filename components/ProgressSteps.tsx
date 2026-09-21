import Link from "next/link";

/**
 * Customer journey steps — matches the client design (5 steps).
 * Internal routes still map to confirm / questions / etc.
 */
export type StepKey =
  | "upload"
  | "confirm"
  | "questions"
  | "evidence"
  | "review"
  | "result";

const STEPS: { key: StepKey; label: string; href: string }[] = [
  { key: "upload", label: "Upload", href: "/appeal/upload" },
  { key: "confirm", label: "Check details", href: "/appeal/confirm" },
  { key: "questions", label: "Your situation", href: "/appeal/questions" },
  { key: "review", label: "Payment", href: "/appeal/review" },
  { key: "result", label: "Download", href: "/appeal/result" },
];

/** Map legacy evidence step onto "Your situation" in the 5-step chrome. */
function visualIndex(current: StepKey): number {
  if (current === "evidence") return 2;
  const i = STEPS.findIndex((s) => s.key === current);
  return i >= 0 ? i : 0;
}

/**
 * Five-step progress — full-width rail on web, same look as mobile.
 */
export function ProgressSteps({ current }: { current: StepKey }) {
  const currentIndex = visualIndex(current);
  const progressPct =
    currentIndex <= 0 ? 0 : (currentIndex / (STEPS.length - 1)) * 100;

  return (
    <nav aria-label="Appeal progress" className="border-b border-brand-borderSoft bg-white">
      <div className="mx-auto w-full max-w-[420px] px-3 py-5 sm:max-w-[560px] sm:px-6 md:max-w-2xl lg:max-w-3xl lg:px-8 lg:py-6">
        <ol className="relative flex items-start justify-between">
          <span
            aria-hidden="true"
            className="absolute left-[8%] right-[8%] top-[14px] h-[2px] bg-[#D1D5DB] sm:top-[15px] lg:top-[17px]"
          />
          <span
            aria-hidden="true"
            className="absolute left-[8%] top-[14px] h-[2px] bg-brand-pink transition-all duration-300 sm:top-[15px] lg:top-[17px]"
            style={{ width: `${progressPct * 0.84}%` }}
          />
          {STEPS.map((s, i) => {
            const state: "done" | "active" | "todo" =
              i < currentIndex ? "done" : i === currentIndex ? "active" : "todo";
            const circle =
              state === "active"
                ? "bg-brand-pink text-white border-brand-pink"
                : state === "done"
                  ? "bg-white text-brand-pink border-brand-pink"
                  : "bg-white text-[#9CA3AF] border-[#D1D5DB]";
            const label =
              state === "active"
                ? "font-bold text-brand-text"
                : state === "done"
                  ? "font-medium text-brand-pink"
                  : "font-medium text-[#9CA3AF]";

            const inner = (
              <div className="relative z-[1] flex w-[3.75rem] flex-col items-center gap-1.5 sm:w-[5rem] lg:w-[6rem]">
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-2 text-[12px] font-bold sm:h-8 sm:w-8 sm:text-[13px] lg:h-9 lg:w-9 lg:text-[14px] ${circle}`}
                >
                  {i + 1}
                </span>
                <span className={`text-center text-[9px] leading-tight sm:text-[11px] lg:text-[12px] ${label}`}>
                  {s.label}
                </span>
              </div>
            );

            return (
              <li key={s.key} className="flex flex-1 justify-center">
                {state === "done" ? (
                  <Link
                    href={s.href}
                    className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div aria-current={state === "active" ? "step" : undefined}>{inner}</div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
