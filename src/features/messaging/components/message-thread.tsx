"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ClinicTime } from "@/components/clinic-time";
import { fetchJson } from "@/lib/fetch-json";
import { cn } from "@/lib/utils";
import { queryKeys, useLiveRefetchInterval } from "@/features/appointments/components/live-events-provider";
import { markThreadReadAction, sendMessageAction } from "@/features/messaging/actions";
import type { MessageDTO } from "@/features/messaging/service";
import { MAX_MESSAGE_LENGTH } from "@/features/messaging/validation";

type ThreadResponse = { messages: MessageDTO[] };

export function MessageThread({
  appointmentId,
  counterpartName,
  disabled = false,
}: {
  appointmentId: string;
  counterpartName: string;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const refetchInterval = useLiveRefetchInterval();
  const key = queryKeys.messages(appointmentId);

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchJson<ThreadResponse>(`/api/appointments/${appointmentId}/messages`, signal),
    refetchInterval,
  });
  const messages = data?.messages;

  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const lastMarked = useRef<string | null>(null);

  // Keep the newest message in view without scrolling the whole page.
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages?.length]);

  // Opening the thread (or receiving while it is open) marks the counterpart's messages as read.
  useEffect(() => {
    if (!messages || document.visibilityState !== "visible") return;
    const latestUnread = [...messages].reverse().find((message) => !message.mine && message.readAt === null);
    if (!latestUnread || lastMarked.current === latestUnread.id) return;
    lastMarked.current = latestUnread.id;
    void markThreadReadAction({ appointmentId }).then(() => queryClient.invalidateQueries({ queryKey: key }));
  }, [messages, appointmentId, queryClient, key]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || pending) return;
    startTransition(async () => {
      const result = await sendMessageAction({ appointmentId, body });
      if (!result.ok) {
        setSendError(result.fieldErrors?.body?.[0] ?? result.error);
        return;
      }
      setSendError(null);
      setDraft("");
      queryClient.setQueryData<ThreadResponse>(key, (previous) => ({
        messages: [...(previous?.messages ?? []), result.data.message],
      }));
      void queryClient.invalidateQueries({ queryKey: key });
    });
  }

  const lastMine = messages ? [...messages].reverse().find((message) => message.mine) : undefined;

  return (
    <section aria-label="Messages" className="grid gap-3 rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold">Messages with {counterpartName}</h2>

      <div
        ref={scroller}
        role="log"
        aria-live="polite"
        data-testid="message-log"
        className="grid max-h-80 min-h-32 content-start gap-2 overflow-y-auto rounded-lg bg-muted/40 p-3"
      >
        {isLoading ? (
          <>
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="ml-auto h-9 w-1/2" />
          </>
        ) : loadError ? (
          <p className="text-sm text-destructive">Couldn&apos;t load messages. Retrying…</p>
        ) : messages && messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No messages yet. Say hello.</p>
        ) : (
          messages?.map((message) => (
            <div key={message.id} className={cn("flex flex-col gap-0.5", message.mine ? "items-end" : "items-start")}>
              <div
                data-testid={message.mine ? "message-mine" : "message-theirs"}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap",
                  message.mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card ring-1 ring-border",
                )}
              >
                {message.body}
              </div>
              <span className="px-1 text-[11px] text-muted-foreground">
                <ClinicTime iso={message.sentAt} pattern="HH:mm" />
                {message.mine && message.id === lastMine?.id && message.readAt ? " · Seen" : ""}
              </span>
            </div>
          ))
        )}
      </div>

      {disabled ? (
        <p className="text-sm text-muted-foreground">Messaging is closed because this appointment was cancelled.</p>
      ) : (
        <form onSubmit={submit} className="grid gap-2">
          <label htmlFor={`message-${appointmentId}`} className="sr-only">
            Write a message
          </label>
          <Textarea
            id={`message-${appointmentId}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={2}
            placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
            aria-invalid={sendError ? true : undefined}
          />
          <div className="flex items-center justify-between gap-3">
            <p role="alert" className="text-xs text-destructive">
              {sendError}
            </p>
            <Button type="submit" size="sm" disabled={pending || draft.trim().length === 0}>
              <SendIcon aria-hidden="true" />
              {pending ? "Sending…" : "Send"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
