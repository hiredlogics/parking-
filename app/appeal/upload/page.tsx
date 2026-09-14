"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/app/AppHeader";
import { ProgressSteps } from "@/components/ProgressSteps";
import { useAppealStore } from "@/features/appeal/store";
import { useCaseSession } from "@/features/appeal/useCaseSession";
import {
  createCase,
  extractNotice,
  isAuthFailure,
} from "@/features/appeal/caseSync";
import { CheckIcon } from "@/components/landing/Icons";

const ACCEPT = "application/pdf,image/jpeg,image/png";
const MAX_BYTES = 12 * 1024 * 1024;

type Status = "idle" | "loading" | "error" | "success";

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const setFileInStore = useAppealStore((s) => s.setFile);
  const setExtraction = useAppealStore((s) => s.setExtraction);
  const setStep = useAppealStore((s) => s.setStep);
  const setCaseId = useAppealStore((s) => s.setCaseId);
  const hydrateFromCase = useAppealStore((s) => s.hydrateFromCase);

  // Resume an in-progress case if the customer already has one. A new
  // case is created on first upload rather than on page view, so simply
  // visiting the page does not litter the database.
  useCaseSession();

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setFileName(file.name);
      setFileSize(file.size);
      if (!/(pdf|jpeg|jpg|png)$/i.test(file.type) && !/\.(pdf|jpe?g|png)$/i.test(file.name)) {
        setStatus("error");
        setError("Unsupported file type. Please upload a PDF, JPG or PNG.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setStatus("error");
        setError(`File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max 12 MB.`);
        return;
      }
      setStatus("loading");
      try {
        const buf = await file.arrayBuffer();
        setFileInStore({
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          base64: arrayBufferToBase64(buf),
        });

        // The case must exist first: extraction is authenticated and
        // bound to a case, so there is nothing to charge an AI call to
        // until we have one.
        const created = await createCase();
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

        const read = await extractNotice(newCase.id, file);
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
        // Small delay so the customer sees the success state before we route away.
        setTimeout(() => router.push("/appeal/confirm"), 400);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Extraction failed. Please try again.");
      }
    },
    [router, setExtraction, setFileInStore, setStep, setCaseId, hydrateFromCase],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  };

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const dropzoneClass = [
    "flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition",
    dragOver
      ? "border-brand-pink bg-brand-pinkLight"
      : status === "loading"
        ? "border-brand-pink/60 bg-brand-pinkPale"
        : status === "success"
          ? "border-brand-green/60 bg-white"
          : "border-brand-border bg-white hover:border-brand-pink/60 hover:bg-brand-pinkPale",
  ].join(" ");

  return (
    <div className="app-shell flex min-h-screen flex-col">
      <AppHeader />
      <ProgressSteps current="upload" />
      <main className="container-page flex flex-1 flex-col items-center justify-center py-8 sm:py-10">
        <div className="mx-auto w-full max-w-2xl text-center">
          <h1 className="text-[26px] font-black leading-tight tracking-tight text-brand-text sm:text-[32px]">
            Upload Your Parking Notice
          </h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-brand-mute">
            Drag &amp; drop or choose a file. Accepted formats: PDF, JPG, PNG. Max 12 MB.
          </p>

          <label
            htmlFor="pcn-file"
            data-testid="dropzone"
            className={`mt-6 ${dropzoneClass}`}
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
              onChange={onInputChange}
              className="sr-only"
            />
            {status === "loading" ? (
              <>
                <Spinner />
                <p className="mt-4 text-sm text-brand-text">
                  Extracting details from{" "}
                  <span className="font-semibold">{fileName}</span>…
                </p>
                <p className="mt-1 text-xs text-brand-mute">
                  This usually takes 3–10 seconds.
                </p>
              </>
            ) : status === "success" ? (
              <>
                <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-green text-white">
                  <CheckIcon className="h-6 w-6" />
                </div>
                <p className="text-base font-semibold text-brand-text">
                  Notice read successfully
                </p>
                <p className="mt-1 text-xs text-brand-mute">
                  Taking you to review the details…
                </p>
              </>
            ) : (
              <>
                <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-pinkLight text-brand-pink">
                  <UploadArrow />
                </div>
                <p className="text-base font-semibold text-brand-text">
                  {fileName ? `Selected: ${fileName}` : "Drag & drop your notice here"}
                </p>
                <p className="mt-1 text-xs text-brand-mute">or click to choose a file</p>
                <span className="btn-brand-outline mt-4">Choose File</span>
                <p className="mt-3 text-[11px] text-brand-mute">
                  PDF · JPG · PNG · up to 12 MB
                </p>
              </>
            )}
          </label>

          {status === "error" && error && (
            <div
              role="alert"
              data-testid="upload-error"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
            >
              <p className="font-semibold">Upload failed</p>
              <p className="mt-1 text-red-800/85">{error}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="btn-brand-outline"
                  onClick={() => {
                    setStatus("idle");
                    setError(null);
                    inputRef.current?.click();
                  }}
                >
                  Retry
                </button>
                <Link href="/" className="btn-brand-ghost">
                  Back
                </Link>
              </div>
            </div>
          )}

          {fileName && status !== "success" && (
            <div className="app-card mt-6 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="app-section-title">Selected file</p>
                <p className="mt-1 truncate text-[14px] font-semibold text-brand-text">
                  {fileName}
                </p>
                {fileSize != null && (
                  <p className="mt-0.5 text-[12px] text-brand-mute">
                    {(fileSize / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>
              {status !== "loading" && (
                <button
                  type="button"
                  onClick={() => {
                    setFileName(null);
                    setFileSize(null);
                    setStatus("idle");
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                  className="text-[12px] font-semibold uppercase tracking-wide text-brand-mute hover:text-brand-text"
                >
                  Remove
                </button>
              )}
            </div>
          )}

          <div className="mt-8 flex justify-center">
            <Link href="/" className="btn-brand-ghost">
              ← Back
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function Spinner() {
  return (
    <div
      aria-label="Loading"
      role="status"
      className="h-8 w-8 animate-spin rounded-full border-2 border-brand-pinkLight border-t-brand-pink"
    />
  );
}

function UploadArrow() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  if (typeof btoa !== "undefined") return btoa(s);
  return Buffer.from(bytes).toString("base64");
}
