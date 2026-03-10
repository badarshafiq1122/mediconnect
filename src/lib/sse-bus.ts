import type { LiveEvent } from "@/lib/sse-events";

type Listener = (event: LiveEvent) => void;

/**
 * In-memory pub/sub keyed by userId. Events are published only after the DB transaction commits.
 *
 * Multi-instance scaling: replace `publish` with a Redis `PUBLISH sse:user:<id>` and have every instance
 * `SUBSCRIBE` and forward messages to its local listeners. The subscribe/publish surface stays identical.
 */
export class SseBus {
  private readonly channels = new Map<string, Set<Listener>>();

  subscribe(userId: string, listener: Listener): () => void {
    let listeners = this.channels.get(userId);
    if (!listeners) {
      listeners = new Set();
      this.channels.set(userId, listeners);
    }
    listeners.add(listener);
    return () => {
      const current = this.channels.get(userId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.channels.delete(userId);
    };
  }

  /** Delivers to every open connection of the user. Returns the number of listeners reached. */
  publish(userId: string, event: LiveEvent): number {
    const listeners = this.channels.get(userId);
    if (!listeners) return 0;
    let delivered = 0;
    for (const listener of [...listeners]) {
      try {
        listener(event);
        delivered += 1;
      } catch (error) {
        // A broken connection must never prevent delivery to the user's other connections.
        console.error("SSE listener failed", error);
      }
    }
    return delivered;
  }

  connectionCount(userId?: string): number {
    if (userId) return this.channels.get(userId)?.size ?? 0;
    let total = 0;
    for (const listeners of this.channels.values()) total += listeners.size;
    return total;
  }
}

// globalThis: Next.js can bundle route handlers, server actions and instrumentation as separate module
// instances; a module-level singleton would give each of them its own (disconnected) bus.
const globalForBus = globalThis as unknown as { __mediconnectSseBus?: SseBus };

export const sseBus: SseBus = (globalForBus.__mediconnectSseBus ??= new SseBus());
