#!/usr/bin/env node
/**
 * Write a deterministic posebin fixture from the TypeScript writer (P0.2).
 * Requires a prior `pnpm --filter @climbing-coach/schema build`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LANDMARK_COUNT, LANDMARK_STRIDE, writePosebin } from '../dist/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = join(ROOT, 'research/pose-lab/fixtures/from-ts.posebin');

const VIDEO_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const TRACK_A = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
const TRACK_B = '01ARZ3NDEKTSV4RRFFQ69G5FAX';
const frameCount = 4;

function fill(seed) {
  const landmarks = new Float32Array(frameCount * LANDMARK_COUNT * LANDMARK_STRIDE);
  for (let i = 0; i < landmarks.length; i++) {
    landmarks[i] = ((seed + i) % 17) / 20;
  }
  landmarks[4] = Number.NaN;
  landmarks[landmarks.length - 1] = Number.NaN;
  return landmarks;
}

const bytes = writePosebin({
  header: {
    videoId: VIDEO_ID,
    kind: 'detection',
    runtime: 'typescript',
    model: 'fixture',
    sampleFps: 15,
    windows: [
      { startUs: 0, endUs: 100_000 },
      { startUs: 2_000_000, endUs: 2_100_000 },
    ],
    coordinateSpace: 'display',
    displayWidth: 1080,
    displayHeight: 1920,
    rotation: 90,
    tracks: [
      { trackId: TRACK_A, firstFrame: 0, lastFrame: frameCount - 1 },
      { trackId: TRACK_B, firstFrame: 1, lastFrame: frameCount - 1 },
    ],
    selectedTrackId: TRACK_A,
    frameCount,
  },
  tUs: new Float64Array([0, 33_333, 2_000_000, 2_033_333]),
  landmarksByTrack: new Map([
    [TRACK_A, fill(1)],
    [TRACK_B, fill(3)],
  ]),
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, bytes);
console.log(`wrote ${OUT} (${bytes.byteLength} bytes)`);
