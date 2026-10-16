function swap(buffer: Float64Array, i: number, j: number): void {
  const tmp = buffer[i] ?? 0;
  buffer[i] = buffer[j] ?? 0;
  buffer[j] = tmp;
}

/** In-place radix-2 complex FFT. */
export function fftRadix2(real: Float64Array, imag: Float64Array, inverse: boolean): void {
  const n = real.length;
  if (imag.length !== n || n === 0 || (n & (n - 1)) !== 0) {
    throw new Error('fftRadix2: length must be a power of two');
  }
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      swap(real, i, j);
      swap(imag, i, j);
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / len;
    const wlenRe = Math.cos(angle);
    const wlenIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k += 1) {
        const evenRe = real[i + k] ?? 0;
        const evenIm = imag[i + k] ?? 0;
        const oddRe = real[i + k + half] ?? 0;
        const oddIm = imag[i + k + half] ?? 0;
        const vRe = oddRe * wRe - oddIm * wIm;
        const vIm = oddRe * wIm + oddIm * wRe;
        real[i + k] = evenRe + vRe;
        imag[i + k] = evenIm + vIm;
        real[i + k + half] = evenRe - vRe;
        imag[i + k + half] = evenIm - vIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i += 1) {
      real[i] = (real[i] ?? 0) / n;
      imag[i] = (imag[i] ?? 0) / n;
    }
  }
}

export function nextPow2(value: number): number {
  let power = 1;
  while (power < value) power <<= 1;
  return power;
}
