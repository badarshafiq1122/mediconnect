import type { AppointmentStatus } from "@prisma/client";
import {
  CalendarCheckIcon,
  CircleCheckIcon,
  CircleXIcon,
  HourglassIcon,
  StethoscopeIcon,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/features/appointments/status";

// Status colours are reserved semantic colours and always ship with an icon and a text label (never colour alone).
const APPEARANCE: Record<AppointmentStatus, { icon: LucideIcon; tone: string }> = {
  booked: { icon: CalendarCheckIcon, tone: "text-primary" },
  in_queue: { icon: HourglassIcon, tone: "text-status-warning" },
  in_progress: { icon: StethoscopeIcon, tone: "text-status-good" },
  completed: { icon: CircleCheckIcon, tone: "text-muted-foreground" },
  cancelled: { icon: CircleXIcon, tone: "text-status-critical" },
};

export function StatusBadge({ status, className }: { status: AppointmentStatus; className?: string }) {
  const { icon: Icon, tone } = APPEARANCE[status];
  return (
    <Badge variant="outline" className={cn("h-6 gap-1.5 px-2.5 text-foreground", className)} data-status={status}>
      <Icon className={cn("size-3.5", tone)} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </Badge>
  );
}
