import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { sseBus } from "@/lib/sse-bus";
import type { LiveEvent } from "@/lib/sse-events";
import { bookAppointment, transitionAppointment, type Actor } from "@/features/appointments/service";
import { listMessages, markThreadRead, sendMessage, unreadCountsByAppointment } from "@/features/messaging/service";
import { sendMessageSchema } from "@/features/messaging/validation";
import { NOW, createDoctor, createPatient, resetDatabase, slotAt } from "./helpers/factories";

beforeEach(resetDatabase);

async function setup() {
  const doctor = await createDoctor({ name: "Grace Hopper" });
  const patient = await createPatient("Ada Lovelace");
  const { id } = await bookAppointment(patient, { doctorId: doctor.doctorId, slotStart: slotAt("10:00") }, NOW);
  return { doctor, patient, appointmentId: id };
}

describe("sendMessage / listMessages", () => {
  it("lets both participants converse in order, with `mine` resolved per viewer", async () => {
    const { doctor, patient, appointmentId } = await setup();
    await sendMessage(patient, { appointmentId, body: "Hello doctor" });
    await sendMessage(doctor, { appointmentId, body: "Hello, how can I help?" });

    const asPatient = await listMessages(patient, appointmentId);
    expect(asPatient.map((m) => [m.body, m.mine, m.senderName])).toEqual([
      ["Hello doctor", true, "Ada Lovelace"],
      ["Hello, how can I help?", false, "Grace Hopper"],
    ]);
    const asDoctor = await listMessages(doctor, appointmentId);
    expect(asDoctor.map((m) => m.mine)).toEqual([false, true]);
  });

  it("strips markup before storing, so the database never holds a script tag", async () => {
    const { patient, appointmentId } = await setup();
    await sendMessage(patient, { appointmentId, body: "<script>alert(1)</script>Hi <b>there</b>" });
    const stored = await prisma.message.findFirstOrThrow();
    expect(stored.body).toBe("alert(1)Hi there");
    expect(stored.body).not.toMatch(/<|>/);
  });

  it("rejects empty, markup-only and over-long messages", async () => {
    const { patient, appointmentId } = await setup();
    await expect(sendMessage(patient, { appointmentId, body: "   " })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(sendMessage(patient, { appointmentId, body: "<div></div>" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(sendMessage(patient, { appointmentId, body: "x".repeat(2001) })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.message.count()).toBe(0);
  });

  it("delivers a live event to the other participant and to the sender's other tabs", async () => {
    const { doctor, patient, appointmentId } = await setup();
    const doctorEvents: LiveEvent[] = [];
    const patientEvents: LiveEvent[] = [];
    const unsubscribe = [
      sseBus.subscribe(doctor.id, (e) => doctorEvents.push(e)),
      sseBus.subscribe(patient.id, (e) => patientEvents.push(e)),
    ];
    const sent = await sendMessage(patient, { appointmentId, body: "ping" });
    unsubscribe.forEach((fn) => fn());

    const expected = { type: "message.created", appointmentId, messageId: sent.id, senderId: patient.id };
    expect(doctorEvents).toContainEqual(expected);
    expect(patientEvents).toContainEqual(expected);
  });

  it("refuses messages on a cancelled appointment", async () => {
    const { patient, appointmentId } = await setup();
    await transitionAppointment(patient, { appointmentId, event: "cancel" }, NOW);
    await expect(sendMessage(patient, { appointmentId, body: "hello?" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rate-limits a user who floods a thread", async () => {
    const { patient, appointmentId } = await setup();
    for (let i = 0; i < 30; i += 1) await sendMessage(patient, { appointmentId, body: `message ${i}` });
    await expect(sendMessage(patient, { appointmentId, body: "one too many" })).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    expect(await prisma.message.count()).toBe(30);
  });
});

describe("thread privacy", () => {
  it("hides the thread from other patients, other doctors and admins behind NOT_FOUND", async () => {
    const { patient, appointmentId } = await setup();
    await sendMessage(patient, { appointmentId, body: "private symptoms" });

    const strangerPatient = await createPatient();
    const otherDoctor = await createDoctor();
    const admin: Actor = { id: "admin-1", role: "admin", name: "Admin" };

    for (const intruder of [strangerPatient, otherDoctor, admin]) {
      await expect(listMessages(intruder, appointmentId)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(sendMessage(intruder, { appointmentId, body: "let me in" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(markThreadRead(intruder, appointmentId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(await prisma.message.count()).toBe(1);
  });

  it("treats an unknown appointment exactly like a forbidden one", async () => {
    const patient = await createPatient();
    await expect(listMessages(patient, "missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("read receipts and unread counts", () => {
  it("marks only the counterpart's messages as read and tells the sender", async () => {
    const { doctor, patient, appointmentId } = await setup();
    await sendMessage(patient, { appointmentId, body: "from patient" });
    await sendMessage(doctor, { appointmentId, body: "from doctor" });

    const patientEvents: LiveEvent[] = [];
    const unsubscribe = sseBus.subscribe(patient.id, (e) => patientEvents.push(e));
    expect(await markThreadRead(doctor, appointmentId)).toBe(1);
    unsubscribe();

    const rows = await prisma.message.findMany({ orderBy: { sentAt: "asc" } });
    expect(rows.map((r) => [r.body, r.readAt !== null])).toEqual([
      ["from patient", true],
      ["from doctor", false],
    ]);
    expect(patientEvents).toContainEqual({ type: "message.read", appointmentId, readerId: doctor.id });
    // Idempotent: nothing left to mark, and no further event.
    expect(await markThreadRead(doctor, appointmentId)).toBe(0);
  });

  it("counts unread incoming messages per appointment", async () => {
    const { doctor, patient, appointmentId } = await setup();
    await sendMessage(doctor, { appointmentId, body: "one" });
    await sendMessage(doctor, { appointmentId, body: "two" });
    await sendMessage(patient, { appointmentId, body: "mine, not counted" });

    expect(await unreadCountsByAppointment(patient)).toEqual({ [appointmentId]: 2 });
    expect(await unreadCountsByAppointment(doctor)).toEqual({ [appointmentId]: 1 });
    await markThreadRead(patient, appointmentId);
    expect(await unreadCountsByAppointment(patient)).toEqual({});
  });
});

describe("sendMessageSchema", () => {
  it("cleans the body and rejects what is empty after cleaning", () => {
    expect(sendMessageSchema.parse({ appointmentId: "a1", body: "  <i>hi</i>  " }).body).toBe("hi");
    expect(sendMessageSchema.safeParse({ appointmentId: "a1", body: "<b></b>" }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ appointmentId: "a1", body: "x".repeat(2001) }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ body: "no appointment" }).success).toBe(false);
  });
});
