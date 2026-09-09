import type { LegalSource } from "../types";

/**
 * Legal Authority & Source Register V1 — seed data.
 *
 * §1 authority hierarchy, §2 core legislation, §6 Beavis, §7 residential
 * authorities, §9 CMA 2026 developments, §16 status flags.
 *
 * Rules encoded:
 *   - Case-law quotation is DISABLED by default (KB-GOV-06 / §17).
 *   - WITHDRAWN / GOVERNMENT_PROPOSAL / OPEN_INVESTIGATION must never be
 *     presented as current binding law.
 */
export const LEGAL_SOURCES: LegalSource[] = [
  /* ---------------- §2 Core legislation ---------------- */
  {
    sourceId: "SRC-POFA-2012",
    title: "Protection of Freedoms Act 2012, s56 and Schedule 4",
    jurisdiction: "ENGLAND_WALES",
    authorityLevel: "PRIMARY_LEGISLATION",
    status: "BINDING_LEGISLATION",
    effectiveFrom: "2012-10-01",
    effectiveTo: null,
    sourceReference: "PoFA 2012 s56; Sch 4",
    sourceUrl: "https://www.legislation.gov.uk/ukpga/2012/9/schedule/4",
    lastReviewedAt: "2026-09-08",
    quotationEnabled: false,
    notes:
      "Recovery of unpaid parking charges from keeper/hirer in England and Wales where statutory conditions are met. Route-specific checks required for Notice to Driver / Notice to Keeper, relevant land, timing and prescribed information. Failure affects keeper liability only; it does not automatically erase driver liability.",
  },
  {
    sourceId: "SRC-CRA-2015",
    title: "Consumer Rights Act 2015",
    jurisdiction: "UK",
    authorityLevel: "PRIMARY_LEGISLATION",
    status: "BINDING_LEGISLATION",
    effectiveFrom: "2015-10-01",
    effectiveTo: null,
    sourceReference: "CRA 2015",
    sourceUrl: "https://www.legislation.gov.uk/ukpga/2015/15/contents",
    lastReviewedAt: "2026-09-08",
    quotationEnabled: false,
    notes:
      "Fairness and transparency of consumer contract terms/notices. Use only where the term, notice or charge raises a genuine fairness/transparency issue. Not generic boilerplate.",
  },
  {
    sourceId: "SRC-EQA-2010",
    title: "Equality Act 2010, including ss20/29 and Schedule 2",
    jurisdiction: "UK",
    authorityLevel: "PRIMARY_LEGISLATION",
    status: "BINDING_LEGISLATION",
    effectiveFrom: "2010-10-01",
    effectiveTo: null,
    sourceReference: "EqA 2010 ss20, 29; Sch 2",
    sourceUrl: "https://www.legislation.gov.uk/ukpga/2010/15/contents",
    lastReviewedAt: "2026-09-08",
    quotationEnabled: false,
    notes:
      "Reasonable adjustments in services and disability-related disadvantage. Apply only when facts engage the Act. Do not require unnecessary medical disclosure; Blue Badge status is not the statutory test.",
  },
  {
    sourceId: "SRC-PARKING-COP-ACT-2019",
    title: "Parking (Code of Practice) Act 2019",
    jurisdiction: "UK",
    authorityLevel: "PRIMARY_LEGISLATION",
    status: "BINDING_LEGISLATION",
    effectiveFrom: "2019-03-15",
    effectiveTo: null,
    sourceReference: "Parking (Code of Practice) Act 2019",
    sourceUrl: "https://www.legislation.gov.uk/ukpga/2019/8/contents",
    lastReviewedAt: "2026-09-08",
    quotationEnabled: false,
    notes:
      "Statutory framework requiring a government private parking Code and appeals arrangements. Important framework law — must NOT be confused with the current industry Single Code.",
  },
  {
    sourceId: "SRC-DMCCA-2024",
    title:
      "Digital Markets, Competition and Consumers Act 2024 / current consumer protection regime",
    jurisdiction: "UK",
    authorityLevel: "PRIMARY_LEGISLATION",
    status: "BINDING_LEGISLATION",
    effectiveFrom: "2024-05-24",
    effectiveTo: null,
    sourceReference: "DMCCA 2024",
    sourceUrl: null,
    lastReviewedAt: "2026-09-08",
    quotationEnabled: false,
    notes:
      "Consumer protection enforcement context including CMA direct enforcement powers. Do NOT generate technical DMCC claims unless a verified knowledge module is enabled.",
  },

  /* ---------------- §6 / §7 Case law ---------------- */
  {
    sourceId: "SRC-CASE-BEAVIS-2015",
    title: "ParkingEye Ltd v Beavis [2015] UKSC 67",
    jurisdiction: "UK",
    authorityLevel: "BINDING_APPELLATE_CASE",
    status: "BINDING_APPELLATE_CASE",
    effectiveFrom: "2015-11-04",
    effectiveTo: null,
    sourceReference: "[2015] UKSC 67",
    sourceUrl: "https://www.supremecourt.uk/cases/ukSC-2015-0116",
    lastReviewedAt: "2026-09-08",
    quotationEnabled: false,
    notes:
      "Leading Supreme Court authority on a private parking charge in its particular factual setting. MAY be used for: a charge can be commercially justified and enforceable in an appropriate scheme; prominence of charge/signage and legitimate interest mattered; fact-specific distinctions may matter. MUST NOT be used to say: every £100 charge is automatically valid; Beavis eliminates all signage/fairness/contract arguments; the charge must equal the operator's financial loss. Kills the obsolete generic 'unenforceable penalty / not a genuine pre-estimate of loss' argument.",
  },
  {
    sourceId: "SRC-CASE-SAEED-2001",
    title: "Saeed v Plustrade Ltd [2001] EWCA Civ 2011",
    jurisdiction: "ENGLAND_WALES",
    authorityLevel: "BINDING_APPELLATE_CASE",
    status: "BINDING_APPELLATE_CASE",
    effectiveFrom: "2001-12-14",
    effectiveTo: null,
    sourceReference: "[2001] EWCA Civ 2011",
    sourceUrl: "https://www.bailii.org/ew/cases/EWCA/Civ/2001/2011.html",
    lastReviewedAt: "2026-09-08",
    quotationEnabled: false,
    notes:
      "Court of Appeal authority demonstrating that an express parking right can be protected against substantial interference, applying the principle that a grantor must not derogate from its grant. Use ONLY where the appellant's actual instrument grants a relevant parking right.",
  },
  {
    sourceId: "SRC-CASE-JOPSON-2016",
    title:
      "Jopson v Homeguard Services Ltd, B9GF0A9E (Oxford County Court appeal, 2016)",
    jurisdiction: "ENGLAND_WALES",
    authorityLevel: "PERSUASIVE_AUTHORITY",
    status: "PERSUASIVE_CASE",
    effectiveFrom: "2016-01-01",
    effectiveTo: null,
    sourceReference: "B9GF0A9E (Oxford CC, 2016)",
    sourceUrl: null,
    lastReviewedAt: "2026-09-08",
    quotationEnabled: false,
    notes:
      "DISABLED BY DEFAULT. Potential persuasive authority on the distinction between parking and brief stopping/loading in a residential context. Must NOT be presented as binding Court of Appeal authority. Use only if a verified transcript is stored and an administrator has enabled it.",
  },

  /* ---------------- §4 Industry Code ---------------- */
  {
    sourceId: "SRC-SINGLE-CODE",
    title: "Private Parking Sector Single Code of Practice",
    jurisdiction: "UK",
    authorityLevel: "INDUSTRY_CODE",
    status: "INDUSTRY_CODE_CURRENT",
    effectiveFrom: "2024-10-01",
    effectiveTo: null,
    sourceReference: "Sector Single Code of Practice (see code_versions)",
    sourceUrl:
      "https://www.britishparking.co.uk/Code-of-Practice-and-Compliance-Monitoring/Parking-News-Online",
    lastReviewedAt: "2026-09-08",
    quotationEnabled: false,
    notes:
      "Contractual/accreditation standard for participating operators — NOT an Act of Parliament. Version and transition must be resolved by parking event date and operator/ATA. See code_versions table.",
  },
  {
    sourceId: "SRC-BPA-CODE-V9",
    title: "BPA Approved Operator Scheme Code of Practice, Version 9",
    jurisdiction: "UK",
    authorityLevel: "INDUSTRY_CODE",
    status: "INDUSTRY_CODE_HISTORIC",
    effectiveFrom: "2024-02-01",
    effectiveTo: "2024-10-01",
    sourceReference: "BPA AOS Code v9",
    sourceUrl:
      "https://www.britishparking.co.uk/Code-of-Practice-and-Compliance-Monitoring/Parking-News-Online",
    lastReviewedAt: "2026-09-08",
    quotationEnabled: false,
    notes:
      "Historic version. BPA states its Version 9 applies to BPA non-compliance issues from 1 February 2024 to before 1 October 2024. Use only for event-date matching.",
  },

  /* ---------------- §5 Government Code status ---------------- */
  {
    sourceId: "SRC-GOV-CODE-2022-WITHDRAWN",
    title: "Government Private Parking Code of Practice (February 2022)",
    jurisdiction: "UK",
    authorityLevel: "GOVERNMENT_CONSULTATION",
    status: "WITHDRAWN",
    effectiveFrom: "2022-02-07",
    effectiveTo: "2022-06-30",
    sourceReference: "Withdrawn Government Code (Feb 2022)",
    sourceUrl: null,
    lastReviewedAt: "2026-09-08",
    quotationEnabled: false,
    notes:
      "WITHDRAWN. Historical/policy context only. Must NEVER be cited as a current binding requirement. Do not hard-code outcomes (e.g. grace/keying rules) from this source.",
  },
  {
    sourceId: "SRC-MHCLG-CONSULT-2025",
    title:
      "MHCLG consultation on a private parking Code of Practice (2025)",
    jurisdiction: "UK",
    authorityLevel: "GOVERNMENT_CONSULTATION",
    status: "GOVERNMENT_PROPOSAL",
    effectiveFrom: "2025-01-01",
    effectiveTo: null,
    sourceReference: "MHCLG consultation 2025",
    sourceUrl:
      "https://www.gov.uk/government/consultations/private-parking-code-of-practice",
    lastReviewedAt: "2026-09-08",
    quotationEnabled: false,
    notes:
      "Consultation before preparing a new government Code. The AI must NOT describe the government Code as already in force. The consultation page is the authoritative status source for this project.",
  },

  /* ---------------- §9 CMA 2026 developments ---------------- */
  {
    sourceId: "SRC-CMA-LETTER-2026-07-16",
    title: "CMA letter to government in relation to private parking (16 July 2026)",
    jurisdiction: "UK",
    authorityLevel: "REGULATOR_GUIDANCE",
    status: "REGULATOR_GUIDANCE",
    effectiveFrom: "2026-07-16",
    effectiveTo: null,
    sourceReference: "CMA letter, 16 July 2026",
    sourceUrl:
      "https://www.gov.uk/government/publications/cma-letter-to-government-in-relation-to-private-parking",
    lastReviewedAt: "2026-09-08",
    quotationEnabled: false,
    notes:
      "Regulatory recommendations/context. Not a court judgment and not legislation.",
  },
  {
    sourceId: "SRC-CMA-PRESS-2026-07-16",
    title:
      "CMA press release — parking charges: CMA takes action to drive improvements for motorists (16 July 2026)",
    jurisdiction: "UK",
    authorityLevel: "REGULATOR_GUIDANCE",
    status: "REGULATOR_GUIDANCE",
    effectiveFrom: "2026-07-16",
    effectiveTo: null,
    sourceReference: "CMA press release, 16 July 2026",
    sourceUrl:
      "https://www.gov.uk/government/news/parking-charges-cma-takes-action-to-drive-improvements-for-motorists",
    lastReviewedAt: "2026-09-08",
    quotationEnabled: false,
    notes:
      "Current consumer-facing statements on appeals, emergencies and keying errors; useful for policy/context. CMA July 2026 material states a charge should be cancelled where evidence shows an applicable exemption, giving an emergency outside the motorist's control as an example, and refers to the industry Appeals Charter.",
  },
  {
    sourceId: "SRC-CMA-ECP-INVESTIGATION",
    title: "Euro Car Parks consumer protection enforcement case",
    jurisdiction: "UK",
    authorityLevel: "REGULATOR_GUIDANCE",
    status: "OPEN_INVESTIGATION",
    effectiveFrom: "2026-07-16",
    effectiveTo: null,
    sourceReference: "CMA case — Euro Car Parks",
    sourceUrl:
      "https://www.gov.uk/cma-cases/euro-car-parks-consumer-protection-enforcement-case",
    lastReviewedAt: "2026-09-08",
    quotationEnabled: false,
    notes:
      "OPEN INVESTIGATION ONLY. Never state or imply that Euro Car Parks has been found to breach consumer law unless and until an official finding says so. No infringement may be inferred from the existence of an investigation.",
  },
  {
    sourceId: "SRC-CMA37-2026-07-22",
    title: "CMA37 — Unfair contract terms guidance (updated 22 July 2026)",
    jurisdiction: "UK",
    authorityLevel: "REGULATOR_GUIDANCE",
    status: "REGULATOR_GUIDANCE",
    effectiveFrom: "2026-07-22",
    effectiveTo: null,
    sourceReference: "CMA37",
    sourceUrl:
      "https://www.gov.uk/government/publications/unfair-contract-terms-cma37",
    lastReviewedAt: "2026-09-08",
    quotationEnabled: false,
    notes:
      "Current CMA guidance on fairness/transparency under the Consumer Rights Act 2015. Guidance, not legislation.",
  },

  /* ---------------- Primary case documents ---------------- */
  {
    sourceId: "SRC-CASE-DOCS",
    title: "PCN / Notice to Keeper / Notice to Driver (uploaded)",
    jurisdiction: "NOT_APPLICABLE",
    authorityLevel: "REGULATOR_GUIDANCE",
    status: "BINDING_LEGISLATION",
    effectiveFrom: null,
    effectiveTo: null,
    sourceReference: "Case documents",
    sourceUrl: null,
    lastReviewedAt: "2026-09-08",
    quotationEnabled: true,
    notes:
      "Primary source for allegation, dates, amount, location, notice route and PoFA analysis. Treated as an evidential source, not a legal authority — quotation of the customer's own document is permitted.",
  },
  {
    sourceId: "SRC-LEASE-TENANCY",
    title: "Uploaded lease / tenancy / parking grant",
    jurisdiction: "NOT_APPLICABLE",
    authorityLevel: "REGULATOR_GUIDANCE",
    status: "BINDING_LEGISLATION",
    effectiveFrom: null,
    effectiveTo: null,
    sourceReference: "Customer instrument",
    sourceUrl: null,
    lastReviewedAt: "2026-09-08",
    quotationEnabled: true,
    notes:
      "Primary source for residential rights. The AI must analyse the actual wording and never assume rights. Quote or accurately paraphrase only the relevant uploaded clause; never invent lease terms.",
  },
  {
    sourceId: "SRC-OPERATOR-EVIDENCE",
    title: "Operator evidence / photographs / ANPR / payment records",
    jurisdiction: "NOT_APPLICABLE",
    authorityLevel: "REGULATOR_GUIDANCE",
    status: "BINDING_LEGISLATION",
    effectiveFrom: null,
    effectiveTo: null,
    sourceReference: "Operator evidence",
    sourceUrl: null,
    lastReviewedAt: "2026-09-08",
    quotationEnabled: true,
    notes:
      "Primary factual evidence. Distinguish total site presence from proven parking time.",
  },
];
