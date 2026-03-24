"use client";

import { createContext, useContext, type ReactNode } from "react";
import { formatInZone, zoneAbbreviation } from "@/lib/time";

const ClinicTimeContext = createContext<string>("UTC");

/** Supplies the clinic timezone (a server-only env value) to client components. */
export function ClinicTimeProvider({ timeZone, children }: { timeZone: string; children: ReactNode }) {
  return <ClinicTimeContext.Provider value={timeZone}>{children}</ClinicTimeContext.Provider>;
}

export function useClinicTimeZone(): string {
  return useContext(ClinicTimeContext);
}

/** Formats an ISO instant in the clinic timezone, identically on server and client (no hydration drift). */
export function ClinicTime({ iso, pattern = "EEE d MMM, HH:mm", withZone = false }: { iso: string; pattern?: string; withZone?: boolean }) {
  const timeZone = useClinicTimeZone();
  return (
    <time dateTime={iso}>
      {formatInZone(iso, pattern, timeZone)}
      {withZone ? ` ${zoneAbbreviation(iso, timeZone)}` : ""}
    </time>
  );
}
