"use client";

import { cn } from "@/lib/utils";
import { useLiveConnected } from "@/features/appointments/components/live-events-provider";

/** Tells the user whether updates are being pushed live or fall back to periodic refresh. */
export function LiveIndicator({ className }: { className?: string }) {
  const connected = useLiveConnected();
  return (
    <span
      role="status"
      data-live={connected ? "connected" : "reconnecting"}
      className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}
      title={connected ? "Updates arrive instantly" : "Live connection lost: refreshing every 30 seconds"}
    >
      <span
        aria-hidden="true"
        className={cn("size-2 rounded-full", connected ? "bg-status-good" : "bg-status-warning")}
      />
      {connected ? "Live" : "Reconnecting"}
    </span>
  );
}
