"use client";

import { useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";
import { useNow } from "@/hooks/use-now";
import { checkInAction, startConsultationAction } from "@/features/appointments/actions";
import { CancelDialog } from "@/features/appointments/components/cancel-dialog";
import { queryKeys } from "@/features/appointments/components/live-events-provider";
import type { AppointmentDTO } from "@/features/appointments/queries";
import { ClinicTime } from "@/components/clinic-time";

/** Role- and status-aware action buttons for one appointment. All rules are re-enforced server-side. */
export function AppointmentActions({
  appointment,
  viewer,
  detailHref,
}: {
  appointment: AppointmentDTO;
  viewer: "patient" | "doctor";
  /** When set, in-progress doctors get a link to the consultation page (where notes and completion live). */
  detailHref?: string;
}) {
  const [pending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const now = useNow();

  const opensAt = new Date(appointment.checkInOpensAt).getTime();
  const checkInEarly = now !== null && now < opensAt;

  function run(action: () => ReturnType<typeof checkInAction>, message: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(message);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.queue }),
        queryClient.invalidateQueries({ queryKey: queryKeys.appointment(appointment.id) }),
      ]);
    });
  }

  const { id, status } = appointment;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {viewer === "patient" && status === "booked" ? (
        <>
          <Button
            size="sm"
            disabled={pending || checkInEarly}
            onClick={() => run(() => checkInAction({ appointmentId: id }), "You're in the queue")}
          >
            {pending ? "Checking in…" : "Check in"}
          </Button>
          {checkInEarly ? (
            <span className="text-xs text-muted-foreground">
              Opens <ClinicTime iso={appointment.checkInOpensAt} pattern="HH:mm" />
            </span>
          ) : null}
        </>
      ) : null}

      {viewer === "doctor" && status === "in_queue" ? (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run(() => startConsultationAction({ appointmentId: id }), "Consultation started")}
        >
          {pending ? "Starting…" : "Start consultation"}
        </Button>
      ) : null}

      {viewer === "doctor" && status === "in_progress" && detailHref ? (
        <LinkButton size="sm" href={detailHref}>
          Open consultation
        </LinkButton>
      ) : null}

      {status === "booked" || status === "in_queue" ? (
        <CancelDialog
          appointmentId={id}
          audience={viewer}
          triggerLabel={status === "in_queue" && viewer === "patient" ? "Leave queue & cancel" : "Cancel"}
        />
      ) : null}
    </div>
  );
}
