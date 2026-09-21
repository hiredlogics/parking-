"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { JourneyHeader } from "@/components/app/JourneyHeader";
import { ProgressSteps } from "@/components/ProgressSteps";
import { useAppealStore } from "@/features/appeal/store";
import { useCaseSession } from "@/features/appeal/useCaseSession";
import { confirmCase } from "@/features/appeal/caseSync";
import type { CaseStage, ExtractedPcn, NoticeRoute } from "@/types";

/** Primary fields shown on the check-details card (matches mockup). */
const PRIMARY_FIELDS: {
  key: keyof ExtractedPcn;
  label: string;
  type: "text" | "date" | "number";
  format?: "currency" | "dateUk";
}[] = [
  { key: "operator_name", label: "Parking company", type: "text" },
  { key: "pcn_number", label: "PCN reference number", type: "text" },
  { key: "vrm", label: "Vehicle registration", type: "text" },
  { key: "parking_event_date", label: "Date of parking event", type: "date", format: "dateUk" },
  { key: "parking_location", label: "Location", type: "text" },
  { key: "charge_amount", label: "Amount", type: "number", format: "currency" },
];

/** Extra fields revealed when customer says details are incorrect. */
const EXTRA_FIELDS: {
  key: keyof ExtractedPcn;
  label: string;
  type: "text" | "date" | "number" | "select";
  options?: Array<{ value: string; label: string }>;
}[] = [
  { key: "notice_issue_date", label: "Notice issue date", type: "date" },
  { key: "notice_received_date", label: "Notice received date", type: "date" },
  {
    key: "notice_route",
    label: "How was the notice served?",
    type: "select",
    options: [
      { value: "POSTAL", label: "Posted (Notice to Keeper)" },
      { value: "WINDSCREEN", label: "Placed on vehicle" },
      { value: "UNKNOWN", label: "Not sure" },
    ],
  },
  { key: "vehicle_make", label: "Vehicle make", type: "text" },
  { key: "alleged_breach", label: "Alleged breach", type: "text" },
  { key: "entry_time", label: "Entry time", type: "text" },
  { key: "exit_time", label: "Exit time", type: "text" },
  { key: "total_recorded_duration", label: "Recorded duration (minutes)", type: "number" },
];

