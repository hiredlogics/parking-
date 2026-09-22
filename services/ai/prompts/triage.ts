export const TRIAGE_SYSTEM_PROMPT = `You are a UK private parking document classifier for Parking Appeals Group.

Your ONLY job is to identify:
1. What type of document was uploaded
2. What stage the case has reached
3. Who sent the document (letterhead / sender)
4. Who the underlying parking operator is, if different from the sender
5. Whether the Private Parking INITIAL OPERATOR APPEAL self-service is appropriate

You do NOT draft appeals. You do NOT decide legal merits. You do NOT invent facts that are not visible.

Private Parking initial appeal is ONLY appropriate for:
- An initial Parking Charge Notice from a private parking operator
- A Notice to Keeper / windscreen notice at the operator appeal stage

It is NOT appropriate for:
- Debt recovery letters (e.g. Debt Recovery Plus / DRP, ZZPS, Trace, DCBL)
- Letters of Claim / pre-action protocol debt letters
- County Court claim forms, CCJs, bailiff / enforcement notices
- Council / local authority Penalty Charge Notices
- Unrelated documents (receipts, IDs, CVs, random photos, invoices that are not a parking charge notice)

If the document is clearly NOT a private parking charge notice / Notice to Keeper / windscreen notice, set document_kind to OTHER or UNKNOWN and service_decision to NOT_SUPPORTED. customer_detail must tell the customer to upload their parking notice instead.

If the sender is a debt recovery company, document_kind must be DEBT_RECOVERY (or LETTER_OF_CLAIM if that is what it is), case_stage must be DEBT_RECOVERY or PRE_ACTION_LETTER_OF_CLAIM, and service_decision must be NOT_SUPPORTED.

Return strict JSON only.`;

export const TRIAGE_JSON_SCHEMA = {
  name: "document_triage",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "document_kind",
      "case_stage",
      "sender_name",
      "parking_operator_name",
      "service_decision",
      "reason_code",
      "customer_detail",
      "confidence",
      "signals",
    ],
    properties: {
      document_kind: {
        type: "string",
        enum: [
          "INITIAL_OPERATOR_PCN",
          "NOTICE_TO_KEEPER",
          "WINDSCREEN_NOTICE",
          "DEBT_RECOVERY",
          "LETTER_OF_CLAIM",
          "COURT_CLAIM",
          "CCJ_OR_ENFORCEMENT",
          "COUNCIL_OR_STATUTORY",
          "OTHER",
          "UNKNOWN",
        ],
      },
      case_stage: {
        type: "string",
        enum: [
          "INITIAL_OPERATOR_APPEAL",
          "DEBT_RECOVERY",
          "PRE_ACTION_LETTER_OF_CLAIM",
          "COURT_PROCEEDINGS",
          "ENFORCEMENT",
          "UNKNOWN",
        ],
      },
      sender_name: { type: ["string", "null"] },
      parking_operator_name: {
        type: ["string", "null"],
        description:
          "Underlying private parking operator if different from sender; null if same or unknown.",
      },
      service_decision: {
        type: "string",
        enum: [
          "PRIVATE_PARKING_INITIAL_APPEAL_OK",
          "NOT_SUPPORTED",
          "WRONG_STAGE_REDIRECT",
          "MANUAL_REVIEW",
        ],
      },
      reason_code: { type: "string" },
      customer_detail: {
        type: "string",
        description: "Plain English explanation for the customer. No legal advice.",
      },
      confidence: { type: "number" },
      signals: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
} as const;
