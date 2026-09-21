import Link from "next/link";
import { ArrowRightIcon } from "./Icons";
import { DocumentHeroVisual } from "./DocumentHeroVisual";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(236,21,115,0.06),transparent_55%)]"
      />
      <div className="container-page relative grid grid-cols-1 items-center gap-10 py-12 sm:py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12 lg:py-16">
        <div className="animate-fadeUp">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.18em] text-brand-pink">
            Parking Appeals Made Simple
          </p>
          <h1 className="font-display text-[34px] font-bold leading-[1.08] tracking-tight text-brand-text sm:text-[42px] lg:text-[50px]">
            Received a Parking Notice, Court Claim or{" "}
            <span className="text-brand-pink">Bailiff Letter?</span>
          </h1>

          <p className="mt-5 max-w-[540px] text-[15px] leading-relaxed text-brand-text/75 sm:text-[16px]">
            Self-service parking appeal documents in minutes. Expert help
            available for court claims, CCJs and enforcement action.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/appeal/upload"
              className="btn-brand-primary"
              data-testid="hero-cta"
            >
              Upload Your Notice <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
            <Link href="/how-it-works" className="btn-brand-outline">
              How It Works <span aria-hidden>↓</span>
            </Link>
          </div>
        </div>

        <div className="relative animate-[fadeUp_0.7s_ease-out_0.08s_both]">
          <DocumentHeroVisual />
        </div>
      </div>
    </section>
  );
}
