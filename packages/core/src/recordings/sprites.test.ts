import { describe, expect, it } from 'vitest';

import { ProblemError } from '@climbing-coach/api';

import { fakeVideoTools, importWith, secondFrames } from '../test/ingest-fakes.js';
import { loupeCenterUs, loupeName, filmstripName } from './sprites.js';

describe('sprite names', () => {
  it('snaps loupe centres to whole seconds so nearby handles share a strip', () => {
    expect(loupeCenterUs(2_400_000)).toBe(2_000_000);
    expect(loupeCenterUs(2_600_000)).toBe(3_000_000);
    expect(loupeName(3_000_000)).toBe('loupe-3000000.jpg');
    expect(filmstripName({ startUs: 0, endUs: 10, count: 4, width: 80 })).toBe(
      'filmstrip-0-10-4-80.jpg',
    );
  });
});

describe('recording sprites', () => {
  it('renders a filmstrip once and serves the cached layout after', async () => {
    const video = fakeVideoTools(secondFrames(), []);
    const { api, id } = await importWith(video);
    const query = { startUs: 0, endUs: 10_000_000, count: 8, width: 80 };
    const first = await api.recordings.filmstrip(id, query);
    const again = await api.recordings.filmstrip(id, query);
    expect(first).toEqual(again);
    expect(first.spriteUrl).toBe(`/thumbs/${id}/filmstrip-0-10000000-8-80.jpg`);
    expect(video.spriteCalls.filter((call) => call.startsWith('filmstrip'))).toHaveLength(1);
  });

  it('builds a loupe around the snapped centre and resolves only sprite names', async () => {
    const video = fakeVideoTools(secondFrames(), []);
    const { api, id } = await importWith(video);
    const loupe = await api.recordings.loupe(id, 2_400_000);
    expect(loupe.tiles[0]?.tUs).toBe(2_000_000);
    expect(video.spriteCalls.at(-1)).toContain(`thumbs/${id}/loupe-2000000.jpg`);
    expect(api.resolveThumb(id, 'loupe-2000000.jpg').path).toBe(
      `/lib/thumbs/${id}/loupe-2000000.jpg`,
    );
    expect(() => api.resolveThumb(id, '../library.db')).toThrow(ProblemError);
  });
});
