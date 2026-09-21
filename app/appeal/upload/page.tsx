"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { JourneyHeader } from "@/components/app/JourneyHeader";
import { ProgressSteps } from "@/components/ProgressSteps";
import { useAppealStore } from "@/features/appeal/store";
import { useCaseSession } from "@/features/appeal/useCaseSession";
import {
  createCase,
  extractNotice,
  isAuthFailure,
} from "@/features/appeal/caseSync";

const ACCEPT = "application/pdf,image/jpeg,image/png";
const MAX_BYTES = 10 * 1024 * 1024;
const COMPRESS_OVER_BYTES = 900 * 1024;

type Status = "idle" | "loading" | "error" | "success";

const READING_CHECKS = [
  "Identifying parking company",
  "Reading notice details",
  "Extracting key information",
] as const;

/**
 * Upload — same composition on mobile and desktop (centered single column).
 * Matches the client mobile mockup; desktop only widens the content rail.
 */
export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [checksVisible, setChecksVisible] = useState(0);
  const setFileInStore = useAppealStore((s) => s.setFile);
  const setExtraction = useAppealStore((s) => s.setExtraction);
  const setStep = useAppealStore((s) => s.setStep);
  const setCaseId = useAppealStore((s) => s.setCaseId);
  const hydrateFromCase = useAppealStore((s) => s.hydrateFromCase);

  useCaseSession();

  useEffect(() => {
    router.prefetch("/appeal/confirm");
  }, [router]);

  useEffect(() => {
    if (status !== "loading") {
      setChecksVisible(0);
      return;
    }
    setChecksVisible(1);
    const t1 = window.setTimeout(() => setChecksVisible(2), 500);
    const t2 = window.setTimeout(() => setChecksVisible(3), 1100);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [status]);

  const startExtraction = useCallback(
    async (file: File) => {
      setError(null);
      setFileName(file.name);
      setPendingFile(file);
      if (!/(pdf|jpeg|jpg|png)$/i.test(file.type) && !/\.(pdf|jpe?g|png)$/i.test(file.name)) {
        setStatus("error");
        setError("Unsupported file type. Please upload a PDF, JPG or PNG.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setStatus("error");
        setError(`File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max 10 MB.`);
        return;
      }

      setStatus("loading");

      try {
        const [created, uploadFile] = await Promise.all([
          createCase(),
          prepareUploadFile(file),
        ]);

        setFileInStore({
          name: uploadFile.name,
          mimeType: uploadFile.type || "application/octet-stream",
          sizeBytes: uploadFile.size,
        });

        if (!created.ok) {
          if (isAuthFailure(created.code)) {
            router.push(`/signin?next=${encodeURIComponent("/appeal/upload")}`);
            return;
          }
          throw new Error(
            created.message || "We could not start your case. Please try again.",
          );
        }
        const newCase = created.data.case;
        setCaseId(newCase.id, newCase.publicId);

        const read = await extractNotice(newCase.id, uploadFile);
        if (!read.ok) {
          if (isAuthFailure(read.code)) {
            router.push(`/signin?next=${encodeURIComponent("/appeal/upload")}`);
            return;
          }
          throw new Error(read.message);
        }
        setExtraction(read.data.extraction);
        hydrateFromCase(read.data.case);

        setStep("confirm");
        setStatus("success");
        router.push("/appeal/confirm");
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Extraction failed. Please try again.");
      }
    },
    [router, setExtraction, setFileInStore, setStep, setCaseId, hydrateFromCase],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setPendingFile(f);
      setFileName(f.name);
      setError(null);
      void startExtraction(f);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void startExtraction(f);
  };

  const onUploadClick = () => {
    if (pendingFile && status === "idle") {
      void startExtraction(pendingFile);
      return;
    }
    inputRef.current?.click();
  };

  if (status === "loading" || status === "success") {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <JourneyHeader />
        <ProgressSteps current="confirm" />
        <ReadingScreen checksVisible={checksVisible} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <JourneyHeader />
      <ProgressSteps current="upload" />

      <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col px-5 pb-8 pt-6 sm:max-w-[480px] sm:px-6 sm:pt-8 md:max-w-[520px] md:pt-10">
        {/* Title — always centered like the mobile mockup */}
        <div className="text-center">
          <h1 className="text-[22px] font-bold leading-[1.25] tracking-tight text-brand-text sm:text-[26px]">
            Upload your Private Parking Notice
          </h1>
          <p className="mx-auto mt-2.5 max-w-[340px] text-[14px] leading-relaxed text-brand-mute sm:max-w-none sm:text-[15px]">
            Upload a clear photo or PDF of your notice and we&apos;ll extract the key details for you.
          </p>
        </div>

        {/* Dropzone */}
        <label
          htmlFor="pcn-file"
          data-testid="dropzone"
          className={[
            "mt-7 flex min-h-[168px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-8 text-center transition sm:mt-8 sm:min-h-[200px] sm:py-10",
            dragOver
              ? "border-brand-pink bg-brand-pinkLight"
              : "border-[#F5A3C7] bg-[#FDF2F7] hover:border-brand-pink hover:bg-brand-pinkLight",
          ].join(" ")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            id="pcn-file"
            data-testid="pcn-file-input"
            type="file"
            accept={ACCEPT}
            capture="environment"
            onChange={onInputChange}
            className="sr-only"
          />
          <CloudUploadIcon />
          <p className="mt-3 max-w-[260px] text-[14px] font-semibold leading-snug text-brand-text sm:max-w-none sm:text-[15px]">
            {fileName
              ? `Selected: ${fileName}`
              : "Drag and drop your file here or click to upload"}
          </p>
          <p className="mt-1.5 text-[12px] text-brand-mute sm:text-[13px]">
            Accepted formats: JPG, PNG, PDF (Max 10MB)
          </p>
        </label>

        {status === "error" && error && (
          <div
            role="alert"
            data-testid="upload-error"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          >
            <p className="font-semibold">Upload failed</p>
            <p className="mt-1 text-red-800/85">{error}</p>
            <button
              type="button"
              className="mt-3 text-[13px] font-semibold text-brand-pink"
              onClick={() => {
                setStatus("idle");
                setError(null);
                inputRef.current?.click();
              }}
            >
              Try again
            </button>
          </div>
        )}

        {/* Example notices — 4 across, same on phone and desktop */}
        <div className="mt-7 grid grid-cols-4 gap-2.5 sm:mt-8 sm:gap-3">
          {EXAMPLE_NOTICES.map((n) => (
            <div key={n.label} className="flex flex-col items-center gap-1.5">
              <div
                className={[
                  "relative aspect-[3/4] w-full overflow-hidden rounded-[6px] border border-brand-borderSoft bg-white shadow-sm",
                  n.highlight ? "ring-1 ring-[#F5D76E]" : "",
                ].join(" ")}
              >
                {n.image ? (
                  <Image
                    src={n.image}
                    alt={n.label}
                    fill
                    className="object-cover object-top"
                    sizes="(max-width: 520px) 22vw, 110px"
                  />
                ) : (
                  <div className={`flex h-full w-full items-start justify-center pt-1.5 ${n.tint}`}>
                    <MiniDoc tint={n.docTint} />
                  </div>
                )}
              </div>
              <span className="text-center text-[9px] font-medium leading-tight text-brand-text sm:text-[10px]">
                {n.label}
              </span>
            </div>
          ))}
        </div>

        {/* Trust line */}
        <div className="mt-6 flex items-center justify-center gap-2 px-1 sm:mt-7">
          <ShieldCheckIcon />
          <p className="text-[12px] leading-snug text-brand-mute sm:text-[13px]">
            Your information is secure and used only to generate your appeal.
          </p>
        </div>

        {/* CTA — same full-width pink button in flow (not a weird side column) */}
        <div className="mt-8 sm:mt-10">
          <button
            type="button"
            onClick={onUploadClick}
            className="flex w-full items-center justify-center rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-brand-pinkDark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink focus-visible:ring-offset-2 active:bg-brand-pinkDark"
          >
            Upload notice
          </button>
          <div className="mt-3 text-center">
            <Link href="/" className="text-[13px] font-medium text-brand-mute hover:text-brand-text">
              ← Back
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function ReadingScreen({ checksVisible }: { checksVisible: number }) {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col items-center px-5 pb-10 pt-10 sm:max-w-[480px] sm:px-6 sm:pt-14 md:max-w-[520px]">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-brand-pinkLight sm:h-[100px] sm:w-[100px]">
          <DocumentIcon />
        </div>
        <div className="mt-6" aria-label="Loading" role="status">
          <ReadingSpinner />
        </div>
        <h1 className="mt-6 text-[22px] font-bold tracking-tight text-brand-text sm:text-[24px]">
          We&apos;re reading your notice...
        </h1>
        <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-brand-mute">
          Our system is extracting the key details from your notice. This only takes a few seconds.
        </p>
      </div>

      <div className="mt-10 w-full rounded-2xl bg-brand-pinkPale px-5 py-4 sm:mt-auto sm:px-6 sm:py-5">
        <ul className="space-y-3">
          {READING_CHECKS.map((label, i) => {
            const done = i < checksVisible;
            return (
              <li
                key={label}
                className={[
                  "flex items-center gap-3 text-[14px] font-medium transition-opacity duration-300",
                  done ? "text-brand-text opacity-100" : "text-brand-mute/50 opacity-60",
                ].join(" ")}
              >
                <span
                  className={[
                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                    done ? "bg-brand-pink text-white" : "bg-white text-brand-mute/40",
                  ].join(" ")}
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path d="M5 12l4.5 4.5L20 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {label}
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}

async function prepareUploadFile(file: File): Promise<File> {
  if (!/^image\/(jpeg|jpg|png)$/i.test(file.type)) return file;
  if (file.size <= COMPRESS_OVER_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82),
    );
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "notice";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

function ReadingSpinner() {
  return (
    <svg className="h-10 w-10 animate-spin" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="16" stroke="#E5E7EB" strokeWidth="3.5" />
      <path d="M20 4a16 16 0 0 1 16 16" stroke="#EC1573" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

function CloudUploadIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 text-brand-pink" fill="none" aria-hidden="true">
      <path
        d="M14 32h-1.5A8.5 8.5 0 0 1 14.2 15.2 10.5 10.5 0 0 1 34.5 18 7.5 7.5 0 0 1 36 33h-2"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 34V22m0 0l-5 5m5-5l5 5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-11 w-11 text-brand-text" fill="none" aria-hidden="true">
      <path
        d="M14 8h14l8 8v24a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M28 8v8h8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M18 24h12M18 30h12M18 36h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-brand-pink" fill="currentColor" aria-hidden="true">
      <path d="M12 2l7 3v6c0 5-3.4 9.4-7 11-3.6-1.6-7-6-7-11V5l7-3z" />
      <path
        d="M9.2 11.8l1.9 1.9 3.8-3.9"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const EXAMPLE_NOTICES: Array<{
  label: string;
  tint: string;
  docTint: string;
  highlight?: boolean;
  image?: string;
}> = [
  { label: "Parking Charge Notice", tint: "bg-white", docTint: "text-brand-mute" },
  {
    label: "Notice to Keeper",
    tint: "bg-[#FFF3B0]",
    docTint: "text-brand-text",
    highlight: true,
    image: "/examples/notice-to-keeper.png",
  },
  { label: "Reminder Notice", tint: "bg-white", docTint: "text-brand-mute" },
  { label: "Final Notice", tint: "bg-white", docTint: "text-brand-mute" },
];

function MiniDoc({ tint }: { tint: string }) {
  return (
    <svg viewBox="0 0 40 52" className={`h-[88%] w-[72%] ${tint}`} fill="none" aria-hidden="true">
      <rect x="1" y="1" width="38" height="50" rx="2" fill="white" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 14h24M8 20h24M8 26h16M8 32h20M8 38h12"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}
