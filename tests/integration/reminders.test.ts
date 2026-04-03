import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { sseBus } from "@/lib/sse-bus";
import type { LiveEvent } from "@/lib/sse-events";
import { sendDueReminders } from "@/features/appointments/reminders";
import { bookAppointment, transitionAppointment } from "@/features/appointments/service";
import { NOW, createDoctor, createPatient, resetDatabase, slotAt } from "./helpers/factories";

beforeEach(resetDatabase);

const reminderCount = (userId?: string) =>
  prisma.notification.count({ where: { type: "appointment_reminder", ...(userId ? { userId } : {}) } });

describe("sendDueReminders", () => {
  it("reminds the patient once for an appointment starting within the lead time", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    await bookAppointment(patient, { doctorId: doctor.doctorId, slotStart: slotAt("10:00") }, NOW);

    const events: LiveEvent[] = [];
    const unsubscribe = sseBus.subscribe(patient.id, (event) => events.push(event));

    // 15 minutes before the slot, inside the 30 minute reminder window.
    const scanAt = new Date("2030-01-07T09:45:00Z");
    expect(await sendDueReminders(scanAt)).toBe(1);
    // A repeat scan (or a second instance) must not send it again.
    expect(await sendDueReminders(scanAt)).toBe(0);
    unsubscribe();

    expect(await reminderCount(patient.id)).toBe(1);
    expect(events.filter((e) => e.type === "notification.created")).toHaveLength(1);
    const row = await prisma.appointment.findFirstOrThrow();
    expect(row.reminderSentAt).not.toBeNull();
  });

  it("sends exactly one reminder when two scans race", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    await bookAppointment(patient, { doctorId: doctor.doctorId, slotStart: slotAt("10:00") }, NOW);

    const scanAt = new Date("2030-01-07T09:45:00Z");
    await Promise.all([sendDueReminders(scanAt), sendDueReminders(scanAt), sendDueReminders(scanAt)]);
    expect(await reminderCount()).toBe(1);
  });

  it("ignores appointments that are too far away, already started, cancelled or in the past", async () => {
    const doctor = await createDoctor();
    const [far, cancelled, queued] = await Promise.all([createPatient(), createPatient(), createPatient()]);
    await bookAppointment(far, { doctorId: doctor.doctorId, slotStart: slotAt("14:00") }, NOW);
    const { id: cancelledId } = await bookAppointment(cancelled, { doctorId: doctor.doctorId, slotStart: slotAt("10:00") }, NOW);
    await transitionAppointment(cancelled, { appointmentId: cancelledId, event: "cancel" }, NOW);
    const { id: queuedId } = await bookAppointment(queued, { doctorId: doctor.doctorId, slotStart: slotAt("10:30") }, NOW);
    await transitionAppointment(queued, { appointmentId: queuedId, event: "check_in" }, new Date("2030-01-07T09:40:00Z"));

    expect(await sendDueReminders(new Date("2030-01-07T10:10:00Z"))).toBe(0);
    expect(await reminderCount()).toBe(0);
  });

  it("does not nag someone who booked inside the reminder window (the confirmation already covers it)", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    // Direct insert so createdAt can sit inside the window; the service always stamps the real clock.
    await prisma.appointment.create({
      data: {
        patientId: patient.id,
        doctorId: doctor.doctorId,
        slotStart: slotAt("10:00"),
        slotEnd: slotAt("10:30"),
        createdAt: new Date("2030-01-07T09:50:00Z"),
      },
    });

    expect(await sendDueReminders(new Date("2030-01-07T09:55:00Z"))).toBe(0);
    expect(await reminderCount()).toBe(0);
    // ...but it is still marked, so it is not re-scanned forever.
    expect((await prisma.appointment.findFirstOrThrow()).reminderSentAt).not.toBeNull();
  });
});
