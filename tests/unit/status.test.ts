import { describe, expect, it } from "vitest";
import type { AppointmentStatus } from "@prisma/client";
import {
  ACTIVE_STATUSES,
  canTransition,
  isActiveStatus,
  nextStatus,
  roleMayTrigger,
  type AppointmentEvent,
} from "@/features/appointments/status";

const STATUSES: AppointmentStatus[] = ["booked", "in_queue", "in_progress", "completed", "cancelled"];
const EVENTS: AppointmentEvent[] = ["check_in", "start", "complete", "cancel"];

const LEGAL: Record<string, AppointmentStatus> = {
  "booked:check_in": "in_queue",
  "booked:cancel": "cancelled",
  "in_queue:start": "in_progress",
  "in_queue:cancel": "cancelled",
  "in_progress:complete": "completed",
};

describe("appointment status transitions", () => {
  const pairs = STATUSES.flatMap((status) => EVENTS.map((event) => [status, event] as const));

  it.each(pairs)("%s + %s", (status, event) => {
    const expected = LEGAL[`${status}:${event}`] ?? null;
    expect(nextStatus(status, event)).toBe(expected);
    expect(canTransition(status, event)).toBe(expected !== null);
  });

  it("terminal states accept no events", () => {
    for (const event of EVENTS) {
      expect(nextStatus("completed", event)).toBeNull();
      expect(nextStatus("cancelled", event)).toBeNull();
    }
  });

  it("an in-progress consultation cannot be cancelled, only completed", () => {
    expect(canTransition("in_progress", "cancel")).toBe(false);
    expect(canTransition("in_progress", "complete")).toBe(true);
  });
});

describe("active statuses (mirror of the partial unique index predicate)", () => {
  it("covers exactly booked, in_queue and in_progress", () => {
    expect([...ACTIVE_STATUSES].sort()).toEqual(["booked", "in_progress", "in_queue"]);
    expect(isActiveStatus("completed")).toBe(false);
    expect(isActiveStatus("cancelled")).toBe(false);
  });
});

describe("role permissions", () => {
  it("patients check in and cancel but cannot start or complete", () => {
    expect(roleMayTrigger("patient", "check_in")).toBe(true);
    expect(roleMayTrigger("patient", "cancel")).toBe(true);
    expect(roleMayTrigger("patient", "start")).toBe(false);
    expect(roleMayTrigger("patient", "complete")).toBe(false);
  });

  it("doctors start, complete and cancel but cannot check a patient in", () => {
    expect(roleMayTrigger("doctor", "start")).toBe(true);
    expect(roleMayTrigger("doctor", "complete")).toBe(true);
    expect(roleMayTrigger("doctor", "cancel")).toBe(true);
    expect(roleMayTrigger("doctor", "check_in")).toBe(false);
  });

  it("admins have no lifecycle powers", () => {
    for (const event of EVENTS) expect(roleMayTrigger("admin", event)).toBe(false);
  });
});
