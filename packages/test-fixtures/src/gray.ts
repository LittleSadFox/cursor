export type GrayFrame = {
  tUs: number;
  width: number;
  height: number;
  pixels: Float32Array;
};

function fill(width: number, height: number, value: number): Float32Array {
  return Float32Array.from({ length: width * height }, () => value);
}

export function staticFrames(
  count: number,
  dtUs: number,
  width = 16,
  height = 16,
  value = 0.4,
): GrayFrame[] {
  return Array.from({ length: count }, (_, index) => ({
    tUs: index * dtUs,
    width,
    height,
    pixels: fill(width, height, value),
  }));
}

/** A small bright blob translates. The background stays put. */
export function movingBlob(count: number, dtUs: number, width = 16, height = 16): GrayFrame[] {
  return Array.from({ length: count }, (_, index) => {
    const pixels = fill(width, height, 0.1);
    const x = 2 + (index % (width - 4));
    const y = 4;
    pixels[y * width + x] = 1;
    pixels[y * width + x + 1] = 1;
    return { tUs: index * dtUs, width, height, pixels };
  });
}

/** A non-periodic image shifted right by 2 px per frame (a camera pan). */
export function panningFrames(count: number, dtUs: number, width = 16, height = 16): GrayFrame[] {
  const base = fill(width, height, 0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      base[y * width + x] = ((x * 3 + y * 5) % 13) / 13;
    }
  }
  return Array.from({ length: count }, (_, index) => {
    const pixels = fill(width, height, 0);
    const shift = index * 2;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const source = x - shift;
        pixels[y * width + x] = source >= 0 && source < width ? (base[y * width + source] ?? 0) : 0;
      }
    }
    return { tUs: index * dtUs, width, height, pixels };
  });
}
