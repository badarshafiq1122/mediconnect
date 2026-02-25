import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/session";
import { DoctorAppointmentView } from "@/features/appointments/components/doctor-appointment-view";
import { getAppointmentDetail } from "@/features/appointments/queries";

export const metadata: Metadata = { title: "Consultation" };

export default async function DoctorAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser("doctor");
  const { id } = await params;
  const detail = await getAppointmentDetail(user, id);
  if (!detail) notFound();
  return <DoctorAppointmentView initial={detail} />;
}
