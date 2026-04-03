import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";
import {
  bookAppointment,
  saveConsultationNotes,
  transitionAppointment,
  type Actor,
} from "@/features/appointments/service";
import {
  getAppointmentDetail,
  getDoctorUpcoming,
  getPatientHistory,
  getQueueSnapshot,
  getRecentPatients,
} from "@/features/appointments/queries";
import { listNotifications, markNotificationsRead } from "@/features/notifications/service";
import { NOW, createDoctor, createPatient, resetDatabase, slotAt, type TestDoctor, type TestPatient } from "./helpers/factories";

beforeEach(resetDatabase);

const CHECK_IN_TIME = new Date("2030-01-07T10:10:00.000Z");
const asUser = (actor: Actor & { email?: string }): SessionUser => ({
  id: actor.id,
  role: actor.role,
  name: actor.name,
  email: actor.email ?? "x@test.local",
});

async function book(patient: Actor, doctor: TestDoctor, time: string, reason?: string, day?: string) {
  const { id } = await bookAppointment(patient, { doctorId: doctor.doctorId, slotStart: slotAt(time, day), reason }, NOW);
  return id;
}
const checkIn = (patient: Actor, id: string, offsetSeconds = 0) =>
  transitionAppointment(patient, { appointmentId: id, event: "check_in" }, new Date(CHECK_IN_TIME.getTime() + offsetSeconds * 1000));

describe("getAppointmentDetail", () => {
  it("shows the patient their appointment without the doctor's clinical notes", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    const id = await book(patient, doctor, "10:00", "Persistent cough");
    await checkIn(patient, id);
    await saveConsultationNotes(doctor, { appointmentId: id, notes: "Suspected bronchitis" });

    const detail = await getAppointmentDetail(asUser(patient), id);
    expect(detail?.viewer).toBe("patient");
    expect(detail?.appointment.reason).toBe("Persistent cough");
    expect(detail?.notes).toBeNull();
    expect(detail?.history).toEqual([]);
    expect(JSON.stringify(detail)).not.toContain("bronchitis");
  });

  it("gives the treating doctor the notes and this patient's earlier completed visits", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    const earlier = await book(patient, doctor, "10:00", "First visit", "2030-01-07");
    await checkIn(patient, earlier);
    await transitionAppointment(doctor, { appointmentId: earlier, event: "start" }, CHECK_IN_TIME);
    await transitionAppointment(doctor, { appointmentId: earlier, event: "complete", notes: "Prescribed rest" }, CHECK_IN_TIME);

    const current = await book(patient, doctor, "11:00", "Follow-up");
    await checkIn(patient, current, 5);
    await saveConsultationNotes(doctor, { appointmentId: current, notes: "Improving" });

    const detail = await getAppointmentDetail(asUser(doctor), current);
    expect(detail?.viewer).toBe("doctor");
    expect(detail?.notes).toBe("Improving");
    expect(detail?.history.map((h) => [h.reason, h.notes])).toEqual([["First visit", "Prescribed rest"]]);
  });

  it("returns null for anyone who is not the patient or the treating doctor", async () => {
    const doctor = await createDoctor();
    const otherDoctor = await createDoctor();
    const patient = await createPatient();
    const stranger = await createPatient();
    const id = await book(patient, doctor, "10:00");

    expect(await getAppointmentDetail(asUser(stranger), id)).toBeNull();
    expect(await getAppointmentDetail(asUser(otherDoctor), id)).toBeNull();
    expect(await getAppointmentDetail(asUser({ id: "admin-1", role: "admin", name: "A" }), id)).toBeNull();
    expect(await getAppointmentDetail(asUser(patient), "missing")).toBeNull();
  });
});

