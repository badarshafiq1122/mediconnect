import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

// Calendar dates travel as "YYYY-MM-DD" strings and wall-clock times as "HH:mm", both in the clinic timezone.
// Instants (Date) are only produced at the boundary via zonedTimeToInstant.

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseYmd(ymd: string): { year: number; month: number; day: number } {
  const match = YMD.exec(ymd);
  if (!match) throw new Error(`Invalid date "${ymd}", expected YYYY-MM-DD`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function parseHhmm(value: string): { hours: number; minutes: number } {
  const match = HHMM.exec(value);
  if (!match) throw new Error(`Invalid time "${value}", expected HH:mm`);
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

export function isValidHhmm(value: string): boolean {
  return HHMM.test(value);
}

export function minutesOfDay(hhmm: string): number {
  const { hours, minutes } = parseHhmm(hhmm);
  return hours * 60 + minutes;
}

export function formatHhmm(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Calendar date of an instant, as seen in the given timezone. */
export function toYmd(instant: Date, timeZone: string): string {
  return format(new TZDate(instant, timeZone), "yyyy-MM-dd");
}

export function addDaysToYmd(ymd: string, days: number): string {
  const { year, month, day } = parseYmd(ymd);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday for a calendar date (timezone independent). */
export function dayOfWeekOfYmd(ymd: string): number {
  const { year, month, day } = parseYmd(ymd);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** The UTC instant at which the wall clock in `timeZone` reads `ymd` `hhmm`. */
export function zonedTimeToInstant(ymd: string, hhmm: string, timeZone: string): Date {
  const { year, month, day } = parseYmd(ymd);
  const { hours, minutes } = parseHhmm(hhmm);
  return new Date(new TZDate(year, month - 1, day, hours, minutes, 0, 0, timeZone).getTime());
}

export function formatInZone(instant: Date | string, pattern: string, timeZone: string): string {
  return format(new TZDate(new Date(instant), timeZone), pattern);
}

export function zoneAbbreviation(instant: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(
    new Date(instant),
  );
  return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
