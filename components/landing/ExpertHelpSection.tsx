import { ExpertHelpCard } from "./ExpertHelpCard";
import {
  CourthouseIcon,
  GavelIcon,
  PersonShieldIcon,
  ShieldIcon,
} from "./Icons";

export function ExpertHelpSection() {
  return (
    <section id="expert-help" className="bg-brand-helpGreenPale py-14 sm:py-16 lg:py-20">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-3 inline-flex items-center justify-center gap-2 text-[13px] font-bold uppercase tracking-widest text-brand-helpGreen">
            <ShieldIcon className="h-5 w-5" />
            <span>Need Expert Help?</span>
          </div>
          <p className="text-[15px] leading-relaxed text-brand-mute">
            For court claims, CCJs and enforcement action, our experts are here
            to help.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
          <ExpertHelpCard
            icon={<GavelIcon className="h-7 w-7" />}
            title="County Court Claim"
            description="You have received official court papers."
            ctaHref="/#contact"
          />
          <ExpertHelpCard
            icon={<CourthouseIcon className="h-7 w-7" />}
            title="CCJ Set Aside"
            description="A County Court Judgment is affecting your credit record."
            ctaHref="/#contact"
          />
          <ExpertHelpCard
            icon={<PersonShieldIcon className="h-7 w-7" />}
            title="Bailiff / Enforcement"
            description="You have received a Notice of Enforcement or a bailiff letter."
            ctaHref="/#contact"
          />
        </div>
      </div>
    </section>
  );
}
