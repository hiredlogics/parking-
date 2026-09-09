import { getSql } from "./pool";
import { ensureSchema } from "./schema";
import type {
  ActivityEvent,
  Admin,
  Appeal,
  Case,
  Client,
  Communication,
  CrmDocument,
  Note,
  Payment,
  Task,
  CrmState,
} from "@/lib/crm/types";

/**
 * Postgres-backed CRM repository. Every function calls `ensureSchema()`
 * first (idempotent) so a fresh database becomes usable on the first
 * request. Rows are (de)serialised with these helpers because the DB
 * uses snake_case while the app uses camelCase.
 */

type Row = Record<string, unknown>;

async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  await ensureSchema();
  const sql = getSql();
  // Bracketed function call — Neon exposes a tagged-template AND a
  // parameterised object form. The unsafe form here supports our
  // dynamic SQL with $n placeholders.
  const result = (await sql.query(text, params)) as unknown as { rows?: Row[] } | Row[];
  return Array.isArray(result) ? result : (result.rows ?? []);
}

// -------- Admins --------
export async function listAdmins(): Promise<Admin[]> {
  const rows = await q(`SELECT id, name, email, role, avatar_initials FROM admins ORDER BY name`);
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    email: r.email as string,
    role: r.role as Admin["role"],
    avatarInitials: r.avatar_initials as string,
  }));
}

export async function findAdminByEmail(email: string): Promise<
  (Admin & { passwordHash: string }) | null
> {
  const rows = await q(
    `SELECT id, name, email, role, avatar_initials, password_hash
       FROM admins WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id as string,
    name: r.name as string,
    email: r.email as string,
    role: r.role as Admin["role"],
    avatarInitials: r.avatar_initials as string,
    passwordHash: r.password_hash as string,
  };
}

export async function findAdminById(id: string): Promise<Admin | null> {
  const rows = await q(
    `SELECT id, name, email, role, avatar_initials FROM admins WHERE id = $1 LIMIT 1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id as string,
    name: r.name as string,
    email: r.email as string,
    role: r.role as Admin["role"],
    avatarInitials: r.avatar_initials as string,
  };
}

export async function createAdmin(input: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role?: Admin["role"];
  avatarInitials?: string;
}): Promise<Admin> {
  const initials =
    input.avatarInitials ??
    (input.name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase() ||
      "PA");
  await q(
    `INSERT INTO admins (id, name, email, password_hash, role, avatar_initials)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.id, input.name, input.email, input.passwordHash, input.role ?? "ADMIN", initials],
  );
  return {
    id: input.id,
    name: input.name,
    email: input.email,
    role: input.role ?? "ADMIN",
    avatarInitials: initials,
  };
}

// -------- Clients --------
export async function listClients(): Promise<Client[]> {
  const rows = await q(
    `SELECT id, name, email, phone, address, status, joined_at, last_activity_at
       FROM clients ORDER BY last_activity_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    email: r.email as string,
    phone: (r.phone as string | null) ?? undefined,
    address: (r.address as string | null) ?? undefined,
    status: r.status as Client["status"],
    joinedAt: r.joined_at as string,
    lastActivityAt: r.last_activity_at as string,
  }));
}

export async function upsertClient(c: Client): Promise<void> {
  await q(
    `INSERT INTO clients (id, name, email, phone, address, status, joined_at, last_activity_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       address = EXCLUDED.address,
       status = EXCLUDED.status,
       last_activity_at = EXCLUDED.last_activity_at`,
    [
      c.id,
      c.name,
      c.email,
      c.phone ?? null,
      c.address ?? null,
      c.status ?? "ACTIVE",
      c.joinedAt,
      c.lastActivityAt,
    ],
  );
}

