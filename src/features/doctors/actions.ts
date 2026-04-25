"use server";

import { revalidatePath } from "next/cache";
import { failure, formDataToObject, parseInput, success, toFailure, type ActionResult, type FieldErrors } from "@/lib/action";
import { requireActor } from "@/lib/session";
import { createDoctorAccount, replaceAvailability, setDoctorActive, updateDoctorProfile } from "@/features/doctors/service";
import {
  createDoctorSchema,
  replaceAvailabilitySchema,
  setDoctorActiveSchema,
  updateDoctorSchema,
} from "@/features/doctors/validation";

function refreshDoctorViews(): void {
  revalidatePath("/admin", "layout");
  revalidatePath("/patient", "layout");
  revalidatePath("/doctor", "layout");
}

export type CreateDoctorFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: FieldErrors;
  values?: Record<string, string>;
};

/** useActionState-compatible wrapper for the admin "add doctor" form. */
export async function createDoctorFormAction(
  _previous: CreateDoctorFormState,
  formData: FormData,
): Promise<CreateDoctorFormState> {
  const raw = formDataToObject(formData);
  const values = Object.fromEntries(
    Object.entries(raw)
      .filter(([key, value]) => key !== "password" && typeof value === "string")
      .map(([key, value]) => [key, String(value)]),
  );
  try {
    const actor = await requireActor("admin");
    const parsed = parseInput(createDoctorSchema, raw);
    if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors, values };
    await createDoctorAccount(actor, parsed.data);
    refreshDoctorViews();
    return { ok: true };
  } catch (error) {
    const result = toFailure(error);
    return { error: result.ok ? undefined : result.error, values };
  }
}

export async function updateDoctorAction(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireActor("admin");
    const parsed = parseInput(updateDoctorSchema, input);
    if (!parsed.ok) return failure(parsed.error, parsed.fieldErrors);
    await updateDoctorProfile(actor, parsed.data);
    refreshDoctorViews();
    return success();
  } catch (error) {
    return toFailure(error);
  }
}

export async function setDoctorActiveAction(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireActor("admin");
    const parsed = parseInput(setDoctorActiveSchema, input);
    if (!parsed.ok) return failure(parsed.error, parsed.fieldErrors);
    await setDoctorActive(actor, parsed.data);
    refreshDoctorViews();
    return success();
  } catch (error) {
    return toFailure(error);
  }
}

export async function replaceAvailabilityAction(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireActor("doctor", "admin");
    const parsed = parseInput(replaceAvailabilitySchema, input);
    if (!parsed.ok) return failure(parsed.error, parsed.fieldErrors);
    await replaceAvailability(actor, parsed.data);
    refreshDoctorViews();
    return success();
  } catch (error) {
    return toFailure(error);
  }
}
