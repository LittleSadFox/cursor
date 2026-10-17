import type { VideoFrame } from '../ports/video.js';

/** Grayscale pixels scaled to 0..1, or null when the buffer is shorter than the frame. */
export function unitGray(frame: VideoFrame): Float32Array | null {
  const count = frame.width * frame.height;
  if (count <= 0) return null;
  const out = new Float32Array(count);
  if (frame.format === 'gray') {
    if (frame.data.length < count) return null;
    for (let i = 0; i < count; i += 1) out[i] = (frame.data[i] ?? 0) / 255;
    return out;
  }
  if (frame.data.length < count * 3) return null;
  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    const red = frame.data[offset] ?? 0;
    const green = frame.data[offset + 1] ?? 0;
    const blue = frame.data[offset + 2] ?? 0;
    out[i] = (red + green + blue) / (3 * 255);
  }
  return out;
}
