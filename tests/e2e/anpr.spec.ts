import { test, expect } from "@playwright/test";
import {
  seedScenario,
  submitConfirm,
  continueFromQuestions,
  continueFromEvidence,
  continueFromReview,
} from "./helpers";

test("Example B — ANPR multiple visits: all listed paragraphs appear in preview", async ({ page }) => {
  await seedScenario(page, "anpr_multiple_visits");
  await submitConfirm(page);
  await continueFromQuestions(page);
  await continueFromEvidence(page);

  await expect(page.getByText(/ANPR/i).first()).toBeVisible();

  await continueFromReview(page);

  const article = page.locator("article");
  const text = await article.innerText();

  // Pack Example B → paragraphs PP-ANPR-001, 002, 003, 004, 005, 012.
  expect(text).toContain("The ANPR images relied upon record the vehicle at particular points on the controlled land.");
  expect(text).toContain("The alleged duration of parking is disputed.");
  expect(text).toContain("The vehicle attended the location on more than one separate occasion.");
  expect(text).toContain("Supporting evidence demonstrates that the vehicle was not continuously present");
  expect(text).toContain("The operator is requested to review the complete sequence of ANPR captures");
  expect(text).toContain("Independent evidence supplied with this appeal is inconsistent");

  expect(text).not.toMatch(/\bI (?:drove|paid|parked)\b/i);
});
