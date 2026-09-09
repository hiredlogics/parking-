import { BenefitItem } from "./BenefitItem";
import { ClockIcon, HeadsetIcon, LockIcon, PoundIcon } from "./Icons";

export function TrustRow() {
  return (
    <section className="bg-brand-navyMute py-6 sm:py-7">
      <div className="container-page">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          <BenefitItem
            icon={<LockIcon className="h-6 w-6" />}
            title="Secure & Confidential"
            description="Your information is safe and never shared."
          />
          <BenefitItem
            icon={<ClockIcon className="h-6 w-6" />}
            title="Available 24/7"
            description="Start your appeal anytime, day or night."
          />
          <BenefitItem
            icon={<PoundIcon className="h-6 w-6" />}
            title="Save Time & Money"
            description="DIY appeals cost less than traditional legal services."
          />
          <BenefitItem
            icon={<HeadsetIcon className="h-6 w-6" />}
            title="Expert Support"
            description="Our team is here if you need extra help along the way."
          />
        </div>
      </div>
    </section>
  );
}
