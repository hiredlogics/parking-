"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app/AppHeader";
import { DEMO_SCENARIOS } from "@/lib/demoScenarios";
import { useAppealStore } from "@/features/appeal/store";
import {
  ArrowRightIcon,
  ClockIcon,
  LockIcon,
  ShieldIcon,
} from "@/components/landing/Icons";

export default function StartPage() {
  const router = useRouter();
  const reset = useAppealStore((s) => s.reset);
  const seed = useAppealStore((s) => s.seedFromScenario);

  return (
    <div className="app-shell">
      <AppHeader />
      <main className="container-page py-10 sm:py-14 lg:py-20">
        <div className="mx-auto max-w-3xl">
          <span className="app-badge">
            <ShieldIcon className="h-3.5 w-3.5" /> Secure appeal workflow
          </span>
          <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-brand-text sm:text-4xl lg:text-[42px]">
            Start Your Private
            <br className="hidden sm:block" />{" "}
            <span className="text-brand-pink">Parking Appeal</span>
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-brand-mute">
            Upload your parking notice and answer a few simple questions. We&apos;ll
            build a keeper-safe, professionally drafted appeal you can download
            as PDF and Word.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/appeal/upload"
              className="btn-brand-primary"
              data-testid="start-continue"
            >
              Upload Your Notice <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              onClick={() => reset()}
              className="btn-brand-ghost"
            >
              Reset progress
            </button>
          </div>

          {/* Reassurance strip */}
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="app-card flex items-start gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-pinkLight text-brand-pink">
                <LockIcon className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-[13.5px] font-bold text-brand-text">Secure &amp; confidential</p>
                <p className="mt-0.5 text-[12px] text-brand-mute">Uploaded documents stay private.</p>
              </div>
            </div>
            <div className="app-card flex items-start gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-pinkLight text-brand-pink">
                <ClockIcon className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-[13.5px] font-bold text-brand-text">About 5 minutes</p>
                <p className="mt-0.5 text-[12px] text-brand-mute">Short, focused questionnaire.</p>
              </div>
            </div>
            <div className="app-card flex items-start gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-pinkLight text-brand-pink">
                <ShieldIcon className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-[13.5px] font-bold text-brand-text">Keeper-safe wording</p>
                <p className="mt-0.5 text-[12px] text-brand-mute">Your appeal never identifies a driver.</p>
              </div>
            </div>
          </div>

          {/* How this appeal is built */}
          <div className="app-card mt-8">
            <p className="app-section-title">What happens next</p>
            <ol className="mt-3 space-y-2 text-[14px] text-brand-text">
              {[
                "Upload your parking notice — we'll read the key details.",
                "Confirm or correct the extracted values.",
                "Answer a short set of neutral questions.",
                "Add any supporting evidence (optional).",
                "Review and generate your appeal (PDF + Word).",
              ].map((line, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-pinkLight text-[11px] font-bold text-brand-pink">
                    {i + 1}
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Seeded demo cases */}
        <section className="mt-12 sm:mt-16">
          <div className="mx-auto max-w-3xl">
            <p className="app-section-title">Or try a seeded demo case</p>
            <p className="mt-2 text-[14px] text-brand-mute">
              Skips the upload and pre-fills a realistic parking notice so you
              can jump straight to confirmation.
            </p>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DEMO_SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                data-testid={`demo-${s.id}`}
                onClick={() => {
                  seed({ pcn: s.pcn, answers: s.suggestedAnswers });
                  router.push("/appeal/confirm");
                }}
                className="app-card text-left transition hover:-translate-y-0.5 hover:shadow-cardHover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink"
              >
                <div className="text-[11px] font-bold uppercase tracking-widest text-brand-pink">
                  {s.id.replace(/_/g, " ")}
                </div>
                <div className="mt-1.5 text-[15px] font-bold text-brand-text">{s.label}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-brand-mute">{s.description}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-pink">
                  Use this scenario <ArrowRightIcon className="h-3 w-3" />
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