describe("getQueueSnapshot", () => {
  async function scene() {
    const doctor = await createDoctor({ name: "Grace Hopper" });
    const [p1, p2, p3] = await Promise.all([createPatient("One"), createPatient("Two"), createPatient("Three")]);
    const ids = [await book(p1, doctor, "10:00"), await book(p2, doctor, "10:30"), await book(p3, doctor, "11:00")];
    return { doctor, patients: [p1, p2, p3] as TestPatient[], ids };
  }

  it("tells a queued patient their position, how many are ahead and a wait estimate", async () => {
    const { doctor, patients, ids } = await scene();
    await checkIn(patients[0]!, ids[0]!, 0);
    await checkIn(patients[1]!, ids[1]!, 1);
    await transitionAppointment(doctor, { appointmentId: ids[0]!, event: "start" }, CHECK_IN_TIME);

    const snapshot = await getQueueSnapshot(asUser(patients[1]!), CHECK_IN_TIME);
    expect(snapshot.role).toBe("patient");
    if (snapshot.role !== "patient") throw new Error("unreachable");
    const mine = snapshot.appointments[0]!;
    expect(mine.status).toBe("in_queue");
    // The first patient was taken in, so this patient is now next, but the doctor is still busy: one slot wait.
    expect(mine.queue).toEqual({ position: 1, ahead: 0, doctorBusy: true, estimatedWaitMinutes: 30 });
  });

  it("lists only a patient's active appointments, never completed or cancelled ones", async () => {
    const { patients, ids } = await scene();
    await transitionAppointment(patients[0]!, { appointmentId: ids[0]!, event: "cancel" }, NOW);
    const snapshot = await getQueueSnapshot(asUser(patients[0]!), NOW);
    expect(snapshot.role === "patient" && snapshot.appointments).toEqual([]);
    const history = await getPatientHistory(patients[0]!.id);
    expect(history.map((h) => h.status)).toEqual(["cancelled"]);
  });

  it("gives the doctor today's schedule, the waiting room in order, and the consultation in progress", async () => {
    const { doctor, patients, ids } = await scene();
    await checkIn(patients[2]!, ids[2]!, 0);
    await checkIn(patients[1]!, ids[1]!, 1);
    await checkIn(patients[0]!, ids[0]!, 2);
    await transitionAppointment(doctor, { appointmentId: ids[1]!, event: "start" }, CHECK_IN_TIME);
    // A cancelled appointment and one on another day must not appear in today's schedule.
    const tomorrow = await book(await createPatient(), doctor, "10:00", undefined, "2030-01-08");
    await transitionAppointment(patients[0]!, { appointmentId: ids[0]!, event: "cancel" }, NOW);

    const snapshot = await getQueueSnapshot(asUser(doctor), CHECK_IN_TIME);
    if (snapshot.role !== "doctor") throw new Error("unreachable");
    expect(snapshot.today.map((a) => a.patient.name)).toEqual(["Two", "Three"]);
    expect(snapshot.today.map((a) => a.id)).not.toContain(tomorrow);
    expect(snapshot.inProgress?.patient.name).toBe("Two");
    expect(snapshot.waiting.map((a) => [a.patient.name, a.queuePosition])).toEqual([["Three", 1]]);
  });

  it("returns an empty doctor snapshot for a doctor account with no profile", async () => {
    const snapshot = await getQueueSnapshot({ id: "ghost", role: "doctor", name: "Ghost", email: "g@test.local" }, NOW);
    expect(snapshot).toEqual({ role: "doctor", today: [], waiting: [], inProgress: null });
  });
});

describe("doctor views", () => {
  it("lists the next seven days of non-cancelled appointments in time order", async () => {
    const doctor = await createDoctor();
    const [a, b, c] = await Promise.all([createPatient(), createPatient(), createPatient()]);
    await book(b, doctor, "11:00", undefined, "2030-01-09");
    await book(a, doctor, "10:00", undefined, "2030-01-07");
    const cancelled = await book(c, doctor, "12:00", undefined, "2030-01-08");
    await transitionAppointment(c, { appointmentId: cancelled, event: "cancel" }, NOW);
    await book(await createPatient(), doctor, "10:00", undefined, "2030-01-20"); // beyond the horizon

    const upcoming = await getDoctorUpcoming(doctor.id, 7, NOW);
    expect(upcoming.map((x) => x.slotStart.slice(0, 16))).toEqual(["2030-01-07T10:00", "2030-01-09T11:00"]);
  });

  it("summarises recent patients by last visit and visit count", async () => {
    const doctor = await createDoctor();
    const regular = await createPatient("Regular");
    const once = await createPatient("Once");
    for (const [patient, time] of [[regular, "10:00"], [regular, "10:30"], [once, "11:00"]] as const) {
      const id = await book(patient, doctor, time);
      await checkIn(patient, id);
      await transitionAppointment(doctor, { appointmentId: id, event: "start" }, CHECK_IN_TIME);
      await transitionAppointment(doctor, { appointmentId: id, event: "complete" }, CHECK_IN_TIME);
    }
    const recent = await getRecentPatients(doctor.id);
    expect(recent.map((r) => [r.name, r.visits])).toEqual([["Once", 1], ["Regular", 2]]);
  });
});

describe("notifications", () => {
  it("lists newest first with an unread count, and marks read only the caller's own", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    const other = await createPatient();
    await book(patient, doctor, "10:00");
    await book(other, doctor, "10:30");

    const before = await listNotifications(patient.id);
    expect(before.unreadCount).toBe(1);
    expect(before.items[0]?.type).toBe("appointment_confirmed");
    expect(before.items[0]?.readAt).toBeNull();

    // Trying to mark someone else's notification by id is a silent no-op.
    const otherNote = await prisma.notification.findFirstOrThrow({ where: { userId: other.id } });
    expect(await markNotificationsRead(patient.id, [otherNote.id])).toBe(0);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: otherNote.id } })).readAt).toBeNull();

    expect(await markNotificationsRead(patient.id)).toBe(1);
    const after = await listNotifications(patient.id);
    expect(after.unreadCount).toBe(0);
    expect(after.items[0]?.readAt).not.toBeNull();
    expect((await listNotifications(doctor.id)).unreadCount).toBe(2);
  });
});
