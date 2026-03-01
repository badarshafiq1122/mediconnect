"use client";

import { ClinicTime } from "@/components/clinic-time";
import { QueueSummary } from "@/features/appointments/components/queue-summary";
import { StatusBadge } from "@/features/appointments/components/status-badge";
import type { AppointmentDTO } from "@/features/appointments/queries";

function message(appointment: AppointmentDTO, viewer: "patient" | "doctor") {
  const { status } = appointment;
  if (viewer === "patient") {
    switch (status) {
      case "booked":
        return (
          <>
            Check-in opens at <ClinicTime iso={appointment.checkInOpensAt} pattern="HH:mm" withZone />. Check in when you
            arrive to join the queue.
          </>
        );
      case "in_queue":
        return "You're in the queue. Keep this page open: your position updates live.";
      case "in_progress":
        return `Your consultation with ${appointment.doctor.name} is under way.`;
      case "completed":
        return "This consultation is complete.";
      case "cancelled":
        return "This appointment was cancelled.";
    }
  }
  switch (status) {
    case "booked":
      return "The patient has not checked in yet.";
    case "in_queue":
      return "The patient is waiting to be seen.";
    case "in_progress":
      return "Consultation in progress. Add notes below and complete it when you're done.";
    case "completed":
      return "This consultation is complete.";
    case "cancelled":
      return "This appointment was cancelled.";
  }
}

/** Live status header for the appointment page. `aria-live` announces queue changes to screen readers. */
export function QueueBanner({ appointment, viewer }: { appointment: AppointmentDTO; viewer: "patient" | "doctor" }) {
  const queued = appointment.status === "in_queue" && appointment.queue !== null;
  return (
    <section
      aria-live="polite"
      aria-label="Appointment status"
      data-testid="queue-banner"
      data-status={appointment.status}
      className="flex flex-wrap items-center justify-between gap-6 rounded-xl border bg-card p-5 sm:p-6"
    >
      <div className="grid max-w-prose gap-3">
        <StatusBadge status={appointment.status} className="w-fit" />
        <p className="text-base text-pretty">{message(appointment, viewer)}</p>
        <QueueSummary appointment={appointment} audience={viewer} />
      </div>
      {queued ? (
        <div className="text-right" aria-hidden="true">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Your position</p>
          <p className="text-6xl font-semibold leading-none" data-testid="queue-position">
            {appointment.queue!.position}
          </p>
        </div>
      ) : null}
    </section>
  );
}
