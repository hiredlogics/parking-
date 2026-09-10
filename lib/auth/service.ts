import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Client } from "@/lib/crm/types";
import { refuseInProduction } from "@/lib/config/production";
import {
  createCustomerAccount,
  findClientAuthByEmail,
} from "@/lib/db/repos";
import { ensureSchema } from "@/lib/db/schema";
import { ensureSeeded } from "@/lib/db/seed-server";

/**
 * Two-tier authentication:
 *
 *   - ADMIN — a small hardcoded list of admin credentials (below). Nobody
 *     can self-register as an admin from the UI. The credentials can be
 *     overridden per-environment via ADMIN_EMAIL / ADMIN_PASSWORD.
 *   - CUSTOMER — self-service registration against the `clients` table
 *     with a bcrypt password hash.
 */

export interface RegisterCustomerInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AdminSessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  kind: "ADMIN";
}

export interface CustomerSessionUser {
  id: string;
  name: string;
  email: string;
  kind: "CUSTOMER";
}

export interface AdminAuthResult {
  ok: boolean;
  error?: string;
  user?: AdminSessionUser;
}

export interface CustomerAuthResult {
  ok: boolean;
  error?: string;
  user?: CustomerSessionUser;
  client?: Client;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEV_ADMIN_PASSWORD = "changeme";

/**
 * The single administrator account.
 *
 * Read per call rather than captured at module load, so a corrected
 * environment variable takes effect on restart rather than depending on
 * import order.
 */
function adminAccount(): { id: string; name: string; email: string; password: string; role: string } {
  return {
    id: "adm_default",
    name: "Merika",
    email: (process.env.ADMIN_EMAIL || "admin@parkingappealsgroup.co.uk").toLowerCase(),
    password: process.env.ADMIN_PASSWORD || DEV_ADMIN_PASSWORD,
    role: "OWNER",
  };
}

export function adminEmailHint(): string {
  return adminAccount().email;
}

/**
 * Compare in time independent of how much of the value matched, so a
 * response time cannot be used to discover the password one character
 * at a time.
 */
function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    // Still compare something of equal length to keep timing flat.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export async function loginAdmin(input: LoginInput): Promise<AdminAuthResult> {
  const admin = adminAccount();
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) {
    return { ok: false, error: "Enter your admin email and password." };
  }

  /*
   * Never accept the placeholder password on a real deployment. Without
   * this, a deploy that forgot ADMIN_PASSWORD hands over the admin area
   * to anyone who tries "changeme".
   */
  if (admin.password === DEV_ADMIN_PASSWORD) {
    refuseInProduction(
      "ADMIN_PASSWORD",
      'The admin account is still using the default password "changeme". Set ADMIN_PASSWORD.',
    );
  }

  const emailOk = secretsMatch(email, admin.email);
  const passwordOk = secretsMatch(input.password, admin.password);
  if (!emailOk || !passwordOk) {
    return { ok: false, error: "Invalid admin credentials." };
  }
  const HARDCODED_ADMIN = admin;
  return {
    ok: true,
    user: {
      id: HARDCODED_ADMIN.id,
      name: HARDCODED_ADMIN.name,
      email: HARDCODED_ADMIN.email,
      role: HARDCODED_ADMIN.role,
      kind: "ADMIN",
    },
  };
}

function genClientId(): string {
  return `cl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function registerCustomer(
  input: RegisterCustomerInput,
): Promise<CustomerAuthResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  if (!name || name.length < 2) return { ok: false, error: "Please enter your name." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." };
  if (!password || password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  await ensureSchema();
  await ensureSeeded();
  const existing = await findClientAuthByEmail(email);
  if (existing?.passwordHash) {
    return {
      ok: false,
      error: "An account with that email already exists. Please sign in instead.",
    };
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const id = existing?.client?.id ?? genClientId();
  let client: Client;
  if (existing?.client) {
    const { upsertClient } = await import("@/lib/db/repos");
    const { getSql } = await import("@/lib/db/pool");
    const now = new Date().toISOString();
    client = {
      ...existing.client,
      name,
      email,
      phone: input.phone ?? existing.client.phone,
      status: "ACTIVE",
      lastActivityAt: now,
    };
    await upsertClient(client);
    // Also set the password_hash column, which upsertClient doesn't touch.
    await getSql().query(`UPDATE clients SET password_hash = $2 WHERE id = $1`, [id, passwordHash]);
  } else {
    client = await createCustomerAccount({
      id,
      name,
      email,
      phone: input.phone,
      passwordHash,
    });
  }
  return {
    ok: true,
    client,
    user: { id: client.id, name: client.name, email: client.email, kind: "CUSTOMER" },
  };
}

export async function loginCustomer(input: LoginInput): Promise<CustomerAuthResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) return { ok: false, error: "Enter your email and password." };
  await ensureSchema();
  await ensureSeeded();
  const found = await findClientAuthByEmail(email);
  if (!found || !found.passwordHash) {
    return { ok: false, error: "Invalid email or password." };
  }
  const ok = await bcrypt.compare(input.password, found.passwordHash);
  if (!ok) return { ok: false, error: "Invalid email or password." };
  return {
    ok: true,
    client: found.client,
    user: {
      id: found.client.id,
      name: found.client.name,
      email: found.client.email,
      kind: "CUSTOMER",
    },
  };
}
