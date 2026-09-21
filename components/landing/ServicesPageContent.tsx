import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRightIcon,
  CarIcon,
  ChatQuestionIcon,
  CheckIcon,
  CourthouseIcon,
  DocumentIcon,
  GavelIcon,
  PersonShieldIcon,
} from "./Icons";

function AppealDocsCollage() {
  return (
    <div className="relative mx-auto w-full max-w-[380px]">
      <Image
        src="/images/services-appeal-docs.png"
        alt="Penalty Charge Notice, Parking Charge Notice and Charge Certificate"
        width={760}
        height={900}
        className="h-auto w-full object-contain"
        sizes="(max-width: 1024px) 90vw, 380px"
      />
    </div>
  );
}

function OrderEnvelopeVisual() {
  return (
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
  );
}

function ServicePriceCard({
  icon,
  title,
  description,
  price,
  href,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  price: string;
  href: string;
}) {
  return (
    <article className="flex flex-col rounded-xl border border-brand-pink/25 bg-white p-5 text-left shadow-card sm:p-6">
      <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand-pinkLight text-brand-pink">
        {icon}
      </div>
      <h3 className="text-[15px] font-bold text-brand-text">{title}</h3>
      <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-brand-mute">
        {description}
      </p>
      <p className="mt-4 font-display text-[26px] font-bold tracking-tight text-brand-pink">
        {price}
      </p>
      <Link
        href={href}
        className="btn-brand-outline mt-4 !px-3 !py-2.5 !text-[11px]"
      >
        Generate Appeal <ArrowRightIcon className="h-3.5 w-3.5" />
      </Link>
    </article>
  );
}

