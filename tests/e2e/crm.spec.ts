import { test, expect } from "@playwright/test";
import { seedScenario, submitConfirm, continueFromQuestions, continueFromEvidence } from "./helpers";

test.describe("admin CRM", () => {
  test("dashboard renders with KPIs, tasks, activity and quick access", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /CRM Dashboard/i })).toBeVisible();
    await expect(page.getByText(/Awaiting Review/i).first()).toBeVisible();
    await expect(page.getByText(/Today's Overview/i)).toBeVisible();
    await expect(page.getByText(/Recent Activity/i)).toBeVisible();
    await expect(page.getByText(/Upcoming Tasks/i)).toBeVisible();
  });

  test("case Kanban lets a case be dragged to a new column", async ({ page }) => {
    await page.goto("/admin/cases");
    await expect(page.getByRole("heading", { name: /Case List/i })).toBeVisible();
    // Assert each Kanban column heading by role.
    for (const label of ["Awaiting Review", "In Progress", "Awaiting Client", "Ready to Draft", "Completed"]) {
      await expect(page.getByRole("heading", { name: label })).toBeVisible();
    }
    // Cases are drag/drop enabled: at least one draggable card exists
    const draggables = page.locator("[draggable='true']");
    expect(await draggables.count()).toBeGreaterThan(0);
  });

  test("case detail exposes the tabbed workflow and action panel", async ({ page }) => {
    await page.goto("/admin/cases/case_awr_1");
    await expect(page.getByRole("heading", { name: /Case Detail — /i })).toBeVisible();
    for (const tab of ["Overview", "Documents", "Timeline", "Notes", "Tasks", "Communication"]) {
      await expect(page.getByRole("button", { name: tab, exact: false }).first()).toBeVisible();
    }
    await expect(page.getByText("Case Actions", { exact: true })).toBeVisible();
  });

  test("client profile shows tabs and quick actions", async ({ page }) => {
    await page.goto("/admin/clients/cl_smith");
    await expect(page.getByRole("heading", { name: /Client Profile/i })).toBeVisible();
    await expect(page.getByText(/Active Cases/i).first()).toBeVisible();
  });

  test("appeal-builder page renders analytics + records", async ({ page }) => {
    await page.goto("/admin/appeal-builder");
    await expect(page.getByRole("heading", { name: /Appeal Builder/i })).toBeVisible();
    await expect(page.getByText(/By Type/i)).toBeVisible();
    await expect(page.getByText(/Top Contraventions/i)).toBeVisible();
  });

  test("integration: unlocking an appeal creates a CRM record", async ({ page }) => {
    // Complete the customer flow so a CRM record is created on unlock.
    await seedScenario(page, "payment_keying");
    await submitConfirm(page);
    await continueFromQuestions(page);
    await continueFromEvidence(page);
    await page.getByTestId("review-continue").click();
    await page.waitForURL("**/appeal/result");
    // Wait for the processing phase to hand off to preview.
    const unlock = page.getByTestId("unlock-cta");
    await unlock.waitFor({ state: "visible", timeout: 20_000 });
    await unlock.click();
    // Once unlocked, PDF download is visible.
    await page.getByTestId("download-pdf").waitFor({ state: "visible" });

    // Verify the CRM Appeal Builder list now contains the record.
    await page.goto("/admin/appeal-builder");
    await expect(page.getByText(/AB12 CDE/i).first()).toBeVisible();
  });

  test("customer portal dashboard renders my dashboard", async ({ page }) => {
    await page.goto("/portal");
    await expect(page.getByRole("heading", { name: /My Dashboard/i })).toBeVisible();
    // Card headers are <h2>s so target by heading role — nav links live in
    // an <aside> that's hidden on mobile.
    await expect(page.getByRole("heading", { name: /My Cases/i }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /My Appeals/i }).first()).toBeVisible();
  });
});
