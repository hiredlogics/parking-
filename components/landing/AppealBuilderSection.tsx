import { SelfServiceCard } from "./SelfServiceCard";
import { CarIcon, CourthouseIcon, DocumentIcon } from "./Icons";

export function AppealBuilderSection() {
  return (
    <section id="services" className="bg-brand-pinkPale py-14 sm:py-16 lg:py-20">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-3 inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-widest text-brand-pink">
            <DocumentIcon className="h-4 w-4" />
            <span>
              Appeal Builder<sup className="text-[9px]">™</sup> – Self-Service Appeals
            </span>
          </div>
          <p className="text-[15px] leading-relaxed text-brand-mute">
            Answer a few questions and we'll generate your professionally
            drafted appeal or representation instantly.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
          <SelfServiceCard
            icon={<CourthouseIcon className="h-7 w-7" />}
            title="Council PCN"
            description="Penalty Charge Notice issued by a council."
            ctaHref="/appeal/upload"
            testId="card-council-pcn"
          />
          <SelfServiceCard
            icon={<CarIcon className="h-7 w-7" />}
            title="Private Parking PCN"
            description="Parking Charge Notice issued by a private parking company."
            ctaHref="/appeal/upload"
            testId="card-private-parking-pcn"
          />
          <SelfServiceCard
            icon={<DocumentIcon className="h-7 w-7" />}
            title="Charge Certificate"
            description="Taken the next step? Challenge your Charge Certificate."
            ctaHref="/appeal/upload"
            testId="card-charge-certificate"
          />
        </div>
      </div>
    </section>
  );
}
