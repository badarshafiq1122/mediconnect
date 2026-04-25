import { z } from "zod";
import { emailSchema, nameSchema, passwordSchema } from "@/features/auth/validation";
import { findOverlappingWindows } from "@/features/appointments/slots";
import { sanitizeMessageBody } from "@/lib/sanitize";

const id = z.string().trim().min(1, "Missing identifier").max(64, "Invalid identifier");
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// --- Discovery filters (from the URL) ------------------------------------------------------------
// Every field falls back to "no filter" instead of erroring, so a hand-edited or stale URL never breaks the page.

const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

export const doctorFiltersSchema = z.object({
  q: z.preprocess(blankToUndefined, z.string().trim().max(80).optional()).catch(undefined),
  specialty: z.preprocess(blankToUndefined, z.string().trim().max(80).optional()).catch(undefined),
  day: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(6).optional()).catch(undefined),
  minRating: z.preprocess(blankToUndefined, z.coerce.number().min(0).max(5).optional()).catch(undefined),
  cursor: z.preprocess(blankToUndefined, z.string().max(64).optional()).catch(undefined),
});

export type DoctorFilters = z.output<typeof doctorFiltersSchema>;

/** searchParams values may be string | string[]; take the first. */
export function parseDoctorFilters(raw: Record<string, string | string[] | undefined>): DoctorFilters {
  const flat = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  return doctorFiltersSchema.parse(flat);
}

// --- Admin / doctor mutations ----------------------------------------------------------------------

const specialtySchema = z.string().trim().min(2, "Enter a specialty").max(80, "Specialty is too long");
const bioSchema = z
  .string()
  .max(1500, "Bio is limited to 1500 characters")
  .transform((value) => sanitizeMessageBody(value))
  .default("");

export const createDoctorSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  specialty: specialtySchema,
  bio: bioSchema,
});

export const updateDoctorSchema = z.object({
  doctorId: id,
  specialty: specialtySchema,
  bio: bioSchema,
});

export const setDoctorActiveSchema = z.object({
  doctorId: id,
  isActive: z.boolean(),
});

export const availabilityWindowSchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0, "Choose a weekday").max(6, "Choose a weekday"),
    startTime: z.string().regex(HHMM, "Use the HH:mm format"),
    endTime: z.string().regex(HHMM, "Use the HH:mm format"),
  })
  .refine((window) => window.startTime < window.endTime, {
    message: "End time must be after the start time",
    path: ["endTime"],
  });

export const replaceAvailabilitySchema = z
  .object({
    /** Omitted when a doctor edits their own schedule; admins pass the target doctor. */
    doctorId: id.optional(),
    windows: z.array(availabilityWindowSchema).max(50, "Too many availability windows"),
  })
  .superRefine((value, context) => {
    if (findOverlappingWindows(value.windows)) {
      context.addIssue({
        code: "custom",
        message: "Availability windows on the same day cannot overlap",
        path: ["windows"],
      });
    }
  });

export type AvailabilityInput = z.output<typeof replaceAvailabilitySchema>["windows"];
