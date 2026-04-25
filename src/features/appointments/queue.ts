// Pure queue arithmetic. The service loads the doctor's in_queue rows, calls these, and persists the diff.

export type QueueEntry = {
  id: string;
  checkedInAt: Date;
  slotStart: Date;
};

/**
 * First come, first served by check-in time (ties: earlier slot, then id for determinism).
 * FIFO means a patient's position only ever improves, which keeps the live counter trustworthy.
 */
export function orderQueue<T extends QueueEntry>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) =>
      a.checkedInAt.getTime() - b.checkedInAt.getTime() ||
      a.slotStart.getTime() - b.slotStart.getTime() ||
      a.id.localeCompare(b.id),
  );
}

/** 1-based dense positions for a doctor's waiting patients. */
export function computeQueuePositions(entries: readonly QueueEntry[]): Map<string, number> {
  const positions = new Map<string, number>();
  orderQueue(entries).forEach((entry, index) => positions.set(entry.id, index + 1));
  return positions;
}

export type PositionChange = { id: string; from: number | null; to: number };

/** Entries whose stored position differs from the freshly computed one. */
export function diffPositions(
  stored: ReadonlyMap<string, number | null>,
  computed: ReadonlyMap<string, number>,
): PositionChange[] {
  const changes: PositionChange[] = [];
  for (const [id, to] of computed) {
    const from = stored.get(id) ?? null;
    if (from !== to) changes.push({ id, from, to });
  }
  return changes;
}

/**
 * Rough wait: every patient ahead plus the consultation currently running each take one slot length.
 * Deliberately a heuristic; real consult durations vary.
 */
export function estimateWaitMinutes(input: {
  position: number;
  doctorBusy: boolean;
  slotMinutes: number;
}): number {
  const ahead = Math.max(0, input.position - 1) + (input.doctorBusy ? 1 : 0);
  return ahead * input.slotMinutes;
}
