import { auth } from "@/lib/auth";
import { sseBus } from "@/lib/sse-bus";
import { formatSseEvent, type LiveEvent } from "@/lib/sse-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;
const RECONNECT_HINT_MS = 5_000;

/**
 * Live channel for the signed-in user: queue position / status changes, notifications and message signals.
 * Events come from sse-bus and are published only after the originating DB transaction has committed. The bus
 * is keyed by userId and this handler subscribes solely to the caller's own id, so no user can receive
 * another user's events.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Please sign in to continue." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const encoder = new TextEncoder();
  let cleanup: () => void = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const unsubscribe = sseBus.subscribe(userId, (event: LiveEvent) => send(formatSseEvent(event)));
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      request.signal.addEventListener("abort", cleanup);
      send(`retry: ${RECONNECT_HINT_MS}\n\n`);
      send(formatSseEvent({ type: "ready" }));
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform stops Next's gzip layer from buffering the stream; X-Accel-Buffering does the same for nginx.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
