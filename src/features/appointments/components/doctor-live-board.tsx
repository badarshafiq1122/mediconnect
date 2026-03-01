"use client";

import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { ClinicTime } from "@/components/clinic-time";
import { StatTile } from "@/components/stat-tile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AppointmentCard } from "@/features/appointments/components/appointment-card";
import { useQueueSnapshot } from "@/features/appointments/components/hooks";
import { StatusBadge } from "@/features/appointments/components/status-badge";
import type { QueueSnapshot } from "@/features/appointments/queries";

/** The doctor's live working view: consultation in progress, the waiting room in order, and today's schedule. */
export function DoctorLiveBoard({
  initial,
  averageRating,
  ratingCount,
  unread,
}: {
  initial: QueueSnapshot;
  averageRating: number;
  ratingCount: number;
  unread: Record<string, number>;
}) {
  const { data } = useQueueSnapshot(initial);
  if (data.role !== "doctor") return null;

  const { today, waiting, inProgress } = data;
  const completed = today.filter((appointment) => appointment.status === "completed").length;

  return (
    <div className="grid gap-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Today's appointments" value={today.length} testId="stat-today" />
        <StatTile label="Waiting now" value={waiting.length} testId="stat-waiting" />
        <StatTile label="Completed today" value={completed} testId="stat-completed" />
        <StatTile
          label="Average rating"
          value={ratingCount === 0 ? "None yet" : averageRating.toFixed(1)}
          hint={ratingCount === 0 ? undefined : `${ratingCount} rating${ratingCount === 1 ? "" : "s"}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="in-consultation" className="grid content-start gap-3">
          <h2 id="in-consultation" className="text-lg font-semibold">
            In consultation
          </h2>
          {inProgress ? (
            <AppointmentCard appointment={inProgress} viewer="doctor" unread={unread[inProgress.id] ?? 0} />
          ) : (
            <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
              No consultation in progress. Start the next waiting patient when you&apos;re ready.
            </p>
          )}
        </section>

        <section aria-labelledby="waiting-room" className="grid content-start gap-3">
          <h2 id="waiting-room" className="flex items-center gap-2 text-lg font-semibold">
            Waiting room
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground" data-testid="waiting-count">
              {waiting.length}
            </span>
          </h2>
          {waiting.length === 0 ? (
            <div className="grid justify-items-start gap-2 rounded-xl border border-dashed p-5">
              <UsersIcon className="size-5 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Nobody is waiting. Patients appear here the moment they check in.</p>
            </div>
          ) : (
            <ol className="grid gap-3" data-testid="waiting-list">
              {waiting.map((appointment) => (
                <li key={appointment.id}>
                  <AppointmentCard appointment={appointment} viewer="doctor" unread={unread[appointment.id] ?? 0} />
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section aria-labelledby="today-schedule" className="grid gap-3">
        <h2 id="today-schedule" className="text-lg font-semibold">
          Today&apos;s schedule
        </h2>
        {today.length === 0 ? (
          <p className="text-sm text-muted-foreground">No appointments scheduled for today.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody data-testid="today-schedule">
                {today.map((appointment) => (
                  <TableRow key={appointment.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      <ClinicTime iso={appointment.slotStart} pattern="HH:mm" />
                    </TableCell>
                    <TableCell className="font-medium">{appointment.patient.name}</TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">{appointment.reason ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={appointment.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/doctor/appointments/${appointment.id}`}
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
