import { createEventBus } from '../ports/events.js';
import { silentLogger } from '../ports/logger.js';
import { isoFromMs, type Clock } from '../ports/clock.js';
import { createIdGen, sequentialRandomBytes } from '../ids/ulid.js';
import { createCoreApi } from '../create-api.js';
import { openMemoryLibrary } from './memory-db.js';

export function fakeClock(startMs = Date.parse('2026-10-15T12:00:00.000Z')): Clock & {
  advance(ms: number): void;
} {
  let now = startMs;
  return {
    nowMs: () => now,
    nowIso: () => isoFromMs(now),
    advance(ms) {
      now += ms;
    },
  };
}

export function createTestApi() {
  const clock = fakeClock();
  const memory = openMemoryLibrary(clock.nowIso());
  const ids = createIdGen(clock, sequentialRandomBytes(1));
  const events = createEventBus(() => clock.nowMs());
  const api = createCoreApi({
    db: memory.db,
    sql: memory.sql,
    clock,
    ids,
    events,
    logger: silentLogger(),
    ffmpegAvailable: false,
    poseAvailable: false,
  });
  return { api, clock, memory, events };
}
