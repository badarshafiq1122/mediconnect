import { describe, expect, it } from "vitest";
import {
  computeQueuePositions,
  diffPositions,
  estimateWaitMinutes,
  orderQueue,
  type QueueEntry,
} from "@/features/appointments/queue";

const entry = (id: string, checkedIn: string, slot = "2030-01-07T10:00:00Z"): QueueEntry => ({
  id,
  checkedInAt: new Date(checkedIn),
  slotStart: new Date(slot),
});

describe("queue ordering", () => {
  it("is first come, first served by check-in time", () => {
    const ordered = orderQueue([
      entry("late", "2030-01-07T09:50:00Z"),
      entry("early", "2030-01-07T09:40:00Z"),
      entry("middle", "2030-01-07T09:45:00Z"),
    ]);
    expect(ordered.map((e) => e.id)).toEqual(["early", "middle", "late"]);
  });

  it("breaks ties by earlier slot, then by id, so the order is deterministic", () => {
    const ordered = orderQueue([
      entry("b", "2030-01-07T09:40:00Z", "2030-01-07T10:30:00Z"),
      entry("z", "2030-01-07T09:40:00Z", "2030-01-07T10:00:00Z"),
      entry("a", "2030-01-07T09:40:00Z", "2030-01-07T10:00:00Z"),
    ]);
    expect(ordered.map((e) => e.id)).toEqual(["a", "z", "b"]);
  });

  it("does not mutate its input", () => {
    const input = [entry("b", "2030-01-07T09:50:00Z"), entry("a", "2030-01-07T09:40:00Z")];
    orderQueue(input);
    expect(input.map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("computeQueuePositions", () => {
  it("returns dense 1-based positions", () => {
    const positions = computeQueuePositions([
      entry("x", "2030-01-07T09:40:00Z"),
      entry("y", "2030-01-07T09:41:00Z"),
      entry("z", "2030-01-07T09:42:00Z"),
    ]);
    expect([...positions.entries()]).toEqual([
      ["x", 1],
      ["y", 2],
      ["z", 3],
    ]);
  });

  it("closes the gap when someone leaves the queue", () => {
    const all = [
      entry("x", "2030-01-07T09:40:00Z"),
      entry("y", "2030-01-07T09:41:00Z"),
      entry("z", "2030-01-07T09:42:00Z"),
    ];
    const afterLeaving = computeQueuePositions(all.filter((e) => e.id !== "x"));
    expect(afterLeaving.get("y")).toBe(1);
    expect(afterLeaving.get("z")).toBe(2);
  });

  it("handles an empty queue", () => {
    expect(computeQueuePositions([]).size).toBe(0);
  });
});

describe("diffPositions", () => {
  it("reports only the entries whose position changed", () => {
    const stored = new Map<string, number | null>([
      ["x", 1],
      ["y", 2],
      ["z", 3],
    ]);
    const computed = new Map([
      ["y", 1],
      ["z", 2],
    ]);
    expect(diffPositions(stored, computed)).toEqual([
      { id: "y", from: 2, to: 1 },
      { id: "z", from: 3, to: 2 },
    ]);
  });

  it("treats a missing stored position as a change", () => {
    expect(diffPositions(new Map(), new Map([["a", 1]]))).toEqual([{ id: "a", from: null, to: 1 }]);
  });
});

describe("estimateWaitMinutes", () => {
  it("is zero for the next patient when the doctor is free", () => {
    expect(estimateWaitMinutes({ position: 1, doctorBusy: false, slotMinutes: 30 })).toBe(0);
  });

  it("counts the consultation in progress and everyone ahead", () => {
    expect(estimateWaitMinutes({ position: 1, doctorBusy: true, slotMinutes: 30 })).toBe(30);
    expect(estimateWaitMinutes({ position: 3, doctorBusy: true, slotMinutes: 20 })).toBe(60);
  });

  it("never goes negative for a nonsensical position", () => {
    expect(estimateWaitMinutes({ position: 0, doctorBusy: false, slotMinutes: 30 })).toBe(0);
  });
});
