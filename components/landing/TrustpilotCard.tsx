import { StarIcon } from "./Icons";

/**
 * Small right-side sidebar in the How It Works section:
 * "Trusted by motorists across the UK — 4.8/5, 1,000+ reviews".
 * Green stars mimic the Trustpilot style.
 */
export function TrustpilotCard() {
  return (
    <aside className="rounded-xl border border-brand-border bg-white p-5 text-center shadow-card sm:p-6">
      <p className="text-[13px] font-semibold leading-tight text-brand-text">
        Trusted by motorists
        <br />
        across the UK
      </p>
      <div className="mt-3 flex items-center justify-center gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="inline-flex h-6 w-6 items-center justify-center bg-brand-green"
          >
            <StarIcon className="h-3.5 w-3.5 text-white" />
          </span>
        ))}
      </div>
      <p className="mt-3 text-[13px] font-bold text-brand-text">4.8 out of 5</p>
      <p className="text-[11px] text-brand-mute">Based on 1,000+ reviews</p>
      <p className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-brand-text">
        <StarIcon className="h-3 w-3 text-brand-green" />
        Trustpilot
      </p>
    </aside>
  );
}
