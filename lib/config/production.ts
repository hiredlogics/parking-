/**
 * Production configuration guard.
 *
 * Every subsystem in this application used to pick a safe-for-development
 * default when its environment variable was absent:
 *
 *   PAYMENT_PROVIDER unset -> demo payments   (appeals given away free)
 *   SESSION_PASSWORD unset -> a literal in    (session cookies forgeable
 *                             this repo        by anyone reading the repo)
 *   ADMIN_PASSWORD   unset -> "changeme"      (admin takeover)
 *   STORAGE_PROVIDER unset -> in-memory Map   (evidence lost on restart)
 *   OPENAI_API_KEY   unset -> template prose  (not a bespoke appeal)
 *
 * Individually each default is reasonable on a laptop. Together they mean
 * a production deploy that simply forgets a variable comes up looking
 * perfectly healthy while giving away free appeals from a forgeable
 * session against storage that evaporates on restart.
 *
 * So: in production these are errors, not defaults. The rules live here
 * rather than being spread across the factories, and `instrumentation.ts`
 * runs them once at startup so a bad deploy fails immediately and says
 * exactly what is wrong — instead of failing later, quietly, in front of
 * a paying customer.
 *
 * The individual factories ALSO refuse unsafe values independently. That
 * duplication is deliberate: a missed startup hook must not be the only
 * thing standing between a misconfigured server and a free appeal.
 */

/** The development-only session secret. Never valid in production. */
export const DEV_SESSION_PASSWORD =
  "pag-dev-only-fallback-session-password-change-me-please-32chars!";

/** The development-only admin password. Never valid in production. */
export const DEV_ADMIN_PASSWORD = "changeme";

const MIN_SESSION_PASSWORD_LENGTH = 32;
const MIN_ADMIN_PASSWORD_LENGTH = 12;

export interface ConfigProblem {
  /** Environment variable or subsystem at fault. */
  key: string;
  /** What is wrong and how to fix it. */
  detail: string;
}

/**
 * Is this a real deployment?
 *
 * `APP_ENV` wins when set, so a staging box can opt into production
 * strictness without pretending to be production for everything else
 * (Next.js sets NODE_ENV=production for any `next build` output).
 */
export function isProductionRuntime(): boolean {
  const appEnv = process.env.APP_ENV?.trim().toLowerCase();
  if (appEnv) return appEnv === "production" || appEnv === "staging";
  return process.env.NODE_ENV === "production";
}

function value(name: string): string {
  return (process.env[name] ?? "").trim();
}

function isSet(name: string): boolean {
  return value(name).length > 0;
}

/** Are payments part of this deployment? Default yes. */
export function paymentsEnabled(): boolean {
  return value("PAYMENTS_ENABLED").toLowerCase() !== "false";
}

/* ------------------------------------------------------------------ */
/* Individual checks                                                   */
/* ------------------------------------------------------------------ */

function checkDatabase(problems: ConfigProblem[]): void {
  if (!isSet("POSTGRES_URL") && !isSet("DATABASE_URL")) {
    problems.push({
      key: "DATABASE_URL",
      detail:
        "No Postgres connection string. Set DATABASE_URL (or POSTGRES_URL). Without it every case operation returns 503.",
    });
  }
}

function checkSession(problems: ConfigProblem[]): void {
  const password = value("SESSION_PASSWORD");

  if (password.length === 0) {
    problems.push({
      key: "SESSION_PASSWORD",
      detail:
        "Not set. Without it the application falls back to a secret committed to this repository, and anyone who can read the repo can forge a session for any customer or admin. Generate one with: openssl rand -base64 48",
    });
    return;
  }
  if (password === DEV_SESSION_PASSWORD) {
    problems.push({
      key: "SESSION_PASSWORD",
      detail:
        "Set to the development placeholder from this repository. Sessions would be forgeable. Generate a real one with: openssl rand -base64 48",
    });
    return;
  }
  if (password.length < MIN_SESSION_PASSWORD_LENGTH) {
    problems.push({
      key: "SESSION_PASSWORD",
      detail: `Only ${password.length} characters; iron-session needs at least ${MIN_SESSION_PASSWORD_LENGTH} for the seal to be sound.`,
    });
  }
}

function checkAdmin(problems: ConfigProblem[]): void {
  const password = value("ADMIN_PASSWORD");

  if (password.length === 0) {
    problems.push({
      key: "ADMIN_PASSWORD",
      detail:
        'Not set. The application would accept the default password "changeme" for the admin account.',
    });
  } else if (password === DEV_ADMIN_PASSWORD) {
    problems.push({
      key: "ADMIN_PASSWORD",
      detail: 'Set to the default "changeme". Choose a real password.',
    });
  } else if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    problems.push({
      key: "ADMIN_PASSWORD",
      detail: `Only ${password.length} characters; use at least ${MIN_ADMIN_PASSWORD_LENGTH}.`,
    });
  }

  if (!isSet("ADMIN_EMAIL")) {
    problems.push({
      key: "ADMIN_EMAIL",
      detail:
        "Not set, so the admin account keeps its default address. Set the real administrator email.",
    });
  }
}

