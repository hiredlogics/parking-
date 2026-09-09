"use client";

import type { CaseType } from "@/lib/crm/types";

/**
 * Per-case-type stage list. Mirrors the reference screenshot's dedicated
 * County-Court / CCJ / Bailiff progress bars in a single reusable
 * component.
 */
const STAGES: Record<
  CaseType,
  { key: string; label: string }[]
> = {
  COUNTY_COURT: [
    { key: "CLAIM_RECEIVED", label: "Claim Received" },
    { key: "AOS_FILED", label: "AOS Filed" },
    { key: "DEFENCE_FILED", label: "Defence Filed" },
    { key: "DIRECTIONS", label: "Directions" },
    { key: "HEARING", label: "Hearing" },
    { key: "COMPLETED", label: "Completed" },
  ],
  CCJ_REMOVAL: [
    { key: "CCJ_OBTAINED", label: "CCJ Obtained" },
    { key: "ASSESS_ELIGIBILITY", label: "Assess Eligibility" },
    { key: "APPLICATION", label: "Application" },
    { key: "HEARING", label: "Hearing" },
    { key: "CCJ_REMOVED", label: "CCJ Removed" },
  ],
  BAILIFF_ENFORCEMENT: [
    { key: "NOTICE", label: "Notice of Enforcement" },
    { key: "COMPLIANCE", label: "Compliance Stage" },
    { key: "ENFORCEMENT", label: "Enforcement Stage" },
    { key: "SALE", label: "Sale Stage" },
    { key: "RESOLVED", label: "Resolved" },
  ],
  PRIVATE_PARKING: [
    { key: "UPLOADED", label: "Uploaded" },
    { key: "CONFIRMED", label: "Confirmed" },
    { key: "QUESTIONS", label: "Questions" },
    { key: "GENERATED", label: "Generated" },
    { key: "DOWNLOADED", label: "Downloaded" },
  ],
  COUNCIL_PCN: [
    { key: "RECEIVED", label: "Received" },
    { key: "REVIEWING", label: "Reviewing" },
    { key: "APPEAL", label: "Appeal Sent" },
    { key: "RESPONSE", label: "Response" },
    { key: "CLOSED", label: "Closed" },
  ],
  CHARGE_CERTIFICATE: [
    { key: "RECEIVED", label: "Received" },
    { key: "REVIEWING", label: "Reviewing" },
    { key: "APPEAL", label: "Appeal Sent" },
    { key: "RESPONSE", label: "Response" },
    { key: "CLOSED", label: "Closed" },
  ],
  ORDER_FOR_RECOVERY: [
    { key: "RECEIVED", label: "Received" },
    { key: "TE9_TE7", label: "TE9 / TE7" },
    { key: "COURT", label: "Court" },
    { key: "RESOLVED", label: "Resolved" },
  ],
};

export function StageStepper({
  type,
  currentKey,
}: {
  type: CaseType;
  currentKey: string | undefined | null;
}) {
  const stages = STAGES[type];
  const currentIdx = Math.max(0, stages.findIndex((s) => s.key === currentKey));
  return (
    <ol className="flex flex-wrap items-center gap-y-3">
      {stages.map((s, i) => {
        const state: "done" | "active" | "todo" =
          i < currentIdx ? "done" : i === currentIdx ? "active" : "todo";
        return (
          <li key={s.key} className="flex items-center">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold ${
                  state === "done"
                    ? "bg-brand-pink text-white border-brand-pink"
                    : state === "active"
                      ? "bg-brand-pinkLight text-brand-pink border-brand-pink"
                      : "bg-white text-brand-mute border-brand-border"
                }`}
              >
                {state === "done" ? (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l4 4L20 6" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={`text-[12px] font-semibold ${
                  state === "active"
                    ? "text-brand-text"
                    : state === "done"
                      ? "text-brand-text/80"
                      : "text-brand-mute"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < stages.length - 1 && (
              <span
                aria-hidden="true"
                className={`mx-2 h-px w-6 ${i < currentIdx ? "bg-brand-pink" : "bg-brand-border"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Return the internal stage-key string for a Case, used by StageStepper. */
export function stageKeyForCase(c: {
  type: CaseType;
  countyCourtStage?: string;
  ccjApplicationStage?: string;
  bailiffStage?: string;
}): string | undefined {
  switch (c.type) {
    case "COUNTY_COURT":
      return c.countyCourtStage;
    case "CCJ_REMOVAL":
      return c.ccjApplicationStage;
    case "BAILIFF_ENFORCEMENT":
      return c.bailiffStage;
    default:
      return undefined;
  }
}
