import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, CheckIcon, DocumentIcon } from "./Icons";

export function OrderForRecoverySection() {
  return (
    <section id="order-for-recovery" className="bg-brand-bluePale py-14 sm:py-16">
      <div className="container-page">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
          <div className="relative mx-auto w-full max-w-[360px]">
            <Image
              src="/images/order-for-recovery.png"
              alt="Order for Recovery from the Traffic Enforcement Centre"
              width={720}
              height={720}
              className="h-auto w-full object-contain"
              sizes="(max-width: 1024px) 90vw, 360px"
            />
          </div>

          <div>
            <div className="mb-3 inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-widest text-brand-blue">
              <DocumentIcon className="h-5 w-5" />
              <span>Order for Recovery – £30</span>
            </div>
            <h2 className="font-display text-[26px] font-bold leading-tight text-brand-text sm:text-[30px]">
              We prepare and submit the application for you
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-brand-text/75">
              You have received an Order for Recovery relating to a council PCN.
              We check deadlines, prepare the correct application and submit it
              to the Traffic Enforcement Centre (TEC) on your behalf.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "We check your deadline",
                "We prepare the correct form",
                "We submit it to the TEC",
              ].map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-3 text-[15px] font-medium text-brand-text"
                >
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-blue text-white">
                    <CheckIcon className="h-3.5 w-3.5" />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
            <Link
              href="/#contact"
              className="mt-7 inline-flex items-center justify-center gap-2 rounded-md bg-brand-blue px-5 py-3 text-[13px] font-semibold uppercase tracking-wide text-white transition hover:bg-brand-blueDark"
            >
              Start Order for Recovery <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
