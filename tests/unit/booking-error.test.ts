import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { mapBookingError } from "@/features/appointments/errors";
import { AppError } from "@/lib/errors";

const uniqueViolation = (target: unknown) =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { modelName: "Appointment", target },
  });

describe("mapBookingError", () => {
  it("maps a doctor+slot uniqueness violation to SLOT_TAKEN", () => {
    const mapped = mapBookingError(uniqueViolation(["doctor_id", "slot_start"]));
    expect(mapped).toBeInstanceOf(AppError);
    expect((mapped as AppError).code).toBe("SLOT_TAKEN");
  });

  it("maps a patient+slot uniqueness violation to PATIENT_CONFLICT", () => {
    expect((mapBookingError(uniqueViolation(["patient_id", "slot_start"])) as AppError).code).toBe("PATIENT_CONFLICT");
  });

  it("understands the constraint name form of the target as well as the column list", () => {
    expect((mapBookingError(uniqueViolation("Appointment_doctor_slot_active_key")) as AppError).code).toBe("SLOT_TAKEN");
    expect((mapBookingError(uniqueViolation("Appointment_patient_slot_active_key")) as AppError).code).toBe(
      "PATIENT_CONFLICT",
    );
  });

  it("falls back to a generic CONFLICT for an unrecognised unique violation", () => {
    expect((mapBookingError(uniqueViolation(["something_else"])) as AppError).code).toBe("CONFLICT");
  });

  it("passes every other error through untouched", () => {
    const other = new Error("boom");
    expect(mapBookingError(other)).toBe(other);
    const differentCode = new Prisma.PrismaClientKnownRequestError("x", { code: "P2025", clientVersion: "test" });
    expect(mapBookingError(differentCode)).toBe(differentCode);
  });
});
