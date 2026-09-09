import { getSession, stampKindCookie } from "@/lib/auth/session";
import { findClientById } from "@/lib/db/repos";
import type { Client } from "@/lib/crm/types";

export type CustomerAuth =
  | { ok: true; client: Client }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Resolve the signed-in customer for checkout / portal APIs.
 *
 * Admin CRM sessions must not unlock customer checkout. A session whose
 * userId maps to a `clients` row is treated as a customer even if the
 * `kind` flag is missing (older cookies).
 */
export async function requireCustomer(): Promise<CustomerAuth> {
  const session = await getSession();
  if (!session.userId) {
    return {
      ok: false,
      status: 401,
      error: "Please sign in with your customer email to continue to checkout.",
    };
  }
  if (session.kind === "ADMIN") {
    return {
      ok: false,
      status: 403,
      error: "You're signed in as admin. Sign in or register as a customer to pay for an appeal.",
    };
  }
  const client = await findClientById(session.userId);
  if (!client) {
    return {
      ok: false,
      status: 401,
      error: "Please sign in with your customer email to continue to checkout.",
    };
  }
  if (!session.kind) {
    session.kind = "CUSTOMER";
    session.role = session.role || "CUSTOMER";
    await session.save();
  }
  await stampKindCookie("CUSTOMER");
  return { ok: true, client };
}
