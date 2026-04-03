import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/features/auth/password";
import { authenticateCredentials, registerPatient } from "@/features/auth/service";
import { resetDatabase } from "./helpers/factories";

const PASSWORD = "Correct-horse-7";
let passwordHash: string;

// bcrypt at cost 12 is deliberately slow: hash once and reuse it for every fixture user.
beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});
beforeEach(resetDatabase);

let ipCounter = 0;
/** A fresh client IP per test so the process-wide login throttle never leaks between tests. */
const freshIp = () => new Headers({ "x-forwarded-for": `10.9.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}` });

async function seedUser(email = "ada@example.com", role: "patient" | "doctor" | "admin" = "patient") {
  return prisma.user.create({ data: { name: "Ada", email, passwordHash, role } });
}

describe("authenticateCredentials", () => {
  it("returns the user, including their role, for correct credentials", async () => {
    const user = await seedUser("doc@example.com", "doctor");
    await expect(authenticateCredentials({ email: "doc@example.com", password: PASSWORD }, freshIp())).resolves.toEqual({
      id: user.id,
      name: "Ada",
      email: "doc@example.com",
      role: "doctor",
    });
  });

  it("matches the email case-insensitively", async () => {
    await seedUser("ada@example.com");
    const result = await authenticateCredentials({ email: "  ADA@Example.com ", password: PASSWORD }, freshIp());
    expect(result?.email).toBe("ada@example.com");
  });

  it("returns null for a wrong password and for an unknown email alike", async () => {
    await seedUser();
    const headers = freshIp();
    expect(await authenticateCredentials({ email: "ada@example.com", password: "wrong-password1" }, headers)).toBeNull();
    expect(await authenticateCredentials({ email: "nobody@example.com", password: PASSWORD }, headers)).toBeNull();
  });

  it("returns null for malformed input instead of throwing", async () => {
    expect(await authenticateCredentials({}, freshIp())).toBeNull();
    expect(await authenticateCredentials({ email: "not-an-email", password: "x" }, freshIp())).toBeNull();
    expect(await authenticateCredentials(undefined, freshIp())).toBeNull();
  });

  it("locks an account/IP pair after 5 failures, even for the correct password", async () => {
    await seedUser();
    const headers = freshIp();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await authenticateCredentials({ email: "ada@example.com", password: "wrong-password1" }, headers)).toBeNull();
    }
    await expect(
      authenticateCredentials({ email: "ada@example.com", password: PASSWORD }, headers),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("does not let one client's failures lock the same account for a different client", async () => {
    await seedUser();
    const attacker = freshIp();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await authenticateCredentials({ email: "ada@example.com", password: "wrong-password1" }, attacker);
    }
    const legitimate = await authenticateCredentials({ email: "ada@example.com", password: PASSWORD }, freshIp());
    expect(legitimate?.email).toBe("ada@example.com");
  });

  it("clears the failure count after a successful login", async () => {
    await seedUser();
    const headers = freshIp();
    for (let round = 0; round < 3; round += 1) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await authenticateCredentials({ email: "ada@example.com", password: "wrong-password1" }, headers);
      }
      expect(await authenticateCredentials({ email: "ada@example.com", password: PASSWORD }, headers)).not.toBeNull();
    }
  });

  it("throttles password spraying across many accounts from one IP", async () => {
    const headers = freshIp();
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await authenticateCredentials({ email: `victim${attempt}@example.com`, password: "guess-password1" }, headers);
    }
    await expect(
      authenticateCredentials({ email: "another@example.com", password: "guess-password1" }, headers),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("registerPatient", () => {
  it("creates a patient whose password is stored as a cost-12 bcrypt hash, never in plaintext", async () => {
    const { id } = await registerPatient({ name: "New Patient", email: "new@example.com", password: "Sturdy-pass-1" });
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user.role).toBe("patient");
    expect(user.passwordHash).not.toContain("Sturdy-pass-1");
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("rejects a duplicate email with CONFLICT", async () => {
    await registerPatient({ name: "One", email: "dup@example.com", password: "Sturdy-pass-1" });
    await expect(
      registerPatient({ name: "Two", email: "dup@example.com", password: "Sturdy-pass-2" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.user.count()).toBe(1);
  });

  it("lets a freshly registered patient log in", async () => {
    await registerPatient({ name: "New", email: "login@example.com", password: "Sturdy-pass-1" });
    const result = await authenticateCredentials({ email: "login@example.com", password: "Sturdy-pass-1" }, freshIp());
    expect(result?.role).toBe("patient");
  });
});
