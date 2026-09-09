import { test, expect } from "@playwright/test";
import {
  seedScenario,
  submitConfirm,
  continueFromQuestions,
  continueFromEvidence,
  continueFromReview,
} from "./helpers";

test("Example A — Payment + Minor Keying Error: full journey ends with a downloadable, keeper-safe appeal", async ({
  page,
}) => {
  await seedScenario(page, "payment_keying");
  await submitConfirm(page);
  await continueFromQuestions(page);
  await continueFromEvidence(page);

  // Review page — expect the payment + registration-entry-error routes.
  await expect(page.getByText(/Payment made/i).first()).toBeVisible();
  await expect(page.getByText(/Registration entry error/i)).toBeVisible();

  await continueFromReview(page);

  const article = page.locator("article");
  const text = await article.innerText();

  // Text from the pack's Example A paragraphs must be present.
  expect(text).toContain("Payment was made in connection with the vehicle's use of the site.");
  expect(text).toContain("Evidence confirming payment is supplied with this appeal.");
  expect(text).toContain("A parking payment was made, but an error occurred");
  expect(text).toContain("The discrepancy concerns a minor error in the vehicle registration");
  expect(text).toContain("Notwithstanding the registration-entry error, the applicable parking tariff was paid.");

  // Keeper-safe: no first-person driver wording.
  expect(text).not.toMatch(/\bI (?:drove|paid|parked|overstayed)\b/i);
  // No leaked IDs.
  expect(text).not.toMatch(/PP-[A-Z0-9-]+/);
  expect(text).not.toMatch(/\bPP-R\d+\b/);

  // Download buttons enabled.
  const pdfBtn = page.getByTestId("download-pdf");
  const docxBtn = page.getByTestId("download-docx");
  await expect(pdfBtn).toBeEnabled();
  await expect(docxBtn).toBeEnabled();

  const [download] = await Promise.all([page.waitForEvent("download"), pdfBtn.click()]);
  expect(await download.path()).toBeTruthy();
});
