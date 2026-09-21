import { ServiceTier } from "./ServiceTier";
import {
  VisualExpertStack,
  VisualOrderForRecovery,
  VisualParkingNotice,
} from "./ServiceVisuals";

/** Three service bands from the How It Works marketing layout. */
export function HowItWorksTiers() {
  return (
    <>
      <ServiceTier
        eyebrow="Self-Service Appeals"
        title="Create your appeal in minutes"
        description="Upload your notice, answer a few questions, and download a professionally drafted appeal ready to submit to the parking company or council."
        price="£4.99"
        priceNote="From"
        ctaHref="/appeal/upload"
        ctaLabel="Start self-service"
        visual={<VisualParkingNotice />}
        steps={[
          { title: "Choose your service", detail: "Council PCN, private parking, or charge certificate." },
          { title: "Answer a few questions", detail: "We only ask what is needed for your case." },
          { title: "Your appeal is generated", detail: "A keeper-safe letter tailored to your facts." },
          { title: "Download & submit", detail: "PDF plus clear submission instructions." },
        ]}
      />

      <ServiceTier
        tone="soft"
        reverse
        eyebrow="Order for Recovery"
        title="We prepare and submit it for you"
        description="If you have received an Order for Recovery on a council PCN, we check your deadline, prepare the correct TE7/TE9 or PE2/PE3 forms, and submit them to the Traffic Enforcement Centre."
        price="£30.00"
        ctaHref="/#contact"
        ctaLabel="Start Order for Recovery"
        visual={<VisualOrderForRecovery />}
        steps={[
          { title: "Tell us what you've received", detail: "Upload the Order for Recovery documents." },
          { title: "We check your deadline", detail: "So nothing is filed too late." },
          { title: "We prepare your forms", detail: "TE7/TE9 or PE2/PE3 as required." },
          { title: "We submit to the TEC", detail: "You get confirmation when it is done." },
        ]}
      />

      <ServiceTier
        eyebrow="Expert Help"
        title="For more complex situations"
        description="Court claims, CCJs, bailiff letters and Notices of Enforcement need careful handling. Tell us about your case and our team will assess the next steps."
        ctaHref="/#contact"
        ctaLabel="Speak to our team"
        visual={<VisualExpertStack />}
        steps={[
          { title: "Tell us about your case", detail: "Upload the documents you have received." },
          { title: "We assess your case", detail: "We identify stage, risk and options." },
          { title: "We confirm next steps", detail: "Clear advice before any further fees." },
          { title: "Our team takes over", detail: "Experts handle preparation and guidance." },
        ]}
      />
    </>
  );
}
