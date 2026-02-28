import {
  addDaysToYmd,
  dayOfWeekOfYmd,
  formatHhmm,
  minutesOfDay,
  toYmd,
  zonedTimeToInstant,
} from "@/lib/time";

// Pure slot arithmetic: no database, no clock, no environment. Everything is passed in so it is unit-testable.

export type AvailabilityWindow = { dayOfWeek: number; startTime: string; endTime: string };

export type SlotPolicy = {
  slotMinutes: number;
  /** Slots starting sooner than this many minutes from `now` cannot be booked. */
  leadMinutes: number;
  timeZone: string;
};

export type Slot = { start: Date; end: Date; available: boolean };
export type DaySlots = { date: string; dayOfWeek: number; slots: Slot[] };

const MS_PER_MINUTE = 60_000;

/** All slot boundaries produced by the doctor's windows on one calendar day, sorted and de-duplicated. */
function slotsForDay(
  windows: readonly AvailabilityWindow[],
  ymd: string,
  policy: SlotPolicy,
): { start: Date; end: Date }[] {
  const dayOfWeek = dayOfWeekOfYmd(ymd);
  const seen = new Set<number>();
  const slots: { start: Date; end: Date }[] = [];

  for (const window of windows) {
    if (window.dayOfWeek !== dayOfWeek) continue;
    const windowEnd = minutesOfDay(window.endTime);
    for (
      let minute = minutesOfDay(window.startTime);
      minute + policy.slotMinutes <= windowEnd;
      minute += policy.slotMinutes
    ) {
      const start = zonedTimeToInstant(ymd, formatHhmm(minute), policy.timeZone);
      if (seen.has(start.getTime())) continue;
      seen.add(start.getTime());
      slots.push({ start, end: new Date(start.getTime() + policy.slotMinutes * MS_PER_MINUTE) });
    }
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Bookable-slot calendar for the next `days` days starting at today (in the clinic timezone).
 * Past slots are omitted; slots that are taken or inside the lead-time are returned with available=false.
 */
export function generateSlots(input: {
  windows: readonly AvailabilityWindow[];
  policy: SlotPolicy;
  now: Date;
  days: number;
  /** Epoch ms of slot starts already held by a live appointment. */
  takenStarts: ReadonlySet<number>;
}): DaySlots[] {
  const { windows, policy, now, days, takenStarts } = input;
  const earliestBookable = now.getTime() + policy.leadMinutes * MS_PER_MINUTE;
  const today = toYmd(now, policy.timeZone);
  const result: DaySlots[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const ymd = addDaysToYmd(today, offset);
    const slots = slotsForDay(windows, ymd, policy)
      .filter((slot) => slot.start.getTime() >= now.getTime())
      .map((slot) => ({
        ...slot,
        available: slot.start.getTime() >= earliestBookable && !takenStarts.has(slot.start.getTime()),
      }));
    if (slots.length > 0) result.push({ date: ymd, dayOfWeek: dayOfWeekOfYmd(ymd), slots });
  }
  return result;
}

/**
 * Is `slotStart` exactly one of the doctor's slot boundaries, and far enough in the future?
 * This validates the *request*; whether the slot is still free is decided only by the database constraint.
 */
export function isBookableSlot(
  windows: readonly AvailabilityWindow[],
  slotStart: Date,
  policy: SlotPolicy,
  now: Date,
): boolean {
  if (Number.isNaN(slotStart.getTime())) return false;
  if (slotStart.getTime() < now.getTime() + policy.leadMinutes * MS_PER_MINUTE) return false;
  const ymd = toYmd(slotStart, policy.timeZone);
  return slotsForDay(windows, ymd, policy).some((slot) => slot.start.getTime() === slotStart.getTime());
}

export function slotEndFor(slotStart: Date, slotMinutes: number): Date {
  return new Date(slotStart.getTime() + slotMinutes * MS_PER_MINUTE);
}

// --- Overlap logic ------------------------------------------------------------

/** Half-open interval overlap: [aStart, aEnd) vs [bStart, bEnd). Touching ranges do not overlap. */
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** First pair of windows on the same weekday that overlap, or null. Used to validate availability edits. */
export function findOverlappingWindows(
  windows: readonly AvailabilityWindow[],
): [AvailabilityWindow, AvailabilityWindow] | null {
  for (let i = 0; i < windows.length; i += 1) {
    for (let j = i + 1; j < windows.length; j += 1) {
      const a = windows[i]!;
      const b = windows[j]!;
      if (a.dayOfWeek !== b.dayOfWeek) continue;
      if (rangesOverlap(minutesOfDay(a.startTime), minutesOfDay(a.endTime), minutesOfDay(b.startTime), minutesOfDay(b.endTime))) {
        return [a, b];
      }
    }
  }
  return null;
}
