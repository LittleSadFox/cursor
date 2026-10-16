import { describe, expect, it } from 'vitest';

import { REACH, landmarksFor } from '@climbing-coach/test-fixtures';

import { FEATURE_NAMES, FEATURE_SPEC } from './spec.js';
import { frameFeatures } from './frame.js';
import type { PoseSample } from '../pose/types.js';

describe('features', () => {
  it('emits one value per spec name and is not version 1.0.0', () => {
    expect(FEATURE_SPEC.version).not.toBe('1.0.0');
    expect(FEATURE_SPEC.version).not.toBe('0.0.0-placeholder');
    const sample: PoseSample = {
      tUs: 0,
      landmarks: landmarksFor(REACH).map((point) => ({
        x: point[0] ?? 0,
        y: point[1] ?? 0,
        z: 0,
        visibility: 1,
      })),
    };
    const row = frameFeatures([sample, { ...sample, tUs: 66_667 }])[1];
    expect(row?.values).toHaveLength(FEATURE_NAMES.length);
  });
});
