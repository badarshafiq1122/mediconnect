import { z } from "zod";
import { sanitizeMessageBody } from "@/lib/sanitize";

const id = z.string().trim().min(1, "Missing identifier").max(64, "Invalid identifier");

/** Free text typed by a user: tags stripped, trimmed, empty collapses to undefined. */
const optionalText = (max: number) =>
  z
    .string()
    .max(max, `Use at most ${max} characters`)
    .optional()
    .transform((value) => {
      const cleaned = value === undefined ? "" : sanitizeMessageBody(value);
      return cleaned.length > 0 ? cleaned : undefined;
    });

export const bookAppointmentSchema = z.object({
  doctorId: id,
  slotStart: z.iso.datetime({ message: "Choose a valid time slot" }).transform((value) => new Date(value)),
  reason: optionalText(500),
});

export const appointmentIdSchema = z.object({ appointmentId: id });

export const cancelAppointmentSchema = appointmentIdSchema.extend({ reason: optionalText(300) });

export const completeAppointmentSchema = appointmentIdSchema.extend({ notes: optionalText(5000) });

export const saveNotesSchema = appointmentIdSchema.extend({
  notes: z
    .string()
    .max(5000, "Notes are limited to 5000 characters")
    .transform((value) => sanitizeMessageBody(value)),
});

export const rateAppointmentSchema = appointmentIdSchema.extend({
  rating: z.coerce.number().int("Choose a whole-number rating").min(1, "Rating is 1 to 5").max(5, "Rating is 1 to 5"),
});

export type BookAppointmentInput = z.output<typeof bookAppointmentSchema>;
