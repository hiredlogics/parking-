import { test, expect } from "@playwright/test";

test.describe("landing page", () => {
  test("renders the pack hero and each of the required sections", async ({ page }) => {
    await page.goto("/");

    // Hero headline
    await expect(
      page.getByRole("heading", { name: /Received a Parking Notice, Court Claim or Bailiff Letter\?/i }),
    ).toBeVisible();

    // Every reference section is present. Use anchor IDs where possible so
    // the assertion doesn't accidentally match items inside a collapsed
    // mobile menu.
    await expect(page.locator("#services")).toBeVisible();
    await expect(page.locator("#expert-help")).toBeVisible();
    await expect(page.locator("#how-it-works")).toBeVisible();
    await expect(page.getByText(/APPEAL BUILDER/i)).toBeVisible();
    await expect(page.getByText(/NEED EXPERT HELP\?/i)).toBeVisible();
    await expect(page.getByText(/REAL CASES\. REAL RESULTS\./i)).toBeVisible();
    await expect(page.getByText(/Not sure what letter you have\?/i)).toBeVisible();
    await expect(page.getByText(/Secure & Confidential/i)).toBeVisible();

    // Hero CTA still navigates to /start (Phase 1 private-parking flow)
    await page.getByTestId("hero-cta").click();
    await expect(page).toHaveURL(/\/start$/);
  });

  test("Private Parking PCN card links to the Phase 1 appeal flow", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("card-private-parking-pcn")).toBeVisible();
    await page.getByTestId("card-private-parking-pcn").click();
    await expect(page).toHaveURL(/\/start$/);
  });

  test("progress steps are rendered on the upload page", async ({ page }) => {
    await page.goto("/appeal/upload");
    await expect(page.getByLabel("Appeal progress")).toBeVisible();
  });
});
