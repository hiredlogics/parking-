import { expect, type Page } from "@playwright/test";

/**
 * Helpers for the V2 case-backed journey.
 *
 * The previous helpers drove the retired V1 flow — `/start` demo seed
 * buttons and an `/appeal/result` page with an "unlock" call to action.
 * That flow no longer exists: cases are created server-side, the
 * payment gate sits before generation, and `/appeal/result` redirects
 * to `/appeal/review`.
 */

export function uniqueEmail(prefix: string): string {
  // Unique per run so the suite can run repeatedly against one database.
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.invalid`;
}

export const TEST_PASSWORD = "PlaywrightTest123!";

/** Register a customer and land signed in. */
export async function createAccount(page: Page, email: string): Promise<void> {
  await page.goto("/signup");
  await page.locator("#name").fill("Playwright Customer");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(TEST_PASSWORD);
  await page.locator("button[type='submit']").click();

  // Signup either lands in the portal or returns to the appeal flow.
  await page.waitForURL((url) => !url.pathname.startsWith("/signup"), {
    timeout: 60_000,
  });
}

/** Sign an existing customer in. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/signin");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(TEST_PASSWORD);
  await page.locator("button[type='submit']").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/signin"), {
    timeout: 60_000,
  });
}

/**
 * A minimal valid PNG.
 *
 * The extraction provider is pinned to the mock in CI, so the bytes are
 * never read for content — but the upload route validates MIME type and
 * size, so this has to be a real image of a plausible size.
 */
function pcnImageBytes(): Buffer {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AL+2ZmpAAAAAElFTkSuQmCC",
    "base64",
  );
  // Pad so it is comfortably over any "suspiciously small" threshold.
  return Buffer.concat([png, Buffer.alloc(2048, 0)]);
}

/** Upload a notice from /appeal/upload, creating the case server-side. */
export async function uploadPcn(page: Page): Promise<void> {
  await page.goto("/appeal/upload");
  await page.getByTestId("pcn-file-input").setInputFiles({
    name: "notice-to-keeper.png",
    mimeType: "image/png",
    buffer: pcnImageBytes(),
  });

  // Surface an upload error immediately rather than timing out later.
  const error = page.getByTestId("upload-error");
  await Promise.race([
    page.waitForURL("**/appeal/confirm", { timeout: 60_000 }),
    error.waitFor({ state: "visible", timeout: 60_000 }).then(async () => {
      throw new Error(`upload failed: ${await error.innerText()}`);
    }),
  ]);
}

/**
 * Supply the registered keeper's details if the page asks for them.
 *
 * The adaptive questions are gone; this is the only customer-typed input
 * left in the journey, and it appears on the evidence page only when the
 * notice does not already carry the keeper (a windscreen ticket, or one
 * the classifier could not place). Returns whether the form was shown,
 * so a caller can assert on it either way.
 */
export async function fillKeeperDetailsIfAsked(page: Page): Promise<boolean> {
  const form = page.getByTestId("keeper-details-form");
  if (!(await form.isVisible().catch(() => false))) return false;

  await page.locator("#keeper_name").fill("Playwright Keeper");
  await page.locator("#keeper_address_line1").fill("12 High Street");
  await page.locator("#keeper_town").fill("Leeds");
  await page.locator("#keeper_postcode").fill("LS1 2AB");
  await page.getByTestId("keeper-details-continue").click();

  // The form disappears once the details are saved and the page re-reads
  // them from the server.
  await form.waitFor({ state: "hidden", timeout: 30_000 }).catch(() => null);
  return true;
}

/**
 * Answer "are you the registered keeper?" on the confirm step.
 *
 * Every keeper-liability ground depends on this fact, so the confirm
 * step refuses to continue without it. Defaults to YES, which is the
 * ordinary case and the one the keeper-safe drafting path assumes.
 */
export async function answerRegisteredKeeper(
  page: Page,
  answer: "yes" | "no" = "yes",
): Promise<void> {
  const radio = page.getByTestId(`registered-keeper-${answer}`);
  /*
   * Wait rather than probe-and-skip. The fieldset renders a moment after
   * the confirm page paints, and a silent skip here surfaces much later
   * as "Please tell us whether you are the registered keeper" with no
   * navigation — which is a confusing way to fail.
   *
   * It is legitimately absent only when triage has blocked the journey,
   * in which case there is nothing to answer.
   */
  const appeared = await radio
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (appeared) await radio.check();
}

/**
 * Wait until the step the journey landed on is actually interactive.
 *
 * The review page fetches readiness before it can render anything, so a
 * scan or a click that arrives during its spinner finds an empty page.
 */
export async function waitForStepReady(page: Page): Promise<void> {
  if (page.url().includes("/appeal/review")) {
    await page
      .getByTestId("review-continue")
      .waitFor({ state: "visible", timeout: 90_000 });
    return;
  }
  await page
    .getByTestId("evidence-continue")
    .waitFor({ state: "visible", timeout: 60_000 });
}

/**
 * Tick the three mandatory pre-payment confirmations (Terms section 16).
 *
 * They are always unchecked on arrival, so every journey that reaches
 * payment has to do this explicitly — which is the behaviour under test.
 */
export async function acceptPurchaseConsent(page: Page): Promise<void> {
  for (const id of [
    "consent-accuracy",
    "consent-terms",
    "consent-immediate-supply",
  ]) {
    await page.getByTestId(id).check();
  }
}

/** Walk a fresh customer all the way to a paid, generated appeal. */
export async function completePaidAppeal(
  page: Page,
  email: string,
): Promise<{ caseId: string }> {
  await createAccount(page, email);
  await uploadPcn(page);

  await page.waitForURL("**/appeal/confirm", { timeout: 60_000 });
  await answerRegisteredKeeper(page);
  await page.getByTestId("confirm-continue").click();

  /*
   * Confirm goes to evidence only when something is still genuinely
   * needed — in practice the keeper's name and address. When the notice
   * already supplies them there is nothing required on that step, so the
   * journey skips straight to payment.
   */
  await page.waitForURL(/\/appeal\/(evidence|review)/, { timeout: 30_000 });
  await waitForStepReady(page);
  if (page.url().includes("/appeal/evidence")) {
    await fillKeeperDetailsIfAsked(page);
    await page.getByTestId("evidence-continue").click();
    await page.waitForURL("**/appeal/review", { timeout: 30_000 });
    await waitForStepReady(page);
  }
  await acceptPurchaseConsent(page);
  await page.getByTestId("review-continue").click();

  await page.waitForURL(/\/checkout\//, { timeout: 30_000 });
  const caseId = /\/checkout\/(case_[a-z0-9]+)/i.exec(page.url())?.[1] ?? "";
  expect(caseId).not.toBe("");

  await page.getByTestId("complete-demo-payment").click();
  await page.waitForURL(/\/checkout\/.*\/success/, { timeout: 90_000 });
  /*
   * Generation is the whole pipeline against a remote database and was
   * measured at ~90s from PAYMENT_CONFIRMED. Callers that use this helper
   * must raise their own per-test timeout to match.
   */
  await page
    .getByTestId("download-pdf")
    .waitFor({ state: "visible", timeout: 180_000 });

  return { caseId };
}

/**
 * Fetch a URL from inside the page.
 *
 * Playwright's `page.request` does not carry this app's session cookie,
 * so an owner's own document came back 401 through it. A same-origin
 * `fetch` from the page sends exactly the credentials the browser would,
 * which is what these assertions are about.
 */
export async function fetchFromPage(
  page: Page,
  url: string,
): Promise<{ status: number; bodyStart: string; contentType: string }> {
  return page.evaluate(async (target) => {
    const res = await fetch(target, { credentials: "include" });
    const text = await res.text();
    return {
      status: res.status,
      bodyStart: text.slice(0, 64),
      contentType: res.headers.get("content-type") ?? "",
    };
  }, url);
}

export interface PortalDoc {
  id: string;
  caseId?: string;
  downloadUrl: string;
  isFinalAppeal?: boolean;
}

/**
 * Document download URLs shown on My Documents.
 *
 * Read from the rendered page rather than an API call: these are the
 * exact hrefs a customer is given, which is what the ownership tests
 * need to attack. (The page is also the thing that would break for a
 * customer, so asserting on it is closer to the real guarantee.)
 */
export async function portalDocumentUrls(page: Page): Promise<string[]> {
  const selector = "a[href*='/api/cases/'][href*='/documents/']";

  /*
   * My Documents is populated by a client-side fetch, and the stored
   * appeal PDF is written while generation finishes. Reload a few times
   * rather than assuming the first paint is the final one.
   */
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt === 0) await page.goto("/portal/documents");
    else await page.reload();

    const links = page.locator(selector);
    try {
      await links.first().waitFor({ state: "attached", timeout: 10_000 });
    } catch {
      continue;
    }

    const urls: string[] = [];
    for (let i = 0; i < (await links.count()); i++) {
      const href = await links.nth(i).getAttribute("href");
      if (href) urls.push(href);
    }
    if (urls.length > 0) return urls;
  }

  throw new Error("My Documents listed no document download links");
}

/**
 * The final appeal PDF's download URL, as offered to the customer.
 */
export async function findFinalAppealUrl(page: Page): Promise<string> {
  const urls = await portalDocumentUrls(page);
  const download =
    urls.find((u) => u.includes("disposition=attachment")) ?? urls[0];
  expect(download, "portal lists no document for a paid case").toBeTruthy();
  return download!;
}
