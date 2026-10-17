import {
  type PoseExtractOptions,
  type PoseExtractSummary,
  type PoseExtractor,
  type PoseRuntimeInfo,
} from '@climbing-coach/core';
import {
  LANDMARK_COUNT,
  LANDMARK_STRIDE,
  type PoseTrack,
  type Us,
  us,
} from '@climbing-coach/schema';

import { keypointsToImage, topDownCrop } from './affine.js';
import { clampBBox, nms } from './bbox.js';
import { frameToRgb, normalizeLandmarks } from './frame-rgb.js';
import { HALPE26_COUNT, mapHalpe26ToBlaze } from './halpe26.js';
import { letterboxRgb, unletterboxBoxes } from './letterbox.js';
import {
  DETECTOR_ID,
  locatePoseModels,
  MODEL_VERSION,
  POSE_ID,
  type LocatedPoseModels,
} from './models.js';
import { openPoseSessions, runDetector, runPose, type OrtSessions } from './session.js';
import { decodeSimcc, simccToInputPixels } from './simcc.js';
import { associateDetections, shouldRunDetector, type TrackedPerson } from './track.js';

const DET_SIZE = 320;
const POSE_W = 192;
const POSE_H = 256;
const DET_SCORE = 0.3;
const DET_INTERVAL = 5;
const MAX_MISSED = 3;
const SIMCC_SPLIT = 2;
const SIMCC_X_BINS = 384;
const SIMCC_Y_BINS = 512;

type PersonBuffers = {
  trackId: string;
  firstFrame: number;
  lastFrame: number;
  landmarks: Float32Array[];
};

export type NodePoseExtractorOptions = {
  located?: LocatedPoseModels;
  platform?: NodeJS.Platform;
  arch?: string;
  detectorInterval?: number;
};

export function createNodePoseExtractor(
  options: NodePoseExtractorOptions = {},
): PoseExtractor {
  const located = options.located ?? locatePoseModels();
  let sessions: OrtSessions | null = null;
  let loading: Promise<OrtSessions> | null = null;

  async function ensureSessions(): Promise<OrtSessions> {
    if (sessions) return sessions;
    if (!located.detectorOnnx || !located.poseOnnx) {
      throw new Error('Pose weights are not installed. Run scripts/pose/fetch-models.mjs.');
    }
    if (!loading) {
      const sessionOpts: { platform?: NodeJS.Platform; arch?: string } = {};
      if (options.platform !== undefined) sessionOpts.platform = options.platform;
      if (options.arch !== undefined) sessionOpts.arch = options.arch;
      loading = openPoseSessions(located.detectorOnnx, located.poseOnnx, sessionOpts).then(
        (opened) => {
          sessions = opened;
          return opened;
        },
      );
    }
    return loading;
  }

  function info(): PoseRuntimeInfo {
    return {
      runtime: 'onnxruntime-node',
      model: POSE_ID,
      modelVersion: MODEL_VERSION,
      keypointSet: 'halpe26',
      executionProvider:
        sessions?.executionProvider ??
        (process.platform === 'darwin' && process.arch === 'arm64' ? 'coreml' : 'cpu'),
      inputSize: { width: POSE_W, height: POSE_H },
    };
  }

  return {
    info,
    ready: () => Boolean(located.detectorOnnx && located.poseOnnx),
    async extract(frames, extractOptions): Promise<PoseExtractSummary> {
      const ort = await ensureSessions();
      const maxPersons = extractOptions.maxPersons ?? 2;
      const interval = options.detectorInterval ?? DET_INTERVAL;
      const tUs: Us[] = [];
      const people = new Map<number, PersonBuffers>();
      let tracks: TrackedPerson[] = [];
      let frameIndex = 0;
      let displayW = extractOptions.displayWidth;
      let displayH = extractOptions.displayHeight;

      for await (const frame of frames) {
        extractOptions.signal?.throwIfAborted();
        const { rgb, width, height } = frameToRgb(frame);
        if (frameIndex === 0) {
          displayW = width;
          displayH = height;
        }

        if (shouldRunDetector(frameIndex, interval) || tracks.length === 0) {
          const boxed = letterboxRgb(rgb, width, height, DET_SIZE);
          const { dets, count } = await runDetector(ort.detector, boxed.tensor, DET_SIZE);
          const detected = nms(
            unletterboxBoxes(dets, count, boxed.ratio, DET_SCORE).map((box) =>
              clampBBox(box, width, height),
            ),
            0.45,
          );
          tracks = associateDetections(tracks, detected, {
            iouThreshold: 0.3,
            maxPersons,
            maxMissed: MAX_MISSED,
          });
        }

        for (const track of tracks) {
          if (track.missed > 0) continue;
          const crop = topDownCrop(rgb, width, height, track.box, POSE_W, POSE_H);
          const { simccX, simccY, keypointCount } = await runPose(
            ort.pose,
            crop.tensor,
            POSE_W,
            POSE_H,
          );
          const decoded = decodeSimcc(
            simccX,
            simccY,
            keypointCount || HALPE26_COUNT,
            SIMCC_X_BINS,
            SIMCC_Y_BINS,
          );
          const inputPx = simccToInputPixels(decoded.xs, decoded.ys, SIMCC_SPLIT);
          const imagePx = keypointsToImage(inputPx.xs, inputPx.ys, crop);
          const blaze = mapHalpe26ToBlaze(imagePx.xs, imagePx.ys, decoded.scores);
          const normalized = normalizeLandmarks(blaze, width, height);

          let buffers = people.get(track.trackIndex);
          if (!buffers) {
            buffers = {
              trackId: extractOptions.nextTrackId(),
              firstFrame: tUs.length,
              lastFrame: tUs.length,
              landmarks: [],
            };
            people.set(track.trackIndex, buffers);
          }
          // Align landmark rows with global frame list (pad gaps with NaN).
          while (buffers.landmarks.length < tUs.length) {
            buffers.landmarks.push(nanLandmarks());
          }
          buffers.landmarks.push(normalized);
          buffers.lastFrame = tUs.length;
        }

        tUs.push(us(frame.tUs));
        frameIndex += 1;
        extractOptions.onProgress?.({
          framesDone: frameIndex,
          framesTotal: null,
          processedUntilUs: us(frame.tUs),
        });
      }

      const track = buildPoseTrack(extractOptions, tUs, people, displayW, displayH, info());
      return {
        track,
        framesProcessed: frameIndex,
        persons: people.size,
      };
    },
  };
}

