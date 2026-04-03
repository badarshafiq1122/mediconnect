import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { sseBus } from "@/lib/sse-bus";
import type { LiveEvent } from "@/lib/sse-events";
import {
  bookAppointment,
  rateAppointment,
  saveConsultationNotes,
  transitionAppointment,
  type Actor,
} from "@/features/appointments/service";
import {
  NOW,
  createDoctor,
  createPatient,
  resetDatabase,
  slotAt,
  type TestDoctor,
  type TestPatient,
} from "./helpers/factories";

beforeEach(resetDatabase);

// Inside the check-in window (60 min before start .. slot end) of every 10:00, 10:30 and 11:00 slot.
const CHECK_IN_TIME = new Date("2030-01-07T10:10:00.000Z");

async function book(patient: Actor, doctor: TestDoctor, time: string): Promise<string> {
  const { id } = await bookAppointment(patient, { doctorId: doctor.doctorId, slotStart: slotAt(time) }, NOW);
  return id;
}

const run = (actor: Actor, appointmentId: string, event: "check_in" | "start" | "complete" | "cancel", extra = {}, at = CHECK_IN_TIME) =>
  transitionAppointment(actor, { appointmentId, event, ...extra }, at);

const positionOf = async (id: string) =>
  (await prisma.appointment.findUniqueOrThrow({ where: { id } })).queuePosition;

/** Books and checks in one patient per slot, in the given order; returns ids in the same order. */
async function queueUp(doctor: TestDoctor, patients: TestPatient[], times: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const [index, patient] of patients.entries()) {
    const id = await book(patient, doctor, times[index]!);
    // Distinct check-in instants so FIFO order is unambiguous.
    await run(patient, id, "check_in", {}, new Date(CHECK_IN_TIME.getTime() + index * 1000));
    ids.push(id);
  }
  return ids;
}

describe("check-in", () => {
  it("puts patients in the queue in check-in order and tells them their position live", async () => {
    const doctor = await createDoctor();
    const [p1, p2] = await Promise.all([createPatient(), createPatient()]);
    const events: LiveEvent[] = [];
    const unsubscribe = sseBus.subscribe(p2.id, (event) => events.push(event));

    const ids = await queueUp(doctor, [p1, p2], ["10:00", "10:30"]);
    unsubscribe();

    expect(await positionOf(ids[0]!)).toBe(1);
    expect(await positionOf(ids[1]!)).toBe(2);
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: ids[1]! } });
    expect(row.status).toBe("in_queue");
    expect(row.checkedInAt).not.toBeNull();
    expect(events).toContainEqual({
      type: "appointment.updated",
      appointmentId: ids[1],
      status: "in_queue",
      queuePosition: 2,
    });
  });

  it("assigns unique dense positions in check-in order when many patients check in simultaneously", async () => {
    const doctor = await createDoctor();
    const patients = await Promise.all(Array.from({ length: 5 }, () => createPatient()));
    const times = ["10:00", "10:30", "11:00", "11:30", "12:00"];
    const ids = await Promise.all(patients.map((patient, index) => book(patient, doctor, times[index]!)));

    // Real requests overlap in wall-clock time. Each patient gets a distinct check-in instant inside their own
    // window (their slot start), issued concurrently, so lock-acquisition order is arbitrary.
    await Promise.all(
      patients.map((patient, index) => run(patient, ids[index]!, "check_in", {}, slotAt(times[index]!))),
    );

    const positions = await Promise.all(ids.map(positionOf));
    expect([...positions].sort()).toEqual([1, 2, 3, 4, 5]);
    // FIFO by check-in instant, whatever order the transactions happened to commit in.
    expect(positions).toEqual([1, 2, 3, 4, 5]);
  });

  it("refuses to check in before the window opens and after the slot has ended", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    const id = await book(patient, doctor, "12:00"); // opens at 11:00

    await expect(run(patient, id, "check_in", {}, new Date("2030-01-07T10:59:00Z"))).rejects.toMatchObject({
      code: "CHECKIN_CLOSED",
    });
    await expect(run(patient, id, "check_in", {}, new Date("2030-01-07T12:31:00Z"))).rejects.toMatchObject({
      code: "CHECKIN_CLOSED",
    });
    expect(await positionOf(id)).toBeNull();
  });

  it("allows check-in exactly when the window opens", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    const id = await book(patient, doctor, "12:00");
    await expect(run(patient, id, "check_in", {}, new Date("2030-01-07T11:00:00Z"))).resolves.toEqual({
      status: "in_queue",
    });
  });
});

