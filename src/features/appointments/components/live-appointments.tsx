"use client";

import { CalendarPlusIcon } from "lucide-react";
import { LinkButton } from "@/components/link-button";
import { AppointmentCard } from "@/features/appointments/components/appointment-card";
import { useQueueSnapshot } from "@/features/appointments/components/hooks";
import type { QueueSnapshot } from "@/features/appointments/queries";

/** The patient's active appointments; statuses and queue positions update live. */
export function LiveAppointments({
  initial,
  unread,
}: {
  initial: QueueSnapshot;
  unread: Record<string, number>;
}) {
  const { data } = useQueueSnapshot(initial);
  const appointments = data.role === "patient" ? data.appointments : [];

  if (appointments.length === 0) {
    return (
      <div className="grid justify-items-start gap-3 rounded-xl border border-dashed p-6">
        <CalendarPlusIcon className="size-6 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="font-medium">No upcoming appointments</p>
          <p className="text-sm text-muted-foreground">Find a doctor and book an open slot in a few clicks.</p>
        </div>
        <LinkButton href="/patient/doctors">Find a doctor</LinkButton>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {appointments.map((appointment) => (
        <AppointmentCard
          key={appointment.id}
          appointment={appointment}
          viewer="patient"
          unread={unread[appointment.id] ?? 0}
        />
      ))}
    </div>
  );
}
