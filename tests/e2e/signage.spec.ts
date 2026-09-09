import { test, expect } from "@playwright/test";
import {
  seedScenario,
  submitConfirm,
  continueFromQuestions,
  continueFromEvidence,
  continueFromReview,
} from "./helpers";

test("Signage: pack paragraphs and {{alleged_term}} substitution", async ({ page }) => {
  await seedScenario(page, "signage");
  await submitConfirm(page);
  await continueFromQuestions(page);
  await continueFromEvidence(page);

  await expect(page.getByText(/Signage/i).first()).toBeVisible();

  await continueFromReview(page);

  const article = page.locator("article");
  const text = await article.innerText();

  expect(text).toContain("The adequacy of the signage at the location is disputed.");
  expect(text).toContain("The parking terms were not adequately communicated on entry to the controlled land.");
  expect(text).toContain("The operator is requested to provide contemporaneous evidence showing the entrance signage");
  // {{alleged_term}} must be filled with the operator's alleged term.
  expect(text).toContain("Unauthorised parking after 6pm");
  expect(text).not.toContain("{{");
});
