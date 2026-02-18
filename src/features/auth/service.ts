import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { RoleName } from "@/lib/roles";
import {
  clearLoginFailures,
  clientIpFromHeaders,
  loginRateStatus,
  recordLoginFailure,
} from "@/lib/rate-limit";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/features/auth/password";
import { loginSchema, type RegisterInput } from "@/features/auth/validation";

export type AuthenticatedUser = { id: string; name: string; email: string; role: RoleName };

/**
 * Verifies credentials. Returns null for any failure (unknown email and wrong password are indistinguishable),
 * and throws RATE_LIMITED once an (ip, account) pair or an ip has failed too often within the window.
 */
export async function authenticateCredentials(raw: unknown, headers: Headers): Promise<AuthenticatedUser | null> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;

  const ip = clientIpFromHeaders(headers);
  const rate = loginRateStatus(ip, email);
  if (!rate.allowed) {
    throw new AppError("RATE_LIMITED", `Too many attempts. Try again in ${Math.max(1, Math.ceil(rate.retryAfterSeconds / 60))} minute(s).`);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Always run a bcrypt comparison, against a dummy hash for unknown emails, so timing does not reveal accounts.
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    recordLoginFailure(ip, email);
    return null;
  }

  clearLoginFailures(ip, email);
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

/** Self-service sign-up. Always creates a patient: doctors and admins are provisioned by an administrator. */
export async function registerPatient(input: RegisterInput): Promise<{ id: string }> {
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash, role: "patient" },
      select: { id: true },
    });
    return user;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("CONFLICT", "An account with this email already exists.");
    }
    throw error;
  }
}
