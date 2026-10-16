import { describe, expect, it } from 'vitest';

import { createEventBus } from './events.js';

const progress = (jobId: string) =>
  ({ type: 'job.progress', jobId, jobType: 'backup-db', step: 'backup', progress: 0.5 }) as const;

describe('event bus', () => {
  it('replays only events after the given id', () => {
    const bus = createEventBus(() => 1000);
    bus.publish(progress('01ARZ3NDEKTSV4RRFFQ69G5FAV'));
    bus.publish(progress('01ARZ3NDEKTSV4RRFFQ69G5FAW'));
    const [first] = bus.resumeFrom('');
    expect(bus.resumeFrom(first?.id ?? '')).toHaveLength(1);
  });

  it('replays the whole ring for an id issued before a restart', () => {
    let now = 1000;
    const before = createEventBus(() => now);
    for (let i = 0; i < 5; i += 1) before.publish(progress('01ARZ3NDEKTSV4RRFFQ69G5FAV'));
    const staleId = before.resumeFrom('').at(-1)?.id ?? '';
    now = 2000;
    const after = createEventBus(() => now);
    after.publish(progress('01ARZ3NDEKTSV4RRFFQ69G5FAW'));
    expect(after.resumeFrom(staleId)).toHaveLength(1);
  });
});
