import { execSync } from "node:child_process";
import { testDatabaseUrl } from "./test-database";

// Applies every migration (including the hand-written partial unique indexes) to the test database once per run.
export default function setup(): void {
  const url = testDatabaseUrl();
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
