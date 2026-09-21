import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Client } from "@/lib/crm/types";
import { refuseInProduction } from "@/lib/config/production";
import {
  createCustomerAccount,
  createPasswordResetToken,
  findClientAuthByEmail,
  findValidPasswordResetToken,
  markPasswordResetTokenUsed,
  updateClientPasswordHash,
} from "@/lib/db/repos";
import { ensureSchema } from "@/lib/db/schema";
import { ensureSeeded } from "@/lib/db/seed-server";
import { sendEmail } from "@/lib/services/email";

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
  /** Machine-readable reason for the UI (e.g. EMAIL_EXISTS). */
  code?: string;
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
      code: "EMAIL_EXISTS",
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

function appBaseUrl(): string {
  const raw =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Start a password reset. Always returns ok so callers cannot probe
 * which emails have accounts. Sends email when SMTP is configured;
 * otherwise logs the link in development.
 */
export async function requestPasswordReset(emailRaw: string): Promise<{
  ok: true;
  message: string;
}> {
  const email = emailRaw.trim().toLowerCase();
  const generic =
    "If an account exists for that email, we have sent reset instructions.";

  if (!EMAIL_RE.test(email)) {
    return { ok: true, message: generic };
  }

  await ensureSchema();
  await ensureSeeded();
  const found = await findClientAuthByEmail(email);
  if (!found?.passwordHash) {
    return { ok: true, message: generic };
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  const id = `prt_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

  await createPasswordResetToken({
    id,
    clientId: found.client.id,
    tokenHash,
    expiresAt,
  });

  const resetUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const subject = "Reset your Parking Appeals Group password";
  const text = [
    `Hi ${found.client.name || "there"},`,
    "",
    "We received a request to reset your password.",
    "Open this link within the next hour to choose a new password:",
    resetUrl,
    "",
    "If you did not ask for this, you can ignore this email.",
    "",
    "Parking Appeals Group",
  ].join("\n");
  const html = `
    <p>Hi ${escapeHtml(found.client.name || "there")},</p>
    <p>We received a request to reset your password.</p>
    <p><a href="${escapeHtml(resetUrl)}">Choose a new password</a> (link expires in 1 hour).</p>
    <p>If you did not ask for this, you can ignore this email.</p>
    <p>Parking Appeals Group</p>
  `;

  const sent = await sendEmail({ to: email, subject, text, html });
  if (!sent.ok) {
    const { isProductionRuntime } = await import("@/lib/config/production");
    if (isProductionRuntime()) {
      console.info(
        `[auth] Password reset email not sent (${sent.reason}) for a registered account.`,
      );
    } else {
      console.info(
        `[auth] Password reset email not sent (${sent.reason}). Dev reset link for ${email}: ${resetUrl}`,
      );
    }
  }

  return { ok: true, message: generic };
}

export async function resetPasswordWithToken(input: {
  token: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = input.token.trim();
  const password = input.password;
  if (!token) return { ok: false, error: "Reset link is missing or invalid." };
  if (!password || password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  await ensureSchema();
  const row = await findValidPasswordResetToken(hashResetToken(token));
  if (!row) {
    return {
      ok: false,
      error: "This reset link is invalid or has expired. Request a new one.",
    };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await updateClientPasswordHash(row.clientId, passwordHash);
  await markPasswordResetTokenUsed(row.id);
  return { ok: true };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
