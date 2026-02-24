import type { Metadata } from "next";
import Link from "next/link";
import { ClinicTime } from "@/components/clinic-time";
import { PageHeader } from "@/components/page-header";
import { config } from "@/lib/config";
import { requirePageUser } from "@/lib/session";
import { formatInZone } from "@/lib/time";
import { StatusBadge } from "@/features/appointments/components/status-badge";
import { getDoctorUpcoming } from "@/features/appointments/queries";
import { AvailabilityEditor } from "@/features/doctors/components/availability-editor";
import { getDoctorDetailByUserId } from "@/features/doctors/queries";

export const metadata: Metadata = { title: "Schedule" };

export default async function DoctorSchedulePage() {
  const user = await requirePageUser("doctor");
  const [upcoming, profile] = await Promise.all([getDoctorUpcoming(user.id, 7), getDoctorDetailByUserId(user.id)]);

  const byDay = new Map<string, typeof upcoming>();
  for (const appointment of upcoming) {
    const day = formatInZone(appointment.slotStart, "yyyy-MM-dd", config.clinicTimezone);
    byDay.set(day, [...(byDay.get(day) ?? []), appointment]);
  }

  return (
    <div className="grid gap-10">
      <PageHeader title="Schedule" description="Your next seven days, and the weekly hours patients can book." />

      <section aria-labelledby="upcoming-week" className="grid gap-4">
        <h2 id="upcoming-week" className="text-lg font-semibold">
          Next 7 days
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No appointments booked for the coming week.</p>
        ) : (
          [...byDay.entries()].map(([day, appointments]) => (
            <div key={day} className="grid gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                <ClinicTime iso={appointments[0]!.slotStart} pattern="EEEE d MMMM" />
              </h3>
              <ul className="grid gap-2" data-testid="schedule-day">
                {appointments.map((appointment) => (
                  <li key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
                    <div className="flex items-center gap-4">
                      <span className="w-12 text-sm font-medium tabular-nums">
                        <ClinicTime iso={appointment.slotStart} pattern="HH:mm" />
                      </span>
                      <div>
                        <p className="text-sm font-medium">{appointment.patient.name}</p>
                        <p className="text-xs text-muted-foreground">{appointment.reason ?? "No reason given"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={appointment.status} />
                      <Link
                        href={`/doctor/appointments/${appointment.id}`}
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Open
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section aria-labelledby="weekly-hours" className="grid gap-4">
        <h2 id="weekly-hours" className="text-lg font-semibold">
          Weekly availability
        </h2>
        <div className="rounded-xl border bg-card p-4 sm:p-6">
          <AvailabilityEditor initial={profile?.availability ?? []} slotMinutes={config.slotMinutes} />
        </div>
      </section>
    </div>
  );
}
