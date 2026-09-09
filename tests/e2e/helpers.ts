import type { Page, Locator } from "@playwright/test";

/**
 * Waits for the app to hydrate (the CTA on the landing page becomes clickable),
 * then navigates to /start.
 */
export async function goToStart(page: Page) {
  await page.goto("/");
  await page.getByTestId("hero-cta").click();
  await page.waitForURL("**/start");
}

/**
 * Seed the store using a deterministic demo scenario, then continue from
 * confirmation onwards.
 */
export async function seedScenario(page: Page, id: string) {
  await page.goto("/start");
  await page.getByTestId(`demo-${id}`).click();
  await page.waitForURL("**/appeal/confirm");
}

/**
 * Continue from the /appeal/confirm page.
 */
export async function submitConfirm(page: Page) {
  await page.getByTestId("confirm-continue").click();
  await page.waitForURL("**/appeal/questions");
}

/**
 * Continue from questions to evidence.
 */
export async function continueFromQuestions(page: Page) {
  await page.getByTestId("questions-continue").click();
  await page.waitForURL("**/appeal/evidence");
}

/**
 * Continue from evidence to review.
 */
export async function continueFromEvidence(page: Page) {
  await page.getByTestId("evidence-continue").click();
  await page.waitForURL("**/appeal/review");
}

/**
 * Continue from review to result. The result page has three visual
 * phases (processing → preview → unlocked). This helper waits for
 * "Unlock My Appeal" to appear (i.e. processing done) and then unlocks
 * so downstream assertions can read the full appeal text.
 */
export async function continueFromReview(page: Page) {
  await page.getByTestId("review-continue").click();
  await page.waitForURL("**/appeal/result");
  const unlock = page.getByTestId("unlock-cta");
  // Processing runs for ~3.3s; give it up to 20s to reach the preview.
  await unlock.waitFor({ state: "visible", timeout: 20_000 });
  await unlock.click();
  // Once unlocked, the download buttons are rendered.
  await page.getByTestId("download-pdf").waitFor({ state: "visible" });
}

export async function expectPreviewContains(preview: Locator, substrings: string[]) {
  const text = await preview.innerText();
  for (const s of substrings) {
    if (!text.includes(s)) {
      throw new Error(`preview did not contain "${s}"\n---\n${text}`);
    }
  }
}