export async function findClientByEmail(email: string): Promise<Client | null> {
  const rows = await q(
    `SELECT id, name, email, phone, address, status, joined_at, last_activity_at
       FROM clients WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id as string,
    name: r.name as string,
    email: r.email as string,
    phone: (r.phone as string | null) ?? undefined,
    address: (r.address as string | null) ?? undefined,
    status: r.status as Client["status"],
    joinedAt: r.joined_at as string,
    lastActivityAt: r.last_activity_at as string,
  };
}

export async function findClientAuthByEmail(
  email: string,
): Promise<{ client: Client; passwordHash: string | null } | null> {
  const rows = await q(
    `SELECT id, name, email, phone, address, status, joined_at, last_activity_at, password_hash
       FROM clients WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    client: {
      id: r.id as string,
      name: r.name as string,
      email: r.email as string,
      phone: (r.phone as string | null) ?? undefined,
      address: (r.address as string | null) ?? undefined,
      status: r.status as Client["status"],
      joinedAt: r.joined_at as string,
      lastActivityAt: r.last_activity_at as string,
    },
    passwordHash: (r.password_hash as string | null) ?? null,
  };
}

export async function createCustomerAccount(input: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  phone?: string;
}): Promise<Client> {
  const now = new Date().toISOString();
  await q(
    `INSERT INTO clients (id, name, email, phone, status, joined_at, last_activity_at, password_hash)
     VALUES ($1,$2,$3,$4,'ACTIVE',$5,$5,$6)`,
    [input.id, input.name, input.email, input.phone ?? null, now, input.passwordHash],
  );
  return {
    id: input.id,
    name: input.name,
    email: input.email,
    phone: input.phone,
    status: "ACTIVE",
    joinedAt: now,
    lastActivityAt: now,
  };
}

export async function findClientById(id: string): Promise<Client | null> {
  const rows = await q(
    `SELECT id, name, email, phone, address, status, joined_at, last_activity_at
       FROM clients WHERE id = $1 LIMIT 1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id as string,
    name: r.name as string,
    email: r.email as string,
    phone: (r.phone as string | null) ?? undefined,
    address: (r.address as string | null) ?? undefined,
    status: r.status as Client["status"],
    joinedAt: r.joined_at as string,
    lastActivityAt: r.last_activity_at as string,
  };
}

// -------- Cases --------
type CaseExtras = Partial<Omit<Case, "id" | "clientId" | "reference" | "type" | "status" | "priority" | "assignedTo" | "createdAt" | "updatedAt" | "summary">>;

export async function listCases(): Promise<Case[]> {
  const rows = await q(
    `SELECT id, client_id, reference, type, status, priority, assigned_to, created_at, updated_at, summary, extras
       FROM cases ORDER BY updated_at DESC`,
  );
  return rows.map(rowToCase);
}

function rowToCase(r: Row): Case {
  const extras = (r.extras as CaseExtras | null) ?? {};
  return {
    id: r.id as string,
    clientId: r.client_id as string,
    reference: r.reference as string,
    type: r.type as Case["type"],
    status: r.status as Case["status"],
    priority: r.priority as Case["priority"],
    assignedTo: (r.assigned_to as string | null) ?? undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    summary: (r.summary as string | null) ?? undefined,
    ...extras,
  };
}

function caseToExtras(c: Case): CaseExtras {
  const {
    id, clientId, reference, type, status, priority, assignedTo,
    createdAt, updatedAt, summary, ...extras
  } = c;
  void id; void clientId; void reference; void type; void status; void priority; void assignedTo;
  void createdAt; void updatedAt; void summary;
  return extras;
}

export async function upsertCase(c: Case): Promise<void> {
  await q(
    `INSERT INTO cases (id, client_id, reference, type, status, priority, assigned_to, created_at, updated_at, summary, extras)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO UPDATE SET
       reference = EXCLUDED.reference,
       type = EXCLUDED.type,
       status = EXCLUDED.status,
       priority = EXCLUDED.priority,
       assigned_to = EXCLUDED.assigned_to,
       updated_at = EXCLUDED.updated_at,
       summary = EXCLUDED.summary,
       extras = EXCLUDED.extras`,
    [
      c.id,
      c.clientId,
      c.reference,
      c.type,
      c.status,
      c.priority,
      c.assignedTo ?? null,
      c.createdAt,
      c.updatedAt,
      c.summary ?? null,
      JSON.stringify(caseToExtras(c)),
    ],
  );
}

// -------- Appeals --------
export async function listAppeals(): Promise<Appeal[]> {
  const rows = await q(
    `SELECT id, client_id, service, pcn_reference, vrm, operator, created_at,
            appeal_status, document_status, evidence_count, generated_document_name, amount
       FROM appeals ORDER BY created_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    clientId: r.client_id as string,
    service: r.service as Appeal["service"],
    pcnReference: r.pcn_reference as string,
    vrm: r.vrm as string,
    operator: r.operator as string,
    createdAt: r.created_at as string,
    appealStatus: r.appeal_status as Appeal["appealStatus"],
    documentStatus: r.document_status as Appeal["documentStatus"],
    evidenceCount: (r.evidence_count as number) ?? 0,
    generatedDocumentName: (r.generated_document_name as string | null) ?? undefined,
    amount: r.amount != null ? Number(r.amount) : undefined,
  }));
}

