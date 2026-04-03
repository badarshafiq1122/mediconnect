import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { sseBus } from "@/lib/sse-bus";
import type { LiveEvent } from "@/lib/sse-events";
import { bookAppointment, transitionAppointment } from "@/features/appointments/service";
import { NOW, createDoctor, createPatient, resetDatabase, slotAt } from "./helpers/factories";

beforeEach(resetDatabase);

const SLOT = slotAt("10:00");

describe("bookAppointment", () => {
  it("books an open slot, notifies both parties and publishes SSE events after commit", async () => {
    const doctor = await createDoctor({ name: "Grace Hopper" });
    const patient = await createPatient("Ada Lovelace");

    const patientEvents: LiveEvent[] = [];
    const doctorEvents: LiveEvent[] = [];
    const unsubscribers = [
      sseBus.subscribe(patient.id, (event) => patientEvents.push(event)),
      sseBus.subscribe(doctor.id, (event) => doctorEvents.push(event)),
    ];

    const { id } = await bookAppointment(patient, { doctorId: doctor.doctorId, slotStart: SLOT, reason: "Cough" }, NOW);
    unsubscribers.forEach((unsubscribe) => unsubscribe());

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id } });
    expect(appointment.status).toBe("booked");
    expect(appointment.queuePosition).toBeNull();
    expect(appointment.slotStart.toISOString()).toBe("2030-01-07T10:00:00.000Z");
    expect(appointment.slotEnd.toISOString()).toBe("2030-01-07T10:30:00.000Z");
    expect(appointment.reason).toBe("Cough");

    const notifications = await prisma.notification.findMany({ orderBy: { createdAt: "asc" } });
    expect(notifications.map((n) => [n.userId, n.type])).toEqual(
      expect.arrayContaining([
        [patient.id, "appointment_confirmed"],
        [doctor.id, "appointment_confirmed"],
      ]),
    );
    expect(notifications).toHaveLength(2);

    expect(patientEvents.map((e) => e.type).sort()).toEqual(["appointment.updated", "notification.created"]);
    expect(doctorEvents.map((e) => e.type).sort()).toEqual(["appointment.updated", "notification.created"]);
  });

  it("rejects a second booking of the same doctor and slot with SLOT_TAKEN, enforced by the database", async () => {
    const doctor = await createDoctor();
    const first = await createPatient();
    const second = await createPatient();

    await bookAppointment(first, { doctorId: doctor.doctorId, slotStart: SLOT }, NOW);
    await expect(bookAppointment(second, { doctorId: doctor.doctorId, slotStart: SLOT }, NOW)).rejects.toMatchObject({
      code: "SLOT_TAKEN",
    });

    expect(await prisma.appointment.count({ where: { doctorId: doctor.doctorId, slotStart: SLOT } })).toBe(1);
  });

  it("leaves no trace of a rejected booking: the transaction rolls back its notifications too", async () => {
    const doctor = await createDoctor();
    await bookAppointment(await createPatient(), { doctorId: doctor.doctorId, slotStart: SLOT }, NOW);
    const before = await prisma.notification.count();

    const loser = await createPatient();
    await expect(bookAppointment(loser, { doctorId: doctor.doctorId, slotStart: SLOT }, NOW)).rejects.toMatchObject({
      code: "SLOT_TAKEN",
    });

    expect(await prisma.notification.count()).toBe(before);
    expect(await prisma.notification.count({ where: { userId: loser.id } })).toBe(0);
  });

  it("lets exactly one of many simultaneous bookings win the same slot", async () => {
    const doctor = await createDoctor();
    const patients = await Promise.all(Array.from({ length: 8 }, () => createPatient()));

    const results = await Promise.allSettled(
      patients.map((patient) => bookAppointment(patient, { doctorId: doctor.doctorId, slotStart: SLOT }, NOW)),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(7);
    for (const failure of rejected) expect(failure.reason).toMatchObject({ code: "SLOT_TAKEN" });
    expect(await prisma.appointment.count({ where: { doctorId: doctor.doctorId } })).toBe(1);
  });

  it("is the database itself that refuses a duplicate, even when the service is bypassed", async () => {
    const doctor = await createDoctor();
    const first = await createPatient();
    const second = await createPatient();
    const slotEnd = new Date(SLOT.getTime() + 30 * 60_000);

    await prisma.appointment.create({
      data: { patientId: first.id, doctorId: doctor.doctorId, slotStart: SLOT, slotEnd },
    });
    await expect(
      prisma.appointment.create({
        data: { patientId: second.id, doctorId: doctor.doctorId, slotStart: SLOT, slotEnd },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("stops one patient holding two live appointments at the same instant", async () => {
    const doctorA = await createDoctor();
    const doctorB = await createDoctor();
    const patient = await createPatient();

    await bookAppointment(patient, { doctorId: doctorA.doctorId, slotStart: SLOT }, NOW);
    await expect(bookAppointment(patient, { doctorId: doctorB.doctorId, slotStart: SLOT }, NOW)).rejects.toMatchObject({
      code: "PATIENT_CONFLICT",
    });
  });

  it("frees the slot when an appointment is cancelled (partial index ignores cancelled rows)", async () => {
    const doctor = await createDoctor();
    const first = await createPatient();
    const second = await createPatient();

    const { id } = await bookAppointment(first, { doctorId: doctor.doctorId, slotStart: SLOT }, NOW);
    await transitionAppointment(first, { appointmentId: id, event: "cancel" }, NOW);

    await expect(
      bookAppointment(second, { doctorId: doctor.doctorId, slotStart: SLOT }, NOW),
    ).resolves.toMatchObject({ id: expect.any(String) });
    expect(await prisma.appointment.count({ where: { doctorId: doctor.doctorId, slotStart: SLOT } })).toBe(2);
  });

  it("frees the slot after completion too, but a completed history row never blocks a later booking", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    await prisma.appointment.create({
      data: {
        patientId: patient.id,
        doctorId: doctor.doctorId,
        slotStart: SLOT,
        slotEnd: new Date(SLOT.getTime() + 30 * 60_000),
        status: "completed",
      },
    });
    await expect(
      bookAppointment(await createPatient(), { doctorId: doctor.doctorId, slotStart: SLOT }, NOW),
    ).resolves.toBeDefined();
  });

  describe("request validation (separate from the race-free constraint check)", () => {
    it.each([
      ["a time that is not on the slot grid", "10:10", "SLOT_UNAVAILABLE"],
      ["a slot inside the 15 minute lead time", "09:10", "SLOT_UNAVAILABLE"],
      ["a slot in the past", "08:00", "SLOT_UNAVAILABLE"],
    ])("rejects %s", async (_label, time, code) => {
      const doctor = await createDoctor();
      const patient = await createPatient();
      await expect(
        bookAppointment(patient, { doctorId: doctor.doctorId, slotStart: slotAt(time) }, NOW),
      ).rejects.toMatchObject({ code });
      expect(await prisma.appointment.count()).toBe(0);
    });

    it("rejects a slot outside the doctor's availability", async () => {
      const doctor = await createDoctor({ availability: [{ dayOfWeek: 1, startTime: "09:00", endTime: "11:00" }] });
      const patient = await createPatient();
      await expect(
        bookAppointment(patient, { doctorId: doctor.doctorId, slotStart: slotAt("14:00") }, NOW),
      ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    });

    it("rejects inactive and unknown doctors", async () => {
      const inactive = await createDoctor({ isActive: false });
      const patient = await createPatient();
      await expect(
        bookAppointment(patient, { doctorId: inactive.doctorId, slotStart: SLOT }, NOW),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        bookAppointment(patient, { doctorId: "does-not-exist", slotStart: SLOT }, NOW),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("only lets patients book", async () => {
      const doctor = await createDoctor();
      await expect(
        bookAppointment(doctor, { doctorId: doctor.doctorId, slotStart: SLOT }, NOW),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});

describe("database constraints", () => {
  it("refuses queue_position on a non-queued appointment and a missing one on a queued appointment", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    const { id } = await bookAppointment(patient, { doctorId: doctor.doctorId, slotStart: SLOT }, NOW);

    await expect(prisma.appointment.update({ where: { id }, data: { queuePosition: 3 } })).rejects.toThrow();
    await expect(prisma.appointment.update({ where: { id }, data: { status: "in_queue" } })).rejects.toThrow();
  });

  it("refuses inverted slots and out-of-range ratings", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    await expect(
      prisma.appointment.create({
        data: { patientId: patient.id, doctorId: doctor.doctorId, slotStart: SLOT, slotEnd: new Date(SLOT.getTime() - 1) },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.doctorId,
          slotStart: SLOT,
          slotEnd: new Date(SLOT.getTime() + 30 * 60_000),
          rating: 9,
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses malformed availability windows", async () => {
    const doctor = await createDoctor();
    for (const bad of [
      { dayOfWeek: 7, startTime: "09:00", endTime: "10:00" },
      { dayOfWeek: 1, startTime: "9:00", endTime: "10:00" },
      { dayOfWeek: 1, startTime: "10:00", endTime: "09:00" },
    ]) {
      await expect(prisma.availabilitySlot.create({ data: { doctorId: doctor.doctorId, ...bad } })).rejects.toThrow();
    }
  });
});
