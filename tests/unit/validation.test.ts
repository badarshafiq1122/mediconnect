import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "@/features/auth/validation";
import {
  bookAppointmentSchema,
  cancelAppointmentSchema,
  rateAppointmentSchema,
  saveNotesSchema,
} from "@/features/appointments/validation";

const fieldErrors = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((result.error?.issues ?? []).map((issue) => [String(issue.path[0]), issue.message]));

describe("registerSchema", () => {
  const valid = { name: "Ada Lovelace", email: "ada@example.com", password: "analytical1" };

  it("accepts a valid payload and normalises the email", () => {
    const parsed = registerSchema.parse({ ...valid, email: "  Ada@Example.COM " });
    expect(parsed.email).toBe("ada@example.com");
  });

  it.each([
    ["too short", "abc1", "password"],
    ["no digit", "onlyletters", "password"],
    ["no letter", "12345678", "password"],
    ["over 72 characters (bcrypt truncation)", `a1${"x".repeat(71)}`, "password"],
  ])("rejects a password that is %s", (_label, password, field) => {
    const result = registerSchema.safeParse({ ...valid, password });
    expect(result.success).toBe(false);
    expect(fieldErrors(result)).toHaveProperty(field);
  });

  it.each(["not-an-email", "a@", "@b.com", ""])("rejects the email %j", (email) => {
    expect(registerSchema.safeParse({ ...valid, email }).success).toBe(false);
  });

  it("rejects names that are too short or contain angle brackets", () => {
    expect(registerSchema.safeParse({ ...valid, name: "A" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, name: "<script>" }).success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(registerSchema.safeParse({}).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("requires a password but does not impose the registration policy", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("bookAppointmentSchema", () => {
  const valid = { doctorId: "doc_1", slotStart: "2030-01-07T10:00:00.000Z" };

  it("parses the slot into a Date", () => {
    const parsed = bookAppointmentSchema.parse(valid);
    expect(parsed.slotStart).toBeInstanceOf(Date);
    expect(parsed.slotStart.toISOString()).toBe("2030-01-07T10:00:00.000Z");
  });

  it.each(["tomorrow", "2030-01-07", "2030-13-45T10:00:00Z", "", 12345])("rejects slotStart %j", (slotStart) => {
    expect(bookAppointmentSchema.safeParse({ ...valid, slotStart }).success).toBe(false);
  });

  it("rejects a missing doctor", () => {
    expect(bookAppointmentSchema.safeParse({ slotStart: valid.slotStart }).success).toBe(false);
  });

  it("strips markup from the visit reason and drops it when nothing is left", () => {
    expect(bookAppointmentSchema.parse({ ...valid, reason: "Cough <b>and</b> fever" }).reason).toBe("Cough and fever");
    expect(bookAppointmentSchema.parse({ ...valid, reason: "   " }).reason).toBeUndefined();
    expect(bookAppointmentSchema.parse(valid).reason).toBeUndefined();
  });

  it("rejects an over-long reason", () => {
    expect(bookAppointmentSchema.safeParse({ ...valid, reason: "x".repeat(501) }).success).toBe(false);
  });
});

describe("rateAppointmentSchema", () => {
  it.each([0, 6, -1, 3.5, "abc"])("rejects rating %j", (rating) => {
    expect(rateAppointmentSchema.safeParse({ appointmentId: "a1", rating }).success).toBe(false);
  });

  it("coerces a form-style string", () => {
    expect(rateAppointmentSchema.parse({ appointmentId: "a1", rating: "4" }).rating).toBe(4);
  });
});

describe("notes and cancellation payloads", () => {
  it("caps notes at 5000 characters", () => {
    expect(saveNotesSchema.safeParse({ appointmentId: "a1", notes: "x".repeat(5001) }).success).toBe(false);
    expect(saveNotesSchema.safeParse({ appointmentId: "a1", notes: "ok" }).success).toBe(true);
  });

  it("accepts a cancellation with no reason", () => {
    expect(cancelAppointmentSchema.parse({ appointmentId: "a1" }).reason).toBeUndefined();
  });
});
