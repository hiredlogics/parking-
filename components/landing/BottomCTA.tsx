import Link from "next/link";
import { ArrowRightIcon, ChatQuestionIcon } from "./Icons";

export function BottomCTA() {
  return (
    <section
      id="contact"
      className="bg-brand-navy py-8 text-white sm:py-10 lg:py-12"
    >
      <div className="container-page">
        <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div className="flex items-start gap-4">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-pink text-white">
              <ChatQuestionIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-lg font-extrabold leading-tight sm:text-xl">
                Not sure what letter you have?
              </p>
              <p className="mt-1 max-w-[520px] text-[13.5px] leading-relaxed text-white/75">
                Upload it and we'll identify the stage of your case and guide
                you to the right solution.
              </p>
            </div>
          </div>

          <Link
            href="/start"
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