function ExpertDocCard({
  title,
  description,
  href,
  children,
}: {
  title: string;
  description: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-brand-helpGreen/20 bg-white shadow-card">
      <div className="border-b border-brand-borderSoft bg-white p-3">{children}</div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className="text-[15px] font-bold text-brand-text">{title}</h3>
        <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-brand-mute">
          {description}
        </p>
        <Link
          href={href}
          className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md border border-brand-helpGreen bg-white px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-brand-helpGreen transition hover:bg-brand-helpGreenPale"
        >
          Get Help <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

function MiniDoc({
  heading,
  sub,
  accent,
  pinkPaper,
}: {
  heading: string;
  sub: string;
  accent?: string;
  pinkPaper?: boolean;
}) {
  return (
    <div
      className={`rounded-md p-3 shadow-sm ring-1 ring-black/5 ${
        pinkPaper ? "bg-brand-pinkPale" : "bg-white"
      }`}
    >
      <div
        className={`mb-0.5 text-[10px] font-black uppercase tracking-wide ${accent ?? "text-brand-text"}`}
      >
        {heading}
      </div>
      <div className="mb-2 text-[8px] font-semibold uppercase tracking-widest text-brand-mute">
        {sub}
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-1.5 rounded-sm bg-black/10"
            style={{ width: `${88 - ((i * 5) % 35)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function ServicesPageContent() {
  return (
    <>
      <section className="bg-white pb-10 pt-12 sm:pb-12 sm:pt-14">
        <div className="container-page max-w-3xl text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-brand-pink">
            Our Services
          </p>
          <h1 className="mt-3 font-display text-[34px] font-bold tracking-tight text-brand-text sm:text-[44px]">
            How can we help you?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-brand-mute sm:text-[16px]">
            Simple, affordable solutions for parking tickets, court claims and
            enforcement action. Choose the service that matches your notice.
          </p>
        </div>
      </section>

      {/* Appeal Builder */}
      <section className="bg-white pb-14 sm:pb-16 lg:pb-20">
        <div className="container-page">
          <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 text-brand-pink">
                <DocumentIcon className="h-6 w-6" />
                <span className="text-[13px] font-bold uppercase tracking-widest">
                  Appeal Builder<sup className="text-[9px]">™</sup>
                </span>
              </div>
              <h2 className="font-display text-[26px] font-bold tracking-tight text-brand-text sm:text-[30px]">
                Self-Service Appeals
              </h2>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-brand-mute">
                Answer a few simple questions and we&apos;ll generate your
                professionally drafted appeal instantly. Download and submit it
                yourself.
              </p>

              <div className="mt-8 rounded-2xl bg-brand-pinkPale/70 p-4 sm:p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <ServicePriceCard
                    icon={<CourthouseIcon className="h-5 w-5" />}
                    title="Council PCN"
                    description="Penalty Charge Notice issued by a council."
                    price="£11.99"
                    href="/appeal/upload"
                  />
                  <ServicePriceCard
                    icon={<CarIcon className="h-5 w-5" />}
                    title="Private Parking PCN"
                    description="Parking Charge Notice issued by a private parking company."
                    price="£11.99"
                    href="/appeal/upload"
                  />
                  <ServicePriceCard
                    icon={<DocumentIcon className="h-5 w-5" />}
                    title="Charge Certificate"
                    description="Taken the next step? Challenge your Charge Certificate."
                    price="£4.99"
                    href="/appeal/upload"
                  />
                </div>
              </div>
            </div>

            <div className="lg:pt-6">
              <AppealDocsCollage />
            </div>
          </div>
        </div>
      </section>

      {/* Order for Recovery */}
      <section className="bg-brand-bluePale py-14 sm:py-16 lg:py-20">
        <div className="container-page">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
            <OrderEnvelopeVisual />

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-8">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 text-brand-blue">
                  <GavelIcon className="h-5 w-5" />
                  <span className="text-[13px] font-bold uppercase tracking-widest">
                    Order for Recovery
                  </span>
                </div>
                <h2 className="font-display text-[24px] font-bold leading-tight text-brand-text sm:text-[28px]">
                  We prepare and submit it for you.
                </h2>
                <p className="mt-3 text-[14.5px] leading-relaxed text-brand-text/75">
                  You have received an Order for Recovery relating to a council
                  PCN. We&apos;ll check your deadline, prepare the correct
                  application (TE7/TE9 or PE2/PE3) and submit it to the Traffic
                  Enforcement Centre (TEC) on your behalf.
                </p>
                <p className="mt-5 font-display text-[32px] font-bold tracking-tight text-brand-blue">
                  £30.00
                </p>
                <Link
                  href="/#contact"
                  className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-brand-blue px-5 py-3 text-[12.5px] font-semibold uppercase tracking-wide text-white transition hover:bg-brand-blueDark"
                >
                  Start Order for Recovery{" "}
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div>
                <ul className="space-y-3.5 rounded-xl border border-brand-blue/15 bg-white/80 p-5 sm:p-6">
                  {[
                    "We check your deadline",
                    "We prepare the correct form (TE7/TE9 or PE2/PE3)",
                    "We submit it to the TEC",
                    "No evidence required",
                  ].map((line) => (
                    <li
                      key={line}
                      className="flex items-start gap-3 text-[14px] font-medium text-brand-text"
                    >
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-blue text-white">
                        <CheckIcon className="h-3 w-3" />
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[12.5px] leading-relaxed text-brand-mute">
                  Ideal for both parking and moving traffic PCNs, including TfL
                  (Dart Charge).
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Expert Help */}
      <section className="bg-brand-helpGreenPale py-14 sm:py-16 lg:py-20">
        <div className="container-page">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-12">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 text-brand-helpGreen">
                <PersonShieldIcon className="h-6 w-6" />
                <span className="text-[13px] font-bold uppercase tracking-widest">
                  Expert Help
                </span>
              </div>
              <h2 className="font-display text-[26px] font-bold tracking-tight text-brand-text sm:text-[30px]">
                For more complex situations
              </h2>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-brand-mute">
                For court claims, CCJs and enforcement action, our experienced
                team will handle the paperwork and guide you through the process.
              </p>
              <Link
                href="/#contact"
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-brand-helpGreen px-5 py-3 text-[12.5px] font-semibold uppercase tracking-wide text-white transition hover:bg-brand-helpGreenDark"
              >
                Get Expert Help <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <ExpertDocCard
                title="County Court Claim"
                description="Received official court papers?"
                href="/#contact"
              >
                <MiniDoc heading="Claim Form" sub="County Court Business Centre" />
              </ExpertDocCard>
              <ExpertDocCard
                title="CCJ Set Aside"
                description="A County Court Judgment is affecting your credit record?"
                href="/#contact"
              >
                <MiniDoc heading="Notice of Judgment" sub="County Court" />
              </ExpertDocCard>
              <ExpertDocCard
                title="Bailiff / Enforcement"
                description="Received a Notice of Enforcement or a bailiff letter?"
                href="/#contact"
              >
                <MiniDoc
                  heading="Notice of Enforcement"
                  sub="Taking Control of Goods"
                  accent="text-[#0D7377]"
                  pinkPaper
                />
              </ExpertDocCard>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white py-10 sm:py-12">
        <div className="container-page">
          <div className="flex flex-col items-start gap-5 rounded-2xl border border-brand-border bg-white px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:px-7 sm:py-7">
            <div className="flex items-start gap-4">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-pink text-white">
                <ChatQuestionIcon className="h-6 w-6" />
              </span>
              <div>
                <p className="text-[16px] font-extrabold text-brand-text sm:text-[17px]">
                  Not sure which service you need?
                </p>
                <p className="mt-1 max-w-[520px] text-[13.5px] leading-relaxed text-brand-mute">
                  Upload your notice and we&apos;ll identify the stage of your
                  case and guide you to the right service.
                </p>
              </div>
            </div>
            <Link
              href="/appeal/upload"
              className="btn-brand-primary w-full justify-center sm:w-auto"
            >
              Upload Your Notice <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
