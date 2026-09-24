"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { JourneyHeader } from "@/components/app/JourneyHeader";
import { ProgressSteps } from "@/components/ProgressSteps";
import { useAppealStore } from "@/features/appeal/store";
import { useCaseSession } from "@/features/appeal/useCaseSession";
import {
  confirmCase,
  saveKeeperProfile,
} from "@/features/appeal/caseSync";
import { needsKeeperDetails } from "@/features/appeal/KeeperDetails";
import type { CaseStage, ExtractedPcn, NoticeRoute } from "@/types";
import { triageBlocksAppealJourney } from "@/types/triage";
import { assessDocumentDeterministic } from "@/lib/triage/deterministic";

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
  const adaptiveAnswers = useAppealStore((s) => s.adaptiveAnswers);
  const hydrateFromCase = useAppealStore((s) => s.hydrateFromCase);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState<keyof ExtractedPcn | null>(null);
  const [showAllFields, setShowAllFields] = useState(false);
  /*
   * Null until the customer touches the control, so a value already
   * stored on the case still shows after the answer map hydrates.
   */
  const [keeperChoice, setKeeperChoice] = useState<string | null>(null);

  const { caseId, status: sessionStatus } = useCaseSession();
  const values = useMemo(() => extraction?.raw ?? {}, [extraction]);
  const triage = extraction?.triage ?? null;
  const fallbackTriage = useMemo(
    () =>
      assessDocumentDeterministic({
        operatorName:
          typeof values.operator_name === "string" ? values.operator_name : null,
        allegedBreach:
          typeof values.alleged_breach === "string"
            ? values.alleged_breach
            : null,
        parkingLocation:
          typeof values.parking_location === "string"
            ? values.parking_location
            : null,
        senderName: triage?.senderName,
        parkingOperatorName: triage?.parkingOperatorName,
      }),
    [values, triage],
  );
  const effectiveTriage = triage ?? fallbackTriage;
  const blockedStage = triageBlocksAppealJourney(effectiveTriage);
  const blockDetail = blockedStage ? effectiveTriage.detail : null;
  const registeredKeeper =
    keeperChoice ?? String(adaptiveAnswers.registered_keeper ?? "");

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
    if (blockedStage) {
      setError(null);
      return;
    }
    const required = ["operator_name", "pcn_number", "vrm", "parking_location", "parking_event_date"] as const;
    const missing = required.filter((k) => !values[k]);
    if (missing.length > 0) {
      setError(`Please provide: ${missing.map(labelFor).join(", ")}`);
      setShowAllFields(true);
      return;
    }
    if (!registeredKeeper) {
      setError("Please tell us whether you are the registered keeper.");
      return;
    }
    setError(null);
    const confirmed = {
      ...(values as ExtractedPcn),
      // Normalise route so the next step can decide on keeper details.
      notice_route: (values.notice_route ?? "UNKNOWN") as NoticeRoute,
      // Durable stage from document understanding — do not reset to initial appeal.
      case_stage: (effectiveTriage.caseStage ??
        values.case_stage ??
        "INITIAL_OPERATOR_APPEAL") as CaseStage,
      // Prefer parking operator when triage separated sender vs operator.
      operator_name:
        effectiveTriage.parkingOperatorName ??
        (typeof values.operator_name === "string"
          ? values.operator_name
          : undefined),
      confirmedAt: new Date().toISOString(),
    };
    setConfirmed(confirmed);

    let answers: Record<string, unknown> = adaptiveAnswers;
    if (caseId) {
      setSaving(true);
      const saved = await confirmCase(caseId, confirmed);
      setSaving(false);
      if (!saved.ok) {
        setError(saved.message || "We could not save your confirmation.");
        return;
      }
      hydrateFromCase(saved.data.case);
      answers = saved.data.case.adaptiveAnswers ?? {};

      // Every keeper-liability ground depends on this fact, so it is
      // saved before readiness is checked rather than alongside the
      // keeper's address later in the journey.
      const keeper = await saveKeeperProfile(caseId, {
        registered_keeper: registeredKeeper,
      });
      if (!keeper.ok) {
        setError(keeper.message || "We could not save your answer.");
        return;
      }
      answers = { ...answers, ...keeper.data.adaptiveAnswers };
    }

    /*
     * Show step 3 only when something is actually needed.
     *
     * The keeper's name and address is the one input nothing can derive,
     * because the letter is sent in their name and no uploaded document
     * carries it. Everything else is read from the notice or defaulted
     * with provenance (lib/rules/factDefaults.ts).
     *
     * This decision is deliberately made from data already in hand. An
     * earlier version asked /readiness here so it could also route on
     * "evidence would help", but that endpoint runs the full sufficiency
     * analysis — on a cold server it took over 30 seconds, which left the
     * customer staring at the confirm screen. The evidence prompt now
     * lives on the review page, which already loads readiness and already
     * shows a spinner while it does.
     */
    if (needsKeeperDetails(answers, confirmed.notice_route)) {
      setStep("evidence");
      router.push("/appeal/evidence");
      return;
    }

    setStep("review");
    router.push("/appeal/review");
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <JourneyHeader />
      <ProgressSteps current="confirm" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-8 pt-6 sm:px-6 sm:pt-8">
        <div className="text-center sm:text-left">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-brand-text sm:text-[26px]">
            {blockedStage ? "This notice is past the appeal stage" : "Check your details"}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-brand-mute">
            {blockedStage
              ? blockDetail
              : "We've extracted the following information from your notice. Please check and amend if needed."}
          </p>
        </div>

        {blockedStage && (
          <div
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
            data-testid="triage-blocked"
          >
            <p className="font-semibold">Document assessment</p>
            <ul className="mt-2 space-y-1 leading-snug">
              <li>
                Sender:{" "}
                {effectiveTriage.senderName ??
                  (typeof values.operator_name === "string"
                    ? values.operator_name
                    : "Unknown")}
              </li>
              <li>
                Document type:{" "}
                {labelDocumentKind(effectiveTriage.documentKind)}
              </li>
              <li>
                Case stage: {labelCaseStage(effectiveTriage.caseStage)}
              </li>
              <li>Standard private parking appeal: Not appropriate at this stage</li>
            </ul>
          </div>
        )}

        {blockedStage && (
          <div className="mt-6 space-y-3">
            <Link
              href="/services"
              className="flex w-full items-center justify-center rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white"
            >
              See Expert Help options
            </Link>
            <Link
              href="/#contact"
              className="flex w-full items-center justify-center rounded-xl border border-brand-border bg-white px-5 py-3.5 text-[15px] font-semibold text-brand-text"
            >
              Contact our team
            </Link>
            <Link
              href="/appeal/upload"
              className="block text-center text-[13px] font-medium text-brand-mute underline-offset-2 hover:underline"
            >
              Upload a different notice
            </Link>
          </div>
        )}

        {extraction.warnings && extraction.warnings.length > 0 && !blockedStage && (
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

        {!blockedStage && (
          <fieldset className="mt-4 rounded-2xl border border-brand-border bg-white p-4 sm:p-5">
            <legend className="px-1 text-[13px] font-bold text-brand-text">
              Are you the registered keeper of this vehicle?
            </legend>
            <p className="mt-1 text-[13px] leading-relaxed text-brand-mute">
              The registered keeper is the person the vehicle is registered to
              with the DVLA. Your appeal is written on their behalf.
            </p>
            <div className="mt-3 space-y-2">
              {[
                { value: "YES", label: "Yes" },
                { value: "NO", label: "No" },
                { value: "UNSURE", label: "I'm not sure" },
              ].map((o) => (
                <label
                  key={o.value}
                  className={[
                    "flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-[14px] transition",
                    registeredKeeper === o.value
                      ? "border-brand-pink bg-brand-pinkPale font-semibold text-brand-text"
                      : "border-brand-border bg-white text-brand-text hover:border-brand-pink/50",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="registered_keeper"
                    value={o.value}
                    data-testid={`registered-keeper-${o.value.toLowerCase()}`}
                    checked={registeredKeeper === o.value}
                    onChange={() => setKeeperChoice(o.value)}
                    className="h-4 w-4 accent-brand-pink"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

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

        {!blockedStage && (
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
        )}
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

function labelDocumentKind(kind: string): string {
  switch (kind) {
    case "DEBT_RECOVERY":
      return "Debt recovery letter";
    case "LETTER_OF_CLAIM":
      return "Letter of Claim";
    case "COURT_CLAIM":
      return "Court claim";
    case "CCJ_OR_ENFORCEMENT":
      return "CCJ / enforcement";
    case "COUNCIL_OR_STATUTORY":
      return "Council / statutory notice";
    case "INITIAL_OPERATOR_PCN":
    case "NOTICE_TO_KEEPER":
    case "WINDSCREEN_NOTICE":
      return "Initial parking notice";
    default:
      return kind.replace(/_/g, " ").toLowerCase();
  }
}

function labelCaseStage(stage: string): string {
  switch (stage) {
    case "DEBT_RECOVERY":
      return "Debt recovery";
    case "PRE_ACTION_LETTER_OF_CLAIM":
      return "Pre-action / Letter of Claim";
    case "COURT_PROCEEDINGS":
      return "Court proceedings";
    case "ENFORCEMENT":
      return "Enforcement";
    case "INITIAL_OPERATOR_APPEAL":
      return "Initial operator appeal";
    default:
      return stage.replace(/_/g, " ").toLowerCase();
  }
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
