import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { login, signedInPage } from "./helpers";

const E2E_URL = process.env.E2E_DATABASE_URL ?? "postgresql://dev@localhost:5432/mediconnect_e2e?schema=public";

test.describe("unauthenticated visitors", () => {
  test("are redirected to sign in and returned to where they were going", async ({ page }) => {
    await page.goto("/patient/dashboard");
    await expect(page).toHaveURL(/\/login\?callbackUrl=/);
    await page.getByLabel("Email").fill("patient1@e2e.test");
    await page.getByLabel("Password").fill("Password123!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/patient\/dashboard/);
  });

  test("get 401 JSON, not a redirect, from the API and the SSE stream", async ({ request }) => {
    for (const path of ["/api/queue", "/api/notifications", "/api/sse/queue", "/api/appointments/x", "/api/appointments/x/messages"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(401);
    }
  });
});

test("responses carry baseline security headers and do not advertise the framework", async ({ request }) => {
  const response = await request.get("/login");
  const headers = response.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test.describe("role boundaries", () => {
  test("a patient cannot open doctor or admin areas", async ({ page }) => {
    await login(page, "patient1@e2e.test");
    await page.goto("/doctor/dashboard");
    await expect(page).toHaveURL(/\/patient\/dashboard/);
    await page.goto("/admin/overview");
    await expect(page).toHaveURL(/\/patient\/dashboard/);
  });

  test("a doctor cannot open patient or admin areas", async ({ page }) => {
    await login(page, "doctor@e2e.test");
    await page.goto("/patient/doctors");
    await expect(page).toHaveURL(/\/doctor\/dashboard/);
    await page.goto("/admin/doctors");
    await expect(page).toHaveURL(/\/doctor\/dashboard/);
  });

  test("signed-in users are bounced away from the login page to their own home", async ({ page }) => {
    await login(page, "admin@e2e.test");
    await page.goto("/login");
    await expect(page).toHaveURL(/\/admin\/overview/);
  });
});

test.describe("appointment privacy", () => {
  test("another patient gets a 404 for someone else's appointment, its messages and its page", async ({ browser }) => {
    const prisma = new PrismaClient({ datasourceUrl: E2E_URL });
    const [owner, intruder, doctor] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: "patient1@e2e.test" } }),
      prisma.user.findUniqueOrThrow({ where: { email: "patient2@e2e.test" } }),
      prisma.doctorProfile.findFirstOrThrow({ where: { user: { email: "doctor@e2e.test" } } }),
    ]);
    const slotStart = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
    slotStart.setUTCHours(12, 0, 0, 0);
    const appointment = await prisma.appointment.create({
      data: { patientId: owner.id, doctorId: doctor.id, slotStart, slotEnd: new Date(slotStart.getTime() + 30 * 60_000), reason: "Private matter" },
    });
    await prisma.message.create({ data: { appointmentId: appointment.id, senderId: owner.id, body: "confidential symptoms" } });
    await prisma.$disconnect();

    const { context, page } = await signedInPage(browser, "patient2@e2e.test");
    expect(intruder.email).toBe("patient2@e2e.test");

    const detail = await context.request.get(`/api/appointments/${appointment.id}`);
    expect(detail.status()).toBe(404);
    const messages = await context.request.get(`/api/appointments/${appointment.id}/messages`);
    expect(messages.status()).toBe(404);
    expect(await messages.text()).not.toContain("confidential");

    // The page streams behind a loading state, so the HTTP status is already 200; assert on what the user sees.
    await page.goto(`/patient/appointments/${appointment.id}`);
    await expect(page.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
    await expect(page.getByText("Private matter")).toHaveCount(0);

    // The owner, in contrast, can read all of it.
    const owned = await signedInPage(browser, "patient1@e2e.test");
    const ok = await owned.context.request.get(`/api/appointments/${appointment.id}/messages`);
    expect(ok.status()).toBe(200);
    expect(await ok.text()).toContain("confidential symptoms");

    await context.close();
    await owned.context.close();
  });
});

test.describe("sign-in protection", () => {
  test("shows a generic error for bad credentials and locks the account after repeated failures", async ({ page }) => {
    const email = `lockout.${Date.now()}@e2e.test`;
    await page.goto("/login");
    const submitWrongPassword = async () => {
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill("wrong-password-1");
      await page.getByRole("button", { name: "Sign in" }).click();
      // React 19 resets the form when the action settles: wait for that before the next attempt.
      await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
      await expect(page.getByLabel("Password")).toHaveValue("");
    };

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await submitWrongPassword();
      await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password" })).toBeVisible();
      // The address is kept so the user only retypes the password.
      await expect(page.getByLabel("Email")).toHaveValue(email);
    }
    await submitWrongPassword();
    await expect(page.getByRole("alert").filter({ hasText: "Too many sign-in attempts" })).toBeVisible();
  });
});
