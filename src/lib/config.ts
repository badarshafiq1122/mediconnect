import { z } from "zod";

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const envSchema = z.object({
  CLINIC_TIMEZONE: z
    .string()
    .refine(isValidTimeZone, "CLINIC_TIMEZONE must be a valid IANA timezone")
    .default("UTC"),
  SLOT_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  BOOKING_LEAD_MINUTES: z.coerce.number().int().min(0).max(24 * 60).default(15),
  CHECKIN_OPENS_MINUTES: z.coerce.number().int().min(0).max(24 * 60).default(60),
  REMINDER_LEAD_MINUTES: z.coerce.number().int().min(1).max(24 * 60).default(30),
  REMINDER_SCAN_INTERVAL_SECONDS: z.coerce.number().int().min(5).default(60),
});

const env = envSchema.parse(process.env);

/** Server-only policy configuration. Client components receive the values they need as props. */
export const config = {
  clinicTimezone: env.CLINIC_TIMEZONE,
  slotMinutes: env.SLOT_MINUTES,
  bookingLeadMinutes: env.BOOKING_LEAD_MINUTES,
  checkinOpensMinutes: env.CHECKIN_OPENS_MINUTES,
  reminderLeadMinutes: env.REMINDER_LEAD_MINUTES,
  reminderScanIntervalSeconds: env.REMINDER_SCAN_INTERVAL_SECONDS,
} as const;
