import type { Notification } from "@prisma/client";
import type { NotificationDTO } from "@/lib/sse-events";

export function toNotificationDTO(row: Notification): NotificationDTO {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    appointmentId: row.appointmentId,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
