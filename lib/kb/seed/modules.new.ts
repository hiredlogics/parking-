import type { KbModule } from "../types";

/**
 * KB modules for the route families introduced by V2 — breakdown,
 * residential rights, Equality Act, hospital, non-parking activity,
 * EV charging / infrastructure, landowner authority.
 *
 * Source: AI Legal Knowledge Base V2 §9–§15; MASTER Developer Pack V2
 * Parts 6 and 7; Legal Authority & Source Register V1 §7 and §8.
 */

const base = {
  version: 1,
  effectiveFrom: null,
  effectiveTo: null,
  status: "ACTIVE" as const,
  lastLegalReview: "2026-09-08",
  changeNotes: "Initial import from AI Legal Knowledge Base V2.",
};

export const KB_MODULES_NEW: KbModule[] = [
  /* ===== §9 Breakdown / frustration / involuntary immobilisation ===== */
  {
    ...base,
    moduleId: "KB-BREAK-01",
    topic: "Breakdown",
    routeFamily: "BREAKDOWN",
    useWhen: [
      "A genuine mechanical event prevented the vehicle from being moved or prevented timely compliance/departure.",
    ],
    doNotUseWhen: [
      "Ordinary inconvenience.",
      "Ordinary delay or convenience.",
      "A pre-existing issue that did not actually prevent compliance.",
    ],
    legalBasis:
      "Common-law frustration/impossibility principles; application is fact-sensitive and must not be presented as automatic. Also consider the applicable current Code/Appeals Charter breakdown or emergency provision.",
    coreProposition:
      "Consider whether an unforeseen supervening event outside the relevant party's control made contractual performance/departure impossible or materially prevented it. Frame as a substantive contractual issue where facts support it, not merely a plea for discretion.",
    aiMustCheck: [
      "Nature of fault",
      "When it arose",
      "Whether vehicle could safely/reasonably be moved",
      "Recovery/repair steps",
      "Duration",
      "Whether the alleged breach was caused by the breakdown",
    ],
    evidenceNeeded: [
      "AA/RAC/recovery report",
      "Garage invoice",
      "Roadside repair record",
      "Photographs",
      "Call logs/messages",
      "Contemporaneous assistance records",
    ],
    draftingNotes:
      "Do not state 'breakdown = automatic frustration'. Do not invent the fault or recovery attendance. Two separate routes exist: (A) current Code/Appeals Charter treatment of evidenced breakdown/emergency, and (B) contract-law frustration/impossibility. The Code route is often the strongest and simplest at initial appeal.",
    sourceIds: [
      "SRC-SINGLE-CODE",
      "SRC-CMA-PRESS-2026-07-16",
    ],
    blockIds: ["AI-BREAK-001", "AI-BREAK-002"],
  },
  {
    ...base,
    moduleId: "KB-BREAK-02",
    topic: "Breakdown",
    routeFamily: "BREAKDOWN",
    useWhen: [
      "A puncture, flat battery or similar event actually immobilised the vehicle.",
    ],
    doNotUseWhen: [
      "The vehicle could reasonably have departed or complied.",
    ],
    legalBasis:
      "Common-law frustration/impossibility principles; applicable current Code provisions.",
    coreProposition:
      "Treat as breakdown only where evidence/facts show the vehicle could not reasonably depart or comply; otherwise assess as ordinary delay.",
    aiMustCheck: ["Severity", "Safety", "Repair/recovery", "Time"],
    evidenceNeeded: [
      "Recovery or repair record",
      "Photographs",
      "Call logs",
    ],
    draftingNotes:
      "Where the issue is brief stopping for a puncture or similar, do not collapse this into frustration.",
    sourceIds: ["SRC-SINGLE-CODE"],
    blockIds: ["AI-BREAK-001"],
  },
  {
    ...base,
    moduleId: "KB-BREAK-03",
    topic: "Breakdown",
    routeFamily: "BREAKDOWN",
    useWhen: [
      "Vehicle remained while awaiting legitimate roadside recovery/assistance.",
    ],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Separate time caused by necessary recovery arrangements from voluntary parking and require operator to address the documented incident.",
    aiMustCheck: [
      "Call time",
      "Arrival time",
      "Departure/recovery time",
      "Recovery evidence",
    ],
    evidenceNeeded: ["Recovery attendance report", "Call logs"],
    draftingNotes: null,
    sourceIds: ["SRC-SINGLE-CODE"],
    blockIds: ["AI-BREAK-001", "AI-BREAK-002"],
  },

  /* ===== §10 Residential parking / primacy of contract ===== */
  {
    ...base,
    moduleId: "KB-RES-01",
    topic: "Residential rights",
    routeFamily: "RESIDENTIAL",
    useWhen: [
      "Resident/tenant/leaseholder relies on an uploaded agreement granting parking rights.",
    ],
    doNotUseWhen: [
      "No instrument has been uploaded.",
      "The appellant is merely a resident with no evidenced grant.",
    ],
    legalBasis:
      "Primacy of contract / pre-existing property rights; the uploaded lease, tenancy or parking grant is the primary source.",
    coreProposition:
      "The actual lease/tenancy/parking grant is the starting point. Later operator signage should not automatically be assumed to vary or extinguish pre-existing contractual/property rights.",
    aiMustCheck: [
      "Exact parking clause",
      "Allocated/communal bay",
      "Permit wording",
      "Power to make regulations",
      "Variation mechanism",
      "Parties",
      "Commencement date",
    ],
    evidenceNeeded: [
      "Lease",
      "Tenancy",
      "Parking-space grant",
      "Title/plan",
      "Managing-agent correspondence",
    ],
    draftingNotes:
      "Do not assert primacy merely because the appellant is a resident. Quote or accurately paraphrase only the relevant uploaded clause; never invent lease terms.",
    sourceIds: ["SRC-LEASE-TENANCY", "SRC-CASE-SAEED-2001"],
    blockIds: ["AI-RES-001"],
  },
  {
    ...base,
    moduleId: "KB-RES-02",
    topic: "Residential rights",
    routeFamily: "RESIDENTIAL",
    useWhen: [
      "Uploaded instrument grants a parking right without the restriction now alleged.",
    ],
    doNotUseWhen: [
      "The document does not support an unrestricted right.",
    ],
    legalBasis: "Construction of the uploaded grant.",
    coreProposition:
      "Where the wording genuinely grants an unrestricted/unfettered right, analyse whether a later permit/payment condition is inconsistent with that grant.",
    aiMustCheck: ["Exact clause and any qualifications/regulations"],
    evidenceNeeded: ["The uploaded instrument"],
    draftingNotes:
      "Never use the word 'unfettered' unless the document supports it.",
    sourceIds: ["SRC-LEASE-TENANCY"],
    blockIds: ["AI-RES-002"],
  },
  {
    ...base,
    moduleId: "KB-RES-03",
    topic: "Residential rights",
    routeFamily: "RESIDENTIAL",
    useWhen: [
      "Agreement identifies a specific bay/space or exclusive parking entitlement.",
    ],
    doNotUseWhen: [],
    legalBasis: "Construction of the uploaded grant.",
    coreProposition:
      "Analyse the resident's rights in that bay and whether the operator has authority to impose the alleged additional contractual term.",
    aiMustCheck: [
      "Plan/bay number",
      "Lease clause",
      "Permit requirements",
      "Management powers",
    ],
    evidenceNeeded: ["Lease/plan identifying the bay"],
    draftingNotes: null,
    sourceIds: ["SRC-LEASE-TENANCY"],
    blockIds: ["AI-RES-003"],
  },
  {
    ...base,
    moduleId: "KB-RES-04",
    topic: "Residential rights",
    routeFamily: "RESIDENTIAL",
    useWhen: [
      "Landlord/lessor granted a parking right and later arrangements arguably substantially interfere with the benefit granted.",
    ],
    doNotUseWhen: [
      "Boilerplate use in every residential appeal.",
      "The actual grant and later interference do not support the doctrine.",
    ],
    legalBasis:
      "Derogation from grant. Saeed v Plustrade Ltd [2001] EWCA Civ 2011 — a grantor must not derogate from its grant. Use only where the appellant's actual instrument grants a relevant parking right.",
    coreProposition:
      "Consider derogation from grant only where the actual grant and later interference support the doctrine.",
    aiMustCheck: [
      "Nature of grant",
      "Later scheme",
      "Degree of interference",
      "Contractual powers",
    ],
    evidenceNeeded: ["The uploaded grant"],
    draftingNotes:
      "Do not use as boilerplate in every residential appeal. Use only after legal/factual validation.",
    sourceIds: ["SRC-LEASE-TENANCY", "SRC-CASE-SAEED-2001"],
    blockIds: ["AI-RES-004"],
  },
  {
    ...base,
    moduleId: "KB-RES-05",
    topic: "Residential rights",
    routeFamily: "RESIDENTIAL",
    useWhen: [
      "Tenancy/lease rights and enforcement conduct raise a genuine interference issue.",
    ],
    doNotUseWhen: [
      "Quiet enjoyment would be used as a universal answer to a PCN.",
    ],
    legalBasis: "Covenant for quiet enjoyment.",
    coreProposition:
      "Use only where the contractual wording/facts support a quiet-enjoyment point; it is not a universal answer to a PCN.",
    aiMustCheck: [
      "Agreement terms",
      "Conduct",
      "Repeated interference if relevant",
    ],
    evidenceNeeded: ["The uploaded agreement"],
    draftingNotes:
      "Do not treat quiet enjoyment as meaning freedom from all parking regulation.",
    sourceIds: ["SRC-LEASE-TENANCY"],
    blockIds: [],
  },
  {
    ...base,
    moduleId: "KB-RES-06",
    topic: "Residential rights",
    routeFamily: "RESIDENTIAL",
    useWhen: [
      "Lease/tenancy contains a permit requirement, regulations clause or power to introduce parking controls.",
    ],
    doNotUseWhen: [],
    legalBasis: "Construction of the uploaded instrument.",
    coreProposition:
      "The AI must confront the clause and analyse its scope rather than omitting it. Primacy may be weaker or differently framed.",
    aiMustCheck: [
      "Exact clause",
      "Whether regulations were validly made",
      "Notice/variation process",
      "Allegation",
    ],
    evidenceNeeded: ["The uploaded instrument"],
    draftingNotes:
      "If the resident's agreement expressly requires compliance with a permit scheme or later regulations, the AI must address that wording rather than pretending it does not exist.",
    sourceIds: ["SRC-LEASE-TENANCY"],
    blockIds: ["AI-RES-001"],
  },
  {
    ...base,
    moduleId: "KB-RES-07",
    topic: "Residential rights",
    routeFamily: "RESIDENTIAL",
    useWhen: [
      "Resident rights exist and third-party operator enforcement is challenged.",
    ],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Assess whether the managing agent/landowner could grant enforcement rights consistent with the resident's existing agreement.",
    aiMustCheck: [
      "Lease powers",
      "Management agreement if available",
      "Site boundary",
      "Operator authority",
    ],
    evidenceNeeded: ["Lease", "Management agreement if available"],
    draftingNotes: null,
    sourceIds: ["SRC-LEASE-TENANCY"],
    blockIds: ["PP-LAND-001"],
  },

  /* ===== §11 Equality Act / additional time ===== */
  {
    ...base,
    moduleId: "KB-EQ-01",
    topic: "Equality Act",
    routeFamily: "EQUALITY",
    useWhen: [
      "Facts indicate disability-related needs may have affected use of the parking service or time required.",
    ],
    doNotUseWhen: [
      "No relevant disability-related facts exist.",
      "The ground would be generated generically.",
    ],
    legalBasis:
      "Equality Act 2010; apply only where statutory conditions are met.",
    coreProposition:
      "Consider whether reasonable adjustments/additional time were required and whether the operator properly considered the individual circumstances.",
    aiMustCheck: [
      "Relevant functional impact",
      "Extra time needed",
      "Operator knowledge where relevant",
      "Evidence supplied",
    ],
    evidenceNeeded: ["Only what is needed to establish the functional issue"],
    draftingNotes:
      "Do not require the customer to disclose unnecessary medical detail. Do not equate Blue Badge possession with the legal test. The AI cannot promise cancellation — state the duty/adjustment issue and require proper consideration.",
    sourceIds: ["SRC-EQA-2010"],
    blockIds: ["AI-EQ-001"],
  },
  {
    ...base,
    moduleId: "KB-EQ-02",
    topic: "Equality Act",
    routeFamily: "EQUALITY",
    useWhen: [
      "Disability-related circumstances reasonably required more time to enter, park, pay, return or leave.",
    ],
    doNotUseWhen: [],
    legalBasis: "Equality Act 2010.",
    coreProposition:
      "Do not assess the event solely by automated timestamps where additional time may constitute a reasonable adjustment.",
    aiMustCheck: [
      "Why extra time was needed and how it relates to the alleged breach",
    ],
    evidenceNeeded: [],
    draftingNotes: null,
    sourceIds: ["SRC-EQA-2010"],
    blockIds: ["AI-EQ-001"],
  },
  {
    ...base,
    moduleId: "KB-EQ-03",
    topic: "Equality Act",
    routeFamily: "EQUALITY",
    useWhen: [
      "No visible badge/indicator but disability-related facts are relevant.",
    ],
    doNotUseWhen: [],
    legalBasis: "Equality Act 2010.",
    coreProposition:
      "Absence of visible evidence does not itself resolve whether Equality Act duties were engaged.",
    aiMustCheck: [
      "Facts and evidence volunteered/necessary for the issue",
    ],
    evidenceNeeded: [],
    draftingNotes:
      "Do not assume a badge is required to trigger the Act.",
    sourceIds: ["SRC-EQA-2010"],
    blockIds: ["AI-EQ-001"],
  },

  /* ===== §12 Hospital / medical sites ===== */
  {
    ...base,
    moduleId: "KB-HOSP-01",
    topic: "Hospital",
    routeFamily: "HOSPITAL",
    useWhen: ["Parking event connected with hospital/medical attendance."],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Analyse the site's parking terms, exemptions/validation process, appointment/emergency circumstances and any relevant additional-time obligations.",
    aiMustCheck: [
      "Hospital",
      "Appointment/emergency",
      "Validation/payment process",
      "Evidence",
    ],
    evidenceNeeded: ["Appointment letter or attendance record"],
    draftingNotes: null,
    sourceIds: ["SRC-SINGLE-CODE"],
    blockIds: ["AI-HOSP-001"],
  },
  {
    ...base,
    moduleId: "KB-HOSP-02",
    topic: "Hospital",
    routeFamily: "HOSPITAL",
    useWhen: ["Emergency or clinical delay caused timing/parking issue."],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Treat the factual cause seriously and assess contractual/Code/adjustment issues rather than using generic sympathy wording.",
    aiMustCheck: [
      "Attendance records",
      "Appointment/clinical delay evidence where available",
    ],
    evidenceNeeded: ["Attendance or clinical delay evidence"],
    draftingNotes:
      "Do not invent medical facts or request excessive health information.",
    sourceIds: ["SRC-SINGLE-CODE", "SRC-EQA-2010"],
    blockIds: ["AI-HOSP-001"],
  },
  {
    ...base,
    moduleId: "KB-HOSP-03",
    topic: "Hospital",
    routeFamily: "HOSPITAL",
    useWhen: [
      "NHS/healthcare landholder has a cancellation or exemption mechanism.",
    ],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Where appropriate, flag landholder/PALS cancellation as a parallel practical route while still generating the operator appeal.",
    aiMustCheck: ["Trust/site policy and evidence"],
    evidenceNeeded: [],
    draftingNotes:
      "This is a parallel practical route — it does not replace the operator appeal.",
    sourceIds: [],
    blockIds: ["AI-HOSP-001"],
  },

  /* ===== §13 Loading, drop-off, collection, non-parking activity ===== */
  {
    ...base,
    moduleId: "KB-ACT-01",
    topic: "Loading",
    routeFamily: "LOADING",
    useWhen: [
      "Vehicle presence was genuinely for loading/unloading and the allegation/site terms make this legally/factually relevant.",
    ],
    doNotUseWhen: [
      "Loading would be assumed always exempt on private land.",
    ],
    legalBasis: null,
    coreProposition:
      "Distinguish the activity from ordinary parking where the contract/site rights recognise the distinction; analyse actual terms and evidence.",
    aiMustCheck: [
      "Nature/duration of loading",
      "Goods",
      "Site terms",
      "Evidence",
    ],
    evidenceNeeded: [],
    draftingNotes:
      "Do not assume loading is always exempt on private land. Jopson v Homeguard is persuasive only and disabled by default.",
    sourceIds: ["SRC-CASE-JOPSON-2016"],
    blockIds: ["AI-ACT-001"],
  },
  {
    ...base,
    moduleId: "KB-ACT-02",
    topic: "Drop-off",
    routeFamily: "DROP_OFF",
    useWhen: ["Vehicle stopped briefly for genuine drop-off/collection."],
    doNotUseWhen: ["A universal exemption would be assumed."],
    legalBasis: null,
    coreProposition:
      "Analyse the precise site restriction and whether stopping/parking/contract formation is established; do not assume a universal exemption.",
    aiMustCheck: ["Duration", "Location", "Signage", "Activity"],
    evidenceNeeded: [],
    draftingNotes: null,
    sourceIds: [],
    blockIds: ["AI-ACT-001"],
  },
  {
    ...base,
    moduleId: "KB-ACT-03",
    topic: "Collection delay",
    routeFamily: "LOADING",
    useWhen: [
      "Authorised customer use involved a collection/check-in/waiting process.",
    ],
    doNotUseWhen: [
      "Ordinary waiting would be converted into an automatic exemption.",
    ],
    legalBasis: null,
    coreProposition:
      "Use the underlying authorisation and factual delay where relevant; do not convert ordinary waiting into an automatic exemption.",
    aiMustCheck: ["Booking/order/receipt", "Authorisation", "Timing"],
    evidenceNeeded: ["Booking or order confirmation"],
    draftingNotes: null,
    sourceIds: [],
    blockIds: ["PP-AUTH-008"],
  },

  /* ===== §14 EV charging and site infrastructure ===== */
  {
    ...base,
    moduleId: "KB-EVCH-01",
    topic: "EV charging",
    routeFamily: "EV_CHARGING",
    useWhen: [
      "Vehicle remained for genuine charging and allegation relates to duration/payment/authorisation.",
    ],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Analyse charging terms separately from ordinary parking terms and establish whether the charge concerned parking, charging, overstay or tariff.",
    aiMustCheck: [
      "Charge session",
      "App/charger record",
      "Bay terms",
      "Parking terms",
    ],
    evidenceNeeded: ["Charging session record"],
    draftingNotes: null,
    sourceIds: [],
    blockIds: ["AI-EVCH-001"],
  },
  {
    ...base,
    moduleId: "KB-INFRA-01",
    topic: "Infrastructure",
    routeFamily: "INFRASTRUCTURE",
    useWhen: [
      "Entry/exit or compliance was prevented/delayed by site infrastructure.",
    ],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Time caused by operator/landholder infrastructure should be distinguished from voluntary parking where supported.",
    aiMustCheck: [
      "Barrier/access fault",
      "Queue",
      "Timestamps",
      "Evidence",
    ],
    evidenceNeeded: [],
    draftingNotes: null,
    sourceIds: [],
    blockIds: ["PP-GRACE-003"],
  },

  /* ===== §15 Landowner authority ===== */
  {
    ...base,
    moduleId: "KB-LAND-01",
    topic: "Landowner authority",
    routeFamily: "LANDOWNER",
    useWhen: ["A proportionate authority challenge is relevant."],
    doNotUseWhen: [
      "It would be asserted that no authority exists merely because the customer has not seen the contract.",
    ],
    legalBasis: null,
    coreProposition:
      "Require evidence that the operator had sufficient authority to operate/enforce at the specific site and material date.",
    aiMustCheck: ["Site", "Event date", "Contracting party", "Scope"],
    evidenceNeeded: [],
    draftingNotes:
      "At initial appeal do not falsely assert that no authority exists merely because the customer has not seen the contract. Keep concise at initial operator stage.",
    sourceIds: [],
    blockIds: ["PP-LAND-001", "PP-LAND-002", "PP-LAND-006"],
  },
  {
    ...base,
    moduleId: "KB-LAND-02",
    topic: "Landowner authority",
    routeFamily: "LANDOWNER",
    useWhen: ["Evidence suggests location, date or scope mismatch."],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Focus on the specific mismatch: land boundary, term, expiry, cancellation powers or enforcement scope.",
    aiMustCheck: [
      "Contract/authority evidence if supplied",
      "Site plan",
      "Dates",
    ],
    evidenceNeeded: [],
    draftingNotes: null,
    sourceIds: [],
    blockIds: ["PP-LAND-005", "PP-LAND-006"],
  },
  {
    ...base,
    moduleId: "KB-LAND-03",
    topic: "Landowner authority",
    routeFamily: "LANDOWNER",
    useWhen: [
      "Operator later provides authority evidence but redactions prevent material verification.",
    ],
    doNotUseWhen: [],
    legalBasis: null,
    coreProposition:
      "Challenge only redactions that prevent verification of parties, land, duration or enforcement scope.",
    aiMustCheck: ["Document supplied and visible omissions"],
    evidenceNeeded: [],
    draftingNotes: null,
    sourceIds: [],
    blockIds: ["PP-LAND-008"],
  },
];
