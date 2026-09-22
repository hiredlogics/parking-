/**
 * Human labels for situation / scenario tags — used on review screens.
 * Values come from the case; labels match the customer-facing copy.
 */
export const SITUATION_LABELS: Record<string, string> = {
  signage_issue: "The signage was unclear or inadequate",
  authorised_or_permit: "I have a valid permit or was authorised to park",
  resident_parking_rights: "I was a resident / have the right to park",
  grace_or_exit: "There wasn't enough time (grace period)",
  landowner_authority_challenge: "Something else happened / Other",
  breakdown_immobilised: "I experienced a breakdown or unforeseen circumstances",
  other_grounds: "Something else happened / Other",
  payment_made: "A payment was made for the parking",
  vrm_error: "The vehicle registration was entered incorrectly",
  anpr_disputed: "The camera times are disputed",
  payment_attempted_failed: "A payment was attempted but did not complete",
  short_stay_consideration: "Short stay / consideration period",
};

/** Follow-up adaptive answers shown on the review screen. */
export const FOLLOW_UP_LABELS: Record<string, string> = {
  jurisdiction: "Car park location (UK nation)",
  vehicle_hire_status: "Vehicle ownership",
  notice_route: "How the notice was received",
  payment_made: "Was a parking payment made?",
  payment_method: "Payment method",
  payment_evidence: "Payment evidence held",
  machine_or_app_issue: "Machine or app issue",
  keying_error: "Registration keying error",
  signage_issue_basis: "Signage issue detail",
  permission_held: "Permit / authorisation held",
  permission_source: "Source of authorisation",
  visitor_authorisation: "Visitor authorisation",
  occupier_status: "Resident / occupier status",
  agreement_uploaded: "Tenancy / lease evidence",
  agreement_permit_clause: "Permit clause in agreement",
  bay_allocated: "Allocated bay",
  bay_reference: "Bay reference",
  parking_right_evidence: "Parking right evidence",
  initial_period_reason: "Arrival / consideration period",
  exit_delay_reason: "Exit / grace delay",
  breakdown_occurred: "Breakdown occurred",
  breakdown_nature: "Nature of breakdown",
  breakdown_prevented_departure: "Prevented departure",
  breakdown_evidence: "Breakdown evidence held",
  recovery_attendance: "Recovery attendance",
  continuous_presence: "Continuous presence on site",
  visit_count: "Number of visits",
  anpr_dispute_detail: "ANPR dispute detail",
};

const JURISDICTION_DISPLAY: Record<string, string> = {
  ENGLAND_WALES: "England or Wales",
  SCOTLAND: "Scotland",
  NORTHERN_IRELAND: "Northern Ireland",
  UNSURE: "Not sure",
};

const HIDDEN_REVIEW_KEYS = new Set([
  "scenarios",
  "situation_other",
  "keeper_name",
  "keeper_address_line1",
  "keeper_address_line2",
  "keeper_town",
  "keeper_postcode",
  "operator_name",
  "pcn_number",
  "vrm",
  "parking_location",
  "parking_event_date",
  "charge_amount",
]);

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
    return `${labels.join("; ")} — ${other}`;
  }
  return labels.join("; ");
}

export function formatFollowUpValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value.map(String).join(", ") || "—";
  }
  const s = String(value).trim();
  if (!s) return "—";
  if (key === "jurisdiction") return JURISDICTION_DISPLAY[s] ?? s;
  if (s === "YES") return "Yes";
  if (s === "NO") return "No";
  if (s === "UNSURE") return "Not sure";
  return s.replace(/_/g, " ");
}

/** Customer-facing follow-up rows for the review screen. */
export function followUpReviewRows(
  adaptiveAnswers: Record<string, unknown>,
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  for (const [key, raw] of Object.entries(adaptiveAnswers)) {
    if (HIDDEN_REVIEW_KEYS.has(key)) continue;
    if (key.startsWith("__")) continue;
    const label = FOLLOW_UP_LABELS[key];
    if (!label) continue;
    if (raw === null || raw === undefined || raw === "") continue;
    if (Array.isArray(raw) && raw.length === 0) continue;
    rows.push({ label, value: formatFollowUpValue(key, raw) });
  }
  return rows;
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
