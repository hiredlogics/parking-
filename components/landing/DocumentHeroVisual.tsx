import { CheckIcon, YellowTicketBadge } from "./Icons";

/**
 * Right-hand hero composition — three overlapping document mockups plus
 * a floating "DIY Self-Service" checklist card. Rendered entirely in
 * HTML/CSS/SVG (no external artwork) so it scales cleanly at every
 * breakpoint.
 */
export function DocumentHeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[560px] select-none">
      <div className="relative aspect-[6/5] w-full">
        {/* Notice of Enforcement (back-most, slight rotation, kraft-ish tone) */}
        <div
          aria-hidden="true"
          className="absolute right-2 top-2 w-[54%] rotate-[8deg] rounded-[6px] bg-[#F4E9D4] p-4 shadow-card ring-1 ring-black/5 sm:right-3 sm:top-3 sm:p-5"
        >
          <div className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-brand-text">
            Notice of Enforcement
          </div>
          <div className="mb-3 text-[9px] font-semibold uppercase tracking-widest text-brand-mute">
            Taking Control of Goods
          </div>
          <DocLines lines={9} />
        </div>

        {/* Claim Form (middle) */}
        <div
          aria-hidden="true"
          className="absolute left-[8%] top-[8%] w-[62%] rotate-[-4deg] rounded-[6px] bg-white p-4 shadow-card ring-1 ring-black/5 sm:p-5"
        >
          <div className="mb-1 flex items-center gap-2">
            <RoyalCrestSvg className="h-5 w-5 text-brand-text/70" />
            <div className="text-[13px] font-black uppercase tracking-tight text-brand-text">
              Claim Form
            </div>
          </div>
          <div className="mb-3 text-[9px] font-semibold uppercase tracking-widest text-brand-mute">
            County Court Business Centre
          </div>
          <DocLines lines={11} />
        </div>

        {/* Yellow Penalty Charge Notice sticker (front-most left) */}
        <div
          aria-hidden="true"
          className="absolute -left-2 top-[28%] w-[36%] max-w-[190px] rotate-[-10deg] sm:-left-4"
        >
          <YellowTicketBadge className="h-auto w-full drop-shadow-md" />
        </div>

        {/* DIY Self-Service floating checklist (front-most right) */}
        <div
          aria-hidden="true"
          className="absolute -right-3 bottom-[-2%] w-[62%] max-w-[300px] rounded-lg bg-white p-4 shadow-pop ring-1 ring-black/5 sm:-right-4 sm:p-5"
        >
          <div className="mb-3 text-sm font-bold text-brand-text">
            DIY Self-Service
          </div>
          <ul className="space-y-2 text-[13px] text-brand-text">
            {[
              "5 minute questionnaire",
              "Professionally drafted appeal",
              "Instant download",
              "Step-by-step guidance",
              "Available 24/7",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-pinkLight text-brand-pink">
                  <CheckIcon className="h-3 w-3" />
                </span>
                <span className="leading-snug">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Faint horizontal "text lines" used inside the paper mockups. */
function DocLines({ lines }: { lines: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-1.5 rounded-sm bg-black/10"
          style={{ width: `${88 - (i * 4) % 40}%` }}
        />
      ))}
    </div>
  );
}

/** Very small royal-crest-style flourish used on the Claim Form card. */
function RoyalCrestSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g fill="currentColor">
        <path d="M12 2l1.4 3.5H17l-3 2.4 1.2 3.6L12 9.5 8.8 11.5 10 7.9 7 5.5h3.6L12 2z" />
        <path d="M4 13h16v1.2H4zm0 2.4h16v1.2H4zm0 2.4h16v1.2H4z" opacity=".55" />
      </g>
    </svg>
  );
}
