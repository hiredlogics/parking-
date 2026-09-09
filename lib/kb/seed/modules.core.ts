import type { KbModule } from "../types";

/**
 * KB modules — governance, PoFA, consideration/grace/time, payment,
 * keying, ANPR/evidence, signage, authorisation.
 *
 * Source: Private Parking AI Legal Knowledge Base V2, §1 and §3–§8.
 * Wording of use_when / core_proposition / ai_must_check / do_not_use_when
 * follows the pack.
 */

const base = {
  version: 1,
  effectiveFrom: null,
  effectiveTo: null,
  status: "ACTIVE" as const,
  lastLegalReview: "2026-09-08",
  changeNotes: "Initial import from AI Legal Knowledge Base V2.",
};

export const KB_MODULES_CORE: KbModule[] = [
  /* ================= §1 Governance ================= */
  {
    ...base,
    moduleId: "KB-GOV-01",
    topic: "Governance",
    routeFamily: "GOVERNANCE",
    useWhen: ["Always — applies to every module in the knowledge base."],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Every module has a stable ID, version and effective date.",
    aiMustCheck: ["Module ID", "version", "effective date"],
    evidenceNeeded: [],
    draftingNotes: "Governance rule — never drafted into an appeal.",
    sourceIds: [],
    blockIds: [],
  },
  {
    ...base,
    moduleId: "KB-GOV-02",
    topic: "Governance",
    routeFamily: "GOVERNANCE",
    useWhen: ["Always."],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Legislation/Code propositions must be separately maintainable from drafting language.",
    aiMustCheck: ["Separation of legal source records from drafting blocks"],
    evidenceNeeded: [],
    draftingNotes: "Governance rule — never drafted into an appeal.",
    sourceIds: [],
    blockIds: [],
  },
  {
    ...base,
    moduleId: "KB-GOV-03",
    topic: "Governance",
    routeFamily: "GOVERNANCE",
    useWhen: ["Always."],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "The AI may combine/rewrite supported propositions, but may not create a new legal proposition outside the approved knowledge base.",
    aiMustCheck: [
      "Every legal proposition in the draft maps to a retrieved active module",
    ],
    evidenceNeeded: [],
    draftingNotes: "Governance rule — enforced by the validator.",
    sourceIds: [],
    blockIds: [],
  },
  {
    ...base,
    moduleId: "KB-GOV-04",
    topic: "Governance",
    routeFamily: "GOVERNANCE",
    useWhen: ["Always."],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "The validator must confirm every material factual assertion is grounded in the PCN, uploaded evidence or customer-confirmed answer.",
    aiMustCheck: ["Fact provenance for each material assertion"],
    evidenceNeeded: [],
    draftingNotes: "Implemented as VAL-FACT.",
    sourceIds: [],
    blockIds: [],
  },
  {
    ...base,
    moduleId: "KB-GOV-05",
    topic: "Governance",
    routeFamily: "GOVERNANCE",
    useWhen: [
      "The legal position depends on the event date, notice route, operator/ATA or transition arrangements.",
    ],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Where the legal position depends on the event date, notice route, operator/ATA or transition arrangements, the system must resolve applicability before drafting.",
    aiMustCheck: [
      "Parking event date",
      "Notice route",
      "Operator / ATA",
      "Code version and transition status",
    ],
    evidenceNeeded: [],
    draftingNotes: "Implemented as VAL-CODE plus resolveCodeVersion().",
    sourceIds: ["SRC-SINGLE-CODE"],
    blockIds: [],
  },
  {
    ...base,
    moduleId: "KB-GOV-06",
    topic: "Governance",
    routeFamily: "GOVERNANCE",
    useWhen: ["Case law would otherwise be quoted or named."],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Case law must not be quoted or named automatically unless the authority and proposition have been separately verified and enabled by an administrator.",
    aiMustCheck: [
      "Source status",
      "quotation_enabled flag on the legal source record",
    ],
    evidenceNeeded: [],
    draftingNotes:
      "Quotation is disabled by default. Paraphrase verified propositions only.",
    sourceIds: [
      "SRC-CASE-BEAVIS-2015",
      "SRC-CASE-SAEED-2001",
      "SRC-CASE-JOPSON-2016",
    ],
    blockIds: [],
  },
  {
    ...base,
    moduleId: "KB-GOV-07",
    topic: "Governance",
    routeFamily: "GOVERNANCE",
    useWhen: ["More than one candidate ground exists."],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "A weak secondary ground must not dilute a strong primary ground. Order: dispositive statutory/contractual issue -> strong factual issue -> evidence challenge -> secondary signage/authority point.",
    aiMustCheck: ["Relative strength of each candidate route"],
    evidenceNeeded: [],
    draftingNotes: "Implemented via DRAFTING_PRIORITY.",
    sourceIds: [],
    blockIds: [],
  },

  /* ================= §3 Keeper liability / PoFA ================= */
  {
    ...base,
    moduleId: "KB-POFA-01",
    topic: "PoFA",
    routeFamily: "POFA",
    useWhen: [
      "Registered keeper appeal; driver has not already been formally identified.",
    ],
    doNotUseWhen: [
      "Driver has already been formally identified to the operator.",
    ],
    legalBasis: "Protection of Freedoms Act 2012 Schedule 4.",
    coreProposition:
      "Keeper liability is not automatic. If the operator seeks recovery from the keeper under Schedule 4, the applicable statutory conditions must be satisfied.",
    aiMustCheck: [
      "Notice route",
      "Relevant land",
      "Event date",
      "Notice dates",
      "Whether a Notice to Driver preceded the NTK",
      "Required content",
      "Whether the operator is actually relying on PoFA",
    ],
    evidenceNeeded: ["PCN / Notice to Keeper", "Notice to Driver if issued"],
    draftingNotes:
      "Do not say the underlying charge is automatically invalid merely because keeper liability fails. State that liability cannot be transferred to the keeper under Schedule 4.",
    sourceIds: ["SRC-POFA-2012", "SRC-CASE-DOCS"],
    blockIds: ["PP-POFA-001", "PP-POFA-007"],
  },
  {
    ...base,
    moduleId: "KB-POFA-02",
    topic: "PoFA",
    routeFamily: "POFA",
    useWhen: [
      "Notice was first sent by post and no prior Notice to Driver was issued.",
    ],
    doNotUseWhen: ["A Notice to Driver preceded the Notice to Keeper."],
    legalBasis: "PoFA Schedule 4 paragraph 9 route.",
    coreProposition:
      "Assess the statutory delivery timing applicable to a postal Notice to Keeper before alleging lateness.",
    aiMustCheck: [
      "Event date",
      "Issue date",
      "Presumed/actual delivery information",
      "Route",
    ],
    evidenceNeeded: ["Notice to Keeper showing issue date"],
    draftingNotes:
      "Do not allege a timing failure until the correct statutory calculation is confirmed.",
    sourceIds: ["SRC-POFA-2012", "SRC-CASE-DOCS"],
    blockIds: ["PP-POFA-003"],
  },
  {
    ...base,
    moduleId: "KB-POFA-03",
    topic: "PoFA",
    routeFamily: "POFA",
    useWhen: [
      "A Notice to Driver was placed on the vehicle and a later NTK is relied upon.",
    ],
    doNotUseWhen: ["No Notice to Driver was issued."],
    legalBasis: "PoFA Schedule 4 paragraph 8 route.",
    coreProposition:
      "Assess the separate Schedule 4 route and timing/content requirements for a notice following a Notice to Driver.",
    aiMustCheck: [
      "Date of parking event",
      "Notice to Driver",
      "NTK issue/delivery",
    ],
    evidenceNeeded: ["Windscreen notice", "Notice to Keeper"],
    draftingNotes: null,
    sourceIds: ["SRC-POFA-2012", "SRC-CASE-DOCS"],
    blockIds: ["PP-POFA-004"],
  },
  {
    ...base,
    moduleId: "KB-POFA-04",
    topic: "PoFA",
    routeFamily: "POFA",
    useWhen: [
      "A specific required Schedule 4 element appears missing or defective.",
    ],
    doNotUseWhen: [
      "The apparent defect arises only from OCR uncertainty.",
      "No specific defect has been identified.",
    ],
    legalBasis: "PoFA Schedule 4, route-specific requirements.",
    coreProposition:
      "Use only the precise defect established from the notice; do not generate a generic checklist challenge.",
    aiMustCheck: [
      "Vehicle",
      "Relevant land",
      "Period of parking",
      "Unpaid charge",
      "Creditor",
      "Statutory invitation/warning and other route-specific requirements",
    ],
    evidenceNeeded: ["Legible copy of the Notice to Keeper"],
    draftingNotes:
      "Do not assert defects from OCR uncertainty; require document confirmation where text is unclear.",
    sourceIds: ["SRC-POFA-2012", "SRC-CASE-DOCS"],
    blockIds: [
      "PP-POFA-005A",
      "PP-POFA-005B",
      "PP-POFA-005C",
      "PP-POFA-005D",
      "PP-POFA-005E",
    ],
  },
  {
    ...base,
    moduleId: "KB-POFA-05",
    topic: "PoFA",
    routeFamily: "POFA",
    useWhen: [
      "A valid PoFA failure is established and driver remains unidentified.",
    ],
    doNotUseWhen: [
      "No PoFA failure has been established.",
      "Driver has been formally identified.",
    ],
    legalBasis: "Protection of Freedoms Act 2012 Schedule 4.",
    coreProposition:
      "If Schedule 4 conditions are not met and the driver has not been established, the operator cannot transfer the driver's liability to the registered keeper under Schedule 4.",
    aiMustCheck: ["Confirmed PoFA failure", "driver_identified = NO"],
    evidenceNeeded: [],
    draftingNotes: "Never invite or infer driver identity.",
    sourceIds: ["SRC-POFA-2012"],
    blockIds: ["PP-POFA-006", "PP-POFA-002"],
  },

  /* ========= §4 Consideration, grace and actual parking time ========= */
  {
    ...base,
    moduleId: "KB-CON-01",
    topic: "Consideration",
    routeFamily: "CONSIDERATION",
    useWhen: [
      "Vehicle entered controlled land and time was needed before any parking terms could reasonably be accepted.",
    ],
    doNotUseWhen: [
      "The issue concerns an end-of-parking grace period rather than initial entry.",
    ],
    legalBasis:
      "Applicable Private Parking Sector Single Code provisions in force for the event.",
    coreProposition:
      "Entry onto land is not automatically acceptance of parking terms. Consider time reasonably required to find a space, locate/read terms, decide whether to stay and attempt initial compliance.",
    aiMustCheck: [
      "ANPR times",
      "Site layout",
      "Reason for initial period",
      "Whether parking actually took place",
      "Whether terms were rejected and vehicle left",
    ],
    evidenceNeeded: [],
    draftingNotes:
      "Do not merge consideration time with an end-of-parking grace period.",
    sourceIds: ["SRC-SINGLE-CODE"],
    blockIds: [
      "PP-CON-001",
      "PP-CON-002",
      "PP-CON-004",
      "PP-CON-005",
    ],
  },
  {
    ...base,
    moduleId: "KB-CON-02",
    topic: "Consideration",
    routeFamily: "CONSIDERATION",
    useWhen: [
      "Terms were considered but not accepted and the vehicle then left.",
    ],
    doNotUseWhen: ["Conduct clearly accepted the parking terms."],
    legalBasis: null,
    coreProposition:
      "Analyse whether a parking contract was ever accepted rather than treating all site presence as parking.",
    aiMustCheck: [
      "Duration",
      "Activity",
      "Evidence",
      "Whether any conduct clearly accepted the terms",
    ],
    evidenceNeeded: [],
    draftingNotes: null,
    sourceIds: ["SRC-SINGLE-CODE"],
    blockIds: ["PP-CON-003"],
  },
  {
    ...base,
    moduleId: "KB-GRACE-01",
    topic: "Grace",
    routeFamily: "GRACE",
    useWhen: [
      "A permitted/paid parking period ended and the allegation concerns additional time before exit.",
    ],
    doNotUseWhen: [
      "The issue concerns the initial consideration period rather than the end of parking.",
    ],
    legalBasis: "Applicable Private Parking Sector Single Code.",
    coreProposition:
      "Apply the applicable end-of-parking grace requirement only after establishing that it applies to the site/event.",
    aiMustCheck: [
      "Parking end time",
      "ANPR exit",
      "Applicable Code rule",
      "Event date",
      "Operator transition status",
    ],
    evidenceNeeded: [],
    draftingNotes: "Do not hard-code '10 minutes always cancels'.",
    sourceIds: ["SRC-SINGLE-CODE"],
    blockIds: [
      "PP-GRACE-001",
      "PP-GRACE-002",
      "PP-GRACE-004",
      "PP-GRACE-005",
    ],
  },
  {
    ...base,
    moduleId: "KB-GRACE-02",
    topic: "Grace",
    routeFamily: "GRACE",
    useWhen: [
      "Departure was delayed by queueing, congestion, barrier failure or site-management conditions.",
    ],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "An exit-camera timestamp may include non-parking time caused by the process of leaving the site.",
    aiMustCheck: [
      "Cause and duration of delay",
      "Site evidence",
      "Barrier/queue information",
      "Actual parking end time",
    ],
    evidenceNeeded: [],
    draftingNotes: null,
    sourceIds: ["SRC-SINGLE-CODE"],
    blockIds: ["PP-GRACE-003"],
  },
  {
    ...base,
    moduleId: "KB-TIME-01",
    topic: "ANPR duration",
    routeFamily: "ANPR",
    useWhen: [
      "Operator relies on entry and exit cameras to calculate duration.",
    ],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Distinguish total presence on controlled land from the period actually parked.",
    aiMustCheck: [
      "Entry/exit location",
      "Manoeuvring",
      "Finding a bay",
      "Payment activity",
      "Queueing",
      "Multiple visits",
    ],
    evidenceNeeded: [],
    draftingNotes:
      "Never claim every ANPR PCN fails PoFA because timestamps are not parking time.",
    sourceIds: ["SRC-OPERATOR-EVIDENCE"],
    blockIds: ["PP-ANPR-001", "PP-ANPR-002"],
  },

  /* ================= §5 Payment, keying and systems ================= */
  {
    ...base,
    moduleId: "KB-PAY-01",
    topic: "Payment",
    routeFamily: "PAYMENT",
    useWhen: [
      "Evidence or confirmed facts show a tariff/payment was made.",
    ],
    doNotUseWhen: ["No payment was made or attempted."],
    legalBasis: null,
    coreProposition:
      "Lead with payment and require the operator to reconcile its transaction records with the parking event.",
    aiMustCheck: [
      "Payment method",
      "Time",
      "Amount",
      "Location",
      "VRM entered",
      "Receipt/bank/app evidence",
    ],
    evidenceNeeded: [
      "Receipt",
      "App confirmation",
      "Bank transaction",
      "Payment screenshot",
    ],
    draftingNotes: null,
    sourceIds: ["SRC-SINGLE-CODE", "SRC-CMA-PRESS-2026-07-16"],
    blockIds: ["PP-PAY-001", "PP-PAY-002", "PP-PAY-006"],
  },
  {
    ...base,
    moduleId: "KB-PAY-02",
    topic: "Payment",
    routeFamily: "PAYMENT",
    useWhen: ["A genuine attempt to pay was prevented by a machine fault."],
    doNotUseWhen: ["No payment attempt was made."],
    legalBasis: null,
    coreProposition:
      "Analyse the operator-provided payment mechanism and the genuine attempt to comply; request relevant fault/maintenance/transaction records where appropriate.",
    aiMustCheck: [
      "Machine ID/location",
      "Attempt time",
      "Alternative methods",
      "Evidence of fault",
    ],
    evidenceNeeded: [
      "Photo/video",
      "Error message",
      "Witness evidence",
      "Transaction attempt",
    ],
    draftingNotes: null,
    sourceIds: ["SRC-SINGLE-CODE"],
    blockIds: ["PP-PAY-003", "PP-PAY-005"],
  },
  {
    ...base,
    moduleId: "KB-PAY-03",
    topic: "Payment",
    routeFamily: "PAYMENT",
    useWhen: [
      "Operator requires or offers digital payment and the process failed.",
    ],
    doNotUseWhen: ["No digital payment attempt was made."],
    legalBasis: null,
    coreProposition:
      "Consider whether a genuine attempt to comply was prevented by the provided system and whether alternative payment was realistically available.",
    aiMustCheck: [
      "App/system",
      "Time",
      "Error",
      "Connectivity",
      "Alternative methods",
      "Records",
    ],
    evidenceNeeded: [
      "Screenshots",
      "App history",
      "Bank authorisation",
      "Support messages",
    ],
    draftingNotes: null,
    sourceIds: ["SRC-SINGLE-CODE"],
    blockIds: ["PP-PAY-004", "PP-PAY-005"],
  },
  {
    ...base,
    moduleId: "KB-KEY-01",
    topic: "Keying error",
    routeFamily: "KEYING",
    useWhen: ["Payment made but VRM entry contains a minor error."],
    doNotUseWhen: ["No payment was made."],
    legalBasis:
      "Applicable sector Code provisions on keying/payment errors.",
    coreProposition:
      "Treat as a paid parking event with a registration mismatch and apply the applicable Code/keying-error requirements.",
    aiMustCheck: [
      "Correct VRM",
      "Entered VRM",
      "Payment match",
      "Error type",
    ],
    evidenceNeeded: ["Payment receipt showing entered VRM"],
    draftingNotes:
      "Do not hard-code an outcome from older withdrawn government proposals; the applicable current industry Code record controls the result.",
    sourceIds: ["SRC-SINGLE-CODE", "SRC-CMA-PRESS-2026-07-16"],
    blockIds: ["PP-KEY-001", "PP-KEY-002", "PP-KEY-004"],
  },
  {
    ...base,
    moduleId: "KB-KEY-02",
    topic: "Keying error",
    routeFamily: "KEYING",
    useWhen: [
      "Payment was made but another known vehicle registration was entered.",
    ],
    doNotUseWhen: ["No payment was made."],
    legalBasis: "Applicable sector Code provisions.",
    coreProposition:
      "Require transaction matching and analyse applicable Code treatment; do not describe the event as simply unpaid parking where tariff was paid.",
    aiMustCheck: [
      "Entered VRM",
      "Relationship to keeper/customer",
      "Payment record",
    ],
    evidenceNeeded: ["Payment record"],
    draftingNotes: null,
    sourceIds: ["SRC-SINGLE-CODE"],
    blockIds: ["PP-KEY-003", "PP-KEY-004"],
  },

  /* ================= §6 ANPR and evidence integrity ================= */
  {
    ...base,
    moduleId: "KB-ANPR-01",
    topic: "ANPR",
    routeFamily: "ANPR",
    useWhen: [
      "Vehicle attended the site more than once and operator may have paired first entry with final exit.",
    ],
    doNotUseWhen: ["Only one visit occurred."],
    legalBasis: null,
    coreProposition:
      "Require review of the complete ANPR sequence rather than two selected images.",
    aiMustCheck: [
      "All visits",
      "Intermediate captures",
      "Evidence vehicle was elsewhere",
    ],
    evidenceNeeded: [
      "Dashcam",
      "Receipts",
      "Location records supplied by customer",
      "CCTV",
      "Witness evidence",
    ],
    draftingNotes: null,
    sourceIds: ["SRC-OPERATOR-EVIDENCE"],
    blockIds: ["PP-ANPR-003", "PP-ANPR-005", "PP-ANPR-011"],
  },
  {
    ...base,
    moduleId: "KB-ANPR-02",
    topic: "ANPR",
    routeFamily: "ANPR",
    useWhen: ["Sequence appears incomplete or inconsistent."],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "An absent intermediate capture does not prove continuous presence; the operator should verify the full record and pairing logic.",
    aiMustCheck: [
      "Image sequence",
      "Timestamps",
      "Camera lanes",
      "Complete logs if disclosed",
    ],
    evidenceNeeded: [],
    draftingNotes: null,
    sourceIds: ["SRC-OPERATOR-EVIDENCE"],
    blockIds: ["PP-ANPR-010", "PP-ANPR-005"],
  },
  {
    ...base,
    moduleId: "KB-ANPR-03",
    topic: "ANPR",
    routeFamily: "ANPR",
    useWhen: [
      "Image, registration read or timestamp appears inconsistent.",
    ],
    doNotUseWhen: [
      "No factual trigger exists for a discrepancy allegation.",
    ],
    legalBasis: null,
    coreProposition:
      "Challenge only the identified discrepancy and request verification of the evidence relied upon.",
    aiMustCheck: [
      "Original images",
      "Timestamp",
      "OCR/VRM read",
      "System records",
    ],
    evidenceNeeded: [],
    draftingNotes:
      "Do not make generic calibration allegations with no factual trigger. Do not demand calibration records in every appeal regardless of issue.",
    sourceIds: ["SRC-OPERATOR-EVIDENCE"],
    blockIds: ["PP-ANPR-007", "PP-ANPR-008"],
  },
  {
    ...base,
    moduleId: "KB-EV-01",
    topic: "Evidence integrity",
    routeFamily: "ANPR",
    useWhen: [
      "Uploaded evidence conflicts with operator's duration/location/account.",
    ],
    doNotUseWhen: ["No independent evidence has been uploaded."],
    legalBasis: null,
    coreProposition:
      "Give the independent evidence appropriate weight and require the operator to reconcile the contradiction.",
    aiMustCheck: [
      "Authenticity",
      "Timestamp",
      "Location",
      "Relevance of evidence",
    ],
    evidenceNeeded: ["The independent evidence itself"],
    draftingNotes: null,
    sourceIds: ["SRC-OPERATOR-EVIDENCE"],
    blockIds: ["PP-ANPR-004"],
  },

  /* ============ §7 Signage and contract formation ============ */
  {
    ...base,
    moduleId: "KB-SIGN-01",
    topic: "Signage",
    routeFamily: "SIGNAGE",
    useWhen: [
      "Credible facts/evidence indicate parking terms were not adequately communicated on entry.",
    ],
    doNotUseWhen: [
      "The only basis is that the customer says they did not personally read the sign.",
    ],
    legalBasis: null,
    coreProposition:
      "Assess whether relevant terms were reasonably brought to attention before/at contract formation.",
    aiMustCheck: [
      "Entrance route",
      "Sign position",
      "Visibility",
      "Event lighting",
      "Contemporaneous images",
    ],
    evidenceNeeded: [
      "Customer photographs/video",
      "Operator site plan/signage evidence",
    ],
    draftingNotes:
      "The AI must not claim a sign is inadequate merely because the customer says they did not personally read it.",
    sourceIds: ["SRC-CRA-2015", "SRC-CASE-BEAVIS-2015", "SRC-CMA37-2026-07-22"],
    blockIds: ["PP-SIGN-001", "PP-SIGN-002"],
  },
  {
    ...base,
    moduleId: "KB-SIGN-02",
    topic: "Signage",
    routeFamily: "SIGNAGE",
    useWhen: [
      "The specific restriction or parking charge was not prominent/clear.",
    ],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Focus on the precise term allegedly breached and whether it was adequately communicated.",
    aiMustCheck: [
      "Sign wording",
      "Font/prominence",
      "Placement",
      "Allegation",
      "Lighting",
    ],
    evidenceNeeded: ["Photographs of the sign relied upon"],
    draftingNotes: null,
    sourceIds: ["SRC-CRA-2015", "SRC-CASE-BEAVIS-2015"],
    blockIds: ["PP-SIGN-004", "PP-SIGN-005"],
  },
  {
    ...base,
    moduleId: "KB-SIGN-03",
    topic: "Signage",
    routeFamily: "SIGNAGE",
    useWhen: ["Different signs communicate inconsistent terms."],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Identify the conflict and require the operator to explain which terms applied and how they were communicated.",
    aiMustCheck: ["Photos of each sign", "Site position", "Wording"],
    evidenceNeeded: ["Photographs of each conflicting sign"],
    draftingNotes: null,
    sourceIds: ["SRC-CRA-2015"],
    blockIds: ["PP-SIGN-011"],
  },
  {
    ...base,
    moduleId: "KB-SIGN-04",
    topic: "Signage",
    routeFamily: "SIGNAGE",
    useWhen: [
      "Operator relies on generic/undated signage evidence or customer evidence suggests change/damage.",
    ],
    doNotUseWhen: ["Signage in place at the material time is not disputed."],
    legalBasis: null,
    coreProposition:
      "Require evidence of signage actually in place at the material time where this is genuinely disputed.",
    aiMustCheck: [
      "Event date",
      "Operator photos",
      "Installation/change records if available",
    ],
    evidenceNeeded: [],
    draftingNotes: null,
    sourceIds: ["SRC-OPERATOR-EVIDENCE"],
    blockIds: ["PP-SIGN-001"],
  },

  /* ====== §8 Authorisation, permits and genuine use ====== */
  {
    ...base,
    moduleId: "KB-AUTH-01",
    topic: "Authorisation",
    routeFamily: "AUTHORIZATION",
    useWhen: [
      "Vehicle had permission from resident, employer, hotel, business, landholder or other authorised source.",
    ],
    doNotUseWhen: ["No underlying permission existed."],
    legalBasis: null,
    coreProposition:
      "Analyse the underlying permission before treating an admin/display mismatch as absence of authority.",
    aiMustCheck: [
      "Source",
      "Scope",
      "Date/time",
      "Vehicle registration",
      "Evidence",
    ],
    evidenceNeeded: ["Evidence of the permission relied upon"],
    draftingNotes: null,
    sourceIds: [],
    blockIds: ["PP-AUTH-001", "PP-AUTH-004"],
  },
  {
    ...base,
    moduleId: "KB-AUTH-02",
    topic: "Permit",
    routeFamily: "PERMIT",
    useWhen: ["A valid permit or whitelist entitlement existed."],
    doNotUseWhen: ["No permit or entitlement existed."],
    legalBasis: null,
    coreProposition:
      "Require operator to check physical/digital permit and whitelist records; distinguish entitlement from display/registration administration.",
    aiMustCheck: [
      "Permit number",
      "Validity",
      "Bay/site",
      "VRM",
      "Digital record",
    ],
    evidenceNeeded: ["Permit or digital entitlement record"],
    draftingNotes:
      "Never state that a permit held automatically cancels a charge.",
    sourceIds: [],
    blockIds: ["PP-AUTH-002", "PP-AUTH-004"],
  },
  {
    ...base,
    moduleId: "KB-AUTH-03",
    topic: "Authorisation",
    routeFamily: "AUTHORIZATION",
    useWhen: ["Vehicle was an authorised visitor."],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Analyse visitor permission and any registration process; do not assume a registration error extinguished underlying permission.",
    aiMustCheck: [
      "Host/resident confirmation",
      "Visitor system",
      "Dates",
      "Evidence",
    ],
    evidenceNeeded: ["Host/resident confirmation"],
    draftingNotes: null,
    sourceIds: [],
    blockIds: ["PP-AUTH-006"],
  },
  {
    ...base,
    moduleId: "KB-CUST-01",
    topic: "Genuine customer",
    routeFamily: "AUTHORIZATION",
    useWhen: [
      "Site is customer-only and evidence shows genuine use of premises.",
    ],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Use as a factual/authorisation route where relevant, not as an automatic cancellation rule.",
    aiMustCheck: [
      "Receipt/booking",
      "Premises",
      "Timing",
      "Landowner/occupier policy",
    ],
    evidenceNeeded: ["Receipt or booking confirmation"],
    draftingNotes:
      "Never state that genuine customer status automatically cancels a charge.",
    sourceIds: [],
    blockIds: ["PP-AUTH-008"],
  },
];
