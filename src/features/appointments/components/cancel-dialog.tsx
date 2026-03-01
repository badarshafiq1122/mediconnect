"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelAppointmentAction } from "@/features/appointments/actions";
import { queryKeys } from "@/features/appointments/components/live-events-provider";

export function CancelDialog({
  appointmentId,
  audience,
  triggerLabel = "Cancel",
}: {
  appointmentId: string;
  audience: "patient" | "doctor";
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  function confirm() {
    startTransition(async () => {
      const result = await cancelAppointmentAction({ appointmentId, reason });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Appointment cancelled");
      setOpen(false);
      setReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.queue }),
        queryClient.invalidateQueries({ queryKey: queryKeys.appointment(appointmentId) }),
      ]);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="text-destructive" />}>
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this appointment?</DialogTitle>
          <DialogDescription>
            {audience === "patient"
              ? "Your slot is released for other patients and your doctor is notified."
              : "The patient is notified and the slot is released."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`cancel-reason-${appointmentId}`}>Reason (optional)</Label>
          <Textarea
            id={`cancel-reason-${appointmentId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Keep appointment
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? "Cancelling…" : "Cancel appointment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
