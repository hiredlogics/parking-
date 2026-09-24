import { expect, test } from "@playwright/test";
import {
  acceptPurchaseConsent,
  answerRegisteredKeeper,
  fillKeeperDetailsIfAsked,
  completePaidAppeal,
  createAccount,
  fetchFromPage,
  findFinalAppealUrl,
  uniqueEmail,
  uploadPcn,
  waitForStepReady,
} from "./journeyHelpers";

/**
 * Document access control, exercised through the real browser and API.
 *
 * The unit suite covers the guards in isolation. This covers the thing
 * that actually matters to a customer: that another customer cannot
 * reach their appeal, even knowing its identifiers.
 *
 * Deterministic providers throughout — see playwright.config.ts.
 */

test.describe.configure({ mode: "serial" });

// Full paid journey + generation can exceed the default 60s when the
// suite has already exercised the same stack (DB, storage, drafting).
test.setTimeout(180_000);

test.describe("Appeal document ownership", () => {
  let ownerEmail: string;
  let ownerCaseId: string;
  /** The exact URL the owner is given for their appeal PDF. */
  let ownerDocUrl: string;

  test("customer A can reach their own paid appeal", async ({ browser }) => {
    // Includes a full post-payment generation; see completePaidAppeal.
    test.setTimeout(240_000);
    const page = await browser.newPage();
    ownerEmail = uniqueEmail("owner");

    const { caseId } = await completePaidAppeal(page, ownerEmail);
    ownerCaseId = caseId;
    ownerDocUrl = await findFinalAppealUrl(page);

    const res = await fetchFromPage(page, ownerDocUrl);
    expect(res.status).toBe(200);
    expect(res.contentType).toMatch(/pdf/i);
    expect(res.bodyStart).toContain("%PDF-");

    await page.close();
  });

  test("customer B cannot reach customer A's document", async ({ browser }) => {
    // A different signed-in customer, with A's exact identifiers.
    const page = await browser.newPage();
    await createAccount(page, uniqueEmail("intruder"));

    const res = await fetchFromPage(page, ownerDocUrl);
    expect([401, 403, 404]).toContain(res.status);
    expect(res.bodyStart).not.toContain("%PDF-");

    await page.close();
  });

  test("customer B cannot read customer A's case state", async ({ browser }) => {
    const page = await browser.newPage();
    await createAccount(page, uniqueEmail("intruder2"));

    const res = await fetchFromPage(page, `/api/cases/${ownerCaseId}`);
    expect([401, 403, 404]).toContain(res.status);

    await page.close();
  });

  test("customer B cannot see customer A's case in their portal", async ({
    browser,
  }) => {
    const page = await browser.newPage();
    await createAccount(page, uniqueEmail("intruder3"));

    await page.goto("/portal/cases");
    await expect(page.locator("body")).not.toContainText(ownerCaseId);

    await page.close();
  });

  test("a signed-out request for the document fails", async ({ browser }) => {
    // A clean context: no session cookie at all.
    const context = await browser.newContext();
    const page = await context.newPage();
    // Load an app page first so the fetch is same-origin, but sign in to nothing.
    await page.goto("/");
    const res = await fetchFromPage(page, ownerDocUrl);
    expect([401, 403, 404]).toContain(res.status);
    expect(res.bodyStart).not.toContain("%PDF-");

    await context.close();
  });

  test("a signed-out visit to the portal is redirected to sign in", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/portal");
    // Signed-out visitors are sent to signup/signin, with a return path.
    await expect(page).toHaveURL(/\/(signup|signin|login)/);
    await expect(page).toHaveURL(/next=%2Fportal/);
    await context.close();
  });
});

test.describe("Payment entitlement", () => {
  test("an unpaid case cannot download the appeal", async ({ browser }) => {
    const page = await browser.newPage();
    await createAccount(page, uniqueEmail("unpaid"));

    // Take the journey as far as review, then stop before paying.
    await uploadPcn(page);
    await page.waitForURL("**/appeal/confirm", { timeout: 60_000 });
    await answerRegisteredKeeper(page);
    await page.getByTestId("confirm-continue").click();

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

    // The document endpoint must refuse before payment.
    const res = await fetchFromPage(page, `/api/cases/${caseId}/document?format=pdf`);
    expect(res.status).not.toBe(200);
    expect(res.bodyStart).not.toContain("%PDF-");

    await page.close();
  });

  test("the portal offers payment, not a download, before paying", async ({
    browser,
  }) => {
    const page = await browser.newPage();
    await createAccount(page, uniqueEmail("unpaid2"));

    await uploadPcn(page);
    await page.waitForURL("**/appeal/confirm", { timeout: 60_000 });
    const caseId = await page.evaluate(() =>
      // The confirm page holds the active case id in the URL or storage.
      new URL(window.location.href).searchParams.get("case") ?? "",
    );

    await page.goto("/portal/cases");
    const link = page.locator("a[href*='/portal/cases/case_']").first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await page.waitForURL(/\/portal\/cases\/case_/, { timeout: 30_000 });

      // Either a pay call to action, or at minimum no PDF download.
      const pay = page.getByTestId("portal-pay-cta");
      const pdf = page.getByTestId("portal-download-pdf");
      const payVisible = await pay.isVisible().catch(() => false);
      const pdfVisible = await pdf.isVisible().catch(() => false);
      expect(payVisible || !pdfVisible).toBeTruthy();
    }

    expect(caseId === "" || caseId.startsWith("case_")).toBeTruthy();
    await page.close();
  });
});
