"use client";

import { useState } from "react";
import { saveKeeperProfile } from "@/features/appeal/caseSync";

/**
 * Registered keeper name and address.
 *
 * THIS IS NOT A LEGAL QUESTION and it is the reason this file exists.
 *
 * It lived inside the adaptive questions page, which made it look like
 * part of the question engine that is being deleted. It is not: it is
 * plain data collection. The appeal letter is addressed FROM the
 * registered keeper, so without a name and address there is no letter to
 * send — no amount of AI fact derivation can supply it, because it is
 * not written on the notice for a windscreen ticket and it is not in any
 * document the customer uploads.
 *
 * Extracted here so it survives the removal of the questions journey
 * unchanged, including its test ids, which the e2e suite asserts on.
 */

export interface KeeperProfileFields {
  keeper_name: string;
  keeper_address_line1: string;
  keeper_address_line2: string;
  keeper_town: string;
  keeper_postcode: string;
}

export const EMPTY_KEEPER_PROFILE: KeeperProfileFields = {
  keeper_name: "",
  keeper_address_line1: "",
  keeper_address_line2: "",
  keeper_town: "",
  keeper_postcode: "",
};

/** Read the fields back out of the stored answer map. */
export function keeperProfileFrom(
  answers: Record<string, unknown>,
): KeeperProfileFields {
  const str = (k: keyof KeeperProfileFields) => String(answers[k] ?? "");
  return {
    keeper_name: str("keeper_name"),
    keeper_address_line1: str("keeper_address_line1"),
    keeper_address_line2: str("keeper_address_line2"),
    keeper_town: str("keeper_town"),
    keeper_postcode: str("keeper_postcode"),
  };
}

/**
 * Whether we still need to ask.
 *
 * A postal Notice to Keeper is addressed to the keeper and therefore
 * already carries these details; only windscreen and unclassified
 * notices need them typed in.
 */
export function needsKeeperDetails(
  answers: Record<string, unknown>,
  noticeRoute: string | null | undefined,
): boolean {
  if (String(answers.keeper_name ?? "").trim().length > 0) return false;
  return (
    noticeRoute === "WINDSCREEN" || noticeRoute === "UNKNOWN" || !noticeRoute
  );
}

const FIELDS: {
  key: keyof KeeperProfileFields;
  label: string;
  placeholder: string;
  required?: boolean;
}[] = [
  { key: "keeper_name", label: "Registered keeper name", placeholder: "e.g. John Smith", required: true },
  { key: "keeper_address_line1", label: "Address line 1", placeholder: "e.g. 12 High Street", required: true },
  { key: "keeper_address_line2", label: "Address line 2 (optional)", placeholder: "e.g. Flat 3" },
  { key: "keeper_town", label: "Town / City", placeholder: "e.g. Leeds", required: true },
  { key: "keeper_postcode", label: "Postcode", placeholder: "e.g. LS1 2AB", required: true },
];

function autoCompleteFor(key: keyof KeeperProfileFields): string {
  if (key === "keeper_name") return "name";
  if (key === "keeper_postcode") return "postal-code";
  if (key === "keeper_town") return "address-level2";
  return "street-address";
}

export function KeeperDetailsForm({
  caseId,
  windscreen,
  initial,
  onSaved,
  heading = true,
  submitLabel = "Continue",
  className = "flex flex-1 flex-col",
}: {
  caseId: string;
  windscreen: boolean;
  initial: KeeperProfileFields;
  onSaved: (answers: Record<string, unknown>) => void;
  /** Off when the host page supplies its own heading. */
  heading?: boolean;
  submitLabel?: string;
  className?: string;
}) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    (key: keyof KeeperProfileFields) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await saveKeeperProfile(caseId, {
      keeper_name: form.keeper_name.trim(),
      keeper_address_line1: form.keeper_address_line1.trim(),
      keeper_address_line2: form.keeper_address_line2.trim(),
      keeper_town: form.keeper_town.trim(),
      keeper_postcode: form.keeper_postcode.trim(),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message || "Could not save keeper details.");
      return;
    }
    onSaved(res.data.adaptiveAnswers);
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className={className}
      data-testid="keeper-details-form"
    >
      {heading && (
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-brand-text sm:text-[26px]">
            Registered keeper details
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-brand-mute">
            {windscreen ? (
              <>
                This appears to be a windscreen notice. Please confirm the
                registered keeper&apos;s details so we can complete your appeal.
              </>
            ) : (
              <>
                Please confirm the registered keeper&apos;s details so we can
                complete your appeal.
              </>
            )}
          </p>
        </div>
      )}

      <div className="mt-6 space-y-4 rounded-2xl border border-brand-border bg-white p-4 sm:p-5">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="text-[13px] font-bold text-brand-text" htmlFor={f.key}>
              {f.label}
            </label>
            <input
              id={f.key}
              name={f.key}
              required={f.required}
              placeholder={f.placeholder}
              value={form[f.key]}
              onChange={set(f.key)}
              className="mt-1.5 w-full rounded-xl border border-brand-border bg-white px-3.5 py-2.5 text-[14px] text-brand-text placeholder:text-brand-mute/55 focus:border-brand-pink focus:outline-none focus:ring-2 focus:ring-brand-pink/30"
              autoComplete={autoCompleteFor(f.key)}
            />
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}

      <div className={heading ? "mt-auto pt-8" : "mt-4"}>
        <button
          type="submit"
          disabled={busy}
          data-testid="keeper-details-continue"
          className="flex w-full items-center justify-center rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-brand-pinkDark disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