function nanLandmarks(): Float32Array {
  const buf = new Float32Array(LANDMARK_COUNT * LANDMARK_STRIDE);
  buf.fill(Number.NaN);
  return buf;
}

function buildPoseTrack(
  options: PoseExtractOptions,
  tUs: readonly Us[],
  people: Map<number, PersonBuffers>,
  displayWidth: number,
  displayHeight: number,
  runtime: PoseRuntimeInfo,
): PoseTrack {
  const frameCount = tUs.length;
  const ordered = [...people.entries()].sort((a, b) => a[0] - b[0]);
  if (ordered.length === 0) {
    const trackId = options.nextTrackId();
    const empty = new Float32Array(frameCount * LANDMARK_COUNT * LANDMARK_STRIDE);
    empty.fill(Number.NaN);
    return {
      header: {
        videoId: options.videoId,
        kind: options.kind,
        runtime: `${runtime.runtime}/${runtime.executionProvider}`,
        model: runtime.model,
        modelVersion: `${runtime.modelVersion}+${runtime.keypointSet}`,
        sampleFps: options.sampleFps,
        windows: options.windows.length
          ? [...options.windows]
          : frameCount > 0
            ? [{ startUs: tUs[0]!, endUs: tUs[frameCount - 1]! }]
            : [],
        coordinateSpace: 'display',
        displayWidth,
        displayHeight,
        rotation: options.rotation,
        tracks: [{ trackId, firstFrame: 0, lastFrame: Math.max(0, frameCount - 1) }],
        selectedTrackId: trackId,
        frameCount,
      },
      tUs: Float64Array.from(tUs),
      landmarksByTrack: new Map([[trackId, empty]]),
    };
  }

  // Prefer the largest average bbox proxy: longest contiguous presence.
  let selected = ordered[0]![1];
  let bestSpan = -1;
  for (const [, buffers] of ordered) {
    const span = buffers.lastFrame - buffers.firstFrame;
    if (span > bestSpan) {
      bestSpan = span;
      selected = buffers;
    }
  }

  const landmarksByTrack = new Map<string, Float32Array>();
  const refs = ordered.map(([, buffers]) => {
    const packed = new Float32Array(frameCount * LANDMARK_COUNT * LANDMARK_STRIDE);
    packed.fill(Number.NaN);
    for (let i = 0; i < buffers.landmarks.length; i += 1) {
      const dest = i * LANDMARK_COUNT * LANDMARK_STRIDE;
      packed.set(buffers.landmarks[i]!, dest);
    }
    landmarksByTrack.set(buffers.trackId, packed);
    return {
      trackId: buffers.trackId,
      firstFrame: buffers.firstFrame,
      lastFrame: Math.min(buffers.lastFrame, Math.max(0, frameCount - 1)),
    };
  });

  return {
    header: {
      videoId: options.videoId,
      kind: options.kind,
      runtime: `${runtime.runtime}/${runtime.executionProvider}`,
      model: runtime.model,
      modelVersion: `${runtime.modelVersion}+${runtime.keypointSet}`,
      sampleFps: options.sampleFps,
      windows: options.windows.length
        ? [...options.windows]
        : frameCount > 0
          ? [{ startUs: tUs[0]!, endUs: tUs[frameCount - 1]! }]
          : [],
      coordinateSpace: 'display',
      displayWidth,
      displayHeight,
      rotation: options.rotation,
      tracks: refs,
      selectedTrackId: selected.trackId,
      frameCount,
    },
    tUs: Float64Array.from(tUs),
    landmarksByTrack,
  };
}

/** Exported for unit tests that do not load ORT. */
export const poseInternals = {
  DETECTOR_ID,
  POSE_ID,
  DET_SIZE,
  POSE_W,
  POSE_H,
};
