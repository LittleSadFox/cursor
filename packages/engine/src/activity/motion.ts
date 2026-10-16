import { STARTING_PARAMS, type StartingParams } from '../params.js';
import { fftRadix2, nextPow2 } from './fft.js';

export type GlobalShift = {
  /** Pixels the next frame's content moved right relative to the previous frame. */
  dx: number;
  /** Pixels the next frame's content moved down. */
  dy: number;
  /** Peak magnitude of the normalized phase-correlation surface. */
  peak: number;
};

function wrapShift(peak: number, size: number): number {
  return peak > size / 2 ? peak - size : peak;
}

/**
 * Integer translation of `next` relative to `previous` via phase correlation.
 * Width and height may be any positive size; the FFT is zero-padded to a power of two.
 */
export function globalMotion(
  previous: ArrayLike<number>,
  next: ArrayLike<number>,
  width: number,
  height: number,
): GlobalShift {
  if (previous.length !== width * height || next.length !== width * height) {
    throw new Error('globalMotion: buffer length must equal width * height');
  }
  const paddedW = nextPow2(width);
  const paddedH = nextPow2(height);
  const size = paddedW * paddedH;
  const re1 = new Float64Array(size);
  const im1 = new Float64Array(size);
  const re2 = new Float64Array(size);
  const im2 = new Float64Array(size);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const src = y * width + x;
      const dst = y * paddedW + x;
      re1[dst] = previous[src] ?? 0;
      re2[dst] = next[src] ?? 0;
    }
  }
  fft2(re1, im1, paddedW, paddedH, false);
  fft2(re2, im2, paddedW, paddedH, false);
  for (let i = 0; i < size; i += 1) {
    const aRe = re1[i] ?? 0;
    const aIm = im1[i] ?? 0;
    const bRe = re2[i] ?? 0;
    const bIm = im2[i] ?? 0;
    const crossRe = aRe * bRe + aIm * bIm;
    const crossIm = aIm * bRe - aRe * bIm;
    const mag = Math.hypot(crossRe, crossIm);
    re1[i] = mag > 1e-12 ? crossRe / mag : 0;
    im1[i] = mag > 1e-12 ? crossIm / mag : 0;
  }
  fft2(re1, im1, paddedW, paddedH, true);
  let peak = 0;
  let peakX = 0;
  let peakY = 0;
  for (let y = 0; y < paddedH; y += 1) {
    for (let x = 0; x < paddedW; x += 1) {
      const value = re1[y * paddedW + x] ?? 0;
      if (value > peak) {
        peak = value;
        peakX = x;
        peakY = y;
      }
    }
  }
  // The correlation peak is the shift that takes `next` back onto `previous`,
  // so negate it to report how the content moved.
  const dx = -wrapShift(peakX, paddedW) || 0;
  const dy = -wrapShift(peakY, paddedH) || 0;
  return { dx, dy, peak };
}

function fft2(
  real: Float64Array,
  imag: Float64Array,
  width: number,
  height: number,
  inverse: boolean,
): void {
  const rowRe = new Float64Array(width);
  const rowIm = new Float64Array(width);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      rowRe[x] = real[y * width + x] ?? 0;
      rowIm[x] = imag[y * width + x] ?? 0;
    }
    fftRadix2(rowRe, rowIm, inverse);
    for (let x = 0; x < width; x += 1) {
      real[y * width + x] = rowRe[x] ?? 0;
      imag[y * width + x] = rowIm[x] ?? 0;
    }
  }
  const colRe = new Float64Array(height);
  const colIm = new Float64Array(height);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      colRe[y] = real[y * width + x] ?? 0;
      colIm[y] = imag[y * width + x] ?? 0;
    }
    fftRadix2(colRe, colIm, inverse);
    for (let y = 0; y < height; y += 1) {
      real[y * width + x] = colRe[y] ?? 0;
      imag[y * width + x] = colIm[y] ?? 0;
    }
  }
}

export function cameraMovingWarning(
  shifts: readonly GlobalShift[],
  params: Pick<
    StartingParams['activity'],
    'cameraMinPeak' | 'cameraMinShiftPx' | 'cameraMinFraction'
  > = STARTING_PARAMS.activity,
): boolean {
  if (shifts.length === 0) return false;
  let strong = 0;
  for (const shift of shifts) {
    if (
      shift.peak >= params.cameraMinPeak &&
      Math.hypot(shift.dx, shift.dy) >= params.cameraMinShiftPx
    ) {
      strong += 1;
    }
  }
  return strong / shifts.length >= params.cameraMinFraction;
}
