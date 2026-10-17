import { describe, expect, it } from 'vitest';

import { us, type SignalsFile } from '@climbing-coach/schema';

import { memoryBlobs } from '../test/fakes.js';
import { quarterTurn } from './rotation.js';
import { readSignals, signalsPath, writeSignals } from './signals-store.js';
import { parseWarningList, setCameraMovingWarning } from './warnings.js';
import { detectionWindows } from './windows.js';

const VIDEO_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

describe('quarterTurn', () => {
  it('keeps −90 and 90 distinct and drops odd angles', () => {
    expect(quarterTurn(-90)).toBe(270);
    expect(quarterTurn(90)).toBe(90);
    expect(quarterTurn(180)).toBe(180);
    expect(quarterTurn(-180)).toBe(180);
    expect(quarterTurn(360)).toBe(0);
    expect(quarterTurn(45)).toBe(0);
  });
});

describe('warnings', () => {
  it('adds and removes camera_moving while keeping other warnings', () => {
    const set = setCameraMovingWarning('["hdr_source"]', true);
    expect(parseWarningList(set)).toEqual(['hdr_source', 'camera_moving']);
    expect(parseWarningList(setCameraMovingWarning(set, false))).toEqual(['hdr_source']);
    expect(parseWarningList(setCameraMovingWarning(set, true))).toEqual([
      'hdr_source',
      'camera_moving',
    ]);
  });

  it('treats malformed JSON as no warnings', () => {
    expect(parseWarningList('nope')).toEqual([]);
    expect(parseWarningList('{"a":1}')).toEqual([]);
    expect(setCameraMovingWarning('nope', true)).toBe('["camera_moving"]');
  });
});

describe('signals store and detection windows', () => {
  const file: SignalsFile = {
    schemaVersion: 1,
    videoId: VIDEO_ID,
    sampleFps: 2,
    samples: [],
    activeWindows: [{ startUs: us(1_000_000), endUs: us(4_000_000) }],
    warnings: [],
  };

  it('round-trips signals and reads a missing file as null', async () => {
    const blobs = memoryBlobs();
    expect(await readSignals(blobs, VIDEO_ID)).toBeNull();
    await writeSignals(blobs, file);
    expect(blobs.files.has(signalsPath(VIDEO_ID))).toBe(true);
    expect(await readSignals(blobs, VIDEO_ID)).toEqual(file);
  });

  it('uses active windows, else the whole recording', () => {
    expect(detectionWindows(file, 10_000_000)).toEqual(file.activeWindows);
    expect(detectionWindows({ ...file, activeWindows: [] }, 10_000_000)).toEqual([
      { startUs: 0, endUs: 10_000_000 },
    ]);
    expect(detectionWindows(null, 0)).toEqual([]);
  });
});
