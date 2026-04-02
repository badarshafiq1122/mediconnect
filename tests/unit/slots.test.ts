import { describe, expect, it } from "vitest";
import {
  findOverlappingWindows,
  generateSlots,
  isBookableSlot,
  rangesOverlap,
  type AvailabilityWindow,
  type SlotPolicy,
} from "@/features/appointments/slots";

const UTC: SlotPolicy = { slotMinutes: 30, leadMinutes: 15, timeZone: "UTC" };
const MONDAY = 1;
const at = (iso: string) => new Date(iso);
const mondayMorning: AvailabilityWindow[] = [{ dayOfWeek: MONDAY, startTime: "09:00", endTime: "11:00" }];

const starts = (days: ReturnType<typeof generateSlots>) =>
  days.flatMap((day) => day.slots.map((slot) => slot.start.toISOString()));

describe("generateSlots", () => {
  it("cuts a window into consecutive slots and drops a trailing partial slot", () => {
    const days = generateSlots({
      windows: [{ dayOfWeek: MONDAY, startTime: "09:00", endTime: "10:20" }],
      policy: UTC,
      now: at("2030-01-07T08:00:00Z"),
      days: 1,
      takenStarts: new Set(),
    });
    expect(starts(days)).toEqual(["2030-01-07T09:00:00.000Z", "2030-01-07T09:30:00.000Z"]);
  });

  it("only returns days that have availability", () => {
    const days = generateSlots({
      windows: mondayMorning,
      policy: UTC,
      now: at("2030-01-07T08:00:00Z"),
      days: 8,
      takenStarts: new Set(),
    });
    expect(days.map((day) => day.date)).toEqual(["2030-01-07", "2030-01-14"]);
  });

  it("marks taken slots unavailable but keeps them visible", () => {
    const taken = new Set([at("2030-01-07T09:30:00Z").getTime()]);
    const [day] = generateSlots({ windows: mondayMorning, policy: UTC, now: at("2030-01-07T08:00:00Z"), days: 1, takenStarts: taken });
    expect(day!.slots.map((slot) => slot.available)).toEqual([true, false, true, true]);
  });

  it("omits past slots and disables slots inside the lead time", () => {
    const [day] = generateSlots({
      windows: mondayMorning,
      policy: UTC,
      now: at("2030-01-07T09:50:00Z"),
      days: 1,
      takenStarts: new Set(),
    });
    // 09:00 and 09:30 are past. 10:00 is 10 min away (< 15 lead) so it is shown but disabled. 10:30 is bookable.
    expect(day!.slots.map((slot) => [slot.start.toISOString().slice(11, 16), slot.available])).toEqual([
      ["10:00", false],
      ["10:30", true],
    ]);
  });

  it("de-duplicates overlapping windows instead of double-listing a slot", () => {
    const days = generateSlots({
      windows: [
        { dayOfWeek: MONDAY, startTime: "09:00", endTime: "10:00" },
        { dayOfWeek: MONDAY, startTime: "09:30", endTime: "10:30" },
      ],
      policy: UTC,
      now: at("2030-01-07T08:00:00Z"),
      days: 1,
      takenStarts: new Set(),
    });
    expect(starts(days)).toEqual([
      "2030-01-07T09:00:00.000Z",
      "2030-01-07T09:30:00.000Z",
      "2030-01-07T10:00:00.000Z",
    ]);
  });

  it("interprets windows in the clinic timezone (New York is UTC-5 in January)", () => {
    const ny: SlotPolicy = { ...UTC, timeZone: "America/New_York" };
    const days = generateSlots({
      windows: [{ dayOfWeek: MONDAY, startTime: "09:00", endTime: "09:30" }],
      policy: ny,
      // 07:00 on Monday morning in New York; UTC midnight would still be Sunday evening there.
      now: at("2030-01-07T12:00:00Z"),
      days: 1,
      takenStarts: new Set(),
    });
    expect(starts(days)).toEqual(["2030-01-07T14:00:00.000Z"]);
  });

  it("follows daylight saving time (New York is UTC-4 after 10 March 2030)", () => {
    const ny: SlotPolicy = { ...UTC, timeZone: "America/New_York" };
    const days = generateSlots({
      windows: [{ dayOfWeek: MONDAY, startTime: "09:00", endTime: "09:30" }],
      policy: ny,
      now: at("2030-03-11T10:00:00Z"),
      days: 1,
      takenStarts: new Set(),
    });
    expect(starts(days)).toEqual(["2030-03-11T13:00:00.000Z"]);
  });
});

describe("isBookableSlot", () => {
  const now = at("2030-01-07T08:00:00Z");

  it("accepts an exact slot boundary inside a window", () => {
    expect(isBookableSlot(mondayMorning, at("2030-01-07T10:30:00Z"), UTC, now)).toBe(true);
  });

  it.each([
    ["off the slot grid", "2030-01-07T09:10:00Z"],
    ["before the window opens", "2030-01-07T08:30:00Z"],
    ["the slot that would overrun the window", "2030-01-07T11:00:00Z"],
    ["on a weekday with no availability", "2030-01-08T09:00:00Z"],
  ])("rejects %s", (_label, iso) => {
    expect(isBookableSlot(mondayMorning, at(iso), UTC, now)).toBe(false);
  });

  it("rejects slots inside the lead time and in the past", () => {
    const nearNow = at("2030-01-07T08:55:00Z");
    expect(isBookableSlot(mondayMorning, at("2030-01-07T09:00:00Z"), UTC, nearNow)).toBe(false);
    expect(isBookableSlot(mondayMorning, at("2030-01-07T09:00:00Z"), UTC, at("2030-01-07T09:30:00Z"))).toBe(false);
  });

  it("rejects an invalid date", () => {
    expect(isBookableSlot(mondayMorning, new Date("nope"), UTC, now)).toBe(false);
  });
});

describe("overlap detection", () => {
  it("treats ranges as half-open so back-to-back ranges do not overlap", () => {
    expect(rangesOverlap(0, 30, 30, 60)).toBe(false);
    expect(rangesOverlap(0, 31, 30, 60)).toBe(true);
    expect(rangesOverlap(10, 20, 0, 100)).toBe(true);
  });

  it("finds overlapping windows on the same day only", () => {
    const a: AvailabilityWindow = { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" };
    const b: AvailabilityWindow = { dayOfWeek: 1, startTime: "11:00", endTime: "13:00" };
    const c: AvailabilityWindow = { dayOfWeek: 2, startTime: "11:00", endTime: "13:00" };
    const touching: AvailabilityWindow = { dayOfWeek: 1, startTime: "12:00", endTime: "13:00" };
    expect(findOverlappingWindows([a, b])).toEqual([a, b]);
    expect(findOverlappingWindows([a, c])).toBeNull();
    expect(findOverlappingWindows([a, touching])).toBeNull();
  });
});
