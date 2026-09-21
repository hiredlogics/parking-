import Image from "next/image";

/**
 * Home hero visual — exact client reference photo
 * (PCN + Claim Form + Notice of Enforcement + “We're here to help.”).
 */
export function DocumentHeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <Image
        src="/images/hero-documents.png"
        alt="Penalty Charge Notice, Claim Form and Notice of Enforcement — we're here to help"
        width={1120}
        height={900}
        priority
        className="h-auto w-full object-contain"
        sizes="(max-width: 1024px) 100vw, 560px"
      />
    </div>
  );
}
