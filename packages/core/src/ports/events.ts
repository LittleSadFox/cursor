import type { CoachEvent, EventHandler } from '@climbing-coach/api';

export type EventBus = {
  publish(event: CoachEvent): void;
  subscribe(handler: EventHandler): () => void;
  resumeFrom(lastEventId: string): CoachEvent[];
};

const RING_MS = 5 * 60 * 1000;

type Buffered = CoachEvent & { id: string; bufferedAt: number };

function sequenceOf(id: string, epoch: string): number | null {
  const [prefix, seq] = id.split('-');
  if (prefix !== epoch || seq === undefined) return null;
  const value = Number(seq);
  return Number.isInteger(value) ? value : null;
}

/**
 * In-memory fan-out with a 5-minute Last-Event-ID ring buffer (BUILD_PLAN §4.4). Ids carry the
 * bus start time, so an id from before a restart replays the whole ring instead of nothing.
 */
export function createEventBus(nowMs: () => number): EventBus {
  const handlers = new Set<EventHandler>();
  const ring: Buffered[] = [];
  const epoch = String(nowMs());
  let seq = 0;

  function prune(now: number): void {
    while (ring.length > 0) {
      const head = ring[0];
      if (head === undefined || now - head.bufferedAt <= RING_MS) break;
      ring.shift();
    }
  }

  return {
    publish(event) {
      const now = nowMs();
      prune(now);
      seq += 1;
      const buffered: Buffered = { ...event, id: `${epoch}-${seq}`, bufferedAt: now };
      ring.push(buffered);
      for (const handler of handlers) handler(buffered);
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    resumeFrom(lastEventId) {
      const now = nowMs();
      prune(now);
      const last = sequenceOf(lastEventId, epoch);
      if (last === null) return [...ring];
      return ring.filter((event) => (sequenceOf(event.id, epoch) ?? 0) > last);
    },
  };
}
