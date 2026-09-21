/**
 * Human labels for situation / scenario tags — used on review screens.
 * Values come from the case; labels match the customer-facing copy.
 */
export const SITUATION_LABELS: Record<string, string> = {
  signage_issue: "The signage was unclear or inadequate",
  authorised_or_permit: "I have a valid permit or was authorised to park",
  resident_parking_rights: "I was a resident / have the right to park",
  grace_or_exit: "There wasn't enough time (grace period)",
  landowner_authority_challenge: "The charge is unfair or unreasonable",
  breakdown_immobilised: "I experienced a breakdown or unforeseen circumstances",
  other_grounds: "Other",
  payment_made: "A payment was made for the parking",
  vrm_error: "The vehicle registration was entered incorrectly",
  anpr_disputed: "The camera times are disputed",
  payment_attempted_failed: "A payment was attempted but did not complete",
  short_stay_consideration: "Short stay / consideration period",
};

export function formatSituationLabel(
  tags: unknown,
  otherText?: unknown,
): string {
  const list = Array.isArray(tags) ? tags.map(String) : [];
  if (list.length === 0) return "—";
  const labels = list.map((t) => SITUATION_LABELS[t] ?? t);
  const other =
    typeof otherText === "string" && otherText.trim() ? otherText.trim() : null;
  if (other && list.includes("other_grounds")) {
    return `${labels.join("; ")}: ${other}`;
  }
  return labels.join("; ");
}

export function formatUkDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso;
}

export function formatMoney(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return `£${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}
