"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import type { AppointmentDetail, QueueSnapshot } from "@/features/appointments/queries";
import { queryKeys, useLiveRefetchInterval } from "@/features/appointments/components/live-events-provider";

/**
 * Role-aware queue snapshot. Seeded from the server render, then kept fresh by SSE-driven invalidation; if the
 * stream is down it polls every 30s (TanStack Query fallback).
 */
export function useQueueSnapshot(initial: QueueSnapshot) {
  const refetchInterval = useLiveRefetchInterval();
  return useQuery({
    queryKey: queryKeys.queue,
    queryFn: ({ signal }) => fetchJson<QueueSnapshot>("/api/queue", signal),
    initialData: initial,
    refetchInterval,
  });
}

export function useAppointmentDetail(appointmentId: string, initial: AppointmentDetail) {
  const refetchInterval = useLiveRefetchInterval();
  return useQuery({
    queryKey: queryKeys.appointment(appointmentId),
    queryFn: ({ signal }) => fetchJson<AppointmentDetail>(`/api/appointments/${appointmentId}`, signal),
    initialData: initial,
    refetchInterval,
  });
}