export async function upsertAppeal(a: Appeal): Promise<void> {
  await q(
    `INSERT INTO appeals (id, client_id, service, pcn_reference, vrm, operator, created_at,
                          appeal_status, document_status, evidence_count, generated_document_name, amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (id) DO UPDATE SET
       appeal_status = EXCLUDED.appeal_status,
       document_status = EXCLUDED.document_status,
       evidence_count = EXCLUDED.evidence_count,
       generated_document_name = EXCLUDED.generated_document_name,
       amount = EXCLUDED.amount`,
    [
      a.id, a.clientId, a.service, a.pcnReference, a.vrm, a.operator, a.createdAt,
      a.appealStatus, a.documentStatus, a.evidenceCount, a.generatedDocumentName ?? null,
      a.amount ?? null,
    ],
  );
}

// -------- Documents --------
export async function listDocuments(): Promise<CrmDocument[]> {
  const rows = await q(
    `SELECT id, case_id, client_id, name, category, size_bytes, mime_type, uploaded_at, uploaded_by
       FROM documents ORDER BY uploaded_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    caseId: (r.case_id as string | null) ?? undefined,
    clientId: r.client_id as string,
    name: r.name as string,
    category: r.category as CrmDocument["category"],
    sizeBytes: r.size_bytes as number,
    mimeType: r.mime_type as string,
    uploadedAt: r.uploaded_at as string,
    uploadedBy: r.uploaded_by as string,
  }));
}

export async function insertDocument(d: CrmDocument): Promise<void> {
  await q(
    `INSERT INTO documents (id, case_id, client_id, name, category, size_bytes, mime_type, uploaded_at, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO NOTHING`,
    [d.id, d.caseId ?? null, d.clientId, d.name, d.category, d.sizeBytes, d.mimeType, d.uploadedAt, d.uploadedBy],
  );
}

export async function deleteDocument(id: string): Promise<void> {
  await q(`DELETE FROM documents WHERE id = $1`, [id]);
}

// -------- Tasks --------
export async function listTasks(): Promise<Task[]> {
  const rows = await q(
    `SELECT id, case_id, client_id, title, due_at, priority, assigned_to, status, created_at
       FROM tasks ORDER BY due_at ASC`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    caseId: (r.case_id as string | null) ?? undefined,
    clientId: (r.client_id as string | null) ?? undefined,
    title: r.title as string,
    dueAt: r.due_at as string,
    priority: r.priority as Task["priority"],
    assignedTo: (r.assigned_to as string | null) ?? undefined,
    status: r.status as Task["status"],
    createdAt: r.created_at as string,
  }));
}

export async function upsertTask(t: Task): Promise<void> {
  await q(
    `INSERT INTO tasks (id, case_id, client_id, title, due_at, priority, assigned_to, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       due_at = EXCLUDED.due_at,
       priority = EXCLUDED.priority,
       status = EXCLUDED.status`,
    [t.id, t.caseId ?? null, t.clientId ?? null, t.title, t.dueAt, t.priority, t.assignedTo ?? null, t.status, t.createdAt],
  );
}

// -------- Notes --------
export async function listNotes(): Promise<Note[]> {
  const rows = await q(
    `SELECT id, case_id, client_id, author_id, content, created_at, updated_at
       FROM notes ORDER BY created_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    caseId: (r.case_id as string | null) ?? undefined,
    clientId: (r.client_id as string | null) ?? undefined,
    authorId: r.author_id as string,
    content: r.content as string,
    createdAt: r.created_at as string,
    updatedAt: (r.updated_at as string | null) ?? undefined,
  }));
}

