import type { AppointmentDTO } from "@/features/appointments/queries";

/** "#2 in line · 1 ahead · about 30 min". Renders nothing unless the appointment is queued. */
export function QueueSummary({ appointment, audience }: { appointment: AppointmentDTO; audience: "patient" | "doctor" }) {
  const queue = appointment.queue;
  if (!queue) return null;

  const wait = queue.estimatedWaitMinutes === 0 ? "you're up next" : `about ${queue.estimatedWaitMinutes} min`;
  return (
    <p className="text-sm text-muted-foreground" data-testid="queue-summary">
      <span className="font-semibold text-foreground">#{queue.position}</span> in line
      {audience === "patient" ? (
        <>
          {" · "}
          {queue.ahead === 0 ? "no one ahead" : `${queue.ahead} ahead`}
          {" · "}
          {wait}
          {queue.doctorBusy ? " · doctor is with another patient" : ""}
        </>
      ) : null}
    </p>
  );
}
