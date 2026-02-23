import type { Metadata } from "next";
import { ClinicTime } from "@/components/clinic-time";
import { PageHeader } from "@/components/page-header";
import { requirePageUser } from "@/lib/session";
import { DoctorLiveBoard } from "@/features/appointments/components/doctor-live-board";
import { getQueueSnapshot, getRecentPatients } from "@/features/appointments/queries";
import { getDoctorDetailByUserId } from "@/features/doctors/queries";
import { unreadCountsByAppointment } from "@/features/messaging/service";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DoctorDashboardPage() {
  const user = await requirePageUser("doctor");
  const [snapshot, profile, recent, unread] = await Promise.all([
    getQueueSnapshot(user),
    getDoctorDetailByUserId(user.id),
    getRecentPatients(user.id),
    unreadCountsByAppointment(user),
  ]);

  return (
    <div className="grid gap-8">
      <PageHeader
        title={user.name}
        description={profile ? `${profile.specialty} · your live schedule and waiting room` : "Your live schedule and waiting room"}
      />

      <DoctorLiveBoard
        initial={snapshot}
        averageRating={profile?.rating ?? 0}
        ratingCount={profile?.ratingCount ?? 0}
        unread={unread}
      />

      <section aria-labelledby="recent-patients" className="grid gap-3">
        <h2 id="recent-patients" className="text-lg font-semibold">
          Recent patients
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Patients you have completed consultations with will appear here.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((patient) => (
              <li key={patient.patientId} className="rounded-xl border bg-card p-4">
                <p className="font-medium">{patient.name}</p>
                <p className="text-sm text-muted-foreground">
                  {patient.visits} visit{patient.visits === 1 ? "" : "s"} · last seen{" "}
                  <ClinicTime iso={patient.lastVisit} pattern="d MMM yyyy" />
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
