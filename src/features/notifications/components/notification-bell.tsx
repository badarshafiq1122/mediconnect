"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClinicTime } from "@/components/clinic-time";
import { fetchJson } from "@/lib/fetch-json";
import type { NotificationDTO } from "@/lib/sse-events";
import { cn } from "@/lib/utils";
import {
  queryKeys,
  useLiveRefetchInterval,
} from "@/features/appointments/components/live-events-provider";
import { markNotificationsReadAction } from "@/features/notifications/actions";

type NotificationsResponse = { items: NotificationDTO[]; unreadCount: number };

export function NotificationBell({ role }: { role: "patient" | "doctor" }) {
  const queryClient = useQueryClient();
  const refetchInterval = useLiveRefetchInterval();
  // Ids that were unread when the menu opened: they keep their highlight even though opening marks them read.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());

  const { data } = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: ({ signal }) => fetchJson<NotificationsResponse>("/api/notifications", signal),
    refetchInterval,
  });

  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;
  const areaPrefix = role === "doctor" ? "/doctor" : "/patient";

  async function onOpenChange(open: boolean) {
    if (!open) {
      setFresh(new Set());
      return;
    }
    setFresh(new Set(items.filter((item) => item.readAt === null).map((item) => item.id)));
    if (unread > 0) {
      await markNotificationsReadAction();
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => void onOpenChange(open)}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          />
        }
      >
        <BellIcon />
        {unread > 0 ? (
          <span
            data-testid="notification-count"
            className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 w-[22rem] max-w-[calc(100vw-2rem)]">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
          ) : (
            items.map((item) => {
              const body = (
                <div className="grid min-w-0 gap-0.5">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {item.title}
                    {fresh.has(item.id) ? <span className="size-1.5 rounded-full bg-primary" aria-label="New" /> : null}
                  </span>
                  <span className="text-sm text-muted-foreground">{item.body}</span>
                  <span className="text-xs text-muted-foreground">
                    <ClinicTime iso={item.createdAt} pattern="EEE d MMM, HH:mm" />
                  </span>
                </div>
              );
              return item.appointmentId ? (
                <DropdownMenuItem
                  key={item.id}
                  className={cn("items-start px-2 py-2", fresh.has(item.id) && "bg-accent/50")}
                  render={<Link href={`${areaPrefix}/appointments/${item.appointmentId}`} />}
                >
                  {body}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem key={item.id} className="items-start px-2 py-2">
                  {body}
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
