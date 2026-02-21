"use client";

import { useState, useTransition } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DAY_NAMES } from "@/lib/time";
import { replaceAvailabilityAction } from "@/features/doctors/actions";
import { replaceAvailabilitySchema } from "@/features/doctors/validation";

type Window = { key: string; dayOfWeek: number; startTime: string; endTime: string };

// Monday first: the order people read a working week in. dayOfWeek values stay 0 = Sunday ... 6 = Saturday.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

let keyCounter = 0;
const nextKey = () => `w${(keyCounter += 1)}`;

export function AvailabilityEditor({
  initial,
  doctorId,
  slotMinutes,
  onSaved,
}: {
  initial: { dayOfWeek: number; startTime: string; endTime: string }[];
  /** Only set when an admin edits someone else's schedule. Doctors always edit their own. */
  doctorId?: string;
  slotMinutes: number;
  onSaved?: () => void;
}) {
  const [windows, setWindows] = useState<Window[]>(() => initial.map((window) => ({ ...window, key: nextKey() })));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (key: string, patch: Partial<Window>) =>
    setWindows((current) => current.map((window) => (window.key === key ? { ...window, ...patch } : window)));

  function save() {
    const payload = {
      doctorId,
      windows: windows.map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime })),
    };
    // Same Zod schema the server uses: instant feedback here, authoritative check there.
    const local = replaceAvailabilitySchema.safeParse(payload);
    if (!local.success) {
      setError(local.error.issues[0]?.message ?? "Please check your availability.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await replaceAvailabilityAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Availability saved");
      onSaved?.();
    });
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Weekly hours patients can book. Each window is cut into {slotMinutes}-minute appointments. Existing bookings are
        never affected by changes here.
      </p>
      <div className="grid gap-3">
        {DISPLAY_ORDER.map((day) => {
          const dayWindows = windows.filter((window) => window.dayOfWeek === day);
          return (
            <div key={day} className="grid gap-2 sm:grid-cols-[7rem_1fr] sm:items-start">
              <p className="pt-1.5 text-sm font-medium">{DAY_NAMES[day]}</p>
              <div className="grid gap-2">
                {dayWindows.length === 0 ? <p className="pt-1.5 text-sm text-muted-foreground">Unavailable</p> : null}
                {dayWindows.map((window) => (
                  <div key={window.key} className="flex flex-wrap items-center gap-2">
                    <Input
                      type="time"
                      step={60}
                      aria-label={`${DAY_NAMES[day]} start time`}
                      value={window.startTime}
                      onChange={(event) => update(window.key, { startTime: event.target.value })}
                      className="w-32"
                    />
                    <span aria-hidden="true" className="text-muted-foreground">
                      to
                    </span>
                    <Input
                      type="time"
                      step={60}
                      aria-label={`${DAY_NAMES[day]} end time`}
                      value={window.endTime}
                      onChange={(event) => update(window.key, { endTime: event.target.value })}
                      className="w-32"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${DAY_NAMES[day]} window`}
                      onClick={() => setWindows((current) => current.filter((entry) => entry.key !== window.key))}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="w-fit"
                  onClick={() =>
                    setWindows((current) => [...current, { key: nextKey(), dayOfWeek: day, startTime: "09:00", endTime: "17:00" }])
                  }
                >
                  <PlusIcon />
                  Add hours
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save availability"}
        </Button>
      </div>
    </div>
  );
}
