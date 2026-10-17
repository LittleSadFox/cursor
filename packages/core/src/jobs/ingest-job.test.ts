import { describe, expect, it } from 'vitest';

import {
  DURATION_US,
  fakeVideoTools,
  gray,
  importWith,
  secondFrames,
} from '../test/ingest-fakes.js';

describe('import ingest', () => {
  it('stores activity windows, poses only those windows, and proposes the climb', async () => {
    const video = fakeVideoTools(secondFrames(), []);
    const { api, id, seen, signals } = await importWith(video);
    const ready = await api.recordings.get(id);
    expect(ready.jobStatus).toBe('succeeded');
    expect(ready.hasPose).toBe(true);
    expect(ready.reviewState).toBe('in_review');
    expect(signals?.activeWindows).toEqual([{ startUs: 0, endUs: 5_000_000 }]);
    expect(video.frameCalls.some((call) => call.sampleFps === 2)).toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.windows).toEqual(signals?.activeWindows);
    expect(seen[0]?.rotation).toBe(270);
    const review = await api.review.get(id);
    expect(review.processing.complete).toBe(true);
    expect(review.items).toHaveLength(1);
    const item = review.items[0];
    expect(item?.outcome).toBe('fall');
    expect(item?.origin).toBe('detector');
    expect(item?.clip.startUs).toBeLessThan(item?.climb.startUs ?? 0);
    expect(item?.clip.endUs).toBeGreaterThan(item?.climb.endUs ?? 0);
  });

  it('decodes at 2 fps when keyframes are more than 2 s apart', async () => {
    const video = fakeVideoTools([gray(0, false), gray(6_000_000, false)], secondFrames());
    const { signals } = await importWith(video);
    const dense = video.frameCalls.filter((call) => call.sampleFps === 2);
    expect(dense).toHaveLength(1);
    expect(dense[0]?.windows).toEqual([{ startUs: 0, endUs: DURATION_US }]);
    expect(signals?.activeWindows).toEqual([{ startUs: 0, endUs: 5_000_000 }]);
  });
});
