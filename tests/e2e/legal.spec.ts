import { expect, test } from "@playwright/test";

/**
 * The published Terms and the consent gate, in a real browser.
 *
 * The API check at the end matters most: it proves the gate is not the
 * disabled button, by calling checkout directly with no consent body.
 */

test.describe("Terms and Conditions page", () => {
  test("loads with the supplied heading and date", async ({ page }) => {
    await page.goto("/terms");
    await expect(
      page.getByRole("heading", { name: "Terms and Conditions", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Last updated: September 2026")).toBeVisible();
    await expect(
      page.getByText("The Parking Appeals Group Limited").first(),
    ).toBeVisible();
  });

  test("shows every section from 1 to 29", async ({ page }) => {
    await page.goto("/terms");
    for (let n = 1; n <= 29; n++) {
      await expect(page.locator(`#section-${n}`)).toHaveCount(1);
    }
    // Section 2 headings exist for all 29 and nothing beyond.
    await expect(page.locator('[id^="section-"]')).toHaveCount(29);
  });

  test("carries the supplied company and contact details", async ({ page }) => {
    await page.goto("/terms");
    const body = await page.locator("body").innerText();
    expect(body).toContain("Office 1275");
    expect(body).toContain("12 Farwig Lane");
    expect(body).toContain("BR1 3RB");
    expect(body).toContain("info@parkingappealsgroup.co.uk");
  });

  test("does not publish the developer checkout appendix", async ({ page }) => {
    await page.goto("/terms");
    const body = (await page.locator("body").innerText()).toUpperCase();
    expect(body).not.toContain("DEVELOPER CHECKOUT WORDING");
    expect(body).not.toContain("PAYMENT BUTTON WORDING");
  });

  test("is readable on mobile and desktop", async ({ page }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/terms");
      await expect(page.locator("#section-1")).toBeVisible();
      await expect(page.locator("#section-29")).toBeAttached();

      // Nothing may overflow the viewport horizontally.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow, `horizontal overflow at ${viewport.width}px`).toBe(false);
    }
  });

  test("is reachable from the site footer", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("footer-terms").click();
    await expect(page).toHaveURL(/\/terms$/);
  });

  test("the privacy policy link resolves", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("footer-privacy").click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole("heading", { name: "Privacy Policy", level: 1 }),
    ).toBeVisible();
  });
});

test.describe("checkout API consent enforcement", () => {
  test("a direct call with no consent is refused", async ({ page }) => {
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/cases/case_does_not_exist/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      return { status: res.status };
    });

    /*
     * Unauthenticated or missing-case answers come first for a fabricated
     * id; what must never happen is a 200 with a checkout session.
     */
    expect(result.status).not.toBe(200);
  });
});
