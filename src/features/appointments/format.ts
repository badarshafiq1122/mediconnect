import { formatInZone, zoneAbbreviation } from "@/lib/time";

/** "Tue 7 Jan, 10:30 UTC" — used in notification copy and the UI so both always agree. */
export function describeSlot(slotStart: Date | string, timeZone: string): string {
  return `${formatInZone(slotStart, "EEE d MMM, HH:mm", timeZone)} ${zoneAbbreviation(slotStart, timeZone)}`;
}
