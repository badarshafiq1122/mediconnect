"use client";

import { useEffect, useState } from "react";

/**
 * Current time in ms, refreshed on an interval. Returns null until mounted so the server render and the first
 * client render agree (no hydration mismatch); callers treat null as "unknown".
 */
export function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
