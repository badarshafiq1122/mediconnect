import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/session";
import { PatientAppointmentView } from "@/features/appointments/components/patient-appointment-view";
import { getAppointmentDetail } from "@/features/appointments/queries";

export const metadata: Metadata = { title: "Appointment" };

export default async function PatientAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser("patient");
  const { id } = await params;
  // Returns null for someone else's appointment, which renders the same 404 as a missing one.
  const detail = await getAppointmentDetail(user, id);
  if (!detail) notFound();
  return <PatientAppointmentView initial={detail} />;
}
