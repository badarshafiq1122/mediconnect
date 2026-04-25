import type { AppointmentStatus } from "@prisma/client";
import type { RoleName } from "@/lib/roles";

/** Statuses that occupy a slot. Mirrors the WHERE clause of the partial unique indexes in the migration. */
export const ACTIVE_STATUSES = ["booked", "in_queue", "in_progress"] as const satisfies readonly AppointmentStatus[];

export function isActiveStatus(status: AppointmentStatus): boolean {
  return (ACTIVE_STATUSES as readonly AppointmentStatus[]).includes(status);
}

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: "Booked",
  in_queue: "In queue",
  in_progress: "In consultation",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type AppointmentEvent = "check_in" | "start" | "complete" | "cancel";

// The single source of truth for lifecycle rules. Every mutation goes through nextStatus().
const TRANSITIONS: Record<AppointmentStatus, Partial<Record<AppointmentEvent, AppointmentStatus>>> = {
  booked: { check_in: "in_queue", cancel: "cancelled" },
  in_queue: { start: "in_progress", cancel: "cancelled" },
  in_progress: { complete: "completed" },
  completed: {},
  cancelled: {},
};

export function nextStatus(current: AppointmentStatus, event: AppointmentEvent): AppointmentStatus | null {
  return TRANSITIONS[current][event] ?? null;
}

export function canTransition(current: AppointmentStatus, event: AppointmentEvent): boolean {
  return nextStatus(current, event) !== null;
}

/** Which lifecycle events each role may trigger (ownership is checked separately, per appointment). */
export const ROLE_EVENTS: Record<RoleName, readonly AppointmentEvent[]> = {
  patient: ["check_in", "cancel"],
  doctor: ["start", "complete", "cancel"],
  admin: [],
};

export function roleMayTrigger(role: RoleName, event: AppointmentEvent): boolean {
  return ROLE_EVENTS[role].includes(event);
}
