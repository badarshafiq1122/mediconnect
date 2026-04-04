import { expect, test } from "@playwright/test";
import { login, signedInPage, waitForLive } from "./helpers";

// Push-vs-poll proof: the polling fallback fires every 30s, and only while the SSE stream is down. Every
// cross-user update below is asserted within 10s while both tabs show "Live", so it can only have arrived by SSE.
const PUSH_TIMEOUT = 10_000;

test("patient books, doctor sees it, and status changes are pushed live over SSE", async ({ page, browser }) => {
  const stamp = Date.now();
  const patientName = `Flow Patient ${stamp}`;
  const email = `flow.${stamp}@e2e.test`;

  // --- Patient registers through the UI and lands on their dashboard --------------------------------------
  await page.goto("/register");
  await page.getByLabel("Full name").fill(patientName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Sturdy-pass-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/patient\/dashboard/);
  await expect(page.getByRole("main").getByText("No upcoming appointments")).toBeVisible();

  // --- Doctor discovery: filter by specialty, open the doctor, pick the first open slot --------------------
  await page.getByRole("link", { name: "Find a doctor" }).first().click();
  await page.getByLabel("Specialty").selectOption("E2E Medicine");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("main").getByTestId("doctor-card")).toHaveCount(1);
  await page.getByRole("link", { name: "Dr. Eve Endtoend" }).click();

  await page.getByRole("main").getByTestId("slot-available").first().click();
  await page.getByLabel("Reason for visit (optional)").fill("Persistent cough");
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await expect(page).toHaveURL(/\/patient\/appointments\//);
  const banner = page.getByRole("main").getByTestId("queue-banner");
  await expect(banner).toHaveAttribute("data-status", "booked");
  await waitForLive(page);

  // --- Doctor, in a second browser, already has their dashboard open --------------------------------------
  const { context: doctorContext, page: doctorPage } = await signedInPage(browser, "doctor@e2e.test");
  await doctorPage.goto("/doctor/dashboard");
  await expect(doctorPage.getByRole("main").getByTestId("waiting-count")).toHaveText("0");
  await waitForLive(doctorPage);

  // The booking is visible on the doctor's schedule.
  await doctorPage.goto("/doctor/schedule");
  // Scoped to <main>: while a streamed page swaps in, a hidden copy of the content briefly exists outside it.
  await expect(doctorPage.getByRole("main").getByText(patientName)).toBeVisible();
  await doctorPage.goto("/doctor/dashboard");
  await expect(doctorPage.getByRole("main").getByTestId("waiting-count")).toHaveText("0");
  await waitForLive(doctorPage);

  // --- Patient checks in: the doctor's waiting room updates WITHOUT a reload --------------------------------
  await page.getByRole("button", { name: "Check in" }).first().click();
  await expect(banner).toHaveAttribute("data-status", "in_queue");
  await expect(page.getByRole("main").getByTestId("queue-position")).toHaveText("1");
  await expect(doctorPage.getByRole("main").getByTestId("waiting-list")).toContainText(patientName, { timeout: PUSH_TIMEOUT });
  await expect(doctorPage.getByRole("main").getByTestId("waiting-count")).toHaveText("1");

  // --- Doctor starts the consultation: the patient's page flips live, no reload -----------------------------
  await doctorPage.getByRole("button", { name: "Start consultation" }).click();
  await expect(banner).toHaveAttribute("data-status", "in_progress", { timeout: PUSH_TIMEOUT });
  await expect(banner).toContainText("under way");
  await expect(doctorPage.getByRole("main").getByTestId("waiting-count")).toHaveText("0");

  // --- Live messaging both ways, with a read receipt ---------------------------------------------------------
  await doctorPage.getByRole("link", { name: "Open consultation" }).click();
  await expect(doctorPage.getByRole("heading", { name: patientName, level: 1 })).toBeVisible();
  await waitForLive(doctorPage);

  await page.getByLabel("Write a message").fill("Hello doctor, my cough is worse at night.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(doctorPage.getByRole("main").getByTestId("message-theirs")).toContainText("cough is worse at night", { timeout: PUSH_TIMEOUT });

  await doctorPage.getByLabel("Write a message").fill("Thanks, noted. Any fever?");
  await doctorPage.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("main").getByTestId("message-theirs")).toContainText("Any fever?", { timeout: PUSH_TIMEOUT });
  // The patient's message was read by the doctor, so the patient's UI shows "Seen".
  await expect(page.getByRole("main").getByTestId("message-log")).toContainText("Seen", { timeout: PUSH_TIMEOUT });

  // --- Doctor writes private notes and completes: the patient's page flips live again -------------------------
  await doctorPage.getByLabel("Consultation notes").fill("Likely post-viral cough. Advised fluids and rest.");
  await doctorPage.getByRole("button", { name: "Complete consultation" }).click();
  await expect(doctorPage.getByRole("main").getByTestId("queue-banner")).toHaveAttribute("data-status", "completed");
  await expect(banner).toHaveAttribute("data-status", "completed", { timeout: PUSH_TIMEOUT });

  // Clinical notes never reach the patient.
  await expect(page.getByText("post-viral")).toHaveCount(0);

  // --- Patient rates the visit; the doctor's rating becomes derived data ---------------------------------------
  await page.getByRole("radio", { name: "5 stars" }).click();
  await page.getByRole("button", { name: "Submit rating" }).click();
  await expect(page.getByText("Your rating")).toBeVisible();

  // --- The patient got their notifications ------------------------------------------------------------------------
  await page.getByRole("button", { name: /Notifications/ }).click();
  await expect(page.getByText("Appointment confirmed")).toBeVisible();

  // Sanity: the same patient can sign back in later and the history is there.
  await page.goto("/patient/dashboard");
  await expect(page.getByRole("heading", { name: "Past appointments" })).toBeVisible();
  await expect(page.getByRole("main").getByText("E2E Medicine").first()).toBeVisible();

  await doctorContext.close();
});

test("a patient can cancel, freeing the slot for someone else", async ({ page, browser }) => {
  await login(page, "patient1@e2e.test");
  await page.goto("/patient/doctors");
  await page.getByLabel("Specialty").selectOption("E2E Medicine");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: "Dr. Eve Endtoend" }).click();

  const firstSlot = page.getByRole("main").getByTestId("slot-available").first();
  const label = await firstSlot.getAttribute("aria-label");
  await firstSlot.click();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page).toHaveURL(/\/patient\/appointments\//);

  await page.getByRole("button", { name: "Cancel" }).first().click();
  await page.getByRole("button", { name: "Cancel appointment" }).click();
  await expect(page.getByRole("main").getByTestId("queue-banner")).toHaveAttribute("data-status", "cancelled");
  await expect(page.getByText("Messaging is closed")).toBeVisible();

  // Another patient sees that very slot as bookable again.
  const other = await signedInPage(browser, "patient2@e2e.test");
  await other.page.goto("/patient/doctors");
  await other.page.getByLabel("Specialty").selectOption("E2E Medicine");
  await other.page.getByRole("button", { name: "Search" }).click();
  await other.page.getByRole("link", { name: "Dr. Eve Endtoend" }).click();
  await expect(other.page.getByRole("button", { name: label! })).toBeEnabled();
  await other.context.close();
});
