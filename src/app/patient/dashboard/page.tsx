import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/link-button";
import { PageHeader } from "@/components/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { config } from "@/lib/config";
import { formatInZone } from "@/lib/time";
import { requirePageUser } from "@/lib/session";
import { LiveAppointments } from "@/features/appointments/components/live-appointments";
import { StatusBadge } from "@/features/appointments/components/status-badge";
import { getPatientHistory, getQueueSnapshot } from "@/features/appointments/queries";
import { unreadCountsByAppointment } from "@/features/messaging/service";

export const metadata: Metadata = { title: "Dashboard" };

export default async function PatientDashboardPage() {
  const user = await requirePageUser("patient");
  const [snapshot, history, unread] = await Promise.all([
    getQueueSnapshot(user),
    getPatientHistory(user.id),
    unreadCountsByAppointment(user),
  ]);
  const firstName = user.name.split(" ")[0] ?? user.name;

  return (
    <div className="grid gap-8">
      <PageHeader
        title={`Hello, ${firstName}`}
        description="Your upcoming appointments and live queue status."
        actions={<LinkButton href="/patient/doctors">Find a doctor</LinkButton>}
      />

      <section aria-labelledby="upcoming-heading" className="grid gap-3">
        <h2 id="upcoming-heading" className="text-lg font-semibold">
          Upcoming
        </h2>
        <LiveAppointments initial={snapshot} unread={unread} />
      </section>

      <section aria-labelledby="history-heading" className="grid gap-3">
        <h2 id="history-heading" className="text-lg font-semibold">
          Past appointments
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Completed and cancelled appointments will appear here.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((appointment) => (
                  <TableRow key={appointment.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatInZone(appointment.slotStart, "EEE d MMM yyyy, HH:mm", config.clinicTimezone)}
                    </TableCell>
                    <TableCell>
                      {appointment.doctor.name}
                      <span className="block text-xs text-muted-foreground">{appointment.doctor.specialty}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={appointment.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/patient/appointments/${appointment.id}`}
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {appointment.status === "completed" && appointment.rating === null ? "Rate visit" : "View"}
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
