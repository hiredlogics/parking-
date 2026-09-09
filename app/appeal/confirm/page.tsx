"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app/AppHeader";
import { ProgressSteps } from "@/components/ProgressSteps";
import { useAppealStore } from "@/features/appeal/store";
import { useCaseSession } from "@/features/appeal/useCaseSession";
import { confirmCase } from "@/features/appeal/caseSync";
import { ArrowRightIcon, ShieldIcon } from "@/components/landing/Icons";
import type { CaseStage, ExtractedPcn, NoticeRoute } from "@/types";

type FieldType = "text" | "date" | "number" | "select";

interface FieldDef {
  key: keyof ExtractedPcn;
  label: string;
  type: FieldType;
  options?: Array<{ value: string; label: string }>;
  hint?: string;
  span?: "full" | "half";
}

/** Field groups shown as separate white cards. */
const GROUPS: { title: string; description: string; fields: FieldDef[] }[] = [
  {
    title: "Parking notice",
    description: "The operator, reference, and vehicle on the notice.",
    fields: [
      { key: "operator_name", label: "Operator", type: "text" },
      { key: "pcn_number", label: "PCN number", type: "text" },
      { key: "vrm", label: "Vehicle registration", type: "text" },
      { key: "vehicle_make", label: "Vehicle make", type: "text", hint: "Optional." },
      { key: "parking_location", label: "Location", type: "text", span: "full" },
    ],
  },
  {
    title: "Dates & delivery",
    description: "When the parking event happened and how the notice was served.",
    fields: [
      { key: "parking_event_date", label: "Event date", type: "date" },
      { key: "notice_issue_date", label: "Issue date", type: "date" },
      { key: "notice_received_date", label: "Received date", type: "date" },
      {
        key: "notice_route",
        label: "Notice route",
        type: "select",
        options: [
          { value: "POSTAL", label: "Posted (Notice to Keeper)" },
          { value: "WINDSCREEN", label: "Placed on vehicle" },
          { value: "UNKNOWN", label: "Not sure" },
        ],
      },
    ],
  },
  {
    title: "If the notice uses ANPR",
    description: "Only fill in if the notice shows entry / exit camera images.",
    fields: [
      { key: "entry_time", label: "Entry time", type: "text", hint: "As printed, e.g. 09:12." },
      { key: "exit_time", label: "Exit time", type: "text", hint: "As printed, e.g. 16:47." },
      { key: "total_recorded_duration", label: "Recorded duration (minutes)", type: "number" },
    ],
  },
  {
    title: "The alleged breach",
    description: "What the operator says the vehicle did and how much they're charging.",
    fields: [
      { key: "charge_amount", label: "Charge amount (£)", type: "number" },
      { key: "alleged_breach", label: "Alleged breach", type: "text", span: "full" },
    ],
  },
];

// case_stage is fixed for this build and never editable — hidden from the UI.

export default function ConfirmPage() {
  const router = useRouter();
  const extraction = useAppealStore((s) => s.extraction);
  const updateField = useAppealStore((s) => s.updateExtractedField);
  const setConfirmed = useAppealStore((s) => s.setConfirmedPcn);
  const setStep = useAppealStore((s) => s.setStep);
  const hydrateFromCase = useAppealStore((s) => s.hydrateFromCase);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Rehydrate from the server so a refresh keeps the extraction.
  const { caseId, status: sessionStatus } = useCaseSession();

  const values = useMemo(() => extraction?.raw ?? {}, [extraction]);

  if (sessionStatus === "loading") {
    return (
      <div className="app-shell">
        <AppHeader />
        <ProgressSteps current="confirm" />
        <main className="container-page py-14">
          <div className="mx-auto max-w-2xl app-card">
            <div className="h-32 animate-pulse rounded-xl bg-brand-canvas" />
          </div>
        </main>
      </div>
    );
  }

  if (!extraction) {
    return (
      <div className="app-shell">
        <AppHeader />
        <ProgressSteps current="confirm" />
        <main className="container-page py-14">
          <div className="mx-auto max-w-2xl">
            <div className="app-card">
              <h1 className="text-2xl font-black tracking-tight">
                Upload your notice first
              </h1>
              <p className="mt-2 text-brand-mute">
                Please upload your PCN so we can extract the key details for you
                to confirm.
              </p>
              <Link href="/appeal/upload" className="btn-brand-primary mt-4">
                Go to upload
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const required = ["operator_name", "pcn_number", "vrm", "parking_location", "parking_event_date"] as const;
    const missing = required.filter((k) => !values[k]);
    if (missing.length > 0) {
      setError(`Please provide: ${missing.map(labelFor).join(", ")}`);
      return;
    }
    setError(null);
    // case_stage is fixed for this build — set it here so the customer
    // never sees the field.
    const confirmed = {
      ...(values as ExtractedPcn),
      case_stage: "INITIAL_OPERATOR_APPEAL" as const,
      confirmedAt: new Date().toISOString(),
    };
    setConfirmed(confirmed);

    // Persist confirmation server-side before moving on. Corrections are
    // stored alongside the original extraction for auditability.
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
    <div className="app-shell">
      <AppHeader />
      <ProgressSteps current="confirm" />
      <main className="container-page py-8 sm:py-10 lg:py-12">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="app-badge">
                <ShieldIcon className="h-3.5 w-3.5" /> Step 2 of 6
              </span>
              <h1 className="mt-3 text-[26px] font-black tracking-tight text-brand-text sm:text-[32px]">
                Check Your Notice Details
              </h1>
              <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-brand-mute">
                We&apos;ve extracted the information from your parking notice.
                Please check everything carefully and correct anything that
                looks wrong before continuing.
              </p>
            </div>
          </div>

          <form className="space-y-6" onSubmit={onSubmit}>
            {GROUPS.map((g) => (
              <section key={g.title} className="app-card">
                <div className="mb-4">
                  <p className="app-section-title">{g.title}</p>
                  <p className="mt-1 text-[13px] text-brand-mute">{g.description}</p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {g.fields.map((f) => {
                    const raw = values[f.key];
                    const stringVal = raw == null ? "" : String(raw);
                    return (
                      <div
                        key={f.key}
                        className={f.span === "full" ? "sm:col-span-2" : undefined}
                      >
                        <label className="app-label" htmlFor={f.key}>
                          {f.label}
                        </label>
                        {f.type === "select" ? (
                          <select
                            id={f.key}
                            className="app-input"
                            data-testid={`field-${f.key}`}
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
                            className="app-input"
                            data-testid={`field-${f.key}`}
                            type={
                              f.type === "number"
                                ? "number"
                                : f.type === "date"
                                  ? "date"
                                  : "text"
                            }
                            value={stringVal}
                            onChange={(e) =>
                              updateField(f.key, coerce(f.key, e.target.value) as never)
                            }
                          />
                        )}
                        {f.hint && <p className="app-hint">{f.hint}</p>}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
              >
                {error}
              </div>
            )}

            <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Link href="/appeal/upload" className="btn-brand-ghost sm:w-auto">
                Back
              </Link>
              <button
                type="submit"
                className="btn-brand-primary"
                disabled={saving}
                data-testid="confirm-continue"
              >
                {saving ? "Saving…" : "Confirm & Continue"}{" "}
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
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
    operator_name: "operator",
    pcn_number: "PCN number",
    vrm: "vehicle registration",
    parking_location: "location",
    parking_event_date: "event date",
  };
  return map[k] ?? k;
}
