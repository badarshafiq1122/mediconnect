import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { StatTile, formatFigure } from "@/components/stat-tile";
import { STATUS_LABEL } from "@/features/appointments/status";
import { StatusBadge } from "@/features/appointments/components/status-badge";
import { VolumeChart } from "@/features/admin/components/volume-chart";
import { getPlatformOverview } from "@/features/admin/queries";
import { requirePageUser } from "@/lib/session";

export const metadata: Metadata = { title: "Overview" };

const STATUS_ORDER = ["booked", "in_queue", "in_progress", "completed", "cancelled"] as const;

export default async function AdminOverviewPage() {
  await requirePageUser("admin");
  const overview = await getPlatformOverview();
  const { totals, byStatus, volume, topDoctors } = overview;
  const topMax = Math.max(...topDoctors.map((doctor) => doctor.appointments), 1);

  return (
    <div className="grid gap-8">
      <PageHeader title="Platform overview" description="Appointment volume and activity across every doctor." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Patients" value={formatFigure(totals.patients)} testId="stat-patients" />
        <StatTile
          label="Doctors"
          value={formatFigure(totals.doctors)}
          hint={`${totals.activeDoctors} active`}
          testId="stat-doctors"
        />
        <StatTile label="Appointments, all time" value={formatFigure(totals.appointments)} testId="stat-appointments" />
        <StatTile label="Appointments today" value={formatFigure(totals.appointmentsToday)} testId="stat-today" />
      </div>

      <section className="rounded-xl border bg-card p-4 sm:p-6" aria-label="Appointment volume">
        <VolumeChart data={volume} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="by-status" className="grid content-start gap-3 rounded-xl border bg-card p-4 sm:p-6">
          <h2 id="by-status" className="text-base font-semibold">
            By status
          </h2>
          <ul className="grid gap-2.5">
            {STATUS_ORDER.map((status) => {
              const count = byStatus[status];
              const share = totals.appointments === 0 ? 0 : Math.round((count / totals.appointments) * 100);
              return (
                <li key={status} className="flex items-center justify-between gap-3" data-testid={`status-${status}`}>
                  <StatusBadge status={status} />
                  <span className="text-sm text-muted-foreground tabular-nums">
                    <span className="font-semibold text-foreground">{formatFigure(count)}</span> · {share}%
                    <span className="sr-only"> of {STATUS_LABEL[status]} appointments</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="top-doctors" className="grid content-start gap-3 rounded-xl border bg-card p-4 sm:p-6">
          <div>
            <h2 id="top-doctors" className="text-base font-semibold">
              Busiest doctors
            </h2>
            <p className="text-sm text-muted-foreground">Appointments in the last 30 days, excluding cancellations.</p>
          </div>
          {topDoctors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No appointments in the last 30 days.</p>
          ) : (
            <ul className="grid gap-3">
              {topDoctors.map((doctor) => (
                <li key={doctor.doctorId} className="grid gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">
                      {doctor.name} <span className="font-normal text-muted-foreground">· {doctor.specialty}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{doctor.appointments}</span>
                  </div>
                  <div
                    role="img"
                    aria-label={`${doctor.appointments} appointments`}
                    className="h-2 rounded-r-[4px]"
                    style={{ width: `${(doctor.appointments / topMax) * 100}%`, background: "var(--series-1)" }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
