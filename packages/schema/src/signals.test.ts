import { describe, expect, it } from 'vitest';

import { parseSignalsJson, stringifySignals, type SignalsFile } from './signals.js';
import { us } from './time.js';

const VIDEO_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

describe('signals', () => {
  it('round-trips JSON', () => {
    const file: SignalsFile = {
      schemaVersion: 1,
      videoId: VIDEO_ID,
      sampleFps: 2,
      samples: [
        { tUs: us(0), energy: 0.1, globalMotion: 0.01 },
        { tUs: us(500_000), energy: 1.2, globalMotion: 0.4, dx: 0.02, dy: -0.01 },
      ],
      activeWindows: [{ startUs: us(500_000), endUs: us(2_000_000) }],
      warnings: ['camera_moving'],
    };

    const text = stringifySignals(file);
    const parsed = parseSignalsJson(text);
    expect(parsed).toEqual(file);
  });
});
