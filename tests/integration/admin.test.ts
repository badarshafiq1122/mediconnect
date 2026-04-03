import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { bookAppointment, transitionAppointment } from "@/features/appointments/service";
import { VOLUME_DAYS, getPlatformOverview } from "@/features/admin/queries";
import { NOW, createDoctor, createPatient, resetDatabase, slotAt } from "./helpers/factories";

beforeEach(resetDatabase);

/** Inserts an appointment directly so it can sit in the past, which the booking service (rightly) forbids. */
async function insertAppointment(patientId: string, doctorId: string, start: Date, status: "completed" | "cancelled" | "booked") {
  await prisma.appointment.create({
    data: { patientId, doctorId, slotStart: start, slotEnd: new Date(start.getTime() + 30 * 60_000), status },
  });
}

describe("getPlatformOverview", () => {
  it("is all zeros, with a zero-filled series, on an empty platform", async () => {
    const overview = await getPlatformOverview(NOW);
    expect(overview.totals).toEqual({ patients: 0, doctors: 0, activeDoctors: 0, appointments: 0, appointmentsToday: 0 });
    expect(overview.byStatus).toEqual({ booked: 0, in_queue: 0, in_progress: 0, completed: 0, cancelled: 0 });
    expect(overview.volume).toHaveLength(VOLUME_DAYS);
    expect(overview.volume.every((point) => point.total === 0)).toBe(true);
    expect(overview.topDoctors).toEqual([]);
  });

  it("counts users, doctors and appointments by status", async () => {
    const busy = await createDoctor({ name: "Busy" });
    await createDoctor({ name: "Retired", isActive: false });
    const [a, b, c] = await Promise.all([createPatient(), createPatient(), createPatient()]);
    await insertAppointment(a.id, busy.doctorId, slotAt("10:00", "2030-01-05"), "completed");
    await insertAppointment(b.id, busy.doctorId, slotAt("10:00", "2030-01-06"), "cancelled");
    await bookAppointment(c, { doctorId: busy.doctorId, slotStart: slotAt("10:00") }, NOW);

    const overview = await getPlatformOverview(NOW);
    expect(overview.totals).toMatchObject({ patients: 3, doctors: 2, activeDoctors: 1, appointments: 3 });
    expect(overview.byStatus).toMatchObject({ completed: 1, cancelled: 1, booked: 1 });
  });

  it("buckets volume by clinic-local day, oldest first, separating cancellations", async () => {
    const doctor = await createDoctor();
    const patients = await Promise.all(Array.from({ length: 4 }, () => createPatient()));
    await insertAppointment(patients[0]!.id, doctor.doctorId, slotAt("09:00", "2030-01-07"), "booked");
    await insertAppointment(patients[1]!.id, doctor.doctorId, slotAt("09:30", "2030-01-07"), "cancelled");
    await insertAppointment(patients[2]!.id, doctor.doctorId, slotAt("09:00", "2030-01-05"), "completed");
    await insertAppointment(patients[3]!.id, doctor.doctorId, slotAt("09:00", "2029-12-01"), "completed"); // outside the window

    const { volume, totals } = await getPlatformOverview(NOW);
    expect(volume[0]?.date).toBe("2029-12-25");
    expect(volume[volume.length - 1]?.date).toBe("2030-01-07");
    expect(volume.find((p) => p.date === "2030-01-07")).toEqual({ date: "2030-01-07", total: 2, cancelled: 1 });
    expect(volume.find((p) => p.date === "2030-01-05")).toEqual({ date: "2030-01-05", total: 1, cancelled: 0 });
    expect(volume.reduce((sum, p) => sum + p.total, 0)).toBe(3);
    expect(totals.appointmentsToday).toBe(2);
  });

  it("ranks doctors by non-cancelled appointments in the last 30 days", async () => {
    const [top, second, idle] = await Promise.all([
      createDoctor({ name: "Top" }),
      createDoctor({ name: "Second" }),
      createDoctor({ name: "Idle" }),
    ]);
    const patients = await Promise.all(Array.from({ length: 4 }, () => createPatient()));
    await insertAppointment(patients[0]!.id, top.doctorId, slotAt("09:00", "2030-01-03"), "completed");
    await insertAppointment(patients[1]!.id, top.doctorId, slotAt("09:00", "2030-01-04"), "completed");
    await insertAppointment(patients[2]!.id, second.doctorId, slotAt("09:00", "2030-01-05"), "completed");
    await insertAppointment(patients[3]!.id, idle.doctorId, slotAt("09:00", "2030-01-05"), "cancelled");

    const { topDoctors } = await getPlatformOverview(NOW);
    expect(topDoctors.map((d) => [d.name, d.appointments])).toEqual([
      ["Top", 2],
      ["Second", 1],
    ]);
  });

  it("does not let a live consultation's status skew the totals", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    const { id } = await bookAppointment(patient, { doctorId: doctor.doctorId, slotStart: slotAt("10:00") }, NOW);
    await transitionAppointment(patient, { appointmentId: id, event: "check_in" }, new Date("2030-01-07T10:00:00Z"));
    const overview = await getPlatformOverview(NOW);
    expect(overview.byStatus).toMatchObject({ in_queue: 1, booked: 0 });
    expect(overview.totals.appointments).toBe(1);
  });
});