function checkStorage(problems: ConfigProblem[]): void {
  const provider = value("STORAGE_PROVIDER").toLowerCase();

  if (provider.length === 0) {
    problems.push({
      key: "STORAGE_PROVIDER",
      detail:
        "Not set, so storage defaults to an in-process Map. Customer evidence and generated PDFs would be lost on every restart and invisible to any other instance. Set STORAGE_PROVIDER=s3 with S3_ENDPOINT for DigitalOcean Spaces.",
    });
    return;
  }
  if (provider === "memory") {
    problems.push({
      key: "STORAGE_PROVIDER",
      detail:
        "Set to memory. Customer documents would be held in RAM and lost on restart. Use s3 (DigitalOcean Spaces) or r2.",
    });
    return;
  }
  if (provider !== "s3" && provider !== "r2") {
    problems.push({
      key: "STORAGE_PROVIDER",
      detail: `Unknown value "${provider}". Use s3 or r2.`,
    });
    return;
  }

  const missing = ["R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"].filter(
    (name) => !isSet(name),
  );
  if (missing.length > 0) {
    problems.push({
      key: "STORAGE_CREDENTIALS",
      detail: `STORAGE_PROVIDER=${provider} but missing: ${missing.join(", ")}.`,
    });
  }
  if (!isSet("R2_ENDPOINT") && !isSet("S3_ENDPOINT") && !isSet("R2_ACCOUNT_ID")) {
    problems.push({
      key: "S3_ENDPOINT",
      detail:
        "No storage endpoint. For DigitalOcean Spaces set S3_ENDPOINT=https://<region>.digitaloceanspaces.com",
    });
  }
}

function checkPayments(problems: ConfigProblem[]): void {
  if (!paymentsEnabled()) return;

  const provider = value("PAYMENT_PROVIDER").toLowerCase();

  if (provider.length === 0) {
    problems.push({
      key: "PAYMENT_PROVIDER",
      detail:
        "Not set, so payments default to the demo provider — customers would receive appeals without paying, and /api/cases/[id]/payment/confirm-demo would settle cases for free. Set PAYMENT_PROVIDER=stripe (or PAYMENTS_ENABLED=false to run without payment).",
    });
    return;
  }
  if (provider === "demo") {
    problems.push({
      key: "PAYMENT_PROVIDER",
      detail:
        "Set to demo. Appeals would be given away free. Set PAYMENT_PROVIDER=stripe.",
    });
    return;
  }
  if (provider !== "stripe") {
    problems.push({
      key: "PAYMENT_PROVIDER",
      detail: `Unknown value "${provider}". Use stripe.`,
    });
    return;
  }

  for (const name of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) {
    if (!isSet(name)) {
      problems.push({
        key: name,
        detail: `Required when PAYMENT_PROVIDER=stripe. ${
          name === "STRIPE_WEBHOOK_SECRET"
            ? "Webhook signature verification is mandatory — without it payment confirmations cannot be trusted."
            : "Checkout cannot be created without it."
        }`,
      });
    }
  }

  if (value("STRIPE_SECRET_KEY").startsWith("sk_test_")) {
    problems.push({
      key: "STRIPE_SECRET_KEY",
      detail: "This is a Stripe TEST key. Production needs a live key.",
    });
  }

  if (!isSet("APP_URL") && !isSet("NEXT_PUBLIC_APP_URL")) {
    problems.push({
      key: "APP_URL",
      detail:
        "Not set. Stripe checkout needs an absolute return URL, so payment would fail. Set the public origin, e.g. https://client-domain.co.uk",
    });
  }
}

function checkOpenAI(problems: ConfigProblem[]): void {
  if (!isSet("OPENAI_API_KEY")) {
    problems.push({
      key: "OPENAI_API_KEY",
      detail:
        "Not set. Extraction refuses to run, and drafting and question generation silently degrade to non-bespoke templates — customers would be sold a template.",
    });
  }

  // Explicit test/offline providers must never be left on in production.
  const offline: Array<[string, string[]]> = [
    ["EXTRACTION_PROVIDER", ["mock"]],
    ["DRAFTING_PROVIDER", ["deterministic"]],
    ["QUESTION_PROVIDER", ["bank"]],
  ];
  for (const [name, unsafe] of offline) {
    const current = value(name).toLowerCase();
    if (current && unsafe.includes(current)) {
      problems.push({
        key: name,
        detail: `Set to "${current}", a development/test provider. Unset it so the real AI provider is used.`,
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Everything wrong with the current configuration for a production
 * deployment. Empty means good. Safe to call in any environment — it
 * only reads env vars and never throws.
 */
export function collectConfigProblems(): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  checkDatabase(problems);
  checkSession(problems);
  checkAdmin(problems);
  checkStorage(problems);
  checkPayments(problems);
  checkOpenAI(problems);
  return problems;
}

export class ProductionConfigError extends Error {
  readonly problems: ConfigProblem[];
  constructor(problems: ConfigProblem[]) {
    super(
      [
        `Refusing to start: ${problems.length} production configuration problem(s).`,
        "",
        ...problems.map((p, i) => `  ${i + 1}. ${p.key}\n     ${p.detail}`),
        "",
        "Set these in the server environment and restart. See .env.example.",
      ].join("\n"),
    );
    this.name = "ProductionConfigError";
    this.problems = problems;
  }
}

/**
 * Fail startup when production configuration is unsafe.
 *
 * A no-op outside production, so development and tests are unaffected.
 */
export function assertProductionConfig(): void {
  if (!isProductionRuntime()) return;
  const problems = collectConfigProblems();
  if (problems.length > 0) throw new ProductionConfigError(problems);
}

/**
 * Guard for an individual factory.
 *
 * Lets each subsystem refuse its own unsafe default even if the startup
 * check never ran, without every factory restating the reasoning.
 */
export function refuseInProduction(key: string, detail: string): void {
  if (!isProductionRuntime()) return;
  throw new ProductionConfigError([{ key, detail }]);
}
