import type { CrmState } from "./types";

/**
 * Realistic seed data for the CRM demo. All customer names, emails and
 * addresses are fictional; every reference / claim number is fabricated.
 */

const iso = (offsetDays: number, h = 10, m = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCHours(h, m, 0, 0);
  return d.toISOString();
};

export function buildSeedState(): CrmState {
  const admins: CrmState["admins"] = [
    { id: "adm_merika", name: "Merika", email: "merika@parkingappealsgroup.co.uk", role: "OWNER", avatarInitials: "MK" },
    { id: "adm_pa_ai", name: "PA Assistant", email: "assistant@parkingappealsgroup.co.uk", role: "STAFF", avatarInitials: "PA" },
    { id: "adm_legal", name: "Legal Team", email: "legal@parkingappealsgroup.co.uk", role: "ADMIN", avatarInitials: "LT" },
  ];

  const clients: CrmState["clients"] = [
    { id: "cl_smith", name: "John Smith", email: "j.smith@example.co.uk", phone: "07700 900123", address: "10 High Street, Northampton, NN1 1AA", joinedAt: iso(-42), lastActivityAt: iso(-1) },
    { id: "cl_brown", name: "David Brown", email: "d.brown@example.co.uk", phone: "07700 900456", joinedAt: iso(-30), lastActivityAt: iso(-2) },
    { id: "cl_jones", name: "Sarah Jones", email: "s.jones@example.co.uk", phone: "07700 900789", joinedAt: iso(-25), lastActivityAt: iso(-3) },
    { id: "cl_wilson", name: "Rachel Adams", email: "r.adams@example.co.uk", phone: "07700 900101", joinedAt: iso(-19), lastActivityAt: iso(-4) },
    { id: "cl_taylor", name: "Lisa Taylor", email: "l.taylor@example.co.uk", phone: "07700 900202", joinedAt: iso(-16), lastActivityAt: iso(-1) },
    { id: "cl_green", name: "Emma Green", email: "e.green@example.co.uk", phone: "07700 900303", joinedAt: iso(-14), lastActivityAt: iso(-1) },
    { id: "cl_davies", name: "Mark Davies", email: "m.davies@example.co.uk", phone: "07700 900404", joinedAt: iso(-12), lastActivityAt: iso(-5) },
    { id: "cl_hall", name: "Daniel Hall", email: "d.hall@example.co.uk", phone: "07700 900505", joinedAt: iso(-10), lastActivityAt: iso(-2) },
    { id: "cl_white", name: "Michael White", email: "m.white@example.co.uk", phone: "07700 900606", joinedAt: iso(-8), lastActivityAt: iso(-1) },
    { id: "cl_johnson", name: "Robert Johnson", email: "r.johnson@example.co.uk", phone: "07700 900707", joinedAt: iso(-8), lastActivityAt: iso(0) },
    { id: "cl_campbell", name: "Kevin Campbell", email: "k.campbell@example.co.uk", phone: "07700 900808", joinedAt: iso(-6), lastActivityAt: iso(0) },
    { id: "cl_allen", name: "Steven Allen", email: "s.allen@example.co.uk", phone: "07700 900909", joinedAt: iso(-3), lastActivityAt: iso(0) },
    { id: "cl_ward", name: "Amelia Ward", email: "a.ward@example.co.uk", phone: "07700 900010", joinedAt: iso(-45), lastActivityAt: iso(-6) },
    { id: "cl_hughes", name: "Nathan Hughes", email: "n.hughes@example.co.uk", phone: "07700 900011", joinedAt: iso(-9), lastActivityAt: iso(-1) },
  ];

  const cases: CrmState["cases"] = [
    // AWAITING REVIEW
    {
      id: "case_awr_1",
      clientId: "cl_smith",
      reference: "PAG-2026-125",
      type: "COUNTY_COURT",
      status: "AWAITING_REVIEW",
      priority: "HIGH",
      assignedTo: "adm_merika",
      createdAt: iso(-2),
      updatedAt: iso(-1),
      summary:
        "Client has received a County Court Claim for an unpaid parking charge. Client believes the signage was unclear and disputes the charge. No previous court experience.",
      claimNumber: "K0X71234",
      courtName: "Northampton County Court",
      claimant: "ParkingLoge Ltd",
      claimAmount: 160,
      aosDeadline: iso(6),
      defenceDeadline: iso(19),
      keyDates: [
        { label: "AOS Deadline", date: iso(6), tag: "10 days left" },
        { label: "Defence Deadline", date: iso(19), tag: "20 days left" },
      ],
    },
    { id: "case_awr_2", clientId: "cl_brown", reference: "PAG-2026-124", type: "COUNTY_COURT", status: "AWAITING_REVIEW", priority: "MEDIUM", createdAt: iso(-3), updatedAt: iso(-3) },
    { id: "case_awr_3", clientId: "cl_jones", reference: "PAG-2026-111", type: "CCJ_REMOVAL", status: "AWAITING_REVIEW", priority: "MEDIUM", createdAt: iso(-4), updatedAt: iso(-4), ccjBasis: "Set aside — never served" },
    { id: "case_awr_4", clientId: "cl_wilson", reference: "PAG-2026-103", type: "BAILIFF_ENFORCEMENT", status: "AWAITING_REVIEW", priority: "URGENT", createdAt: iso(-1), updatedAt: iso(-1), enforcementCompany: "Marston (Northampton)", riskLevel: "HIGH", bailiffStage: "COMPLIANCE" },
    // IN_PROGRESS
    { id: "case_ip_1", clientId: "cl_taylor", reference: "PAG-2026-028", type: "CCJ_REMOVAL", status: "IN_PROGRESS", priority: "MEDIUM", assignedTo: "adm_legal", createdAt: iso(-9), updatedAt: iso(-1), ccjBasis: "Set aside — never served", ccjApplicationStage: "APPLICATION" },
    { id: "case_ip_2", clientId: "cl_green", reference: "PAG-2026-024", type: "CCJ_REMOVAL", status: "IN_PROGRESS", priority: "MEDIUM", createdAt: iso(-8), updatedAt: iso(-1) },
    { id: "case_ip_3", clientId: "cl_white", reference: "PAG-2026-022", type: "BAILIFF_ENFORCEMENT", status: "IN_PROGRESS", priority: "HIGH", createdAt: iso(-7), updatedAt: iso(-2), enforcementCompany: "CDER Group", riskLevel: "HIGH", bailiffStage: "ENFORCEMENT" },
    // AWAITING_CLIENT
    { id: "case_ac_1", clientId: "cl_davies", reference: "PAG-2026-002", type: "BAILIFF_ENFORCEMENT", status: "AWAITING_CLIENT", priority: "HIGH", createdAt: iso(-6), updatedAt: iso(-2), enforcementCompany: "Marston" },
    { id: "case_ac_2", clientId: "cl_johnson", reference: "PAG-2026-018", type: "BAILIFF_ENFORCEMENT", status: "AWAITING_CLIENT", priority: "MEDIUM", createdAt: iso(-6), updatedAt: iso(-3) },
    // READY_TO_DRAFT
    { id: "case_rd_1", clientId: "cl_campbell", reference: "PAG-2026-022", type: "BAILIFF_ENFORCEMENT", status: "READY_TO_DRAFT", priority: "MEDIUM", createdAt: iso(-4), updatedAt: iso(-1), enforcementCompany: "Bristow & Sutor" },
    { id: "case_rd_2", clientId: "cl_hall", reference: "PAG-2026-103", type: "CCJ_REMOVAL", status: "READY_TO_DRAFT", priority: "MEDIUM", createdAt: iso(-4), updatedAt: iso(0) },
    // COMPLETED
    { id: "case_cp_1", clientId: "cl_allen", reference: "CC-2026-041", type: "COUNTY_COURT", status: "COMPLETED", priority: "LOW", createdAt: iso(-20), updatedAt: iso(-2), countyCourtStage: "COMPLETED" },
    { id: "case_cp_2", clientId: "cl_ward", reference: "PAG-2026-071", type: "BAILIFF_ENFORCEMENT", status: "COMPLETED", priority: "LOW", createdAt: iso(-25), updatedAt: iso(-9), bailiffStage: "RESOLVED" },
    { id: "case_cp_3", clientId: "cl_hughes", reference: "PAG-2026-019", type: "CCJ_REMOVAL", status: "COMPLETED", priority: "LOW", createdAt: iso(-27), updatedAt: iso(-6), ccjApplicationStage: "CCJ_REMOVED" },
  ];

  const appeals: CrmState["appeals"] = [
    { id: "ap_1", clientId: "cl_smith", service: "PRIVATE_PARKING", pcnReference: "BR/PCN/2026/00123", vrm: "AB12 CDE", operator: "Britannia Parking Ltd", createdAt: iso(-1), appealStatus: "GENERATED", documentStatus: "DOWNLOADED", evidenceCount: 2, generatedDocumentName: "Appeal — AB12 CDE.pdf", amount: 29 },
    { id: "ap_2", clientId: "cl_jones", service: "PRIVATE_PARKING", pcnReference: "MP/2026/000456", vrm: "MK18 EEP", operator: "MetroPark Enforcement Ltd", createdAt: iso(-2), appealStatus: "SUBMITTED", documentStatus: "DOWNLOADED", evidenceCount: 1, amount: 29 },
    { id: "ap_3", clientId: "cl_green", service: "COUNCIL_PCN", pcnReference: "CP-2026-77123", vrm: "NW20 RES", operator: "Camden Council", createdAt: iso(-4), appealStatus: "GENERATED", documentStatus: "EMAILED", evidenceCount: 0, amount: 29 },
    { id: "ap_4", clientId: "cl_hall", service: "CHARGE_CERTIFICATE", pcnReference: "CG-2026-99001", vrm: "SK21 WLM", operator: "CityGuard", createdAt: iso(-5), appealStatus: "RESPONDED", documentStatus: "DOWNLOADED", evidenceCount: 3, amount: 39 },
    { id: "ap_5", clientId: "cl_white", service: "PRIVATE_PARKING", pcnReference: "PP/2026/554321", vrm: "LP67 XYZ", operator: "ParkPro UK Ltd", createdAt: iso(-6), appealStatus: "GENERATED", documentStatus: "DOWNLOADED", evidenceCount: 1, amount: 29 },
    { id: "ap_6", clientId: "cl_campbell", service: "PRIVATE_PARKING", pcnReference: "MP/2026/040088", vrm: "GK69 TRR", operator: "MetroPark Enforcement", createdAt: iso(-7), appealStatus: "GENERATED", documentStatus: "PENDING", evidenceCount: 0, amount: 29 },
  ];

  const documents: CrmState["documents"] = [
    { id: "doc_1", caseId: "case_awr_1", clientId: "cl_smith", name: "Claim Form.pdf", category: "CLAIM_FORM", sizeBytes: 245_000, mimeType: "application/pdf", uploadedAt: iso(-2), uploadedBy: "cl_smith" },
    { id: "doc_2", caseId: "case_awr_1", clientId: "cl_smith", name: "Parking Charge Notice.jpg", category: "PARKING_NOTICE", sizeBytes: 900_000, mimeType: "image/jpeg", uploadedAt: iso(-2), uploadedBy: "cl_smith" },
    { id: "doc_3", caseId: "case_awr_1", clientId: "cl_smith", name: "Photos — Car Park.jpg", category: "EVIDENCE", sizeBytes: 1_200_000, mimeType: "image/jpeg", uploadedAt: iso(-2), uploadedBy: "cl_smith" },
    { id: "doc_4", caseId: "case_ip_1", clientId: "cl_taylor", name: "Bailiff Letter.pdf", category: "CORRESPONDENCE", sizeBytes: 180_000, mimeType: "application/pdf", uploadedAt: iso(-8), uploadedBy: "cl_taylor" },
    { id: "doc_5", caseId: "case_ip_1", clientId: "cl_taylor", name: "Credit Report.pdf", category: "EVIDENCE", sizeBytes: 210_000, mimeType: "application/pdf", uploadedAt: iso(-8), uploadedBy: "cl_taylor" },
    { id: "doc_6", clientId: "cl_smith", name: "Appeal — AB12 CDE.pdf", category: "APPEAL", sizeBytes: 145_000, mimeType: "application/pdf", uploadedAt: iso(-1), uploadedBy: "SYSTEM" },
  ];

  const tasks: CrmState["tasks"] = [
    { id: "t_1", caseId: "case_awr_1", title: "Review County Court Claim — David Brown", dueAt: iso(0, 11), priority: "HIGH", status: "OPEN", assignedTo: "adm_merika", createdAt: iso(-1) },
    { id: "t_2", caseId: "case_awr_3", title: "Check documents — CCJ Case 2026-008", dueAt: iso(0, 12, 30), priority: "MEDIUM", status: "OPEN", assignedTo: "adm_legal", createdAt: iso(-1) },
    { id: "t_3", caseId: "case_ip_1", title: "Draft Consent Order — Lisa Taylor", dueAt: iso(1, 14), priority: "MEDIUM", status: "IN_PROGRESS", assignedTo: "adm_legal", createdAt: iso(-2) },
    { id: "t_4", caseId: "case_ip_3", title: "Bailiff case urgent review — Michael White", dueAt: iso(0, 15), priority: "URGENT", status: "OPEN", assignedTo: "adm_merika", createdAt: iso(-1) },
    { id: "t_5", caseId: "case_ac_1", title: "Send status update — Mark Davies", dueAt: iso(2, 9), priority: "MEDIUM", status: "OPEN", assignedTo: "adm_pa_ai", createdAt: iso(-1) },
  ];

  const notes: CrmState["notes"] = [
    { id: "n_1", caseId: "case_awr_1", clientId: "cl_smith", authorId: "adm_merika", content: "Client called — obtained scanned notice and photos of car park. Requires urgent review.", createdAt: iso(-1) },
    { id: "n_2", clientId: "cl_smith", authorId: "adm_pa_ai", content: "Client contacted — obtained bailiff letter.", createdAt: iso(-6) },
    { id: "n_3", clientId: "cl_smith", authorId: "adm_merika", content: "Waiting for consent order from claimant.", createdAt: iso(-7) },
  ];

  const communications: CrmState["communications"] = [
    { id: "c_1", caseId: "case_awr_1", clientId: "cl_smith", type: "EMAIL_OUT", subject: "We've received your Court Claim documents", body: "Hi John, thanks for uploading the Claim Form. Our legal team will review and be in touch shortly.", createdAt: iso(-1, 9, 12), from: "merika@parkingappealsgroup.co.uk", to: "j.smith@example.co.uk" },
    { id: "c_2", clientId: "cl_smith", type: "AUTOMATIC_UPDATE", subject: "Case PAG-2026-125 status: Awaiting Review", body: "Your case has been created and is with our legal team.", createdAt: iso(-2, 10) },
    { id: "c_3", caseId: "case_ip_1", clientId: "cl_taylor", type: "DOCUMENT_REQUEST", subject: "Please upload your credit report", body: "Hi Lisa, in order to prepare your set-aside application we need your latest credit report.", createdAt: iso(-8, 15) },
    { id: "c_4", clientId: "cl_smith", type: "PAYMENT_CONFIRMATION", subject: "Payment received — invoice PAG-INV-001", body: "Thanks for your payment of £29.00 towards your appeal service.", createdAt: iso(-1, 14, 20) },
  ];

  const activity: CrmState["activity"] = [
    { id: "act_1", clientId: "cl_smith", caseId: "case_awr_1", type: "CASE_CREATED", description: "County Court Case PAG-2026-125 created", createdAt: iso(-2, 10, 4), actorId: "adm_merika" },
    { id: "act_2", clientId: "cl_smith", caseId: "case_awr_1", type: "DOCUMENT_ADDED", description: "Claim Form uploaded", createdAt: iso(-2, 10, 5), actorId: "cl_smith" },
    { id: "act_3", clientId: "cl_smith", appealId: "ap_1", type: "APPEAL_GENERATED", description: "Private Parking Appeal generated for AB12 CDE", createdAt: iso(-1, 14), actorId: "SYSTEM" },
    { id: "act_4", clientId: "cl_smith", type: "PAYMENT_RECEIVED", description: "Payment received: £29.00 — Appeal Builder", createdAt: iso(-1, 14, 20) },
    { id: "act_5", clientId: "cl_jones", appealId: "ap_2", type: "APPEAL_DOWNLOADED", description: "Appeal downloaded", createdAt: iso(-2, 10, 30), actorId: "SYSTEM" },
    { id: "act_6", clientId: "cl_taylor", caseId: "case_ip_1", type: "STATUS_CHANGED", description: "Status: Awaiting Review → In Progress", createdAt: iso(-1, 10), actorId: "adm_merika" },
    { id: "act_7", clientId: "cl_green", type: "CLIENT_CREATED", description: "Client Emma Green created", createdAt: iso(-14, 9) },
    { id: "act_8", clientId: "cl_smith", caseId: "case_awr_1", type: "NOTE_ADDED", description: "Note added by Merika", createdAt: iso(-1, 11) },
  ];

  const payments: CrmState["payments"] = [
    { id: "pay_1", clientId: "cl_smith", appealId: "ap_1", service: "Appeal Builder — Private Parking", amount: 29, status: "PAID", reference: "PAG-INV-001", createdAt: iso(-1) },
    { id: "pay_2", clientId: "cl_jones", appealId: "ap_2", service: "Appeal Builder — Private Parking", amount: 29, status: "PAID", reference: "PAG-INV-002", createdAt: iso(-2) },
    { id: "pay_3", clientId: "cl_smith", caseId: "case_awr_1", service: "County Court Defence", amount: 450, status: "PENDING", reference: "PAG-INV-003", createdAt: iso(-1) },
    { id: "pay_4", clientId: "cl_taylor", caseId: "case_ip_1", service: "CCJ Set-Aside Application", amount: 495, status: "PAID", reference: "PAG-INV-004", createdAt: iso(-7) },
    { id: "pay_5", clientId: "cl_green", appealId: "ap_3", service: "Appeal Builder — Council PCN", amount: 29, status: "PAID", reference: "PAG-INV-005", createdAt: iso(-4) },
    { id: "pay_6", clientId: "cl_hall", appealId: "ap_4", service: "Appeal Builder — Charge Certificate", amount: 39, status: "PAID", reference: "PAG-INV-006", createdAt: iso(-5) },
    { id: "pay_7", clientId: "cl_davies", caseId: "case_ac_1", service: "Bailiff Support", amount: 295, status: "PAID", reference: "PAG-INV-007", createdAt: iso(-4) },
    { id: "pay_8", clientId: "cl_wilson", service: "Consultation", amount: 75, status: "REFUNDED", reference: "PAG-INV-008", createdAt: iso(-3) },
  ];

  return {
    clients,
    cases,
    appeals,
    documents,
    tasks,
    notes,
    communications,
    activity,
    payments,
    admins,
    seededAt: new Date().toISOString(),
  };
}
