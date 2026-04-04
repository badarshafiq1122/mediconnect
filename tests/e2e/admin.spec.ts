import { expect, test } from "@playwright/test";
import { login, signedInPage } from "./helpers";

test("admin overview shows real volume data with an accessible tooltip and table view", async ({ page }) => {
  await login(page, "admin@e2e.test");
  await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();
  await expect(page.getByTestId("stat-doctors")).toHaveText("2");
  await expect(page.getByTestId("stat-patients")).toHaveText("2");

  const columns = page.getByTestId("volume-column");
  await expect(columns).toHaveCount(14);

  // Hover a day that has appointments: a tooltip lists every series and the total.
  await columns.nth(13).hover();
  await columns.nth(12).hover();
  await expect(page.getByTestId("volume-tooltip")).toBeVisible();
  await expect(page.getByTestId("volume-tooltip")).toContainText("Kept");
  await expect(page.getByTestId("volume-tooltip")).toContainText("Cancelled");

  // The same numbers are reachable without hovering.
  await page.getByRole("button", { name: "View as table" }).click();
  await expect(page.getByRole("table")).toContainText("Total");
  await expect(page.getByRole("row")).toHaveCount(15);
});

test("admin adds a doctor who then appears in patient search, and can be hidden from booking", async ({ page, browser }) => {
  const stamp = Date.now();
  const name = `Dr. Nova ${stamp}`;
  const specialty = `Nova Medicine ${stamp}`;

  await login(page, "admin@e2e.test");
  await page.goto("/admin/doctors");
  await page.getByRole("button", { name: "Add doctor" }).click();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Specialty").fill(specialty);
  await page.getByLabel("Email").fill(`nova.${stamp}@e2e.test`);
  await page.getByLabel("Temporary password").fill("Temp-pass-123");
  await page.getByRole("button", { name: "Create doctor" }).click();
  const card = page.getByTestId("admin-doctor").filter({ hasText: name });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Available Mon, Tue, Wed, Thu, Fri");

  // The new doctor can sign in and is discoverable by patients.
  const patient = await signedInPage(browser, "patient1@e2e.test");
  await patient.page.goto(`/patient/doctors?q=${encodeURIComponent(name)}`);
  await expect(patient.page.getByTestId("doctor-card")).toHaveCount(1);

  // Deactivate: hidden from discovery, existing data untouched.
  await card.getByRole("button", { name: "Deactivate" }).click();
  await expect(card).toHaveAttribute("data-active", "false");
  await patient.page.reload();
  await expect(patient.page.getByTestId("doctor-card")).toHaveCount(0);
  await expect(patient.page.getByRole("main").getByText("No doctors match those filters")).toBeVisible();
  await patient.context.close();

  const newDoctor = await signedInPage(browser, `nova.${stamp}@e2e.test`, "Temp-pass-123");
  await expect(newDoctor.page).toHaveURL(/\/doctor\/dashboard/);
  await newDoctor.context.close();
});

test("a doctor edits their own weekly availability", async ({ page }) => {
  await login(page, "historian@e2e.test");
  await page.goto("/doctor/schedule");
  await expect(page.getByRole("heading", { name: "Weekly availability" })).toBeVisible();

  // Overlapping windows are rejected with the shared Zod schema's message before anything is sent.
  await page.getByRole("button", { name: "Add hours" }).first().click();
  await page.getByRole("button", { name: "Save availability" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "cannot overlap" })).toBeVisible();
});
