import { describe, expect, it } from 'vitest';

import { readPosebin } from '@climbing-coach/schema';
import { standClimbFall } from '@climbing-coach/test-fixtures';

import { posebinOf } from '../test/attempts.js';
import { detectFromPoseTrack } from './proposals.js';

const VIDEO_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const TRACK_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';

describe('proposals from a pose track', () => {
  it('detects the stand-climb-fall scenario as one fall', () => {
    const scenario = standClimbFall();
    const track = readPosebin(
      posebinOf(VIDEO_ID, TRACK_ID, scenario.samples, 'rtmpose-m-halpe26', '20230605'),
    );
    const attempts = detectFromPoseTrack(track);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe('fall');
  });
});
