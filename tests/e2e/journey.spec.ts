import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  acceptPurchaseConsent,
  answerRegisteredKeeper,
  fillKeeperDetailsIfAsked,
  createAccount,
  portalDocumentUrls,
  uploadPcn,
  uniqueEmail,
  waitForStepReady,
} from "./journeyHelpers";

/**
 * The continuous customer journey, end to end, in a real browser.
 *
 * One test walks the whole thing in order rather than several tests
 * each re-creating state, because the thing most worth protecting is
 * that the steps connect: a case created at upload is the same case
 * that gets paid for, drafted, and whose PDF appears in the portal.
 *
 * Every external dependency is pinned to a deterministic provider in
 * playwright.config.ts, so this makes no paid API calls.
 */

test.describe.configure({ mode: "serial" });

test.describe("Private parking appeal — continuous journey", () => {
  let page: Page;
  let email: string;
  let caseUrl: string;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    email = uniqueEmail("journey");
  });

  test.afterAll(async () => {
    // May be undefined if the browser failed to launch at all.
    await page?.close();
  });

  test("1. a customer can create an account", async () => {
    await createAccount(page, email);
    // Signup lands the customer inside the product, not back on marketing.
    await expect(page).not.toHaveURL(/\/signup/);
  });

  test("2. uploading a notice creates a case and extracts it", async () => {
    await uploadPcn(page);

    // Extraction has run and the customer is asked to confirm it.
    await page.waitForURL("**/appeal/confirm", { timeout: 60_000 });
    await expect(page.getByTestId("confirm-continue")).toBeVisible();
  });

  test("3. confirming the notice moves on without a questions step", async () => {
    /*
     * No questions step: the classifier and the uploaded documents are
     * what establish the facts now. Keeper status is the one answer the
     * confirm step still requires, because every keeper-liability ground
     * depends on it.
     *
     * Where it lands depends on the notice. Step 3 is only shown when
     * something is actually needed there — the keeper's name and address,
     * which a postal Notice to Keeper already supplies. A windscreen
     * ticket does not, so that journey does stop at evidence.
     */
    await answerRegisteredKeeper(page);
    await page.getByTestId("confirm-continue").click();
    await page.waitForURL(/\/appeal\/(evidence|review)/, { timeout: 30_000 });
    await waitForStepReady(page);
    expect(page.url()).toMatch(/\/appeal\/(evidence|review)/);
  });

  test("4. the customer is never asked who was driving", async () => {
    /*
     * The keeper-safety guarantee, which used to be asserted against the
     * questions actually asked. Nothing is asked any more, so it is
     * asserted against every word of input the journey still presents:
     * the labels, placeholders and headings on the evidence page.
     *
     * The page legitimately carries the reassurance banner "We never ask
     * who was driving", so the scan is limited to the form controls
     * rather than the whole body -- a body scan would match the
     * reassurance and pass for the wrong reason.
     *
     * Asserted against whichever step the journey actually reached, so
     * the guarantee is checked on the page the customer is really shown.
     */
    const labels = await page
      .locator("label, input[placeholder], h1, h2")
      .evaluateAll((els) =>
        els.map((el) =>
          [
            el.textContent ?? "",
            el.getAttribute("placeholder") ?? "",
          ].join(" "),
        ),
      );

    expect(labels.length).toBeGreaterThan(0);
    for (const text of labels) {
      const t = text.toLowerCase();
      expect(t, text).not.toContain("who was driving");
      expect(t, text).not.toContain("were you driving");
      expect(t, text).not.toContain("who drove");
      expect(t, text).not.toContain("name of the driver");
    }
  });

  test("4b. keeper details are collected when the notice lacks them", async () => {
    // The one remaining piece of typed input, and the letter has no
    // sender without it.
    await fillKeeperDetailsIfAsked(page);
    await expect(page.getByTestId("keeper-details-form")).toBeHidden();
  });

  test("5. evidence is optional and review is reached", async () => {
    // Evidence never blocks checkout, so continuing without uploading
    // anything must reach review. When the step was skipped entirely we
    // are already there.
    if (page.url().includes("/appeal/evidence")) {
      await page.getByTestId("evidence-continue").click();
    }
    await page.waitForURL("**/appeal/review", { timeout: 30_000 });
    await waitForStepReady(page);
  });

  test("5b. payment is blocked until all three consents are given", async () => {
    // All three arrive unticked, so the pay button starts disabled.
    for (const id of ["consent-accuracy", "consent-terms", "consent-immediate-supply"]) {
      await expect(page.getByTestId(id)).not.toBeChecked();
    }
    await expect(page.getByTestId("review-continue")).toBeDisabled();

    await page.getByTestId("consent-accuracy").check();
    await expect(page.getByTestId("review-continue")).toBeDisabled();

    await page.getByTestId("consent-terms").check();
    await expect(page.getByTestId("review-continue")).toBeDisabled();

    await page.getByTestId("consent-immediate-supply").check();
    await expect(page.getByTestId("review-continue")).toBeEnabled();
  });

  test("5c. a refresh does not carry the consent over", async () => {
    await page.reload();
    for (const id of ["consent-accuracy", "consent-terms", "consent-immediate-supply"]) {
      await expect(page.getByTestId(id)).not.toBeChecked();
    }
    await expect(page.getByTestId("review-continue")).toBeDisabled();
    await acceptPurchaseConsent(page);
  });

  test("6. review leads to checkout, not to a free appeal", async () => {
    await page.getByTestId("review-continue").click();
    // The payment gate sits between review and any generated document.
    await page.waitForURL(/\/checkout\//, { timeout: 30_000 });
    caseUrl = page.url();
    expect(caseUrl).toMatch(/\/checkout\/case_/);
  });

  test("7. paying unlocks generation and produces a document", async () => {
    /*
     * Generation runs the full pipeline server-side — analysis,
     * retrieval, drafting, validation and PDF — against a remote
     * database. Measured end to end at ~90s from PAYMENT_CONFIRMED to
     * the appeal row being written, so the default 60s per-test budget
     * cannot cover it.
     */
    test.setTimeout(240_000);
    await page.getByTestId("complete-demo-payment").click();

    // Generation and validation run server-side after payment.
    await page.waitForURL(/\/checkout\/.*\/success/, { timeout: 90_000 });
    await expect(page.getByTestId("download-pdf")).toBeVisible({
      timeout: 180_000,
    });
  });

  test("8. the PDF downloads from the success page", async () => {
    const download = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      page.getByTestId("download-pdf").click(),
    ]).then(([d]) => d);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const bytes = Buffer.concat(chunks);

    // A real PDF, not an error page rendered as a download.
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  test("9. the case appears in the portal", async () => {
    await page.goto("/portal");
    await expect(page.locator("body")).toContainText(/appeal/i);
  });

  test("10. My Cases lists the case", async () => {
    await page.goto("/portal/cases");
    await expect(page.locator("body")).toContainText(/CASE-/, {
      timeout: 30_000,
    });
  });

  test("11. My Appeals lists the appeal", async () => {
    await page.goto("/portal/appeals");
    await expect(page.locator("body")).not.toContainText(/no appeals yet/i);
  });

  test("12. My Documents lists the generated PDF", async () => {
    await page.goto("/portal/documents");
    await expect(page.locator("body")).not.toContainText(/no documents/i, {
      timeout: 30_000,
    });
  });

  test("13. the PDF can be viewed and downloaded from the case page", async () => {
    await page.goto("/portal/cases");
    await page.locator("a[href*='/portal/cases/case_']").first().click();
    await page.waitForURL(/\/portal\/cases\/case_/, { timeout: 30_000 });

    const pdf = page.getByTestId("portal-download-pdf");
    await expect(pdf).toBeVisible({ timeout: 30_000 });

    const download = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      pdf.click(),
    ]).then(([d]) => d);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });

  test("14. an invoice is available for the payment", async () => {
    await page.goto("/portal/invoices");
    await expect(page.locator("body")).not.toContainText(/no invoices/i, {
      timeout: 30_000,
    });
  });

  test("15. re-downloading the PDF does not regenerate it", async () => {
    /*
     * The releasable appeal is generated once from the validated draft
     * and persisted. Re-reading it must be a storage read, never a
     * regeneration — otherwise every download costs money and, worse,
     * could hand the customer different wording than they were shown.
     *
     * A regeneration would write a new row in case_documents_meta, so
     * the document's identity is the evidence: if it is byte-identical
     * and still the same record after repeated downloads, nothing was
     * produced again.
     */
    const before = await portalDocumentUrls(page);
    expect(before.length, "no documents listed").toBeGreaterThan(0);

    await page.goto("/portal/cases");
    await page.locator("a[href*='/portal/cases/case_']").first().click();
    await page.waitForURL(/\/portal\/cases\/case_/);

    const hashes = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const d = await Promise.all([
        page.waitForEvent("download", { timeout: 60_000 }),
        page.getByTestId("portal-download-pdf").click(),
      ]).then(([x]) => x);
      expect(d.suggestedFilename()).toMatch(/\.pdf$/i);

      const stream = await d.createReadStream();
      const chunks: Buffer[] = [];
      for await (const c of stream) chunks.push(c as Buffer);
      hashes.add(createHash("sha256").update(Buffer.concat(chunks)).digest("hex"));
    }

    // Every download returned exactly the same bytes.
    expect(hashes.size).toBe(1);

    /*
     * And the document set is unchanged. A regeneration would persist a
     * new document row against the case, so a stable list of the same
     * URLs means nothing was produced again.
     */
    expect(await portalDocumentUrls(page)).toEqual(before);
  });
});
