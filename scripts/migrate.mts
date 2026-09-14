/**
 * Explicit schema + knowledge-base + admin config bootstrap.
 *
 *   npm run migrate
 */
import { ensureSchema } from "../lib/db/schema";
import { ensureKbSeeded } from "../lib/kb/seed";
import { ensureAdminConfigSeeded } from "../lib/config/seedAdminConfig";
import { hasDb } from "../lib/db/pool";

async function main(): Promise<void> {
  if (!hasDb()) {
    console.error("[migrate] DATABASE_URL / POSTGRES_URL is not set.");
    process.exit(1);
  }
  console.log("[migrate] ensuring application schema…");
  await ensureSchema();
  console.log("[migrate] seeding / refreshing knowledge base…");
  const summary = await ensureKbSeeded();
  console.log("[migrate] KB:", summary);
  console.log("[migrate] seeding admin configuration graph…");
  await ensureAdminConfigSeeded();
  console.log("[migrate] done.");
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
