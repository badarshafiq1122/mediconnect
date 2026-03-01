"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LIVE_EVENT_TYPES, type LiveEvent, type LiveEventType } from "@/lib/sse-events";
import { notificationsKey } from "@/features/notifications/components/notification-keys";

type LiveContextValue = {
  /** True while the EventSource is open. When false, queries fall back to a 30 second poll. */
  connected: boolean;
};

const LiveContext = createContext<LiveContextValue>({ connected: false });

export const POLL_FALLBACK_MS = 30_000;

/** Query keys shared between the live provider and the components that read them. */
export const queryKeys = {
  queue: ["queue"] as const,
  appointment: (id: string) => ["appointment", id] as const,
  messages: (id: string) => ["messages", id] as const,
  notifications: notificationsKey,
};

/**
 * Opens one EventSource per signed-in tab and turns server pushes into TanStack Query invalidations.
 * If the stream cannot be established or drops, `connected` flips to false and every live query starts polling
 * every 30 seconds (see useLiveRefetchInterval), so the UI degrades to slower updates instead of freezing.
 */
export function LiveEventsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof EventSource === "undefined") return; // Very old browser: polling fallback only.

    const source = new EventSource("/api/sse/queue");

    const refreshEverything = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.queue });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      void queryClient.invalidateQueries({ queryKey: ["appointment"] });
      void queryClient.invalidateQueries({ queryKey: ["messages"] });
    };

    const handlers: Record<LiveEventType, (event: LiveEvent) => void> = {
      // Sent on every (re)connect: anything missed while disconnected is recovered by refetching.
      ready: refreshEverything,
      "appointment.updated": (event) => {
        if (event.type !== "appointment.updated") return;
        void queryClient.invalidateQueries({ queryKey: queryKeys.queue });
        void queryClient.invalidateQueries({ queryKey: queryKeys.appointment(event.appointmentId) });
      },
      "notification.created": (event) => {
        if (event.type !== "notification.created") return;
        void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
        toast(event.notification.title, { description: event.notification.body });
      },
      "message.created": (event) => {
        if (event.type !== "message.created") return;
        void queryClient.invalidateQueries({ queryKey: queryKeys.messages(event.appointmentId) });
      },
      "message.read": (event) => {
        if (event.type !== "message.read") return;
        void queryClient.invalidateQueries({ queryKey: queryKeys.messages(event.appointmentId) });
      },
    };

    const listeners = LIVE_EVENT_TYPES.map((type) => {
      const listener = (message: Event) => {
        try {
          handlers[type](JSON.parse((message as MessageEvent<string>).data) as LiveEvent);
        } catch (error) {
          console.error("Ignoring malformed live event", error);
        }
      };
      source.addEventListener(type, listener);
      return [type, listener] as const;
    });

    const onOpen = () => setConnected(true);
    // EventSource retries by itself; while it does, polling covers the gap.
    const onError = () => setConnected(false);
    source.addEventListener("open", onOpen);
    source.addEventListener("error", onError);

    return () => {
      for (const [type, listener] of listeners) source.removeEventListener(type, listener);
      source.removeEventListener("open", onOpen);
      source.removeEventListener("error", onError);
      source.close();
      setConnected(false);
    };
  }, [queryClient]);

  const value = useMemo(() => ({ connected }), [connected]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLiveConnected(): boolean {
  return useContext(LiveContext).connected;
}

/** `false` while the SSE stream is healthy (pushes drive updates), 30s polling when it is not. */
export function useLiveRefetchInterval(): number | false {
  return useLiveConnected() ? false : POLL_FALLBACK_MS;
}
