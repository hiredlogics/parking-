import Link from "next/link";
import { ArrowRightIcon } from "./Icons";
import { HowItWorksHeroVisual } from "./ServiceVisuals";

export function AboutHero() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_10%,rgba(236,21,115,0.07),transparent_55%)]"
      />
      <div className="container-page relative grid grid-cols-1 items-center gap-10 py-12 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12 lg:py-16">
        <div className="animate-fadeUp">
          <h1 className="font-display text-[34px] font-bold leading-[1.08] tracking-tight text-brand-text sm:text-[42px] lg:text-[48px]">
            Making parking appeals simpler.
          </h1>
          <p className="mt-5 max-w-[520px] text-[15px] leading-relaxed text-brand-mute sm:text-[16px]">
            Parking notices, court claims and enforcement letters are confusing.
            Parking Appeals Group helps people understand what they have
            received and take the next step with clear guidance and
            professionally drafted documents.
          </p>
        </div>
        <div className="relative animate-[fadeUp_0.7s_ease-out_0.08s_both]">
          <HowItWorksHeroVisual />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-2 left-[8%] hidden h-14 w-14 rounded-full bg-[#E8F5E9] shadow-card sm:block"
          />
        </div>
      </div>
    </section>
  );
}

export function AboutStory() {
  return (
    <section className="border-t border-brand-borderSoft bg-white py-14 sm:py-16">
      <div className="container-page grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14">
        <div className="relative mx-auto w-full max-w-[420px]">
          <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-brand-canvas shadow-card ring-1 ring-brand-border">
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-white via-brand-pinkPale to-brand-canvas p-8">
              <div className="flex flex-col items-start">
                <span className="font-display text-[11px] font-bold uppercase tracking-[0.42em] text-brand-pink">
                  THE
                </span>
                <span className="mt-1.5 flex flex-col gap-[0.12em] font-display text-[18px] font-extrabold uppercase leading-[1.05] tracking-[0.055em] text-brand-text">
                  <span>Parking Appeals</span>
                  <span>Group</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-brand-pink">
            Why Parking Appeals Group?
          </p>
          <h2 className="mt-3 font-display text-[26px] font-bold leading-tight tracking-tight text-brand-text sm:text-[32px]">
            Created from real experience. Built to make the process simpler.
          </h2>
          <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-brand-mute">
            <p>
              Parking Appeals Group was founded after our founder successfully
              challenged a Transport for London (TfL) Penalty Charge Notice —
              and realised how hard the process is for most people.
            </p>
            <p>
              Official letters use legal language. Deadlines are easy to miss.
              And it is not always clear whether you should appeal, pay, or get
              specialist help.
            </p>
            <p>
              We built this service so anyone can identify their notice, follow
              a clear path, and get a document that is ready to submit —
              without needing to become an expert overnight.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReadyChecklist() {
  const items = [
    "Relevant legislation",
    "Proven appeal grounds",
    "Personalised to your notice",
    "Clear and professional",
  ];
  return (
    <div className="mx-auto w-full max-w-[380px]">
      <div className="rounded-[18px] bg-[#1a1a24] p-3 shadow-pop ring-1 ring-black/20">
        <div className="overflow-hidden rounded-xl bg-white">
          <div className="flex items-center gap-3 border-b border-brand-borderSoft px-4 py-3">
            <span className="flex flex-col items-start leading-none">
              <span className="font-display text-[8px] font-bold uppercase tracking-[0.38em] text-brand-pink">
                THE
              </span>
              <span className="mt-0.5 flex flex-col font-display text-[10px] font-extrabold uppercase leading-[1.05] tracking-[0.05em] text-brand-text">
                <span>Parking Appeals</span>
                <span>Group</span>
              </span>
            </span>
          </div>
          <div className="px-5 py-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-pinkLight text-brand-pink">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <path d="M5 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="font-display text-[18px] font-bold text-brand-text">
              Your appeal is ready
            </p>
            <ul className="mt-5 space-y-2.5 text-left">
              {items.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-[13px] text-brand-text">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-pink text-white">
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                      <path d="M5 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-md bg-brand-pink px-4 py-3 text-[12px] font-semibold uppercase tracking-wide text-white">
              Download your appeal →
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AboutTechnology() {
  return (
    <section className="bg-brand-canvas/70 py-14 sm:py-16">
      <div className="container-page grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
        <div>
          <h2 className="font-display text-[26px] font-bold leading-tight tracking-tight text-brand-text sm:text-[32px]">
            Technology makes it faster. Our knowledge makes it effective.
          </h2>
          <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-brand-mute">
            <p>
              We use technology to prepare appeals quickly — guided by a curated
              knowledge base of legislation, guidance and real case patterns.
            </p>
            <p>
              That means your document is not generic template text. It is built
              around the notice you uploaded and the facts of your situation,
              then written in clear, professional language you can submit with
              confidence.
            </p>
          </div>
        </div>
        <ReadyChecklist />
      </div>
    </section>
  );
}

export function AboutReadyCta() {
  return (
    <section className="bg-white py-12 sm:py-14">
      <div className="container-page text-center">
        <h2 className="font-display text-[26px] font-bold tracking-tight text-brand-text sm:text-[30px]">
          Ready to get started?
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-[15px] text-brand-mute">
          Upload your notice and we&apos;ll guide you to the right service —
          self-service appeal, Order for Recovery, or expert help.
        </p>
        <Link
          href="/appeal/upload"
          className="btn-brand-primary mt-7"
          data-testid="about-cta"
        >
          Start an Appeal <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
