"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, ClockIcon, HistoryIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClinicTime } from "@/components/clinic-time";
import { completeConsultationAction, saveNotesAction } from "@/features/appointments/actions";
import { AppointmentActions } from "@/features/appointments/components/appointment-actions";
import { useAppointmentDetail } from "@/features/appointments/components/hooks";
import { queryKeys } from "@/features/appointments/components/live-events-provider";
import { QueueBanner } from "@/features/appointments/components/queue-banner";
import { StarRating } from "@/features/appointments/components/rating-form";
import type { AppointmentDetail } from "@/features/appointments/queries";
import { MessagingWidget } from "@/features/messaging/components/messaging-widget";

export function DoctorAppointmentView({ initial }: { initial: AppointmentDetail }) {
  const { data } = useAppointmentDetail(initial.appointment.id, initial);
  const { appointment, history } = data;
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  // Seeded once from the server; live refetches must never overwrite what the doctor is typing.
  const [notes, setNotes] = useState(initial.notes ?? "");

  const canWriteNotes = ["in_queue", "in_progress", "completed"].includes(appointment.status);

  function refresh() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.queue }),
      queryClient.invalidateQueries({ queryKey: queryKeys.appointment(appointment.id) }),
    ]);
  }

  function save() {
    startTransition(async () => {
      const result = await saveNotesAction({ appointmentId: appointment.id, notes });
      if (!result.ok) return void toast.error(result.error);
      toast.success("Notes saved");
      await refresh();
    });
  }

  function complete() {
    startTransition(async () => {
      const result = await completeConsultationAction({ appointmentId: appointment.id, notes });
      if (!result.ok) return void toast.error(result.error);
      toast.success("Consultation completed");
      await refresh();
    });
  }

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/doctor/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Back to dashboard
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{appointment.patient.name}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <ClockIcon className="size-4" aria-hidden="true" />
          <ClinicTime iso={appointment.slotStart} pattern="EEEE d MMMM, HH:mm" withZone />
        </p>
      </div>

      <QueueBanner appointment={appointment} viewer="doctor" />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visit</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Patient</dt>
                <dd>{appointment.patient.name}</dd>
                <dt className="text-muted-foreground">Reason</dt>
                <dd>{appointment.reason ?? "Not provided"}</dd>
                {appointment.rating !== null ? (
                  <>
                    <dt className="text-muted-foreground">Patient rating</dt>
                    <dd>
                      <StarRating value={appointment.rating} />
                    </dd>
                  </>
                ) : null}
              </dl>
              <AppointmentActions appointment={appointment} viewer="doctor" />
            </CardContent>
          </Card>

          {canWriteNotes ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Consultation notes</CardTitle>
                <CardDescription>Private to you. Notes are never shown to the patient.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Label htmlFor="notes" className="sr-only">
                  Consultation notes
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={7}
                  maxLength={5000}
                  placeholder="Symptoms, findings, prescriptions, follow-up…"
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={save} disabled={pending}>
                    Save notes
                  </Button>
                  {appointment.status === "in_progress" ? (
                    <Button onClick={complete} disabled={pending}>
                      {pending ? "Working…" : "Complete consultation"}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HistoryIcon className="size-4" aria-hidden="true" />
                Previous visits with this patient
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No earlier completed visits.</p>
              ) : (
                <ul className="grid gap-3" data-testid="visit-history">
                  {history.map((visit) => (
                    <li key={visit.id} className="grid gap-0.5 border-l-2 pl-3 text-sm">
                      <span className="font-medium">
                        <ClinicTime iso={visit.slotStart} pattern="d MMM yyyy" />
                        {visit.reason ? ` · ${visit.reason}` : ""}
                      </span>
                      <span className="whitespace-pre-wrap text-muted-foreground">{visit.notes ?? "No notes recorded."}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <MessagingWidget
          appointmentId={appointment.id}
          counterpartName={appointment.patient.name}
          disabled={appointment.status === "cancelled"}
        />
      </div>
    </div>
  );
}
