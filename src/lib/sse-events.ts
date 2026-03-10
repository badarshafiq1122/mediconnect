// Shared by the SSE route handler (server) and the EventSource hook (client). Type-only Prisma imports keep
// the Prisma runtime out of the client bundle.
import type { AppointmentStatus, NotificationType } from "@prisma/client";

export type NotificationDTO = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  appointmentId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type LiveEvent =
  | { type: "ready" }
  | {
      type: "appointment.updated";
      appointmentId: string;
      status: AppointmentStatus;
      queuePosition: number | null;
    }
  | { type: "notification.created"; notification: NotificationDTO }
  | { type: "message.created"; appointmentId: string; messageId: string; senderId: string }
  | { type: "message.read"; appointmentId: string; readerId: string };

export type LiveEventType = LiveEvent["type"];

export const LIVE_EVENT_TYPES: readonly LiveEventType[] = [
  "ready",
  "appointment.updated",
  "notification.created",
  "message.created",
  "message.read",
];

export function formatSseEvent(event: LiveEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
