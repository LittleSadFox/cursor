#!/usr/bin/env node
/**
 * Write a posebin fixture from the TypeScript writer for Python to read (P0.2).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LANDMARK_COUNT,
  LANDMARK_STRIDE,
  writePosebin,
} from '../dist/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = join(ROOT, 'research/pose-lab/fixtures/from-ts.posebin');

const VIDEO_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const TRACK_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
const frameCount = 3;
const landmarks = new Float32Array(frameCount * LANDMARK_COUNT * LANDMARK_STRIDE);
landmarks[0] = 0.42;
landmarks[1] = 0.24;
landmarks[4] = Number.NaN;
const tUs = new Float64Array([16_000_000 + 7, 16_033_333, 16_066_666]);

const bytes = writePosebin({
  header: {
    videoId: VIDEO_ID,
    kind: 'detection',
    runtime: 'typescript',
    model: 'fixture',
    sampleFps: 15,
    windows: [{ startUs: 16_000_000, endUs: 16_100_000 }],
    coordinateSpace: 'display',
    displayWidth: 1080,
    displayHeight: 1920,
    rotation: 0,
    tracks: [{ trackId: TRACK_ID, firstFrame: 0, lastFrame: frameCount - 1 }],
    selectedTrackId: TRACK_ID,
    frameCount,
  },
  tUs,
  landmarksByTrack: new Map([[TRACK_ID, landmarks]]),
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, bytes);
console.log(`wrote ${OUT} (${bytes.byteLength} bytes)`);
