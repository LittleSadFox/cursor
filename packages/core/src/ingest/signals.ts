import {
  STARTING_PARAMS,
  activitySeries,
  activeWindows,
  cameraMovingWarning,
  globalMotion,
  type GlobalShift,
} from '@climbing-coach/engine';
import {
  stringifySignals,
  us,
  type RecordingWarning,
  type SignalsFile,
} from '@climbing-coach/schema';

import type { VideoFrame } from '../ports/video.js';
import { unitGray } from './gray.js';

/** Keyframe gap above this uses a 2 fps decode instead of keyframes (BUILD_PLAN §3.3). */
export const GOP_LIMIT_US = 2_000_000;

export const ACTIVITY_MAX_SIDE = STARTING_PARAMS.activity.grayscalePx;

export function signalsPath(videoId: string): string {
  return `signals/${videoId}.json`;
}

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

export type ActivityFrame = {
  tUs: number;
  width: number;
  height: number;
  pixels: ArrayLike<number>;
};

/** Decode frames into 0..1 gray, dropping buffers that do not match their size. */
export function activityFrames(frames: readonly VideoFrame[]): ActivityFrame[] {
  const out: ActivityFrame[] = [];
  for (const frame of frames) {
    const pixels = unitGray(frame);
    if (!pixels) continue;
    out.push({ tUs: frame.tUs, width: frame.width, height: frame.height, pixels });
  }
  return out;
}

function sameSize(left: ActivityFrame, right: ActivityFrame): boolean {
  return (
    left.width === right.width &&
    left.height === right.height &&
    left.pixels.length === left.width * left.height &&
    right.pixels.length === right.width * right.height
  );
}

function sampleRate(frames: readonly ActivityFrame[]): number {
  const fallback = STARTING_PARAMS.activity.sampleFps;
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (!first || !last || frames.length < 2) return fallback;
  const span = last.tUs - first.tUs;
  if (span <= 0) return fallback;
  return Math.max(((frames.length - 1) * 1_000_000) / span, 0.001);
}

function shiftBetween(previous: ActivityFrame, next: ActivityFrame): GlobalShift | null {
  if (!sameSize(previous, next)) return null;
  return globalMotion(previous.pixels, next.pixels, previous.width, previous.height);
}

/** Activity energy, camera motion, and active windows for one recording. */
export function buildSignalsFile(
  videoId: string,
  durationUs: number,
  frames: readonly ActivityFrame[],
): SignalsFile {
  const comparable = frames.filter((frame, index) => {
    if (index === 0) return true;
    const previous = frames[index - 1];
    return previous ? sameSize(previous, frame) : false;
  });
  const series = comparable.length >= 2 ? activitySeries(comparable) : [];
  const shifts: (GlobalShift | null)[] = [];
  for (let index = 1; index < comparable.length; index += 1) {
    const previous = comparable[index - 1];
    const next = comparable[index];
    shifts.push(previous && next ? shiftBetween(previous, next) : null);
  }
  const present = shifts.filter((shift): shift is GlobalShift => shift !== null);
  const warnings: RecordingWarning[] = cameraMovingWarning(present) ? ['camera_moving'] : [];
  const file: SignalsFile = {
    schemaVersion: 1,
    videoId,
    sampleFps: sampleRate(comparable),
    samples: series.map((sample, index) => {
      const shift = shifts[index];
      return {
        tUs: us(Math.round(sample.tUs)),
        energy: sample.energy,
        globalMotion: shift?.peak ?? 0,
        ...(shift ? { dx: shift.dx, dy: shift.dy } : {}),
      };
    }),
    activeWindows: activeWindows(series, durationUs, STARTING_PARAMS.activity).map((window) => ({
      startUs: us(Math.round(window.startUs)),
      endUs: us(Math.round(window.endUs)),
    })),
    warnings,
  };
  return JSON.parse(stringifySignals(file)) as SignalsFile;
}
