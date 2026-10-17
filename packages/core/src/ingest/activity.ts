import {
  STARTING_PARAMS,
  activeWindows,
  activityEnergy,
  cameraMovingWarning,
  globalMotion,
  type GlobalShift,
} from '@climbing-coach/engine';
import { us, type RecordingWarning, type SignalsFile } from '@climbing-coach/schema';

import type { VideoFrame } from '../ports/video.js';
import { unitGray } from './gray.js';

/** Keyframe gap above this uses a 2 fps decode instead of keyframes (BUILD_PLAN §3.3). */
export const GOP_LIMIT_US = 2_000_000;

export const ACTIVITY_MAX_SIDE = STARTING_PARAMS.activity.grayscalePx;

/**
 * True when keyframes are missing or farther apart than `GOP_LIMIT_US`, including the
 * gap from the last keyframe to the end of the recording.
 */
export function needsDenseActivitySample(
  keyframeTimesUs: readonly number[],
  durationUs: number,
): boolean {
  if (durationUs <= 0) return false;
  if (keyframeTimesUs.length === 0) return true;
  const times = [...keyframeTimesUs].sort((a, b) => a - b);
  let previous = 0;
  for (const time of times) {
    if (time - previous > GOP_LIMIT_US) return true;
    previous = time;
  }
  return durationUs - previous > GOP_LIMIT_US;
}

type GrayFrame = { tUs: number; width: number; height: number; pixels: Float32Array };

type PairSample = { tUs: number; energy: number; shift: GlobalShift };

export type ActivityPass = {
  push(frame: VideoFrame): void;
  /** Timestamps of every readable frame, including ones that could not be compared. */
  times(): readonly number[];
  signals(videoId: string, durationUs: number): SignalsFile;
};

function comparable(previous: GrayFrame, next: GrayFrame): boolean {
  return previous.width === next.width && previous.height === next.height;
}

function sampleRate(times: readonly number[]): number {
  const first = times[0];
  const last = times[times.length - 1];
  if (first === undefined || last === undefined || last <= first) {
    return STARTING_PARAMS.activity.sampleFps;
  }
  return ((times.length - 1) * 1_000_000) / (last - first);
}

function toSignals(
  videoId: string,
  durationUs: number,
  pairs: readonly PairSample[],
  times: readonly number[],
): SignalsFile {
  const series = pairs.map(({ tUs, energy }) => ({ tUs, energy }));
  const warnings: RecordingWarning[] = cameraMovingWarning(pairs.map((pair) => pair.shift))
    ? ['camera_moving']
    : [];
  return {
    schemaVersion: 1,
    videoId,
    sampleFps: sampleRate(times),
    samples: pairs.map(({ tUs, energy, shift }) => ({
      tUs: us(Math.round(tUs)),
      energy,
      globalMotion: shift.peak,
      dx: shift.dx,
      dy: shift.dy,
    })),
    activeWindows: activeWindows(series, durationUs, STARTING_PARAMS.activity).map((window) => ({
      startUs: us(Math.round(window.startUs)),
      endUs: us(Math.round(window.endUs)),
    })),
    warnings,
  };
}

/**
 * Streaming activity pass: keeps only the previous frame, so memory does not grow with
 * recording length. Frames whose size changes start a new comparison run.
 */
export function createActivityPass(): ActivityPass {
  let previous: GrayFrame | null = null;
  const pairs: PairSample[] = [];
  const times: number[] = [];
  return {
    push(frame) {
      const pixels = unitGray(frame);
      if (!pixels) return;
      const next: GrayFrame = { tUs: frame.tUs, width: frame.width, height: frame.height, pixels };
      times.push(next.tUs);
      if (previous && comparable(previous, next)) {
        pairs.push({
          tUs: next.tUs,
          energy: activityEnergy(previous.pixels, next.pixels),
          shift: globalMotion(previous.pixels, next.pixels, next.width, next.height),
        });
      }
      previous = next;
    },
    times: () => times,
    signals: (videoId, durationUs) => toSignals(videoId, durationUs, pairs, times),
  };
}

/** Feed every frame of `frames` into a fresh pass. */
export async function runActivityPass(
  frames: AsyncIterable<VideoFrame>,
  signal?: AbortSignal,
): Promise<ActivityPass> {
  const pass = createActivityPass();
  for await (const frame of frames) {
    if (signal?.aborted) throw new Error('activity decode aborted');
    pass.push(frame);
  }
  return pass;
}
