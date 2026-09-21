import { getSql } from "./pool";
import { ensureSchema } from "./schema";
import type { Admin, Client } from "@/lib/crm/types";

/**
 * Postgres-backed repository for accounts (admins/clients) and the
 * appeal-logic override tables. Every function calls `ensureSchema()`
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

export async function updateClientPasswordHash(
  clientId: string,
  passwordHash: string,
): Promise<void> {
  const now = new Date().toISOString();
  await q(
    `UPDATE clients
        SET password_hash = $2, last_activity_at = $3
      WHERE id = $1`,
    [clientId, passwordHash, now],
  );
}

export async function createPasswordResetToken(input: {
  id: string;
  clientId: string;
  tokenHash: string;
  expiresAt: string;
}): Promise<void> {
  const now = new Date().toISOString();
  // Invalidate earlier unused tokens for this client.
  await q(
    `UPDATE password_reset_tokens
        SET used_at = $2
      WHERE client_id = $1 AND used_at IS NULL`,
    [input.clientId, now],
  );
  await q(
    `INSERT INTO password_reset_tokens (id, client_id, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.id, input.clientId, input.tokenHash, input.expiresAt, now],
  );
}

export async function findValidPasswordResetToken(
  tokenHash: string,
): Promise<{ id: string; clientId: string } | null> {
  const now = new Date().toISOString();
  const rows = await q(
    `SELECT id, client_id
       FROM password_reset_tokens
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > $2
      LIMIT 1`,
    [tokenHash, now],
  );
  const r = rows[0];
  if (!r) return null;
  return { id: r.id as string, clientId: r.client_id as string };
}

export async function markPasswordResetTokenUsed(id: string): Promise<void> {
  await q(
    `UPDATE password_reset_tokens SET used_at = $2 WHERE id = $1`,
    [id, new Date().toISOString()],
  );
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

// -------- Appeal rules / paragraphs (admin-editable overrides) --------
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

