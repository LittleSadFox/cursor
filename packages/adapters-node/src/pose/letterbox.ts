import type { BBox } from './bbox.js';

export type LetterboxResult = {
  /** NCHW float32 tensor, length = 1 × 3 × size × size. */
  tensor: Float32Array;
  /** Scale from original pixels into the letterboxed canvas. */
  ratio: number;
  padX: number;
  padY: number;
  size: number;
};

/**
 * Resize+pad an RGB frame into a square RTMDet input (keep aspect, pad 114).
 * Mean/std match MMDetection RTMDet BGR order after channel swap.
 */
export function letterboxRgb(
  rgb: Uint8Array,
  width: number,
  height: number,
  size: number,
  mean: readonly [number, number, number] = [103.53, 116.28, 123.675],
  std: readonly [number, number, number] = [57.375, 57.12, 58.395],
): LetterboxResult {
  const ratio = Math.min(size / width, size / height);
  const newW = Math.max(1, Math.round(width * ratio));
  const newH = Math.max(1, Math.round(height * ratio));
  const padX = 0;
  const padY = 0;
  const tensor = new Float32Array(1 * 3 * size * size);
  const plane = size * size;
  // Fill with padded normalized 114 (BGR).
  for (let c = 0; c < 3; c += 1) {
    const fill = (114 - mean[c]!) / std[c]!;
    tensor.fill(fill, c * plane, (c + 1) * plane);
  }
  for (let y = 0; y < newH; y += 1) {
    const srcY = Math.min(height - 1, Math.floor(y / ratio));
    for (let x = 0; x < newW; x += 1) {
      const srcX = Math.min(width - 1, Math.floor(x / ratio));
      const src = (srcY * width + srcX) * 3;
      const dstX = padX + x;
      const dstY = padY + y;
      const r = rgb[src] ?? 0;
      const g = rgb[src + 1] ?? 0;
      const b = rgb[src + 2] ?? 0;
      // RTMDet expects BGR mean/std (to_rgb: false).
      tensor[0 * plane + dstY * size + dstX] = (b - mean[0]!) / std[0]!;
      tensor[1 * plane + dstY * size + dstX] = (g - mean[1]!) / std[1]!;
      tensor[2 * plane + dstY * size + dstX] = (r - mean[2]!) / std[2]!;
    }
  }
  return { tensor, ratio, padX, padY, size };
}

/** Map detector boxes from letterboxed space back to original pixels. */
export function unletterboxBoxes(
  dets: Float32Array,
  count: number,
  ratio: number,
  scoreThreshold: number,
): BBox[] {
  const boxes: BBox[] = [];
  for (let i = 0; i < count; i += 1) {
    const base = i * 5;
    const score = dets[base + 4] ?? 0;
    if (score < scoreThreshold) continue;
    boxes.push({
      x1: (dets[base] ?? 0) / ratio,
      y1: (dets[base + 1] ?? 0) / ratio,
      x2: (dets[base + 2] ?? 0) / ratio,
      y2: (dets[base + 3] ?? 0) / ratio,
      score,
    });
  }
  return boxes;
}
