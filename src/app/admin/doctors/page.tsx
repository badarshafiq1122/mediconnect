import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { config } from "@/lib/config";
import { requirePageUser } from "@/lib/session";
import { AdminDoctorCard } from "@/features/admin/components/admin-doctor-card";
import { CreateDoctorDialog } from "@/features/admin/components/create-doctor-dialog";
import { listDoctorsForAdmin } from "@/features/doctors/queries";

export const metadata: Metadata = { title: "Manage doctors" };

export default async function AdminDoctorsPage() {
  await requirePageUser("admin");
  const doctors = await listDoctorsForAdmin();

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Doctors"
        description="Add doctors, edit their profiles and weekly hours, and hide them from booking."
        actions={<CreateDoctorDialog />}
      />
      {doctors.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No doctors yet. Add the first one to open bookings.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Doctors">
          {doctors.map((doctor) => (
            <li key={doctor.id}>
              <AdminDoctorCard doctor={doctor} slotMinutes={config.slotMinutes} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
