import type { VideoFrame } from '@climbing-coach/core';

/** Ensure RGB bytes for the pose/det networks (gray is expanded). */
export function frameToRgb(frame: VideoFrame): {
  rgb: Uint8Array;
  width: number;
  height: number;
} {
  if (frame.format === 'rgb') {
    return { rgb: frame.data, width: frame.width, height: frame.height };
  }
  const rgb = new Uint8Array(frame.width * frame.height * 3);
  for (let i = 0; i < frame.data.length; i += 1) {
    const v = frame.data[i] ?? 0;
    const o = i * 3;
    rgb[o] = v;
    rgb[o + 1] = v;
    rgb[o + 2] = v;
  }
  return { rgb, width: frame.width, height: frame.height };
}

/** Normalize image-pixel landmarks into display-normalized [0,1] BlazePose slots. */
export function normalizeLandmarks(
  landmarks: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(landmarks.length);
  for (let i = 0; i < landmarks.length; i += 4) {
    const x = landmarks[i]!;
    const y = landmarks[i + 1]!;
    out[i] = Number.isFinite(x) ? x / width : Number.NaN;
    out[i + 1] = Number.isFinite(y) ? y / height : Number.NaN;
    out[i + 2] = landmarks[i + 2]!;
    out[i + 3] = landmarks[i + 3]!;
  }
  return out;
}
