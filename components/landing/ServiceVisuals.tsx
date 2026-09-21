import Image from "next/image";

/** How It Works / About hero — same client document collage photo. */
export function HowItWorksHeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[520px]">
      <Image
        src="/images/hero-documents.png"
        alt="Parking and enforcement notices"
        width={1120}
        height={900}
        className="h-auto w-full object-contain"
        sizes="(max-width: 1024px) 100vw, 520px"
      />
    </div>
  );
}

export function VisualParkingNotice() {
  return (
    <div className="relative mx-auto w-full max-w-[320px]">
      <Image
        src="/images/services-appeal-docs.png"
        alt="Parking notices and charge certificate"
        width={760}
        height={900}
        className="h-auto w-full object-contain"
        sizes="320px"
      />
    </div>
  );
}

export function VisualOrderForRecovery() {
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <Image
        src="/images/order-for-recovery.png"
        alt="Order for Recovery"
        width={720}
        height={720}
        className="h-auto w-full object-contain"
        sizes="300px"
      />
    </div>
  );
}

export function VisualExpertStack() {
  return (
    <div className="relative mx-auto w-full max-w-[320px]">
      <Image
        src="/images/hero-documents.png"
        alt="Court claim and enforcement documents"
        width={1120}
        height={900}
        className="h-auto w-full object-contain"
        sizes="320px"
      />
    </div>
  );
}
