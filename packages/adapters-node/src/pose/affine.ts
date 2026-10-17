import type { BBox } from './bbox.js';

export type AffineCrop = {
  /** NCHW float32, 1×3×H×W with ImageNet RGB mean/std. */
  tensor: Float32Array;
  centerX: number;
  centerY: number;
  scaleW: number;
  scaleH: number;
  inputW: number;
  inputH: number;
};

function sampleBilinear(
  rgb: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number] {
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) {
    const xi = Math.min(width - 1, Math.max(0, Math.round(x)));
    const yi = Math.min(height - 1, Math.max(0, Math.round(y)));
    const i = (yi * width + xi) * 3;
    return [rgb[i] ?? 0, rgb[i + 1] ?? 0, rgb[i + 2] ?? 0];
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const dx = x - x0;
  const dy = y - y0;
  const i00 = (y0 * width + x0) * 3;
  const i01 = (y0 * width + x1) * 3;
  const i10 = (y1 * width + x0) * 3;
  const i11 = (y1 * width + x1) * 3;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c += 1) {
    const v00 = rgb[i00 + c] ?? 0;
    const v01 = rgb[i01 + c] ?? 0;
    const v10 = rgb[i10 + c] ?? 0;
    const v11 = rgb[i11 + c] ?? 0;
    out[c] =
      v00 * (1 - dx) * (1 - dy) + v01 * dx * (1 - dy) + v10 * (1 - dx) * dy + v11 * dx * dy;
  }
  return out;
}

/**
 * Top-down crop for RTMPose: pad bbox 1.25×, fix aspect to inputW/inputH, warp to NCHW.
 * `inputW`/`inputH` are network spatial size (192×256 for Halpe-26-m).
 */
export function topDownCrop(
  rgb: Uint8Array,
  width: number,
  height: number,
  box: BBox,
  inputW: number,
  inputH: number,
  padding = 1.25,
  mean: readonly [number, number, number] = [123.675, 116.28, 103.53],
  std: readonly [number, number, number] = [58.395, 57.12, 57.375],
): AffineCrop {
  const centerX = (box.x1 + box.x2) / 2;
  const centerY = (box.y1 + box.y2) / 2;
  let scaleW = (box.x2 - box.x1) * padding;
  let scaleH = (box.y2 - box.y1) * padding;
  const aspect = inputW / inputH;
  if (scaleW > scaleH * aspect) scaleH = scaleW / aspect;
  else scaleW = scaleH * aspect;

  const tensor = new Float32Array(1 * 3 * inputH * inputW);
  const plane = inputH * inputW;
  for (let y = 0; y < inputH; y += 1) {
    for (let x = 0; x < inputW; x += 1) {
      const srcX = centerX - scaleW / 2 + (x + 0.5) * (scaleW / inputW);
      const srcY = centerY - scaleH / 2 + (y + 0.5) * (scaleH / inputH);
      const [r, g, b] = sampleBilinear(rgb, width, height, srcX, srcY);
      const dest = y * inputW + x;
      tensor[0 * plane + dest] = (r - mean[0]!) / std[0]!;
      tensor[1 * plane + dest] = (g - mean[1]!) / std[1]!;
      tensor[2 * plane + dest] = (b - mean[2]!) / std[2]!;
    }
  }
  return { tensor, centerX, centerY, scaleW, scaleH, inputW, inputH };
}

/** Map keypoints from network input pixels back into the source frame. */
export function keypointsToImage(
  xs: Float32Array,
  ys: Float32Array,
  crop: AffineCrop,
): { xs: Float32Array; ys: Float32Array } {
  const outX = new Float32Array(xs.length);
  const outY = new Float32Array(ys.length);
  for (let i = 0; i < xs.length; i += 1) {
    const x = xs[i] ?? -1;
    const y = ys[i] ?? -1;
    if (x < 0 || y < 0) {
      outX[i] = Number.NaN;
      outY[i] = Number.NaN;
      continue;
    }
    outX[i] = (x / crop.inputW) * crop.scaleW + crop.centerX - crop.scaleW / 2;
    outY[i] = (y / crop.inputH) * crop.scaleH + crop.centerY - crop.scaleH / 2;
  }
  return { xs: outX, ys: outY };
}
