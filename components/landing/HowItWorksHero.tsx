import { HowItWorksHeroVisual } from "./ServiceVisuals";

export function HowItWorksHero() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_15%,rgba(236,21,115,0.07),transparent_50%)]"
      />
      <div className="container-page relative grid grid-cols-1 items-center gap-10 py-12 sm:py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12 lg:py-16">
        <div className="animate-fadeUp">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.2em] text-brand-pink">
            How it Works
          </p>
          <h1 className="font-display text-[32px] font-bold leading-[1.1] tracking-tight text-brand-text sm:text-[40px] lg:text-[46px]">
            Received a parking notice and not sure what to do next?
          </h1>
          <p className="mt-5 max-w-[520px] text-[15px] leading-relaxed text-brand-mute sm:text-[16px]">
            Parking charges and court documents can feel stressful and confusing.
            We make the next step clear — whether you need a self-service appeal,
            help with an Order for Recovery, or expert support for court and
            enforcement.
          </p>
        </div>
        <div className="animate-[fadeUp_0.7s_ease-out_0.08s_both]">
          <HowItWorksHeroVisual />
        </div>
      </div>
    </section>
  );
}
