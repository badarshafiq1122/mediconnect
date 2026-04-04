import { expect, test, type Page } from "@playwright/test";
import { signedInPage } from "./helpers";

async function openDoctorPage(page: Page) {
  await page.goto("/patient/doctors");
  await page.getByLabel("Specialty").selectOption("Historical Medicine");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: "Dr. Hugo Historian" }).click();
  await expect(page.getByRole("main").getByTestId("slot-grid")).toBeVisible();
}

test("two patients race for the same slot: exactly one wins, the other is told and sees fresh availability", async ({ browser }) => {
  const a = await signedInPage(browser, "patient1@e2e.test");
  const b = await signedInPage(browser, "patient2@e2e.test");

  // Both load the page while the slot is still free, and both select the same time.
  await openDoctorPage(a.page);
  await openDoctorPage(b.page);
  const slot = a.page.getByRole("main").getByTestId("slot-available").first();
  const label = (await slot.getAttribute("aria-label"))!;
  await slot.click();
  await b.page.getByRole("button", { name: label }).click();

  // A confirms first and wins.
  await a.page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(a.page).toHaveURL(/\/patient\/appointments\//);

  // B's page is now stale. Confirming is rejected by the database constraint, not by any client-side check.
  await b.page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(b.page.getByRole("alert").filter({ hasText: "just taken" })).toBeVisible();
  await expect(b.page).not.toHaveURL(/\/patient\/appointments\//);

  // The picker refreshed itself: the lost slot is now shown as unavailable.
  const lostTime = label.replace("Book ", "");
  await expect(b.page.getByRole("button", { name: `${lostTime}, unavailable` })).toBeDisabled();

  await a.context.close();
  await b.context.close();
});
