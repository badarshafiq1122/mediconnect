"use client";

import Link from "next/link";
import { ClockIcon, MessageSquareIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ClinicTime } from "@/components/clinic-time";
import { AppointmentActions } from "@/features/appointments/components/appointment-actions";
import { QueueSummary } from "@/features/appointments/components/queue-summary";
import { StatusBadge } from "@/features/appointments/components/status-badge";
import type { AppointmentDTO } from "@/features/appointments/queries";

export function AppointmentCard({
  appointment,
  viewer,
  unread = 0,
}: {
  appointment: AppointmentDTO;
  viewer: "patient" | "doctor";
  unread?: number;
}) {
  const href = `/${viewer}/appointments/${appointment.id}`;
  const headline = viewer === "patient" ? appointment.doctor.name : appointment.patient.name;
  const subline = viewer === "patient" ? appointment.doctor.specialty : appointment.reason;

  return (
    <Card data-testid="appointment-card" data-status={appointment.status}>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-0.5">
            <Link href={href} className="font-medium hover:underline">
              {headline}
            </Link>
            {subline ? <p className="text-sm text-muted-foreground">{subline}</p> : null}
          </div>
          <StatusBadge status={appointment.status} />
        </div>

        <p className="flex items-center gap-1.5 text-sm">
          <ClockIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          <ClinicTime iso={appointment.slotStart} withZone />
        </p>

        <QueueSummary appointment={appointment} audience={viewer} />

        {viewer === "patient" && appointment.reason ? (
          <p className="text-sm text-muted-foreground">Reason: {appointment.reason}</p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <AppointmentActions appointment={appointment} viewer={viewer} detailHref={href} />
          <div className="flex items-center gap-3">
            {unread > 0 ? (
              <Badge variant="secondary" className="gap-1">
                <MessageSquareIcon aria-hidden="true" />
                {unread} new
              </Badge>
            ) : null}
            <Link href={href} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Details
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
