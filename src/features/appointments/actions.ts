"use server";

import { revalidatePath } from "next/cache";
import type { AppointmentStatus } from "@prisma/client";
import { failure, parseInput, success, toFailure, type ActionResult } from "@/lib/action";
import type { RoleName } from "@/lib/roles";
import { requireActor } from "@/lib/session";
import {
  bookAppointment,
  rateAppointment,
  saveConsultationNotes,
  transitionAppointment,
} from "@/features/appointments/service";
import type { AppointmentEvent } from "@/features/appointments/status";
import {
  appointmentIdSchema,
  bookAppointmentSchema,
  cancelAppointmentSchema,
  completeAppointmentSchema,
  rateAppointmentSchema,
  saveNotesSchema,
} from "@/features/appointments/validation";

// Thin layer: resolve the session, validate input with Zod, delegate to service.ts, refresh affected pages.
// Business rules live in the service so they are testable without a request context.

function refreshViews(): void {
  revalidatePath("/patient", "layout");
  revalidatePath("/doctor", "layout");
}

export async function bookAppointmentAction(input: unknown): Promise<ActionResult<{ appointmentId: string }>> {
  try {
    const actor = await requireActor("patient");
    const parsed = parseInput(bookAppointmentSchema, input);
    if (!parsed.ok) return failure(parsed.error, parsed.fieldErrors);
    const { id } = await bookAppointment(actor, parsed.data);
    refreshViews();
    return success({ appointmentId: id });
  } catch (error) {
    return toFailure(error);
  }
}

async function runTransition(
  event: AppointmentEvent,
  roles: RoleName[],
  input: unknown,
  schema: typeof appointmentIdSchema | typeof cancelAppointmentSchema | typeof completeAppointmentSchema,
): Promise<ActionResult<{ status: AppointmentStatus }>> {
  try {
    const actor = await requireActor(...roles);
    const parsed = parseInput(schema, input);
    if (!parsed.ok) return failure(parsed.error, parsed.fieldErrors);
    const data = parsed.data as { appointmentId: string; reason?: string; notes?: string };
    const { status } = await transitionAppointment(actor, {
      appointmentId: data.appointmentId,
      event,
      reason: data.reason,
      notes: data.notes,
    });
    refreshViews();
    return success({ status });
  } catch (error) {
    return toFailure(error);
  }
}

export async function checkInAction(input: unknown) {
  return runTransition("check_in", ["patient"], input, appointmentIdSchema);
}

export async function startConsultationAction(input: unknown) {
  return runTransition("start", ["doctor"], input, appointmentIdSchema);
}

export async function completeConsultationAction(input: unknown) {
  return runTransition("complete", ["doctor"], input, completeAppointmentSchema);
}

export async function cancelAppointmentAction(input: unknown) {
  return runTransition("cancel", ["patient", "doctor"], input, cancelAppointmentSchema);
}

export async function saveNotesAction(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireActor("doctor");
    const parsed = parseInput(saveNotesSchema, input);
    if (!parsed.ok) return failure(parsed.error, parsed.fieldErrors);
    await saveConsultationNotes(actor, parsed.data);
    revalidatePath("/doctor", "layout");
    return success();
  } catch (error) {
    return toFailure(error);
  }
}

export async function rateAppointmentAction(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireActor("patient");
    const parsed = parseInput(rateAppointmentSchema, input);
    if (!parsed.ok) return failure(parsed.error, parsed.fieldErrors);
    await rateAppointment(actor, parsed.data);
    refreshViews();
    return success();
  } catch (error) {
    return toFailure(error);
  }
}
