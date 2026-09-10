/**
 * List the OpenAI models available to the configured account.
 *
 * AI-7 step 1: the intended model IDs must be verified against the real
 * account before production defaults change. Guessing an identifier
 * would break a working pipeline.
 *
 * Reads OPENAI_API_KEY server-side and NEVER prints it.
 *
 *   node scripts/check-models.mjs
 */
import { readFileSync, existsSync } from "node:fs";

const TARGETS = [
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-4o",
  "gpt-4o-mini",
];

function loadKey() {
  if (process.env.OPENAI_API_KEY?.trim()) return process.env.OPENAI_API_KEY.trim();
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^\s*OPENAI_API_KEY\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const value = m[1].trim().replace(/^["']|["']$/g, "");
      if (value) return value;
    }
  }
  return null;
}

const key = loadKey();
if (!key) {
  console.error("OPENAI_API_KEY is not set. Cannot verify model availability.");
  process.exit(2);
}

const res = await fetch("https://api.openai.com/v1/models", {
  headers: { Authorization: `Bearer ${key}` },
});

if (!res.ok) {
  // Never echo the body verbatim in case it reflects credentials.
  console.error(`Model list failed: HTTP ${res.status} ${res.statusText}`);
  process.exit(3);
}

const body = await res.json();
const ids = (body.data ?? []).map((m) => m.id).sort();

console.log(`TOTAL MODELS AVAILABLE: ${ids.length}\n`);

console.log("=== TARGET MODEL AVAILABILITY ===");
for (const t of TARGETS) {
  const exact = ids.includes(t);
  const prefixed = ids.filter((i) => i.startsWith(t) && i !== t);
  console.log(
    `${exact ? "AVAILABLE" : "NOT FOUND"}  ${t}` +
      (prefixed.length ? `   (related: ${prefixed.slice(0, 6).join(", ")})` : ""),
  );
}

console.log("\n=== GPT-5* FAMILY ===");
const five = ids.filter((i) => /^gpt-5/.test(i));
console.log(five.length ? five.join("\n") : "(none)");

console.log("\n=== GPT-4* FAMILY (chat/vision capable) ===");
console.log(ids.filter((i) => /^gpt-4/.test(i)).join("\n") || "(none)");

console.log("\n=== O-SERIES / REASONING ===");
console.log(ids.filter((i) => /^o\d/.test(i)).join("\n") || "(none)");
