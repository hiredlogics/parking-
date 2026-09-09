import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { getSql, hasDb } from "./pool";
import { ensureSchema } from "./schema";

/**
 * Optional file-based migration runner.
 *
 * Production path still uses `ensureSchema()` (idempotent CREATE IF NOT
 * EXISTS). This runner records applied `.sql` files in `system_meta` so
 * future non-idempotent migrations can be introduced safely.
 */
export async function runMigrations(): Promise<{ applied: string[] }> {
  if (!hasDb()) {
    throw new Error("No database URL configured.");
  }
  await ensureSchema();
  const sql = getSql();
  const dir = join(process.cwd(), "lib/db/migrations");
  let files: string[] = [];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return { applied: [] };
  }

  const applied: string[] = [];
  for (const file of files) {
    const key = `migration:${file}`;
    const existing = (await sql.query(
      `SELECT value FROM system_meta WHERE key = $1 LIMIT 1`,
      [key],
    )) as unknown as Array<{ value: string }> | { rows?: Array<{ value: string }> };
    const rows = Array.isArray(existing) ? existing : existing.rows ?? [];
    if (rows.length > 0) continue;

    const body = readFileSync(join(dir, file), "utf8");
    // Strip SQL comments; split on semicolons for Neon one-statement calls.
    const statements = body
      .split(";")
      .map((s) =>
        s
          .split("\n")
          .filter((line) => !line.trim().startsWith("--"))
          .join("\n")
          .trim(),
      )
      .filter(Boolean);

    for (const stmt of statements) {
      await sql.query(stmt);
    }
    await sql.query(
      `INSERT INTO system_meta (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, new Date().toISOString()],
    );
    applied.push(file);
  }
  return { applied };
}