export default function ConfirmPage() {
  const router = useRouter();
  const extraction = useAppealStore((s) => s.extraction);
  const updateField = useAppealStore((s) => s.updateExtractedField);
  const setConfirmed = useAppealStore((s) => s.setConfirmedPcn);
  const setStep = useAppealStore((s) => s.setStep);
  const hydrateFromCase = useAppealStore((s) => s.hydrateFromCase);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState<keyof ExtractedPcn | null>(null);
  const [showAllFields, setShowAllFields] = useState(false);

  const { caseId, status: sessionStatus } = useCaseSession();
  const values = useMemo(() => extraction?.raw ?? {}, [extraction]);

  if (sessionStatus === "loading") {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <JourneyHeader />
        <ProgressSteps current="confirm" />
        <main className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6">
          <div className="h-40 animate-pulse rounded-2xl bg-brand-pinkPale" />
        </main>
      </div>
    );
  }

  if (!extraction) {
    return (
      <div className="flex min-h-screen flex-col bg-white">
        <JourneyHeader />
        <ProgressSteps current="confirm" />
        <main className="mx-auto w-full max-w-lg px-4 py-10 text-center sm:px-6">
          <h1 className="text-[22px] font-bold text-brand-text">Upload your notice first</h1>
          <p className="mt-2 text-[14px] text-brand-mute">
            Please upload your PCN so we can extract the key details for you to confirm.
          </p>
          <Link
            href="/appeal/upload"
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white"
          >
            Go to upload
          </Link>
        </main>
      </div>
    );
  }

  const saveAndContinue = async () => {
    const required = ["operator_name", "pcn_number", "vrm", "parking_location", "parking_event_date"] as const;
    const missing = required.filter((k) => !values[k]);
    if (missing.length > 0) {
      setError(`Please provide: ${missing.map(labelFor).join(", ")}`);
      setShowAllFields(true);
      return;
    }
    setError(null);
    const confirmed = {
      ...(values as ExtractedPcn),
      // Normalise route so the next step can decide on keeper details.
      notice_route: (values.notice_route ?? "UNKNOWN") as NoticeRoute,
      case_stage: "INITIAL_OPERATOR_APPEAL" as const,
      confirmedAt: new Date().toISOString(),
    };
    setConfirmed(confirmed);

    if (caseId) {
      setSaving(true);
      const saved = await confirmCase(caseId, confirmed);
      setSaving(false);
      if (!saved.ok) {
        setError(saved.message || "We could not save your confirmation.");
        return;
      }
      hydrateFromCase(saved.data.case);
    }

    setStep("questions");
    router.push("/appeal/questions");
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <JourneyHeader />
      <ProgressSteps current="confirm" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-8 pt-6 sm:px-6 sm:pt-8">
        <div className="text-center sm:text-left">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-brand-text sm:text-[26px]">
            Check your details
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-brand-mute">
            We&apos;ve extracted the following information from your notice. Please check and amend if needed.
          </p>
        </div>

        {extraction.warnings && extraction.warnings.length > 0 && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
          >
            {extraction.warnings.map((w) => (
              <p key={w} className="leading-snug">
                {w}
              </p>
            ))}
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-2xl bg-brand-pinkPale">
          {PRIMARY_FIELDS.map((f, idx) => {
            const raw = values[f.key];
            const stringVal = raw == null ? "" : String(raw);
            const isEditing = editingKey === f.key || showAllFields;
            return (
              <div
                key={f.key}
                className={[
                  "px-4 py-3.5 sm:px-5",
                  idx < PRIMARY_FIELDS.length - 1 ? "border-b border-white/80" : "",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-brand-text">{f.label}</p>
                    {isEditing ? (
                      <input
                        id={f.key}
                        data-testid={`field-${f.key}`}
                        className="mt-1.5 w-full rounded-lg border border-brand-border bg-white px-3 py-2 text-[14px] text-brand-text focus:border-brand-pink focus:outline-none focus:ring-2 focus:ring-brand-pink/30"
                        type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                        value={stringVal}
                        autoFocus={editingKey === f.key}
                        onChange={(e) =>
                          updateField(f.key, coerce(f.key, e.target.value) as never)
                        }
                        onBlur={() => {
                          if (editingKey === f.key) setEditingKey(null);
                        }}
                      />
                    ) : (
                      <p
                        className={[
                          "mt-0.5 text-[15px] text-brand-text",
                          f.key === "pcn_number" ? "underline decoration-brand-text/30 underline-offset-2" : "",
                        ].join(" ")}
                        data-testid={`field-${f.key}`}
                      >
                        {formatDisplay(stringVal, f.format) || (
                          <span className="text-brand-mute">Not found — tap Edit</span>
                        )}
                      </p>
                    )}
                  </div>
                  {!isEditing && (
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-[13px] font-semibold text-brand-blue"
                      onClick={() => setEditingKey(f.key)}
                      aria-label={`Edit ${f.label}`}
                    >
                      <PencilIcon />
                      Edit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {showAllFields && (
          <div className="mt-4 space-y-3 rounded-2xl border border-brand-borderSoft bg-white p-4 sm:p-5">
            <p className="text-[13px] font-semibold text-brand-text">Additional details</p>
            {EXTRA_FIELDS.map((f) => {
              const raw = values[f.key];
              const stringVal = raw == null ? "" : String(raw);
              return (
                <div key={f.key}>
                  <label className="text-[12px] font-bold text-brand-text" htmlFor={f.key}>
                    {f.label}
                  </label>
                  {f.type === "select" ? (
                    <select
                      id={f.key}
                      data-testid={`field-${f.key}`}
                      className="mt-1 w-full rounded-lg border border-brand-border bg-white px-3 py-2 text-[14px]"
                      value={stringVal}
                      onChange={(e) =>
                        updateField(f.key, coerce(f.key, e.target.value) as never)
                      }
                    >
                      <option value="">—</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={f.key}
                      data-testid={`field-${f.key}`}
                      className="mt-1 w-full rounded-lg border border-brand-border bg-white px-3 py-2 text-[14px]"
                      type={
                        f.type === "number" ? "number" : f.type === "date" ? "date" : "text"
                      }
                      value={stringVal}
                      onChange={(e) =>
                        updateField(f.key, coerce(f.key, e.target.value) as never)
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          >
            {error}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-8">
          <button
            type="button"
            data-testid="confirm-continue"
            disabled={saving}
            onClick={() => void saveAndContinue()}
            className="flex w-full items-center justify-center rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-brand-pinkDark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Looks correct, continue"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAllFields(true);
              setEditingKey(PRIMARY_FIELDS[0]?.key ?? null);
            }}
            className="flex w-full items-center justify-center rounded-xl border-2 border-brand-pink bg-white px-5 py-3.5 text-[15px] font-semibold text-brand-pink transition hover:bg-brand-pinkPale focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink focus-visible:ring-offset-2"
          >
            The details are incorrect
          </button>
        </div>
      </main>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinejoin="round" />
    </svg>
  );
}

function formatDisplay(value: string, format?: "currency" | "dateUk"): string {
  if (!value) return "";
  if (format === "currency") {
    const n = Number(value);
    if (!Number.isFinite(n)) return value;
    return `£${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
  }
  if (format === "dateUk") {
    // Prefer ISO YYYY-MM-DD → DD/MM/YYYY
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return value;
}

function coerce(
  key: keyof ExtractedPcn,
  value: string,
): ExtractedPcn[keyof ExtractedPcn] | undefined {
  if (value === "") return undefined;
  if (key === "total_recorded_duration" || key === "charge_amount") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  if (key === "notice_route") return value as NoticeRoute;
  if (key === "case_stage") return value as CaseStage;
  return value;
}

function labelFor(k: keyof ExtractedPcn): string {
  const map: Partial<Record<keyof ExtractedPcn, string>> = {
    operator_name: "parking company",
    pcn_number: "PCN reference number",
    vrm: "vehicle registration",
    parking_location: "location",
    parking_event_date: "date of parking event",
  };
  return map[k] ?? k;
}
