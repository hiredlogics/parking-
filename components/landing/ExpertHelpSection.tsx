import { ExpertHelpCard } from "./ExpertHelpCard";
import {
  CourthouseIcon,
  DocumentIcon,
  GavelIcon,
  PersonShieldIcon,
  ShieldIcon,
} from "./Icons";

export function ExpertHelpSection() {
  return (
    <section id="expert-help" className="bg-brand-canvas py-14 sm:py-16 lg:py-20">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-3 inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-widest text-brand-text">
            <ShieldIcon className="h-4 w-4 text-brand-pink" />
            <span>Need Expert Help? – We've got you.</span>
          </div>
          <p className="text-[15px] leading-relaxed text-brand-mute">
            For court claims, CCJs and enforcement action, our experts are here
            to help.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <ExpertHelpCard
            icon={<GavelIcon className="h-8 w-8" />}
            title="County Court Claim"
            description="You have received official court papers."
            ctaHref="/#contact"
          />
          <ExpertHelpCard
            icon={<CourthouseIcon className="h-8 w-8" />}
            title="CCJ Removal"
            description="A County Court Judgment is affecting your credit record."
            ctaHref="/#contact"
          />
          <ExpertHelpCard
            icon={<PersonShieldIcon className="h-8 w-8" />}
            title="Bailiff / Enforcement Letter"
            description="You have received a Notice of Enforcement or bailiff letter."
            ctaHref="/#contact"
          />
          <ExpertHelpCard
            icon={<DocumentIcon className="h-8 w-8" />}
            title="Order for Recovery"
            description="You have received an Order for Recovery relating to a council PCN."
            ctaHref="/#contact"
          />
        </div>
      </div>
    </section>
  );
}
