import Link from "next/link";
import { ArrowRightIcon, ShieldIcon } from "./Icons";
import { DocumentHeroVisual } from "./DocumentHeroVisual";

export function Hero() {
  return (
    <section className="relative bg-white">
      <div className="container-page grid grid-cols-1 items-center gap-10 py-12 sm:py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14 lg:py-20">
        {/* Left column */}
        <div>
          <h1 className="text-[34px] font-black leading-[1.05] tracking-tight text-brand-text sm:text-[42px] lg:text-[52px]">
            Received a Parking
            <br />
            Notice, Court Claim
            <br />
            or <span className="text-brand-pink">Bailiff Letter?</span>
          </h1>

          <p className="mt-5 max-w-[520px] text-[15px] leading-relaxed text-brand-text/80 sm:text-base">
            Self-service parking appeal documents in minutes. Expert help
            available for court claims, CCJs and enforcement action.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/appeal/upload"
              className="btn-brand-primary"
              data-testid="hero-cta"
            >
              Upload Your Notice <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
            <Link href="#how-it-works" className="btn-brand-outline">
              How It Works <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-6 flex items-center gap-2 text-[13px] font-medium text-brand-text/70">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-pinkLight text-brand-pink">
              <ShieldIcon className="h-3.5 w-3.5" />
            </span>
            Secure. Fast. Available 24/7.
          </div>
        </div>

        {/* Right column */}
        <div className="relative">
          <DocumentHeroVisual />
        </div>
      </div>
    </section>
  );
}
