import { prisma } from "@/lib/prisma";
import type { NotificationDTO } from "@/lib/sse-events";
import { toNotificationDTO } from "@/features/notifications/dto";

export async function listNotifications(
  userId: string,
  limit = 20,
): Promise<{ items: NotificationDTO[]; unreadCount: number }> {
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items: rows.map(toNotificationDTO), unreadCount };
}

/** Marks the user's own notifications read (all of them when `ids` is omitted). Returns how many changed. */
export async function markNotificationsRead(userId: string, ids?: string[]): Promise<number> {
  const result = await prisma.notification.updateMany({
    // userId is part of the predicate, so a user can never mark someone else's notification.
    where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return result.count;
}
