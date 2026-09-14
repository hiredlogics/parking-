import bcrypt from "bcryptjs";
import { ensureSchema } from "./schema";
import { createAdmin, findAdminByEmail } from "./repos";

let running: Promise<void> | null = null;

/**
 * Idempotent server-side bootstrap. On the first request to any
 * DB-backed route, this makes sure a default admin account exists so a
 * fresh install has somewhere to log in. Safe to call from every
 * request path — `findAdminByEmail` already makes it a no-op after the
 * first run.
 */
export async function ensureSeeded(): Promise<void> {
  if (running) return running;
  running = (async () => {
    await ensureSchema();

    // Password is "changeme" — the register form still lets you create
    // your own admin, this just guarantees a first login exists.
    if (!(await findAdminByEmail("admin@parkingappealsgroup.co.uk"))) {
      const passwordHash = await bcrypt.hash("changeme", 10);
      await createAdmin({
        id: "adm_default",
        name: "Merika",
        email: "admin@parkingappealsgroup.co.uk",
        passwordHash,
        role: "OWNER",
        avatarInitials: "MK",
      });
    }
  })();
  try {
    await running;
  } catch (err) {
    running = null;
    throw err;
  }
}
