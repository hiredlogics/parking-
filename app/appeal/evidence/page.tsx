"use client";

import { useRef, useState, type ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app/AppHeader";
import { ProgressSteps } from "@/components/ProgressSteps";
import { useAppealStore } from "@/features/appeal/store";
import { useCaseSession } from "@/features/appeal/useCaseSession";
import { removeEvidence, uploadEvidence } from "@/features/appeal/caseSync";
import type { EvidenceItem, EvidenceType } from "@/types";
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

const CATEGORIES: Category[] = [
  {
    type: "payment_receipt",
    title: "Payment receipt",
    description: "Bank statement, till receipt, or PDF confirmation.",
    icon: <DocumentIcon className="h-6 w-6" />,
  },
  {
    type: "app_screenshot",
    title: "App screenshot",
    description: "Screenshot from the parking app showing the transaction.",
    icon: <DocumentIcon className="h-6 w-6" />,
  },
  {
    type: "permit",
    title: "Permit",
    description: "The permit that was in force for the vehicle.",
    icon: <ShieldIcon className="h-6 w-6" />,
  },
  {
    type: "signage_photo",
    title: "Signage photograph",
    description: "Photo of the entrance sign or specific term at the site.",
    icon: <DocumentIcon className="h-6 w-6" />,
  },
  {
    type: "authorisation_evidence",
    title: "Authorisation evidence",
    description: "Letter, email, or record showing the vehicle was authorised.",
    icon: <PersonShieldIcon className="h-6 w-6" />,
  },
  {
    type: "anpr_evidence",
    title: "ANPR evidence",
    description: "Independent evidence the vehicle was elsewhere / left.",
    icon: <CarIcon className="h-6 w-6" />,
  },
  {
    type: "location_evidence",
    title: "Location evidence",
    description: "Map, address confirmation, or other location proof.",
    icon: <DocumentIcon className="h-6 w-6" />,
  },
  {
    type: "other",
    title: "Other evidence",
    description: "Anything else you'd like the operator to consider.",
    icon: <DocumentIcon className="h-6 w-6" />,
  },
];

export default function EvidencePage() {
  const router = useRouter();
  const evidence = useAppealStore((s) => s.evidence);
  const remove = useAppealStore((s) => s.removeEvidence);
  const setStep = useAppealStore((s) => s.setStep);
  const hydrateFromCase = useAppealStore((s) => s.hydrateFromCase);
  const [uploadingType, setUploadingType] = useState<EvidenceType | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Evidence metadata is bound to the server case, so it survives a refresh.
  const { caseId } = useCaseSession();

  const onFile = async (type: EvidenceType, file: File) => {
    setError(null);
    setUploadingType(type);
    try {
      if (!caseId) {
        throw new Error("Please start your appeal before uploading evidence.");
      }
      // A single authenticated call validates, stores and attaches the
      // file. The browser never sees or supplies a storage key.
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
    setStep("review");
    router.push("/appeal/review");
  };

  return (
    <div className="app-shell">
      <AppHeader />
      <ProgressSteps current="evidence" />
      <main className="container-page py-8 sm:py-10 lg:py-12">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <span className="app-badge">
              <ShieldIcon className="h-3.5 w-3.5" /> Step 4 of 6
            </span>
            <h1 className="mt-3 text-[26px] font-black tracking-tight text-brand-text sm:text-[32px]">
              Add Supporting Evidence
            </h1>
            <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-brand-mute">
              Upload any evidence that supports your appeal. Anything you add
              here will be referenced in the final appeal.
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {CATEGORIES.map((c) => {
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
            <Link href="/appeal/questions" className="btn-brand-ghost">
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
