import { parseSignalsJson, stringifySignals, type SignalsFile } from '@climbing-coach/schema';

import type { BlobStore } from '../ports/blobs.js';

export function signalsPath(videoId: string): string {
  return `signals/${videoId}.json`;
}

export async function writeSignals(blobs: BlobStore, file: SignalsFile): Promise<void> {
  await blobs.write(signalsPath(file.videoId), new TextEncoder().encode(stringifySignals(file)));
}

/** Stored signals, or null when the activity pass never wrote them or they do not parse. */
export async function readSignals(blobs: BlobStore, videoId: string): Promise<SignalsFile | null> {
  try {
    return parseSignalsJson(new TextDecoder().decode(await blobs.read(signalsPath(videoId))));
  } catch {
    return null;
  }
}
