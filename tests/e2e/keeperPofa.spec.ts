import { test, expect } from "@playwright/test";
import {
  seedScenario,
  submitConfirm,
  continueFromQuestions,
  continueFromEvidence,
  continueFromReview,
} from "./helpers";

test("Example C — Keeper + Confirmed Late Postal NTK: PoFA paragraphs present, no driver identifying wording", async ({
  page,
}) => {
  await seedScenario(page, "keeper_late_ntk");
  await submitConfirm(page);
  await continueFromQuestions(page);
  await continueFromEvidence(page);

  await expect(page.getByText(/Keeper protection \(PoFA\)/i)).toBeVisible();

  await continueFromReview(page);

  const article = page.locator("article");
  const text = await article.innerText();

  // Pack Example C → PP-INTRO-001, PP-INTRO-002, PP-POFA-001, 003, 006, 007.
  expect(text).toContain("I write as the registered keeper of vehicle");
  expect(text).toContain("This appeal is submitted by the registered keeper.");
  expect(text).toContain("Where the operator seeks to recover the parking charge from the registered keeper");
  expect(text).toContain("The Notice to Keeper was not delivered within the relevant statutory period");
  expect(text).toContain("The operator has not established the identity of the driver.");
  expect(text).toContain("For the reasons set out above, the operator has failed to establish keeper liability");

  expect(text).not.toMatch(/\b(?:i drove|i paid|driver'?s name|who was driving)\b/i);
});
