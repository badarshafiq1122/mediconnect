import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const PASSWORD = "Password123!";

export async function login(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(patient|doctor|admin)\//);
  await expect(page.locator("main h1").first()).toBeVisible();
}

/** A separate browser context = a separate signed-in user, like a second person on a second device. */
export async function signedInPage(
  browser: Browser,
  email: string,
  password = PASSWORD,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email, password);
  return { context, page };
}

/**
 * Waits until this tab's EventSource is open. Actions performed by *another* user after this point can only reach
 * the page through the SSE push (the 30s polling fallback is only enabled while this indicator says "reconnecting").
 */
export async function waitForLive(page: Page): Promise<void> {
  await expect(page.locator('[data-live="connected"]').first()).toBeVisible({ timeout: 20_000 });
}
