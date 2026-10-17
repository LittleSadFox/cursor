import { describe, expect, it } from 'vitest';

import type { PoseTrack } from '@climbing-coach/schema';

import { peopleOf, withSelected } from './people.js';

const A = '01ARZ3NDEKTSV4RRFFQ69G5FA1';
const B = '01ARZ3NDEKTSV4RRFFQ69G5FA2';

function track(): PoseTrack {
  return {
    header: {
      selectedTrackId: A,
      tracks: [
        { trackId: A, firstFrame: 0, lastFrame: 1 },
        { trackId: B, firstFrame: 1, lastFrame: 2 },
      ],
    },
    tUs: Float64Array.from([0, 1_000, 2_500.2]),
  } as PoseTrack;
}

describe('pose people', () => {
  it('lists each person and which one detection uses', () => {
    expect(peopleOf(track())).toEqual([
      { trackId: A, firstFrame: 0, lastFrame: 1, startUs: 0, endUs: 1_000, selected: true },
      { trackId: B, firstFrame: 1, lastFrame: 2, startUs: 1_000, endUs: 2_500, selected: false },
    ]);
  });

  it('returns the same track when the selection does not change', () => {
    const pose = track();
    expect(withSelected(pose, A)).toBe(pose);
    expect(withSelected(pose, B).header.selectedTrackId).toBe(B);
    expect(() => withSelected(pose, '01ARZ3NDEKTSV4RRFFQ69G5FAX')).toThrow(/unknown track/);
  });
});
