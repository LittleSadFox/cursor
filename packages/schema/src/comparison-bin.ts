const MAGIC = new TextEncoder().encode('CMPBIN\0\0');
const FORMAT_VERSION = 1;
const HEADER_BYTES = 24;

/**
 * Comparison result (`comparisons/<id>.bin`, BUILD_PLAN §3.4).
 * `warpUs` is Int32 `[steps × 2]`: clip-time microseconds of A and B per warp step.
 * `divergence` is Float32 `[steps × channels]`, row-major.
 */
export type ComparisonBin = {
  warpUs: Int32Array;
  divergence: Float32Array;
  channels: number;
};

function assertShape(bin: ComparisonBin): number {
  if (bin.warpUs.length % 2 !== 0) throw new Error('warpUs length must be even');
  const steps = bin.warpUs.length / 2;
  if (!Number.isInteger(bin.channels) || bin.channels <= 0) {
    throw new Error('channels must be a positive integer');
  }
  if (bin.divergence.length !== steps * bin.channels) {
    throw new Error(`divergence length ${bin.divergence.length} != ${steps} × ${bin.channels}`);
  }
  return steps;
}

export function writeComparisonBin(bin: ComparisonBin): Uint8Array {
  const steps = assertShape(bin);
  const warpBytes = steps * 2 * 4;
  const out = new Uint8Array(HEADER_BYTES + warpBytes + bin.divergence.length * 4);
  const view = new DataView(out.buffer);
  out.set(MAGIC, 0);
  view.setUint32(8, FORMAT_VERSION, true);
  view.setUint32(12, steps, true);
  view.setUint32(16, bin.channels, true);
  bin.warpUs.forEach((value, index) => view.setInt32(HEADER_BYTES + index * 4, value, true));
  const divergenceStart = HEADER_BYTES + warpBytes;
  bin.divergence.forEach((value, index) =>
    view.setFloat32(divergenceStart + index * 4, value, true),
  );
  return out;
}

export function readComparisonBin(bytes: Uint8Array): ComparisonBin {
  if (bytes.byteLength < HEADER_BYTES) throw new Error('comparison bin too short');
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (bytes[i] !== MAGIC[i]) throw new Error('not a comparison bin');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(8, true);
  if (version !== FORMAT_VERSION) throw new Error(`unsupported comparison bin version ${version}`);
  const steps = view.getUint32(12, true);
  const channels = view.getUint32(16, true);
  const warpStart = HEADER_BYTES;
  const divergenceStart = warpStart + steps * 2 * 4;
  const expected = divergenceStart + steps * channels * 4;
  if (bytes.byteLength !== expected) {
    throw new Error(`comparison bin is ${bytes.byteLength} bytes, expected ${expected}`);
  }
  const warpUs = Int32Array.from({ length: steps * 2 }, (_, i) =>
    view.getInt32(warpStart + i * 4, true),
  );
  const divergence = Float32Array.from({ length: steps * channels }, (_, i) =>
    view.getFloat32(divergenceStart + i * 4, true),
  );
  return { warpUs, divergence, channels };
}

export const COMPARISON_BIN_FORMAT_VERSION = FORMAT_VERSION;

/** Int32 µs reach about 35.8 minutes of clip time. */
export const MAX_WARP_US = 2 ** 31 - 1;

/** A clip time that fits the Int32 warp column; anything else would wrap silently. */
export function warpTimeUs(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_WARP_US) {
    throw new Error(`warp time ${value} µs is not an integer in [0, ${MAX_WARP_US}]`);
  }
  return value;
}
