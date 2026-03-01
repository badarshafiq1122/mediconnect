"use client";

import Link from "next/link";
import { ArrowLeftIcon, ClockIcon, StethoscopeIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClinicTime } from "@/components/clinic-time";
import { AppointmentActions } from "@/features/appointments/components/appointment-actions";
import { useAppointmentDetail } from "@/features/appointments/components/hooks";
import { QueueBanner } from "@/features/appointments/components/queue-banner";
import { RatingForm } from "@/features/appointments/components/rating-form";
import type { AppointmentDetail } from "@/features/appointments/queries";
import { MessagingWidget } from "@/features/messaging/components/messaging-widget";

export function PatientAppointmentView({ initial }: { initial: AppointmentDetail }) {
  const { data } = useAppointmentDetail(initial.appointment.id, initial);
  const { appointment } = data;

  return (
    <div className="grid gap-6">
      <div>
        <Link
          href="/patient/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Back to dashboard
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Appointment with {appointment.doctor.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <StethoscopeIcon className="size-4" aria-hidden="true" />
            {appointment.doctor.specialty}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ClockIcon className="size-4" aria-hidden="true" />
            <ClinicTime iso={appointment.slotStart} pattern="EEEE d MMMM, HH:mm" withZone />
          </span>
        </p>
      </div>

      <QueueBanner appointment={appointment} viewer="patient" />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Doctor</dt>
                <dd>{appointment.doctor.name}</dd>
                <dt className="text-muted-foreground">Reason</dt>
                <dd>{appointment.reason ?? "Not provided"}</dd>
              </dl>
              <AppointmentActions appointment={appointment} viewer="patient" />
            </CardContent>
          </Card>

          {appointment.status === "completed" ? (
            <Card>
              <CardContent>
                <RatingForm appointmentId={appointment.id} rating={appointment.rating} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <MessagingWidget
          appointmentId={appointment.id}
          counterpartName={appointment.doctor.name}
          disabled={appointment.status === "cancelled"}
        />
      </div>
    </div>
  );
}
