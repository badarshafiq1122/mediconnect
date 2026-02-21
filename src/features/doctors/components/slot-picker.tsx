"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarXIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useClinicTimeZone } from "@/components/clinic-time";
import { formatInZone, zoneAbbreviation, zonedTimeToInstant } from "@/lib/time";
import { cn } from "@/lib/utils";
import { bookAppointmentAction } from "@/features/appointments/actions";
import type { DaySlotsDTO } from "@/features/appointments/queries";

export function SlotPicker({ doctorId, doctorName, days }: { doctorId: string; doctorName: string; days: DaySlotsDTO[] }) {
  const router = useRouter();
  const timeZone = useClinicTimeZone();
  const [pending, startTransition] = useTransition();

  const firstOpenDay = days.find((day) => day.slots.some((slot) => slot.available))?.date ?? days[0]?.date ?? null;
  const [date, setDate] = useState<string | null>(firstOpenDay);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const day = useMemo(() => days.find((entry) => entry.date === date) ?? null, [days, date]);
  // "UTC" alone, or "EST (America/New_York)" when the abbreviation differs from the zone name.
  const abbreviation = zoneAbbreviation(new Date(day?.slots[0]?.start ?? days[0]?.slots[0]?.start ?? 0), timeZone);
  const zoneLabel = abbreviation === timeZone ? abbreviation : `${abbreviation} (${timeZone})`;

  if (days.length === 0) {
    return (
      <div className="grid justify-items-start gap-2 rounded-xl border border-dashed p-6">
        <CalendarXIcon className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium">No open slots in the next 7 days</p>
        <p className="text-sm text-muted-foreground">Check back soon, or look at another doctor.</p>
      </div>
    );
  }

  const label = (ymd: string) => formatInZone(zonedTimeToInstant(ymd, "12:00", timeZone), "EEE d MMM", timeZone);

  function book() {
    if (!slotStart) return;
    setError(null);
    startTransition(async () => {
      const result = await bookAppointmentAction({ doctorId, slotStart, reason });
      if (!result.ok) {
        setError(result.fieldErrors?.slotStart?.[0] ?? result.error);
        toast.error(result.error);
        setSlotStart(null);
        // The slot may just have been taken: reload availability so the grid tells the truth.
        router.refresh();
        return;
      }
      toast.success("Appointment booked");
      router.push(`/patient/appointments/${result.data.appointmentId}`);
    });
  }

  return (
    <div className="grid gap-5">
      {/* Outside the booking panel on purpose: a failed booking closes the panel, and the reason must stay visible. */}
      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div role="tablist" aria-label="Choose a day" className="flex gap-2 overflow-x-auto pb-1">
        {days.map((entry) => {
          const open = entry.slots.filter((slot) => slot.available).length;
          const selected = entry.date === date;
          return (
            <button
              key={entry.date}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => {
                setDate(entry.date);
                setSlotStart(null);
                setError(null);
              }}
              className={cn(
                "shrink-0 rounded-lg border px-3.5 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                selected ? "border-primary bg-accent" : "bg-card hover:bg-muted",
              )}
            >
              <span className="block font-medium">{label(entry.date)}</span>
              <span className="block text-xs text-muted-foreground">{open === 0 ? "Fully booked" : `${open} open`}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          Times are shown in {zoneLabel}.
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" data-testid="slot-grid">
          {day?.slots.map((slot) => {
            const time = formatInZone(slot.start, "HH:mm", timeZone);
            const selected = slot.start === slotStart;
            return (
              <button
                key={slot.start}
                type="button"
                disabled={!slot.available}
                aria-pressed={selected}
                aria-label={slot.available ? `Book ${time}` : `${time}, unavailable`}
                data-testid={slot.available ? "slot-available" : "slot-unavailable"}
                onClick={() => {
                  setSlotStart(slot.start);
                  setError(null);
                }}
                className={cn(
                  "rounded-lg border px-2 py-2 text-sm font-medium tabular-nums outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : slot.available
                      ? "bg-card hover:border-primary hover:bg-accent"
                      : "cursor-not-allowed bg-muted text-muted-foreground line-through opacity-60",
                )}
              >
                {time}
              </button>
            );
          })}
        </div>
      </div>

      {slotStart ? (
        <div className="grid gap-3 rounded-xl border bg-card p-4" data-testid="booking-panel">
          <p className="text-sm">
            Book <span className="font-medium">{doctorName}</span> on{" "}
            <span className="font-medium">
              {formatInZone(slotStart, "EEEE d MMMM 'at' HH:mm", timeZone)} {zoneAbbreviation(slotStart, timeZone)}
            </span>
            ?
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="reason">Reason for visit (optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={2}
              placeholder="A few words help your doctor prepare"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={book} disabled={pending}>
              {pending ? "Booking…" : "Confirm booking"}
            </Button>
            <Button variant="ghost" onClick={() => setSlotStart(null)} disabled={pending}>
              Choose another time
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
