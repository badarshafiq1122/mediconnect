"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { StarIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { rateAppointmentAction } from "@/features/appointments/actions";
import { queryKeys } from "@/features/appointments/components/live-events-provider";

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} className={cn("size-4", n <= value ? "fill-status-warning text-status-warning" : "text-muted-foreground/40")} />
      ))}
    </span>
  );
}

export function RatingForm({ appointmentId, rating }: { appointmentId: string; rating: number | null }) {
  const [choice, setChoice] = useState(0);
  const [pending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  if (rating !== null) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">Your rating</span>
        <Stars value={rating} />
      </div>
    );
  }

  function submit() {
    startTransition(async () => {
      const result = await rateAppointmentAction({ appointmentId, rating: choice });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Thanks for your feedback");
      await queryClient.invalidateQueries({ queryKey: queryKeys.appointment(appointmentId) });
    });
  }

  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">How was your consultation?</legend>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={choice === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onClick={() => setChoice(n)}
              className="rounded-md p-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <StarIcon
                className={cn("size-6 transition-colors", n <= choice ? "fill-status-warning text-status-warning" : "text-muted-foreground/40 hover:text-status-warning")}
              />
            </button>
          ))}
        </div>
        <Button size="sm" onClick={submit} disabled={choice === 0 || pending}>
          {pending ? "Submitting…" : "Submit rating"}
        </Button>
      </div>
    </fieldset>
  );
}

export { Stars as StarRating };
