"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { formDataToObject, parseInput, type FieldErrors } from "@/lib/action";
import { isAppError } from "@/lib/errors";
import { clientIpFromHeaders, loginRateStatus, registerLimiter } from "@/lib/rate-limit";
import { registerPatient } from "@/features/auth/service";
import { safeRedirectPath } from "@/features/auth/redirect";
import { loginSchema, registerSchema } from "@/features/auth/validation";

export type AuthFormState = {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Echoed back so the form keeps what the user typed (React 19 resets uncontrolled forms after an action). */
  values?: { name?: string; email?: string };
};

function minutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

const text = (value: FormDataEntryValue | undefined): string => (typeof value === "string" ? value : "");

export async function loginAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = formDataToObject(formData);
  const values = { email: text(raw.email) };
  const parsed = parseInput(loginSchema, raw);
  if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors, values };

  const ip = clientIpFromHeaders(await headers());
  const rate = loginRateStatus(ip, parsed.data.email);
  if (!rate.allowed) {
    return { error: `Too many sign-in attempts. Try again in ${minutes(rate.retryAfterSeconds)} minute(s).`, values };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      // "/" routes each role to its own home (see app/page.tsx).
      redirectTo: safeRedirectPath(raw.callbackUrl) ?? "/",
    });
  } catch (error) {
    // signIn signals success by throwing a redirect, which must propagate; only auth failures are handled here.
    if (error instanceof AuthError) return { error: "Invalid email or password.", values };
    throw error;
  }
  return {};
}

export async function registerAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = formDataToObject(formData);
  const values = { name: text(raw.name), email: text(raw.email) };
  const parsed = parseInput(registerSchema, raw);
  if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors, values };

  const ip = clientIpFromHeaders(await headers());
  if (!registerLimiter.hit(ip).allowed) {
    return { error: "Too many sign-ups from this network. Please try again later.", values };
  }

  try {
    await registerPatient(parsed.data);
  } catch (error) {
    if (isAppError(error, "CONFLICT")) {
      return { fieldErrors: { email: ["An account with this email already exists"] }, values };
    }
    throw error;
  }

  try {
    await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Account created, but automatic sign-in failed. Please sign in.", values };
    }
    throw error;
  }
  return {};
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
