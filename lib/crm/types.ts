/**
 * CRM data model.
 *
 * Every entity is uniquely identified by a stable string id, is
 * timestamped, and references related entities by id. The demo store
 * (lib/crm/store.ts) holds these in-memory + persists to localStorage;
 * the shape is intentionally SQL-friendly so a Postgres schema can drop
 * in later without touching page code.
 */

export type CaseType =
  | "PRIVATE_PARKING" // Self-service (from the Appeal Builder)
  | "COUNCIL_PCN"
  | "CHARGE_CERTIFICATE"
  | "ORDER_FOR_RECOVERY"
  | "COUNTY_COURT"
  | "CCJ_REMOVAL"
  | "BAILIFF_ENFORCEMENT";

export type KanbanStatus =
  | "AWAITING_REVIEW"
  | "IN_PROGRESS"
  | "AWAITING_CLIENT"
  | "READY_TO_DRAFT"
  | "COMPLETED";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  joinedAt: string;
  lastActivityAt: string;
  status?: "ACTIVE" | "INACTIVE";
}

export interface Case {
  id: string;
  clientId: string;
  reference: string;
  type: CaseType;
  status: KanbanStatus;
  priority: Priority;
  assignedTo?: string; // admin id
  createdAt: string;
  updatedAt: string;
  summary?: string;

  /** Type-specific fields (all optional). Kept flat to keep types simple. */
  claimNumber?: string;
  courtName?: string;
  claimant?: string;
  claimAmount?: number;
  aosDeadline?: string;
  defenceDeadline?: string;
  hearingDate?: string;
  hearingTime?: string;
  ccjBasis?: string;
  ccjApplicationStage?: "CCJ_OBTAINED" | "ASSESS_ELIGIBILITY" | "APPLICATION" | "HEARING" | "CCJ_REMOVED";
  countyCourtStage?: "CLAIM_RECEIVED" | "AOS_FILED" | "DEFENCE_FILED" | "DIRECTIONS" | "HEARING" | "COMPLETED";
  bailiffStage?: "NOTICE" | "COMPLIANCE" | "ENFORCEMENT" | "SALE" | "RESOLVED";
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  enforcementCompany?: string;
  urgentWarning?: string;
  feeSummary?: {
    label: string;
    amount: number;
  }[];
  keyDates?: {
    label: string;
    date: string;
    tag?: string;
  }[];
}

/**
 * Appeal Builder record — one per completed self-service PCN appeal
 * that came out of the customer-facing website.
 */
export interface Appeal {
  id: string;
  clientId: string;
  service:
    | "COUNCIL_PCN"
    | "PRIVATE_PARKING"
    | "CHARGE_CERTIFICATE";
  pcnReference: string;
  vrm: string;
  operator: string;
  createdAt: string;
  appealStatus: "GENERATED" | "SUBMITTED" | "RESPONDED" | "CANCELLED";
  documentStatus: "READY" | "DOWNLOADED" | "EMAILED" | "PENDING";
  evidenceCount: number;
  generatedDocumentName?: string;
  amount?: number;
}

export type DocumentCategory =
  | "PARKING_NOTICE"
  | "EVIDENCE"
  | "APPEAL"
  | "COURT_FORM"
  | "CLAIM_FORM"
  | "WITNESS_STATEMENT"
  | "CONSENT_ORDER"
  | "CORRESPONDENCE"
  | "INVOICE"
  | "OTHER";

export interface CrmDocument {
  id: string;
  caseId?: string;
  clientId: string;
  name: string;
  category: DocumentCategory;
  sizeBytes: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string; // admin id or "SYSTEM"
}

export type TaskStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED";

export interface Task {
  id: string;
  caseId?: string;
  clientId?: string;
  title: string;
  dueAt: string;
  priority: Priority;
  assignedTo?: string;
  status: TaskStatus;
  createdAt: string;
}

export interface Note {
  id: string;
  caseId?: string;
  clientId?: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

export type CommunicationType =
  | "EMAIL_OUT"
  | "EMAIL_IN"
  | "AUTOMATIC_UPDATE"
  | "DOCUMENT_REQUEST"
  | "PAYMENT_CONFIRMATION"
  | "STATUS_UPDATE";

export interface Communication {
  id: string;
  caseId?: string;
  clientId: string;
  type: CommunicationType;
  subject: string;
  body: string;
  createdAt: string;
  from?: string;
  to?: string;
}

export type ActivityType =
  | "CASE_CREATED"
  | "STATUS_CHANGED"
  | "DOCUMENT_ADDED"
  | "NOTE_ADDED"
  | "TASK_ADDED"
  | "TASK_COMPLETED"
  | "COMMUNICATION_SENT"
  | "APPEAL_GENERATED"
  | "APPEAL_DOWNLOADED"
  | "PAYMENT_RECEIVED"
  | "EMAIL_SENT"
  | "CLIENT_CREATED";

export interface ActivityEvent {
  id: string;
  caseId?: string;
  clientId?: string;
  appealId?: string;
  type: ActivityType;
  description: string;
  createdAt: string;
  actorId?: string;
  meta?: Record<string, string | number | undefined>;
}

export type PaymentStatus = "PAID" | "PENDING" | "REFUNDED";

export interface Payment {
  id: string;
  clientId: string;
  caseId?: string;
  appealId?: string;
  service: string; // human-readable
  amount: number; // pounds
  status: PaymentStatus;
  reference: string; // e.g. PAG-INV-0001
  createdAt: string;
}

export interface Admin {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "STAFF" | "SUPPORT";
  avatarInitials: string;
}

/** Shape stored in localStorage. */
export interface CrmState {
  clients: Client[];
  cases: Case[];
  appeals: Appeal[];
  documents: CrmDocument[];
  tasks: Task[];
  notes: Note[];
  communications: Communication[];
  activity: ActivityEvent[];
  payments: Payment[];
  admins: Admin[];
  seededAt?: string;
}
