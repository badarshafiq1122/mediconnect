import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";

/**
 * Translates a database uniqueness rejection into a typed error. The partial unique indexes are the only
 * arbiter of "is this slot free": callers never check-then-insert.
 */
export function mapBookingError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const rawTarget = error.meta?.target;
    const target = Array.isArray(rawTarget) ? rawTarget.join(",") : String(rawTarget ?? "");
    if (/doctor/.test(target)) {
      return new AppError("SLOT_TAKEN", "Sorry, that slot was just taken. Please choose another time.");
    }
    if (/patient/.test(target)) {
      return new AppError("PATIENT_CONFLICT", "You already have an appointment at that time.");
    }
    return new AppError("CONFLICT", "That slot is no longer available.");
  }
  return error;
}
