import type { AppointmentStatus, NotificationType, Prisma } from "@prisma/client";
import { sseBus } from "@/lib/sse-bus";
import type { LiveEvent } from "@/lib/sse-events";
import { toNotificationDTO } from "@/features/notifications/dto";

/**
 * Transactional outbox, in memory: services collect events while the DB transaction runs and call
 * flushOutbox() only after it commits. A rolled-back transaction therefore never leaks a phantom event.
 */
export type OutboxItem = { userId: string; event: LiveEvent };
export type Outbox = OutboxItem[];

export function flushOutbox(outbox: Outbox): void {
  for (const item of outbox) sseBus.publish(item.userId, item.event);
}

export function appointmentUpdated(
  userId: string,
  appointment: { id: string; status: AppointmentStatus; queuePosition: number | null },
): OutboxItem {
  return {
    userId,
    event: {
      type: "appointment.updated",
      appointmentId: appointment.id,
      status: appointment.status,
      queuePosition: appointment.queuePosition,
    },
  };
}

/** Persists the notification inside the caller's transaction and returns the SSE item to flush afterwards. */
export async function createNotification(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    appointmentId: string;
  },
): Promise<OutboxItem> {
  const row = await tx.notification.create({ data: input });
  return { userId: input.userId, event: { type: "notification.created", notification: toNotificationDTO(row) } };
}
