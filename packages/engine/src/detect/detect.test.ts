import { describe, expect, it } from 'vitest';

import { CLIMB_SCENARIOS, FRAME_US, type RawSample } from '@climbing-coach/test-fixtures';

import { STARTING_PARAMS } from '../params.js';
import { selectClimberTrack } from '../pose/select-track.js';
import type { PoseSample } from '../pose/types.js';
import { detectAttempts } from './attempts.js';
import { boundaryOffsetUs } from './offset.js';

function toSamples(raw: readonly RawSample[]): PoseSample[] {
  return raw.map((sample) => ({
    tUs: sample.tUs,
    landmarks: sample.landmarks.map((point) => ({
      x: point[0] ?? 0,
      y: point[1] ?? 0,
      z: point[2] ?? 0,
      visibility: point[3] ?? 0,
    })),
  }));
}

describe('detect', () => {
  it.each(CLIMB_SCENARIOS.map((scenario) => [scenario.name, scenario] as const))(
    '%s',
    (_name, scenario) => {
      let samples = toSamples(scenario.samples);
      if (scenario.bystander) {
        const tracks = [
          { trackId: 'bystander', samples: toSamples(scenario.bystander) },
          { trackId: 'climber', samples },
        ];
        expect(selectClimberTrack(tracks)).toBe('climber');
        samples = tracks[1]?.samples ?? samples;
      }
      const { attempts, floor } = detectAttempts(samples);
      expect(attempts).toHaveLength(scenario.attempts.length);
      scenario.attempts.forEach((expected, index) => {
        const got = attempts[index];
        expect(got, `${scenario.name} attempt ${index}`).toBeDefined();
        if (!got) return;
        expect(Math.abs(got.startUs - expected.startUs)).toBeLessThanOrEqual(FRAME_US);
        expect(Math.abs(got.endUs - expected.endUs)).toBeLessThanOrEqual(FRAME_US);
        expect(got.outcome).toBe(expected.outcome);
        if (expected.startConfidence) expect(got.startConfidence).toBe(expected.startConfidence);
        if (expected.exitDirection) expect(got.exitDirection).toBe(expected.exitDirection);
      });
      if (scenario.name === 'already-on-wall') expect(floor.alreadyOnWall).toBe(true);
      if (scenario.name === 'stand-climb-fall') expect(floor.confidence).toBe('high');
    },
  );

  it('applies a boundary offset only with enough same-sign labels', () => {
    const late = Array.from({ length: 20 }, () => 200_000);
    expect(boundaryOffsetUs(late)).toBe(200_000);
    expect(boundaryOffsetUs(Array.from({ length: 19 }, () => 200_000))).toBe(0);
    const mixed = [
      ...Array.from({ length: 10 }, () => 200_000),
      ...Array.from({ length: 10 }, () => -200_000),
    ];
    expect(boundaryOffsetUs(mixed)).toBe(0);
    expect(boundaryOffsetUs(Array.from({ length: 20 }, () => 2_000_000))).toBe(
      STARTING_PARAMS.detect.boundaryOffsetBoundUs,
    );
  });
});
