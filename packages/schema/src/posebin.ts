import { LANDMARK_COUNT, LANDMARK_STRIDE } from './landmarks.js';
import {
  assertPoseTrackInvariants,
  PoseTrackHeaderSchema,
  type PoseTrack,
  type PoseTrackHeader,
} from './pose-track.js';

const MAGIC = new TextEncoder().encode('POSEBIN\0');
const FORMAT_VERSION = 1;

function align8(n: number): number {
  return (n + 7) & ~7;
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

/**
 * Encode a PoseTrack to the posebin binary format (BUILD_PLAN §3.4).
 */
export function writePosebin(track: PoseTrack): Uint8Array {
  assertPoseTrackInvariants(track);
  const headerJson = new TextEncoder().encode(JSON.stringify(track.header));
  const headerLen = headerJson.length;
  const headerEnd = 16 + headerLen;
  const dataStart = align8(headerEnd);
  const n = track.header.frameCount;
  const tBytes = n * 8;
  const perTrackBytes = n * LANDMARK_COUNT * LANDMARK_STRIDE * 4;
  const total = dataStart + tBytes + track.header.tracks.length * perTrackBytes;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

  out.set(MAGIC, 0);
  writeU32(view, 8, FORMAT_VERSION);
  writeU32(view, 12, headerLen);
  out.set(headerJson, 16);

  let offset = dataStart;
  for (let i = 0; i < n; i++) {
    view.setFloat64(offset + i * 8, track.tUs[i]!, true);
  }
  offset += tBytes;

  for (const ref of track.header.tracks) {
    const buf = track.landmarksByTrack.get(ref.trackId)!;
    out.set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), offset);
    offset += perTrackBytes;
  }

  return out;
}

/**
 * Decode a posebin buffer into a PoseTrack.
 */
export function readPosebin(bytes: Uint8Array): PoseTrack {
  if (bytes.byteLength < 16) {
    throw new Error('posebin too short');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== MAGIC[i]) {
      throw new Error('invalid posebin magic');
    }
  }

  const version = readU32(view, 8);
  if (version !== FORMAT_VERSION) {
    throw new Error(`unsupported posebin version ${version}`);
  }

  const headerLen = readU32(view, 12);
  const headerEnd = 16 + headerLen;
  if (headerEnd > bytes.byteLength) {
    throw new Error('posebin header overruns buffer');
  }

  const headerText = new TextDecoder().decode(bytes.subarray(16, headerEnd));
  let rawHeader: unknown;
  try {
    rawHeader = JSON.parse(headerText);
  } catch {
    throw new Error('posebin header is not valid JSON');
  }
  const header: PoseTrackHeader = PoseTrackHeaderSchema.parse(rawHeader);

  const dataStart = align8(headerEnd);
  const n = header.frameCount;
  const tBytes = n * 8;
  const perTrackBytes = n * LANDMARK_COUNT * LANDMARK_STRIDE * 4;
  const needed = dataStart + tBytes + header.tracks.length * perTrackBytes;
  if (bytes.byteLength < needed) {
    throw new Error(`posebin truncated: need ${needed}, have ${bytes.byteLength}`);
  }

  const tUs = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    tUs[i] = view.getFloat64(dataStart + i * 8, true);
  }

  const landmarksByTrack = new Map<string, Float32Array>();
  let offset = dataStart + tBytes;
  for (const ref of header.tracks) {
    const slice = bytes.subarray(offset, offset + perTrackBytes);
    const copy = new Float32Array(perTrackBytes / 4);
    copy.set(new Float32Array(slice.buffer, slice.byteOffset, copy.length));
    landmarksByTrack.set(ref.trackId, copy);
    offset += perTrackBytes;
  }

  const track: PoseTrack = { header, tUs, landmarksByTrack };
  assertPoseTrackInvariants(track);
  return track;
}

export const POSEBIN_FORMAT_VERSION = FORMAT_VERSION;
