import { config as loadEnv } from "dotenv";

loadEnv({ quiet: true });

const FALLBACK_URL = "postgresql://dev@localhost:5432/mediconnect_test?schema=public";

/** Resolves the integration-test database URL and refuses to return anything that is not a *_test database. */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? FALLBACK_URL;
  const databaseName = new URL(url).pathname.replace(/^\//, "");
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to run integration tests against "${databaseName}": database name must end with "_test" ` +
        "because these tests TRUNCATE every table.",
    );
  }
  return url;
}
