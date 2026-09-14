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
 * Answer adaptive questions until the engine reports sufficiency.
 *
 * Picks the first offered option for choice questions and types a
 * plausible value for free-text ones. The point is to exercise the
 * loop and the transitions, not to steer the case down a chosen route.
 *
 * Returns the label of every question actually put to the customer, so
 * callers can assert on what was asked.
 */
export async function answerAllQuestions(page: Page, limit = 30): Promise<string[]> {
  const done = page.getByTestId("questions-complete-continue");
  const card = page.getByTestId("adaptive-question");
  const label = page.getByTestId("question-label");
  const submit = page.getByTestId("question-continue");
  const asked: string[] = [];

  for (let i = 0; i < limit; i++) {
    if (await done.isVisible().catch(() => false)) break;

    // Wait for a question that is actually ready to accept an answer.
    // The submit button is disabled and shows "Saving…" mid-flight, and
    // the card is replaced wholesale when the next question arrives.
    try {
      await card.waitFor({ state: "visible", timeout: 20_000 });
      await expect(submit).toBeEnabled({ timeout: 20_000 });
    } catch {
      if (await done.isVisible().catch(() => false)) break;
      throw new Error("no answerable question and no completion state");
    }

    const current = await label.innerText();
    asked.push(current.trim());

    // Choice options render as aria-pressed buttons inside the card.
    const options = card.locator("button[aria-pressed]");
    if ((await options.count()) > 0) {
      await options.first().click();
    } else {
      const text = card.locator(
        "input[type='text'], input[type='date'], input[type='time'], input[type='number'], textarea",
      );
      if ((await text.count()) > 0) {
        const field = text.first();
        const type = await field.getAttribute("type");
        await field.fill(
          type === "date"
            ? "2026-07-12"
            : type === "time"
              ? "10:42"
              : type === "number"
                ? "2"
                : "KT19 RPI",
        );
      }
    }

    await submit.click();

    /*
     * Wait for the server to move the case on, rather than guessing at
     * a delay: either a different question is now showing, or
     * questioning is complete.
     */
    await Promise.race([
      page
        .waitForFunction(
          (prev) =>
            document.querySelector('[data-testid="question-label"]')?.textContent?.trim() !==
            prev,
          current.trim(),
          { timeout: 30_000 },
        )
        .catch(() => null),
      done.waitFor({ state: "visible", timeout: 30_000 }).catch(() => null),
    ]);
  }

  return asked;
}

/** Walk a fresh customer all the way to a paid, generated appeal. */
export async function completePaidAppeal(
  page: Page,
  email: string,
): Promise<{ caseId: string }> {
  await createAccount(page, email);
  await uploadPcn(page);

  await page.waitForURL("**/appeal/confirm", { timeout: 60_000 });
  await page.getByTestId("confirm-continue").click();

  await page.waitForURL("**/appeal/questions", { timeout: 30_000 });
  await answerAllQuestions(page);
  await page.getByTestId("questions-complete-continue").click();

  await page.waitForURL("**/appeal/evidence", { timeout: 30_000 });
  await page.getByTestId("evidence-continue").click();

  await page.waitForURL("**/appeal/review", { timeout: 30_000 });
  await page.getByTestId("review-continue").click();

  await page.waitForURL(/\/checkout\//, { timeout: 30_000 });
  const caseId = /\/checkout\/(case_[a-z0-9]+)/i.exec(page.url())?.[1] ?? "";
  expect(caseId).not.toBe("");

  await page.getByTestId("complete-demo-payment").click();
  await page.waitForURL(/\/checkout\/.*\/success/, { timeout: 90_000 });
  await page.getByTestId("download-pdf").waitFor({ state: "visible", timeout: 90_000 });

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