export async function insertNote(n: Note): Promise<void> {
  await q(
    `INSERT INTO notes (id, case_id, client_id, author_id, content, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at`,
    [n.id, n.caseId ?? null, n.clientId ?? null, n.authorId, n.content, n.createdAt, n.updatedAt ?? null],
  );
}

export async function deleteNote(id: string): Promise<void> {
  await q(`DELETE FROM notes WHERE id = $1`, [id]);
}

// -------- Communications --------
export async function listCommunications(): Promise<Communication[]> {
  const rows = await q(
    `SELECT id, case_id, client_id, type, subject, body, created_at, "from", "to"
       FROM communications ORDER BY created_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    caseId: (r.case_id as string | null) ?? undefined,
    clientId: r.client_id as string,
    type: r.type as Communication["type"],
    subject: r.subject as string,
    body: r.body as string,
    createdAt: r.created_at as string,
    from: (r.from as string | null) ?? undefined,
    to: (r.to as string | null) ?? undefined,
  }));
}

export async function insertCommunication(c: Communication): Promise<void> {
  await q(
    `INSERT INTO communications (id, case_id, client_id, type, subject, body, created_at, "from", "to")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO NOTHING`,
    [c.id, c.caseId ?? null, c.clientId, c.type, c.subject, c.body, c.createdAt, c.from ?? null, c.to ?? null],
  );
}

// -------- Activity --------
export async function listActivity(): Promise<ActivityEvent[]> {
  const rows = await q(
    `SELECT id, case_id, client_id, appeal_id, type, description, created_at, actor_id, meta
       FROM activity ORDER BY created_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    caseId: (r.case_id as string | null) ?? undefined,
    clientId: (r.client_id as string | null) ?? undefined,
    appealId: (r.appeal_id as string | null) ?? undefined,
    type: r.type as ActivityEvent["type"],
    description: r.description as string,
    createdAt: r.created_at as string,
    actorId: (r.actor_id as string | null) ?? undefined,
    meta: (r.meta as ActivityEvent["meta"]) ?? undefined,
  }));
}

export async function insertActivity(a: ActivityEvent): Promise<void> {
  await q(
    `INSERT INTO activity (id, case_id, client_id, appeal_id, type, description, created_at, actor_id, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO NOTHING`,
    [
      a.id, a.caseId ?? null, a.clientId ?? null, a.appealId ?? null,
      a.type, a.description, a.createdAt, a.actorId ?? null,
      a.meta ? JSON.stringify(a.meta) : null,
    ],
  );
}

