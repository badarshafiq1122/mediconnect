import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { requirePageUser } from "@/lib/session";
import { DAY_NAMES } from "@/lib/time";
import { getDoctorSlots } from "@/features/appointments/queries";
import { RatingLabel, initials } from "@/features/doctors/components/doctor-card";
import { SlotPicker } from "@/features/doctors/components/slot-picker";
import { getDoctorDetail } from "@/features/doctors/queries";

export const metadata: Metadata = { title: "Book a doctor" };

export default async function DoctorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageUser("patient");
  const { id } = await params;
  const doctor = await getDoctorDetail(id);
  if (!doctor) notFound();
  const days = await getDoctorSlots(doctor.id);

  return (
    <div className="grid gap-8">
      <div>
        <Link href="/patient/doctors" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          All doctors
        </Link>
        <div className="mt-4 flex items-start gap-4">
          <Avatar size="lg" className="size-14">
            <AvatarFallback className="text-base">{initials(doctor.name)}</AvatarFallback>
          </Avatar>
          <div className="grid gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{doctor.name}</h1>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">{doctor.specialty}</Badge>
              <RatingLabel rating={doctor.rating} count={doctor.ratingCount} />
            </div>
            <p className="max-w-prose text-sm text-muted-foreground">{doctor.bio || "No biography provided."}</p>
            <p className="text-xs text-muted-foreground">
              Regular hours:{" "}
              {doctor.availability.length === 0
                ? "none set"
                : doctor.availability
                    .map((window) => `${DAY_NAMES[window.dayOfWeek]!.slice(0, 3)} ${window.startTime}-${window.endTime}`)
                    .join(" · ")}
            </p>
          </div>
        </div>
      </div>

      <section aria-labelledby="book-heading" className="grid gap-4">
        <h2 id="book-heading" className="text-lg font-semibold">
          Choose a time
        </h2>
        <SlotPicker doctorId={doctor.id} doctorName={doctor.name} days={days} />
      </section>
    </div>
  );
}
