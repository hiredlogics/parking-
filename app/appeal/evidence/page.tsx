"use client";

import { useMemo, useRef, useState, type ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { JourneyHeader } from "@/components/app/JourneyHeader";
import { ProgressSteps } from "@/components/ProgressSteps";
import { FactGapQuestions } from "@/components/appeal/FactGapQuestions";
import { useAppealStore } from "@/features/appeal/store";
import { useCaseSession } from "@/features/appeal/useCaseSession";
import {
  fetchCase,
  removeEvidence,
  saveKeeperProfile,
  uploadEvidence,
} from "@/features/appeal/caseSync";
import {
  KeeperDetailsForm,
  keeperProfileFrom,
  needsKeeperDetails,
} from "@/features/appeal/KeeperDetails";
import {
  evidenceTypesForScenarios,
  type EvidenceItem,
  type EvidenceType,
} from "@/types";
import {
  ArrowRightIcon,
  CarIcon,
  CheckIcon,
  DocumentIcon,
  PersonShieldIcon,
  ShieldIcon,
} from "@/components/landing/Icons";

interface Category {
  type: EvidenceType;
  title: string;
  description: string;
  icon: ReactElement;
}

const CATEGORY_META: Record<
  EvidenceType,
  { title: string; description: string; icon: "doc" | "shield" | "person" | "car" }
> = {
  payment_receipt: {
    title: "Payment receipt",
    description: "Bank statement, till receipt, or PDF confirmation.",
    icon: "doc",
  },
  app_screenshot: {
    title: "App screenshot",
    description: "Screenshot from the parking app showing the transaction.",
    icon: "doc",
  },
  permit: {
    title: "Permit / resident pass",
    description: "The permit, tenancy clause, or pass that was in force.",
    icon: "shield",
  },
  signage_photo: {
    title: "Signage photograph",
    description: "Photo of the entrance sign or specific term at the site.",
    icon: "doc",
  },
  authorisation_evidence: {
    title: "Authorisation / tenancy evidence",
    description: "Letter, email, lease or record showing the vehicle was authorised.",
    icon: "person",
  },
  anpr_evidence: {
    title: "ANPR / timing evidence",
    description: "Independent evidence of arrival, exit or time on site.",
    icon: "car",
  },
  location_evidence: {
    title: "Location evidence",
    description: "Map, address confirmation, or other location proof.",
    icon: "doc",
  },
  breakdown_evidence: {
    title: "Breakdown / recovery evidence",
    description: "Recovery report, breakdown attendance, or repair invoice.",
    icon: "car",
  },
  other: {
    title: "Other supporting evidence",
    description: "Anything else you would like the operator to consider.",
    icon: "doc",
  },
};

function iconFor(kind: "doc" | "shield" | "person" | "car") {
  switch (kind) {
    case "shield":
      return <ShieldIcon className="h-6 w-6" />;
    case "person":
      return <PersonShieldIcon className="h-6 w-6" />;
    case "car":
      return <CarIcon className="h-6 w-6" />;
    default:
      return <DocumentIcon className="h-6 w-6" />;
  }
}

export default function EvidencePage() {
  const router = useRouter();
  const evidence = useAppealStore((s) => s.evidence);
  const adaptiveAnswers = useAppealStore((s) => s.adaptiveAnswers);
  const confirmed = useAppealStore((s) => s.confirmed);
  const setAdaptiveAnswers = useAppealStore((s) => s.setAdaptiveAnswers);
  const remove = useAppealStore((s) => s.removeEvidence);
  const setStep = useAppealStore((s) => s.setStep);
  const hydrateFromCase = useAppealStore((s) => s.hydrateFromCase);
  const [uploadingType, setUploadingType] = useState<EvidenceType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { caseId } = useCaseSession();

  /*
   * What happened, in the customer's own words.
   *
   * Some grounds cannot be reached any other way. A notice records the
   * allegation, not the circumstances, so nothing on it can reveal a
   * breakdown, a residential right or a disability — the operator had no
   * reason to write those down. This box is the only channel for them.
   *
   * It is not a menu of appeal reasons. The text is classified into
   * circumstance tags (lib/reasoning/narrative.ts) which the issue
   * engine treats as one input among the notice facts; the customer
   * describes events and the system decides the grounds.
   */
  const [situation, setSituation] = useState(
    typeof adaptiveAnswers.situation_other === "string"
      ? adaptiveAnswers.situation_other
      : "",
  );
  const [savingSituation, setSavingSituation] = useState(false);
  /*
   * Bumped after anything that can change which issues are live, to
   * remount the question component so it re-asks against the new set.
   */
  const [factsNonce, setFactsNonce] = useState(0);

  const saveSituation = async () => {
    if (!caseId) return;
    setSavingSituation(true);
    setError(null);
    const res = await saveKeeperProfile(caseId, { situation_other: situation });
    setSavingSituation(false);
    if (!res.ok) {
      setError(res.message || "We could not save that.");
      return;
    }
    setAdaptiveAnswers(res.data.adaptiveAnswers);
    setFactsNonce((n) => n + 1);
  };

  /*
   * An answered fact can open an issue, and an open issue changes which
   * uploads are worth suggesting, so pull the case back down.
   */
  const refreshCase = async () => {
    if (!caseId) return;
    const res = await fetchCase(caseId);
    if (res.ok) hydrateFromCase(res.data.case);
  };

  /*
   * The keeper's name and address, collected here because the letter is
   * addressed FROM them and nothing else can supply it: a windscreen
   * ticket does not carry the keeper's details, and no document the
   * customer uploads does either. This is the one piece of typed input
   * the pipeline genuinely cannot derive.
   */
  const needsKeeper = needsKeeperDetails(
    adaptiveAnswers,
    confirmed?.notice_route,
  );

  const categories: Category[] = useMemo(() => {
    const types = evidenceTypesForScenarios(adaptiveAnswers.scenarios);
    // Keep any already-uploaded types visible even if not in the suggestion set.
    const uploaded = new Set(evidence.map((e) => e.type));
    const ordered = [...types];
    for (const t of uploaded) {
      if (!ordered.includes(t)) ordered.splice(ordered.length - 1, 0, t);
    }
    return ordered.map((type) => {
      const meta = CATEGORY_META[type];
      return {
        type,
        title: meta.title,
        description: meta.description,
        icon: iconFor(meta.icon),
      };
    });
  }, [adaptiveAnswers.scenarios, evidence]);

  const onFile = async (type: EvidenceType, file: File) => {
    setError(null);
    setUploadingType(type);
    try {
      if (!caseId) {
        throw new Error("Please start your appeal before uploading evidence.");
      }
      const uploaded = await uploadEvidence(caseId, {
        file,
        evidenceType: type,
      });
      if (!uploaded.ok) {
        throw new Error(uploaded.message || "We could not upload that file.");
      }
      hydrateFromCase(uploaded.data.case);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingType(null);
    }
  };

  const onRemove = async (id: string) => {
    setError(null);
    if (!caseId) {
      remove(id);
      return;
    }
    const res = await removeEvidence(caseId, id);
    if (!res.ok) {
      setError(res.message || "We could not remove that file.");
      return;
    }
    hydrateFromCase(res.data.case);
  };

  const onContinue = () => {
    if (needsKeeper) {
      setError(
        "Please add the registered keeper's name and address — the appeal letter is sent in their name.",
      );
      return;
    }
    setStep("review");
    router.push("/appeal/review");
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <JourneyHeader />
      <ProgressSteps current="evidence" />
      <main className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6">
            <h1 className="text-[22px] font-bold tracking-tight text-brand-text sm:text-[26px]">
              Add supporting evidence
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-brand-mute">
              Based on your situation, these are the most helpful uploads. You can skip this if you have nothing to add.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              data-testid="evidence-error"
              className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
            >
              {error}
            </div>
          )}

          {caseId && (
            <section
              className="mb-6 rounded-2xl border border-brand-border bg-brand-canvas p-4 sm:p-5"
              data-testid="situation-section"
            >
              <h2 className="text-[16px] font-bold text-brand-text">
                In your own words, what happened?
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-brand-mute">
                Your notice tells us what you&apos;re accused of, but not the
                circumstances. If the car broke down, you live there, or
                something else was going on, tell us here — we&apos;ll work out
                which grounds that opens.
              </p>
              <textarea
                value={situation}
                onChange={(e) => setSituation(e.target.value)}
                rows={4}
                data-testid="situation-input"
                className="mt-3 w-full rounded-xl border border-brand-border bg-white px-3 py-2.5 text-[14px] leading-relaxed text-brand-text"
                placeholder="For example: the car wouldn't start and I had to wait for recovery."
              />
              <button
                type="button"
                onClick={() => void saveSituation()}
                disabled={savingSituation}
                data-testid="situation-save"
                className="btn-brand-outline mt-3 disabled:opacity-50"
              >
                {savingSituation ? "Saving…" : "Save"}
              </button>
            </section>
          )}

          {caseId && (
            <FactGapQuestions
              key={factsNonce}
              caseId={caseId}
              onAnswered={() => void refreshCase()}
            />
          )}

          {needsKeeper && caseId && (
            <section
              className="mb-6 rounded-2xl border border-brand-border bg-brand-canvas p-4 sm:p-5"
              data-testid="keeper-details-section"
            >
              <h2 className="text-[16px] font-bold text-brand-text">
                Registered keeper details
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-brand-mute">
                Your appeal letter is sent in the registered keeper&apos;s name,
                so we need these before we can produce it.
              </p>
              <KeeperDetailsForm
                caseId={caseId}
                windscreen={confirmed?.notice_route === "WINDSCREEN"}
                initial={keeperProfileFrom(adaptiveAnswers)}
                heading={false}
                submitLabel="Save keeper details"
                className="flex flex-col"
                onSaved={(answers) => {
                  setAdaptiveAnswers(answers);
                  setError(null);
                }}
              />
            </section>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {categories.map((c) => {
              const filesForCategory = evidence.filter((e) => e.type === c.type);
              return (
                <CategoryCard
                  key={c.type}
                  category={c}
                  files={filesForCategory}
                  uploading={uploadingType === c.type}
                  onFile={(f) => onFile(c.type, f)}
                  onRemove={onRemove}
                />
              );
            })}
          </div>

          <p className="mt-6 text-center text-[13px] text-brand-mute">
            {evidence.length === 0
              ? "You can skip this step if you don't have any evidence."
              : `${evidence.length} file${evidence.length === 1 ? "" : "s"} added.`}
          </p>

          <div className="mt-8 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/appeal/confirm" className="btn-brand-ghost">
              Back
            </Link>
            <button
              type="button"
              className="btn-brand-primary"
              onClick={onContinue}
              data-testid="evidence-continue"
            >
              Continue to Review <ArrowRightIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function CategoryCard({
  category,
  files,
  uploading,
  onFile,
  onRemove,
}: {
  category: Category;
  files: EvidenceItem[];
  uploading: boolean;
  onFile: (f: File) => void;
  onRemove: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="app-card flex h-full flex-col">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-pinkLight text-brand-pink">
          {category.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-brand-text">{category.title}</p>
          <p className="mt-1 text-[13px] text-brand-mute">{category.description}</p>
        </div>
      </div>

      <div className="mt-4 flex-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf,text/plain"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              onFile(f);
              e.target.value = "";
            }
          }}
          data-testid={`evidence-file-${category.type}`}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="btn-brand-outline w-full justify-center"
          data-testid={`evidence-upload-${category.type}`}
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>

        {files.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-[13px]">
            {files.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-brand-borderSoft bg-brand-canvas px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-green text-white">
                    <CheckIcon className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 truncate text-brand-text">
                    {e.fileName}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(e.id)}
                  className="text-[11px] font-semibold uppercase tracking-wide text-brand-mute hover:text-red-500"
                  data-testid={`evidence-remove-${e.id}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
