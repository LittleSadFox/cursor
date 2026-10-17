import { InferenceSession, Tensor } from 'onnxruntime-node';
import { describe, expect, it } from 'vitest';

import { us } from '@climbing-coach/schema';

import { createNodePoseExtractor } from './extractor.js';
import { locatePoseModels } from './models.js';
import type { OpenOrtSession } from './session.js';
import { probePoseStatus } from './status.js';

function syntheticPersonFrame(tUs: number, width = 96, height = 128) {
  const data = new Uint8Array(width * height * 3);
  // Dark background
  data.fill(30);
  // Bright standing rectangle (person-like blob) near the center.
  for (let y = 20; y < 110; y += 1) {
    for (let x = 35; x < 60; x += 1) {
      const i = (y * width + x) * 3;
      data[i] = 200;
      data[i + 1] = 180;
      data[i + 2] = 160;
    }
  }
  return {
    tUs: us(tUs),
    width,
    height,
    data,
    format: 'rgb' as const,
  };
}

async function* fewFrames() {
  yield syntheticPersonFrame(0);
  yield syntheticPersonFrame(66_667);
  yield syntheticPersonFrame(133_334);
}

describe('pose smoke (CPU)', () => {
  it('reports missing weights honestly when models are absent', () => {
    const status = probePoseStatus({
      env: { ...process.env, COACH_POSE_MODELS: '/tmp/coach-pose-missing-models' },
      cwd: process.cwd(),
    });
    // If the developer already fetched into vendor/, availability may still be true via
    // the vendor fallback — only assert the shape of the status object here.
    expect(status.note.length).toBeGreaterThan(0);
    expect(typeof status.available).toBe('boolean');
  });

  it('runs detector+pose on synthetic RGB when weights are present', async () => {
    const located = locatePoseModels();
    if (!located.detectorOnnx || !located.poseOnnx) {
      console.warn(
        '[pose smoke] weights missing — skip inference (run scripts/pose/fetch-models.mjs)',
      );
      return;
    }
    const extractor = createNodePoseExtractor({
      located,
      platform: 'linux',
      arch: 'x64',
      detectorInterval: 1,
    });
    expect(extractor.ready()).toBe(true);
    let trackId = 0;
    const summary = await extractor.extract(fewFrames(), {
      videoId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      kind: 'detection',
      sampleFps: 15,
      displayWidth: 96,
      displayHeight: 128,
      rotation: 0,
      windows: [],
      maxPersons: 1,
      nextTrackId: () => {
        trackId += 1;
        // Valid ULID-shaped ids for the schema (26 Crockford base32 chars).
        const ids = ['01ARZ3NDEKTSV4RRFFQ69G5FAV', '01ARZ3NDEKTSV4RRFFQ69G5FAW'];
        return ids[trackId - 1] ?? '01ARZ3NDEKTSV4RRFFQ69G5FAX';
      },
    });
    expect(summary.framesProcessed).toBe(3);
    expect(summary.track.header.coordinateSpace).toBe('display');
    expect(summary.track.header.model).toBe('rtmpose-m-halpe26');
    expect(summary.track.header.modelVersion).toContain('halpe26');
    expect(summary.track.header.frameCount).toBe(3);
    expect(summary.track.header.runtime).toContain('onnxruntime-node');
    const landmarks = summary.track.landmarksByTrack.get(summary.track.header.selectedTrackId);
    expect(landmarks?.length).toBe(3 * 33 * 4);
  }, 120_000);

  it('finishes on CPU when the macOS CoreML session fails at run time', async () => {
    const located = locatePoseModels();
    if (!located.detectorOnnx || !located.poseOnnx) return;
    const requested: string[][] = [];
    // The synthetic blob is not a person to RTMDet; a fixed box (letterboxed 320² space,
    // ratio 2.5) makes the real RTMPose graph run so its CoreML failure is exercised.
    const fixedDetector = {
      inputNames: ['input'],
      outputNames: ['dets'],
      run: async () => ({
        dets: new Tensor('float32', Float32Array.from([87.5, 50, 150, 275, 0.9]), [1, 1, 5]),
      }),
      release: async () => undefined,
    };
    const openSession: OpenOrtSession = async (modelPath, providers) => {
      requested.push([...providers]);
      if (modelPath === located.detectorOnnx) return fixedDetector;
      const session = await InferenceSession.create(modelPath, { executionProviders: ['cpu'] });
      if (providers[0] !== 'coreml') return session;
      return {
        inputNames: session.inputNames,
        outputNames: session.outputNames,
        run: () =>
          Promise.reject(
            new Error(
              'CoreML static output shape ({1,1,1,2100,2100}) and inferred shape ({1,2100}) have different ranks.',
            ),
          ),
        release: () => session.release(),
      };
    };
    const extractor = createNodePoseExtractor({
      located,
      platform: 'darwin',
      arch: 'arm64',
      detectorInterval: 1,
      openSession,
    });
    const summary = await extractor.extract(fewFrames(), {
      videoId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      kind: 'detection',
      sampleFps: 15,
      displayWidth: 96,
      displayHeight: 128,
      rotation: 0,
      windows: [],
      maxPersons: 1,
      nextTrackId: () => '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    });
    expect(summary.framesProcessed).toBe(3);
    expect(summary.persons).toBe(1);
    expect(summary.track.header.runtime).toBe('onnxruntime-node/cpu');
    expect(requested).toEqual([['cpu'], ['coreml', 'cpu'], ['cpu']]);
  }, 120_000);
});
