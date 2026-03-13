import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { messageLimiter } from "@/lib/rate-limit";
import { sanitizeMessageBody } from "@/lib/sanitize";
import { sseBus } from "@/lib/sse-bus";
import type { Actor } from "@/features/appointments/service";
import { MAX_MESSAGE_LENGTH } from "@/features/messaging/validation";

export type MessageDTO = {
  id: string;
  appointmentId: string;
  senderId: string;
  senderName: string;
  body: string;
  sentAt: string;
  readAt: string | null;
  mine: boolean;
};

const THREAD_LIMIT = 200;

const notFound = () => new AppError("NOT_FOUND", "Conversation not found.");

/** Only the appointment's patient and treating doctor may see or write to its thread. Admins cannot. */
async function loadThread(actor: Actor, appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, status: true, patientId: true, doctor: { select: { userId: true } } },
  });
  if (!appointment) throw notFound();

  const isPatient = actor.role === "patient" && actor.id === appointment.patientId;
  const isDoctor = actor.role === "doctor" && actor.id === appointment.doctor.userId;
  // Same error as "missing" so thread ids cannot be probed.
  if (!isPatient && !isDoctor) throw notFound();

  return {
    id: appointment.id,
    status: appointment.status,
    counterpartId: isPatient ? appointment.doctor.userId : appointment.patientId,
  };
}

type MessageRow = {
  id: string;
  appointmentId: string;
  senderId: string;
  body: string;
  sentAt: Date;
  readAt: Date | null;
  sender: { name: string };
};

function toDTO(row: MessageRow, viewerId: string): MessageDTO {
  return {
    id: row.id,
    appointmentId: row.appointmentId,
    senderId: row.senderId,
    senderName: row.sender.name,
    body: row.body,
    sentAt: row.sentAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
    mine: row.senderId === viewerId,
  };
}

const messageSelect = {
  id: true,
  appointmentId: true,
  senderId: true,
  body: true,
  sentAt: true,
  readAt: true,
  sender: { select: { name: true } },
} as const;

export async function listMessages(actor: Actor, appointmentId: string): Promise<MessageDTO[]> {
  await loadThread(actor, appointmentId);
  // Newest 200, returned oldest-first for rendering.
  const rows = await prisma.message.findMany({
    where: { appointmentId },
    select: messageSelect,
    orderBy: { sentAt: "desc" },
    take: THREAD_LIMIT,
  });
  return rows.reverse().map((row) => toDTO(row, actor.id));
}

export async function sendMessage(actor: Actor, input: { appointmentId: string; body: string }): Promise<MessageDTO> {
  const thread = await loadThread(actor, input.appointmentId);
  if (thread.status === "cancelled") {
    throw new AppError("CONFLICT", "Messaging is closed because this appointment was cancelled.");
  }

  // Sanitised here as well as in the Zod schema: the service is callable without the action layer.
  const body = sanitizeMessageBody(input.body);
  if (body.length === 0) throw new AppError("VALIDATION", "Write a message before sending.");
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new AppError("VALIDATION", `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`);
  }

  if (!messageLimiter.hit(actor.id).allowed) {
    throw new AppError("RATE_LIMITED", "You're sending messages too quickly. Please wait a moment.");
  }

  const row = await prisma.message.create({
    data: { appointmentId: thread.id, senderId: actor.id, body },
    select: messageSelect,
  });

  // After commit (the create above has returned). The sender is included so their other tabs stay in sync.
  const event = {
    type: "message.created" as const,
    appointmentId: thread.id,
    messageId: row.id,
    senderId: actor.id,
  };
  sseBus.publish(thread.counterpartId, event);
  sseBus.publish(actor.id, event);

  return toDTO(row, actor.id);
}

/** Marks the counterpart's messages as read by the viewer and lets the sender's UI show "Seen". */
export async function markThreadRead(actor: Actor, appointmentId: string): Promise<number> {
  const thread = await loadThread(actor, appointmentId);
  const result = await prisma.message.updateMany({
    where: { appointmentId: thread.id, senderId: { not: actor.id }, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count > 0) {
    sseBus.publish(thread.counterpartId, { type: "message.read", appointmentId: thread.id, readerId: actor.id });
  }
  return result.count;
}

/** Unread incoming message counts per appointment, for dashboard badges. */
export async function unreadCountsByAppointment(actor: Actor): Promise<Record<string, number>> {
  const grouped = await prisma.message.groupBy({
    by: ["appointmentId"],
    where: {
      readAt: null,
      senderId: { not: actor.id },
      appointment: { OR: [{ patientId: actor.id }, { doctor: { userId: actor.id } }] },
    },
    _count: { _all: true },
  });
  return Object.fromEntries(grouped.map((entry) => [entry.appointmentId, entry._count._all]));
}