describe("start consultation", () => {
  it("removes the patient from the queue and closes the gap for everyone behind, pushing each new position", async () => {
    const doctor = await createDoctor();
    const [p1, p2, p3] = await Promise.all([createPatient(), createPatient(), createPatient()]);
    const [id1, id2, id3] = await queueUp(doctor, [p1, p2, p3], ["10:00", "10:30", "11:00"]);

    const p3Events: LiveEvent[] = [];
    const unsubscribe = sseBus.subscribe(p3.id, (event) => p3Events.push(event));

    // The doctor may see a patient out of order (e.g. urgent); the rest must re-number.
    await run(doctor, id2!, "start");
    unsubscribe();

    expect(await positionOf(id1!)).toBe(1);
    expect(await positionOf(id2!)).toBeNull();
    expect(await positionOf(id3!)).toBe(2);
    const started = await prisma.appointment.findUniqueOrThrow({ where: { id: id2! } });
    expect(started.status).toBe("in_progress");
    expect(started.startedAt).not.toBeNull();
    expect(p3Events).toContainEqual({
      type: "appointment.updated",
      appointmentId: id3,
      status: "in_queue",
      queuePosition: 2,
    });
  });

  it("does not let a doctor run two consultations at once", async () => {
    const doctor = await createDoctor();
    const [p1, p2] = await Promise.all([createPatient(), createPatient()]);
    const [id1, id2] = await queueUp(doctor, [p1, p2], ["10:00", "10:30"]);

    await run(doctor, id1!, "start");
    await expect(run(doctor, id2!, "start")).rejects.toMatchObject({ code: "DOCTOR_BUSY" });
    expect(await positionOf(id2!)).toBe(1);
  });

  it("lets only one of two simultaneous start requests succeed", async () => {
    const doctor = await createDoctor();
    const [p1, p2] = await Promise.all([createPatient(), createPatient()]);
    const [id1, id2] = await queueUp(doctor, [p1, p2], ["10:00", "10:30"]);

    const results = await Promise.allSettled([run(doctor, id1!, "start"), run(doctor, id2!, "start")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.appointment.count({ where: { doctorId: doctor.doctorId, status: "in_progress" } })).toBe(1);
  });

  it("cannot start a patient who has not checked in", async () => {
    const doctor = await createDoctor();
    const id = await book(await createPatient(), doctor, "10:00");
    await expect(run(doctor, id, "start")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});

describe("complete", () => {
  it("records notes and frees the doctor to start the next patient", async () => {
    const doctor = await createDoctor();
    const [p1, p2] = await Promise.all([createPatient(), createPatient()]);
    const [id1, id2] = await queueUp(doctor, [p1, p2], ["10:00", "10:30"]);

    await run(doctor, id1!, "start");
    await run(doctor, id1!, "complete", { notes: "Prescribed rest." });

    const done = await prisma.appointment.findUniqueOrThrow({ where: { id: id1! } });
    expect(done.status).toBe("completed");
    expect(done.notes).toBe("Prescribed rest.");
    expect(done.completedAt).not.toBeNull();
    await expect(run(doctor, id2!, "start")).resolves.toEqual({ status: "in_progress" });
  });
});

describe("cancel", () => {
  it("removes a queued patient, renumbers the rest and notifies the doctor", async () => {
    const doctor = await createDoctor();
    const [p1, p2, p3] = await Promise.all([createPatient("First"), createPatient("Second"), createPatient("Third")]);
    const [id1, id2, id3] = await queueUp(doctor, [p1, p2, p3], ["10:00", "10:30", "11:00"]);

    await run(p1, id1!, "cancel", { reason: "Feeling better" });

    const cancelled = await prisma.appointment.findUniqueOrThrow({ where: { id: id1! } });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.queuePosition).toBeNull();
    expect(cancelled.cancelledBy).toBe("patient");
    expect(await positionOf(id2!)).toBe(1);
    expect(await positionOf(id3!)).toBe(2);

    const note = await prisma.notification.findFirstOrThrow({
      where: { userId: doctor.id, type: "appointment_cancelled" },
    });
    expect(note.body).toContain("First");
    expect(note.body).toContain("Feeling better");
  });

  it("notifies the patient when the doctor cancels", async () => {
    const doctor = await createDoctor({ name: "Grace Hopper" });
    const patient = await createPatient();
    const id = await book(patient, doctor, "10:00");

    await run(doctor, id, "cancel", { reason: "Emergency" });

    const note = await prisma.notification.findFirstOrThrow({
      where: { userId: patient.id, type: "appointment_cancelled" },
    });
    expect(note.body).toContain("Grace Hopper");
    expect(note.body).toContain("Emergency");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id } })).cancelledBy).toBe("doctor");
  });

  it("cannot cancel a consultation that is already in progress or finished", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    const [id] = await queueUp(doctor, [patient], ["10:00"]);
    await run(doctor, id!, "start");
    await expect(run(patient, id!, "cancel")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await run(doctor, id!, "complete");
    await expect(run(doctor, id!, "cancel")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});

describe("authorization", () => {
  it("hides other people's appointments behind NOT_FOUND", async () => {
    const doctor = await createDoctor();
    const otherDoctor = await createDoctor();
    const owner = await createPatient();
    const stranger = await createPatient();
    const id = await book(owner, doctor, "10:00");

    await expect(run(stranger, id, "check_in")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(run(stranger, id, "cancel")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(run(otherDoctor, id, "cancel")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id } })).status).toBe("booked");
  });

  it("enforces which role may trigger which event", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    const id = await book(patient, doctor, "10:00");

    await expect(run(patient, id, "start")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(run(patient, id, "complete")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(run(doctor, id, "check_in")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const admin: Actor = { id: "admin-1", role: "admin", name: "Admin" };
    await expect(run(admin, id, "cancel")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects repeating an event that has already happened", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    const [id] = await queueUp(doctor, [patient], ["10:00"]);
    await expect(run(patient, id!, "check_in")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});

describe("consultation notes", () => {
  it("lets the treating doctor save notes once the patient is queued, and nobody else", async () => {
    const doctor = await createDoctor();
    const otherDoctor = await createDoctor();
    const patient = await createPatient();
    const booked = await book(patient, doctor, "10:00");

    // Not yet queued: nothing to annotate.
    await expect(saveConsultationNotes(doctor, { appointmentId: booked, notes: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await run(patient, booked, "check_in");
    await saveConsultationNotes(doctor, { appointmentId: booked, notes: "Allergic to penicillin" });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: booked } })).notes).toBe("Allergic to penicillin");

    await expect(saveConsultationNotes(otherDoctor, { appointmentId: booked, notes: "x" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(saveConsultationNotes(patient, { appointmentId: booked, notes: "x" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("ratings", () => {
  async function completed(doctor: TestDoctor, patient: TestPatient, time: string): Promise<string> {
    const [id] = await queueUp(doctor, [patient], [time]);
    await run(doctor, id!, "start");
    await run(doctor, id!, "complete");
    return id!;
  }

  it("averages ratings into the doctor's profile and blocks double voting", async () => {
    const doctor = await createDoctor();
    const [p1, p2] = await Promise.all([createPatient(), createPatient()]);
    const id1 = await completed(doctor, p1, "10:00");
    const id2 = await completed(doctor, p2, "10:30");

    await rateAppointment(p1, { appointmentId: id1, rating: 4 });
    await rateAppointment(p2, { appointmentId: id2, rating: 2 });

    const profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { id: doctor.doctorId } });
    expect(profile.rating).toBe(3);
    expect(profile.ratingCount).toBe(2);
    await expect(rateAppointment(p1, { appointmentId: id1, rating: 5 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("only allows the patient to rate, and only after completion", async () => {
    const doctor = await createDoctor();
    const patient = await createPatient();
    const stranger = await createPatient();
    const pending = await book(patient, doctor, "10:00");

    await expect(rateAppointment(patient, { appointmentId: pending, rating: 5 })).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
    const id = await completed(await createDoctor(), patient, "11:00");
    await expect(rateAppointment(stranger, { appointmentId: id, rating: 5 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
