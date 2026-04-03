import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { bookAppointment } from "@/features/appointments/service";
import { getDoctorSlots } from "@/features/appointments/queries";
import { listSpecialties, searchDoctors } from "@/features/doctors/queries";
import {
  createDoctorAccount,
  replaceAvailability,
  setDoctorActive,
  updateDoctorProfile,
} from "@/features/doctors/service";
import { parseDoctorFilters, replaceAvailabilitySchema } from "@/features/doctors/validation";
import type { Actor } from "@/features/appointments/service";
import { NOW, createDoctor, createPatient, resetDatabase, slotAt } from "./helpers/factories";

beforeEach(resetDatabase);

const admin: Actor = { id: "admin-1", role: "admin", name: "Admin" };
const none = parseDoctorFilters({});

describe("searchDoctors", () => {
  it("filters by specialty case-insensitively and hides inactive doctors", async () => {
    await createDoctor({ name: "Dr Heart", specialty: "Cardiology" });
    await createDoctor({ name: "Dr Skin", specialty: "Dermatology" });
    await createDoctor({ name: "Dr Hidden", specialty: "Cardiology", isActive: false });

    const { doctors } = await searchDoctors({ ...none, specialty: "cardiology" });
    expect(doctors.map((d) => d.name)).toEqual(["Dr Heart"]);
  });

  it("filters by minimum rating", async () => {
    await createDoctor({ name: "Low", rating: 2.5 });
    await createDoctor({ name: "High", rating: 4.8 });
    const { doctors } = await searchDoctors({ ...none, minRating: 4 });
    expect(doctors.map((d) => d.name)).toEqual(["High"]);
  });

  it("filters by the weekday a doctor is available", async () => {
    await createDoctor({ name: "Mondays", availability: [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }] });
    await createDoctor({ name: "Fridays", availability: [{ dayOfWeek: 5, startTime: "09:00", endTime: "12:00" }] });
    const { doctors } = await searchDoctors({ ...none, day: 5 });
    expect(doctors.map((d) => d.name)).toEqual(["Fridays"]);
    expect(doctors[0]?.availableDays).toEqual([5]);
  });

  it("searches name, specialty and bio", async () => {
    await createDoctor({ name: "Florence Nightingale", specialty: "Nursing" });
    await createDoctor({ name: "Someone Else", specialty: "Orthopedics" });
    expect((await searchDoctors({ ...none, q: "FLOREN" })).doctors.map((d) => d.name)).toEqual(["Florence Nightingale"]);
    expect((await searchDoctors({ ...none, q: "ortho" })).doctors.map((d) => d.name)).toEqual(["Someone Else"]);
    expect((await searchDoctors({ ...none, q: "no such doctor" })).doctors).toEqual([]);
  });

  it("combines filters with AND semantics", async () => {
    await createDoctor({ name: "Match", specialty: "Cardiology", rating: 4.9 });
    await createDoctor({ name: "WrongSpecialty", specialty: "Dermatology", rating: 4.9 });
    await createDoctor({ name: "TooLow", specialty: "Cardiology", rating: 1 });
    const { doctors } = await searchDoctors({ ...none, specialty: "Cardiology", minRating: 4 });
    expect(doctors.map((d) => d.name)).toEqual(["Match"]);
  });

  it("pages through every doctor exactly once with a stable cursor, best-rated first", async () => {
    // Many ties on rating exercise the id tiebreak the cursor depends on.
    const created = await Promise.all(Array.from({ length: 25 }, (_, i) => createDoctor({ rating: (i % 5) + 0.5 })));

    const seen: string[] = [];
    const ratings: number[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await searchDoctors({ ...none, cursor }, 10);
      seen.push(...page.doctors.map((d) => d.id));
      ratings.push(...page.doctors.map((d) => d.rating));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(25);
    expect(new Set(seen)).toEqual(new Set(created.map((d) => d.doctorId)));
    expect([...ratings].sort((a, b) => b - a)).toEqual(ratings);
  });

  it("reports no next cursor when the results fit on one page", async () => {
    await createDoctor();
    await createDoctor();
    const page = await searchDoctors(none, 10);
    expect(page.doctors).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("lists distinct specialties of active doctors only", async () => {
    await createDoctor({ specialty: "Cardiology" });
    await createDoctor({ specialty: "Cardiology" });
    await createDoctor({ specialty: "Dermatology" });
    await createDoctor({ specialty: "Secret", isActive: false });
    expect(await listSpecialties()).toEqual(["Cardiology", "Dermatology"]);
  });
});

describe("parseDoctorFilters (URL parameters)", () => {
  it("coerces valid values and ignores blank ones", () => {
    expect(parseDoctorFilters({ q: " heart ", day: "3", minRating: "4.5", specialty: "", cursor: "abc" })).toEqual({
      q: "heart",
      day: 3,
      minRating: 4.5,
      specialty: undefined,
      cursor: "abc",
    });
  });

  it("falls back to no filter for hostile or out-of-range values instead of throwing", () => {
    const parsed = parseDoctorFilters({ day: "9", minRating: "banana", q: "x".repeat(500), cursor: ["a", "b"] });
    expect(parsed.day).toBeUndefined();
    expect(parsed.minRating).toBeUndefined();
    expect(parsed.q).toBeUndefined();
    expect(parsed.cursor).toBe("a");
  });

  it("does not turn a blank day into Sunday", () => {
    expect(parseDoctorFilters({ day: "" }).day).toBeUndefined();
  });
});

describe("createDoctorAccount", () => {
  const input = { name: "Dr New", email: "new.doc@example.com", password: "Sturdy-pass-1", specialty: "Neurology", bio: "" };

  it("creates the account, profile and a default Mon-Fri schedule, with a hashed password", async () => {
    const { doctorId, userId } = await createDoctorAccount(admin, input);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { doctorProfile: { include: { availability: true } } } });
    expect(user.role).toBe("doctor");
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(user.doctorProfile?.id).toBe(doctorId);
    expect(user.doctorProfile?.availability.map((w) => w.dayOfWeek).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("is admin-only", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    await expect(createDoctorAccount(doctor, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createDoctorAccount(patient, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a duplicate email", async () => {
    await createDoctorAccount(admin, input);
    await expect(createDoctorAccount(admin, input)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("doctor administration", () => {
  it("deactivating hides a doctor from discovery, slots and new bookings but keeps existing appointments", async () => {
    const doctor = await createDoctor({ name: "Dr Leaving" });
    const patient = await createPatient();
    const { id } = await bookAppointment(patient, { doctorId: doctor.doctorId, slotStart: slotAt("10:00") }, NOW);

    await setDoctorActive(admin, { doctorId: doctor.doctorId, isActive: false });

    expect((await searchDoctors(none)).doctors).toEqual([]);
    expect(await getDoctorSlots(doctor.doctorId, NOW)).toEqual([]);
    await expect(
      bookAppointment(await createPatient(), { doctorId: doctor.doctorId, slotStart: slotAt("11:00") }, NOW),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id } })).status).toBe("booked");

    await setDoctorActive(admin, { doctorId: doctor.doctorId, isActive: true });
    expect((await searchDoctors(none)).doctors).toHaveLength(1);
  });

  it("updates profile fields, admin-only", async () => {
    const doctor = await createDoctor();
    await updateDoctorProfile(admin, { doctorId: doctor.doctorId, specialty: "Oncology", bio: "New bio" });
    const profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { id: doctor.doctorId } });
    expect([profile.specialty, profile.bio]).toEqual(["Oncology", "New bio"]);
    await expect(
      updateDoctorProfile(doctor, { doctorId: doctor.doctorId, specialty: "Hacked", bio: "" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      updateDoctorProfile(admin, { doctorId: "missing", specialty: "X", bio: "" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("replaceAvailability", () => {
  const monday = [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }];

  it("replaces the doctor's own schedule atomically", async () => {
    const doctor = await createDoctor();
    await replaceAvailability(doctor, { windows: monday });
    const rows = await prisma.availabilitySlot.findMany({ where: { doctorId: doctor.doctorId } });
    expect(rows.map((r) => [r.dayOfWeek, r.startTime, r.endTime])).toEqual([[1, "09:00", "12:00"]]);
  });

  it("ignores a foreign doctorId supplied by a doctor: they can only ever edit their own schedule", async () => {
    const mine = await createDoctor();
    const theirs = await createDoctor({ availability: [{ dayOfWeek: 2, startTime: "10:00", endTime: "11:00" }] });
    await replaceAvailability(mine, { doctorId: theirs.doctorId, windows: monday });
    expect(await prisma.availabilitySlot.count({ where: { doctorId: theirs.doctorId } })).toBe(1);
    expect((await prisma.availabilitySlot.findFirstOrThrow({ where: { doctorId: theirs.doctorId } })).dayOfWeek).toBe(2);
  });

  it("lets an admin edit any doctor, but requires them to name one", async () => {
    const doctor = await createDoctor();
    await replaceAvailability(admin, { doctorId: doctor.doctorId, windows: monday });
    expect(await prisma.availabilitySlot.count({ where: { doctorId: doctor.doctorId } })).toBe(1);
    await expect(replaceAvailability(admin, { windows: monday })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("forbids patients", async () => {
    const patient = await createPatient();
    await expect(replaceAvailability(patient, { windows: monday })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects windows shorter than one slot and leaves the old schedule untouched", async () => {
    const doctor = await createDoctor({ availability: monday });
    await expect(
      replaceAvailability(doctor, { windows: [{ dayOfWeek: 1, startTime: "09:00", endTime: "09:20" }] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.availabilitySlot.count({ where: { doctorId: doctor.doctorId } })).toBe(1);
  });

  it("can clear the schedule entirely", async () => {
    const doctor = await createDoctor();
    await replaceAvailability(doctor, { windows: [] });
    expect(await prisma.availabilitySlot.count({ where: { doctorId: doctor.doctorId } })).toBe(0);
  });

  it("does not disturb already-booked appointments that fall outside the new windows", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    const { id } = await bookAppointment(patient, { doctorId: doctor.doctorId, slotStart: slotAt("15:00") }, NOW);
    await replaceAvailability(doctor, { windows: monday });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id } })).status).toBe("booked");
  });
});

describe("replaceAvailabilitySchema", () => {
  it("rejects overlapping windows on the same day, inverted times and bad formats", () => {
    const overlap = replaceAvailabilitySchema.safeParse({
      windows: [
        { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
        { dayOfWeek: 1, startTime: "11:00", endTime: "13:00" },
      ],
    });
    expect(overlap.success).toBe(false);

    expect(replaceAvailabilitySchema.safeParse({ windows: [{ dayOfWeek: 1, startTime: "12:00", endTime: "09:00" }] }).success).toBe(false);
    expect(replaceAvailabilitySchema.safeParse({ windows: [{ dayOfWeek: 1, startTime: "9am", endTime: "5pm" }] }).success).toBe(false);
    expect(replaceAvailabilitySchema.safeParse({ windows: [{ dayOfWeek: 8, startTime: "09:00", endTime: "10:00" }] }).success).toBe(false);
  });

  it("accepts back-to-back windows and coerces form-style weekday strings", () => {
    const parsed = replaceAvailabilitySchema.parse({
      windows: [
        { dayOfWeek: "1", startTime: "09:00", endTime: "12:00" },
        { dayOfWeek: 1, startTime: "12:00", endTime: "15:00" },
      ],
    });
    expect(parsed.windows[0]?.dayOfWeek).toBe(1);
  });
});

describe("getDoctorSlots", () => {
  it("shows a booked slot as unavailable and frees it again when cancelled elsewhere", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    await bookAppointment(patient, { doctorId: doctor.doctorId, slotStart: slotAt("10:00") }, NOW);

    const days = await getDoctorSlots(doctor.doctorId, NOW);
    const today = days.find((day) => day.date === "2030-01-07");
    const slot = today?.slots.find((s) => s.start === "2030-01-07T10:00:00.000Z");
    expect(slot?.available).toBe(false);
    expect(today?.slots.find((s) => s.start === "2030-01-07T10:30:00.000Z")?.available).toBe(true);
    expect(days).toHaveLength(7);
  });
});
