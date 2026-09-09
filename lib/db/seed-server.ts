import bcrypt from "bcryptjs";
import { buildSeedState } from "@/lib/crm/seed";
import { ensureSchema } from "./schema";
import {
  isSeeded,
  markSeeded,
  upsertClient,
  upsertCase,
  upsertAppeal,
  insertDocument,
  upsertTask,
  insertNote,
  insertCommunication,
  insertActivity,
  insertPayment,
  createAdmin,
  findAdminByEmail,
} from "./repos";

let running: Promise<void> | null = null;

/**
 * Idempotent server-side seeder. On the first request to any DB-backed
 * route, this populates the Postgres tables with the demo dataset from
 * `lib/crm/seed.ts` plus a default admin user. Safe to call from every
 * request path.
 */
export async function ensureSeeded(): Promise<void> {
  if (running) return running;
  running = (async () => {
    await ensureSchema();
    if (await isSeeded()) return;
    const state = buildSeedState();
    // Clients first (FK targets), then cases/appeals, then dependants.
    for (const c of state.clients) await upsertClient(c);
    for (const c of state.cases) await upsertCase(c);
    for (const a of state.appeals) await upsertAppeal(a);
    for (const d of state.documents) await insertDocument(d);
    for (const t of state.tasks) await upsertTask(t);
    for (const n of state.notes) await insertNote(n);
    for (const c of state.communications) await insertCommunication(c);
    for (const a of state.activity) await insertActivity(a);
    for (const p of state.payments) await insertPayment(p);

    // A default admin so the demo works out of the box. Password is
    // "changeme" — the register form still lets you create your own.
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
    await markSeeded();
  })();
  try {
    await running;
  } catch (err) {
    running = null;
    throw err;
  }
}
