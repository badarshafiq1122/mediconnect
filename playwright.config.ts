import { defineConfig, devices } from "@playwright/test";

// e2e runs on its own port and its own database (mediconnect_e2e) so it can never touch dev data or another project.
const PORT = 3101;
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://dev@localhost:5432/mediconnect_e2e?schema=public";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Reset + seed the e2e DB, build, then serve the production bundle.
    command: `npx tsx tests/e2e/prepare-db.ts && npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      E2E_DATABASE_URL,
      AUTH_URL: `http://localhost:${PORT}`,
      AUTH_TRUST_HOST: "true",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-secret-not-for-production-use-0123456789",
      CLINIC_TIMEZONE: "UTC",
      BOOKING_LEAD_MINUTES: "15",
      // Wide window so any slot the booking flow picks can be checked in immediately.
      CHECKIN_OPENS_MINUTES: "1440",
      NODE_ENV: "production",
    },
  },
});
