import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseDatasetManifest, testSplitSha256Of, type DatasetManifest } from './dataset.js';
import { sha256Hex } from './sha256.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function recording(
  partial: Partial<DatasetManifest['recordings'][number]> &
    Pick<DatasetManifest['recordings'][number], 'id' | 'sha256' | 'split'>,
): DatasetManifest['recordings'][number] {
  return {
    mediaPath: 'gym/clip.mov',
    durationUs: 1_000_000,
    climberId: 'climber-a',
    boulderId: 'boulder-1',
    gym: 'Local',
    grade: 'V4',
    color: 'blue',
    lighting: 'overhead',
    cameraDistanceM: 3,
    cameraHeightM: 1.2,
    wallAngle: 'vert',
    attemptCount: 2,
    handheld: false,
    hdr: false,
    hevc: false,
    consentId: 'consent-1',
    ...partial,
  };
}

describe('dataset manifest', () => {
  it('parses the committed empty manifest', () => {
    const path = join(dirname(fileURLToPath(import.meta.url)), '../../../datasets/manifest.json');
    const manifest = parseDatasetManifest(readFileSync(path, 'utf8'));
    expect(manifest.frozen).toBe(false);
    expect(manifest.recordings).toEqual([]);
    expect(manifest.captureProtocolVersion).toBe('0.1');
  });

  it('rejects absolute paths and parent segments', () => {
    const base = {
      schemaVersion: 1 as const,
      datasetVersion: '0.0.1',
      description: 'test',
      testSplitRatio: 0.3,
      frozen: false,
      recordings: [recording({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', sha256: HASH_A, split: 'train', mediaPath: '../secret.mov' })],
    };
    expect(() => parseDatasetManifest(JSON.stringify(base))).toThrow();
  });

  it('rejects the same climber and boulder in two splits', () => {
    const manifest = {
      schemaVersion: 1 as const,
      datasetVersion: '0.0.1',
      description: 'test',
      testSplitRatio: 0.3,
      frozen: false,
      recordings: [
        recording({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', sha256: HASH_A, split: 'train' }),
        recording({
          id: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
          sha256: HASH_B,
          split: 'test',
          mediaPath: 'gym/other.mov',
        }),
      ],
    };
    expect(() => parseDatasetManifest(JSON.stringify(manifest))).toThrow(/leaks/);
  });

  it('requires a matching test-split hash when frozen', () => {
    const recordings = [recording({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', sha256: HASH_A, split: 'test' })];
    const manifest = {
      schemaVersion: 1 as const,
      datasetVersion: '0.0.1',
      description: 'test',
      testSplitRatio: 0.3,
      frozen: true,
      recordings,
    };
    expect(() => parseDatasetManifest(JSON.stringify(manifest))).toThrow(/testSplitSha256/);
    const frozen = { ...manifest, testSplitSha256: testSplitSha256Of(recordings) };
    expect(parseDatasetManifest(JSON.stringify(frozen)).frozen).toBe(true);
    expect(testSplitSha256Of([])).toBe(sha256Hex(''));
  });
});
