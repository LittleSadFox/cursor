import { describe, expect, it } from 'vitest';

import { LANDMARK_COUNT } from '@climbing-coach/schema';

import { CLIMB_SCENARIOS } from './scenarios.js';

describe('synthetic climber', () => {
  it('builds every Phase 1 scenario with 33 landmarks', () => {
    expect(CLIMB_SCENARIOS.length).toBeGreaterThanOrEqual(12);
    for (const scenario of CLIMB_SCENARIOS) {
      expect(scenario.samples.length, scenario.name).toBeGreaterThan(10);
      expect(scenario.samples[0]?.landmarks).toHaveLength(LANDMARK_COUNT);
    }
  });
});
