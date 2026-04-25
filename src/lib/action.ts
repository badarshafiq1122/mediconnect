import { z } from "zod";
import { AppError } from "@/lib/errors";

export type FieldErrors = Record<string, string[] | undefined>;

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export function success(): ActionResult<undefined>;
export function success<T>(data: T): ActionResult<T>;
export function success<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function failure(error: string, fieldErrors?: FieldErrors): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors: FieldErrors };

/** Server-side Zod validation for every server action input (the client never gets to skip it). */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): ParseResult<z.output<S>> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const { fieldErrors, formErrors } = z.flattenError(parsed.error);
  return {
    ok: false,
    error: formErrors[0] ?? "Please correct the highlighted fields.",
    fieldErrors: fieldErrors as FieldErrors,
  };
}

/** Maps a thrown error to an ActionResult. Unexpected errors are logged and reported generically. */
export function toFailure(error: unknown): ActionResult<never> {
  if (error instanceof AppError) return failure(error.message);
  console.error("Unhandled server action error", error);
  return failure("Something went wrong. Please try again.");
}

export function formDataToObject(formData: FormData): Record<string, FormDataEntryValue> {
  const out: Record<string, FormDataEntryValue> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("$ACTION")) out[key] = value;
  }
  return out;
}