// -------- Payments --------
export async function listPayments(): Promise<Payment[]> {
  const rows = await q(
    `SELECT id, client_id, case_id, appeal_id, service, amount, status, reference, created_at
       FROM payments ORDER BY created_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    clientId: r.client_id as string,
    caseId: (r.case_id as string | null) ?? undefined,
    appealId: (r.appeal_id as string | null) ?? undefined,
    service: r.service as string,
    amount: Number(r.amount),
    status: r.status as Payment["status"],
    reference: r.reference as string,
    createdAt: r.created_at as string,
  }));
}

export async function insertPayment(p: Payment): Promise<void> {
  await q(
    `INSERT INTO payments (id, client_id, case_id, appeal_id, service, amount, status, reference, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO NOTHING`,
    [p.id, p.clientId, p.caseId ?? null, p.appealId ?? null, p.service, p.amount, p.status, p.reference, p.createdAt],
  );
}

// -------- Appeal rules / paragraphs (CRM-editable overrides) --------
export interface RuleOverride {
  id: string;
  route: string | null;
  paragraphIds: string[];
  description: string;
  active: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface ParagraphOverride {
  id: string;
  title: string;
  trigger: string;
  category: string;
  priority: number;
  text: string;
  active: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export async function listRuleOverrides(): Promise<RuleOverride[]> {
  const rows = await q(
    `SELECT id, route, paragraph_ids, description, active, updated_at, updated_by FROM appeal_rules`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    route: (r.route as string | null) ?? null,
    paragraphIds: (r.paragraph_ids as string[] | null) ?? [],
    description: r.description as string,
    active: r.active as boolean,
    updatedAt: (r.updated_at as string | null) ?? null,
    updatedBy: (r.updated_by as string | null) ?? null,
  }));
}

/** Insert-if-missing — never overwrites an existing (possibly edited) row. */
export async function seedRuleIfMissing(input: {
  id: string;
  route: string | null;
  paragraphIds: string[];
  description: string;
}): Promise<void> {
  await q(
    `INSERT INTO appeal_rules (id, route, paragraph_ids, description, active)
     VALUES ($1,$2,$3,$4,TRUE)
     ON CONFLICT (id) DO NOTHING`,
    [input.id, input.route, JSON.stringify(input.paragraphIds), input.description],
  );
}

export async function setRuleActive(id: string, active: boolean, updatedBy: string): Promise<void> {
  await q(
    `UPDATE appeal_rules SET active = $2, updated_at = $3, updated_by = $4 WHERE id = $1`,
    [id, active, new Date().toISOString(), updatedBy],
  );
}

export async function listParagraphOverrides(): Promise<ParagraphOverride[]> {
  const rows = await q(
    `SELECT id, title, trigger_desc, category, priority, text, active, updated_at, updated_by FROM appeal_paragraphs`,
  );
  return rows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    trigger: r.trigger_desc as string,
    category: r.category as string,
    priority: r.priority as number,
    text: r.text as string,
    active: r.active as boolean,
    updatedAt: (r.updated_at as string | null) ?? null,
    updatedBy: (r.updated_by as string | null) ?? null,
  }));
}

export async function seedParagraphIfMissing(input: {
  id: string;
  title: string;
  trigger: string;
  category: string;
  priority: number;
  text: string;
}): Promise<void> {
  await q(
    `INSERT INTO appeal_paragraphs (id, title, trigger_desc, category, priority, text, active)
     VALUES ($1,$2,$3,$4,$5,$6,TRUE)
     ON CONFLICT (id) DO NOTHING`,
    [input.id, input.title, input.trigger, input.category, input.priority, input.text],
  );
}

/** Updates title/text/active for a paragraph. Caller must run keeper-safe validation on `text` first. */
export async function updateParagraphOverride(input: {
  id: string;
  title: string;
  text: string;
  active: boolean;
  updatedBy: string;
}): Promise<void> {
  await q(
    `UPDATE appeal_paragraphs SET title = $2, text = $3, active = $4, updated_at = $5, updated_by = $6 WHERE id = $1`,
    [input.id, input.title, input.text, input.active, new Date().toISOString(), input.updatedBy],
  );
}

// -------- Aggregate --------
export async function loadState(): Promise<Omit<CrmState, "admins">> {
  const [
    clients, cases, appeals, documents, tasks, notes, communications, activity, payments,
  ] = await Promise.all([
    listClients(), listCases(), listAppeals(), listDocuments(),
    listTasks(), listNotes(), listCommunications(), listActivity(), listPayments(),
  ]);
  return { clients, cases, appeals, documents, tasks, notes, communications, activity, payments };
}

/** Ensure a "seeded" flag is set; used by initial seeding. */
export async function isSeeded(): Promise<boolean> {
  const rows = await q(`SELECT value FROM system_meta WHERE key = 'seeded' LIMIT 1`);
  return rows.length > 0;
}
export async function markSeeded(): Promise<void> {
  await q(
    `INSERT INTO system_meta (key, value) VALUES ('seeded', $1)
     ON CONFLICT (key) DO NOTHING`,
    [new Date().toISOString()],
  );
}
