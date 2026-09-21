import Link from "next/link";
import { ArrowRightIcon, ChatQuestionIcon } from "./Icons";

/**
 * Home uses the dark navy banner; How It Works uses the light band.
 */
export function BottomCTA({
  variant = "dark",
}: {
  variant?: "dark" | "light";
}) {
  if (variant === "light") {
    return (
      <section id="contact" className="bg-brand-canvas py-12 sm:py-14">
        <div className="container-page">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div className="max-w-xl">
              <h2 className="font-display text-[22px] font-bold tracking-tight text-brand-text sm:text-[26px]">
                Not sure which service you need?
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-brand-mute">
                Upload your notice and we&apos;ll identify the stage of your case
                and guide you to the right next step.
              </p>
            </div>
            <Link
              href="/appeal/upload"
              className="btn-brand-primary w-full justify-center sm:w-auto"
              data-testid="bottom-cta"
            >
              Upload Your Notice <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="contact" className="bg-white py-10 sm:py-12">
      <div className="container-page">
        <div className="flex flex-col items-start gap-6 rounded-2xl bg-brand-navy px-6 py-7 text-white sm:px-8 sm:py-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div className="flex items-start gap-4">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-pink text-white">
              <ChatQuestionIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-lg font-extrabold leading-tight sm:text-xl">
                Not sure what letter you have?
              </p>
              <p className="mt-1 max-w-[540px] text-[13.5px] leading-relaxed text-white/75">
                Upload it and we&apos;ll identify the stage of your case and guide
                you to the right service.
              </p>
            </div>
          </div>

          <Link
            href="/appeal/upload"
            className="btn-brand-primary w-full justify-center sm:w-auto"
            data-testid="bottom-cta"
          >
            Upload Your Notice <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
