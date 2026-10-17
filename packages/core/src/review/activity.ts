import type { ActivityTrack } from '@climbing-coach/api';
import {
  STARTING_PARAMS,
  activityChart,
  detectorSignals,
  estimateFloor,
  trackSamples,
} from '@climbing-coach/engine';
import { readPosebin, us } from '@climbing-coach/schema';

import { findPoseTrack } from '../db/repos/attempts.js';
import { readSignals } from '../ingest/signals-store.js';
import type { BlobStore } from '../ports/blobs.js';
import type { AppDatabase } from '../ports/sql.js';
import { chartStride } from './chart.js';

/** Energy samples kept for the lane. Hip points have their own budget in the engine. */
const ENERGY_POINTS = 800;

/**
 * Activity lane for one recording. Missing signals or a missing pose track
 * leave that half empty; the threshold is always the detector's current one.
 */
export async function loadActivityTrack(
  db: AppDatabase,
  blobs: BlobStore | undefined,
  videoId: string,
): Promise<ActivityTrack> {
  const file = blobs ? await readSignals(blobs, videoId) : null;
  const samples = chartStride(file?.samples ?? [], ENERGY_POINTS).map((sample) => ({
    tUs: sample.tUs,
    energy: sample.energy,
  }));
  return {
    energyThreshold: STARTING_PARAMS.activity.energyThreshold,
    samples,
    activeWindows: file?.activeWindows ?? [],
    hip: await hipOf(db, blobs, videoId),
  };
}

async function hipOf(
  db: AppDatabase,
  blobs: BlobStore | undefined,
  videoId: string,
): Promise<ActivityTrack['hip']> {
  if (!blobs) return null;
  const stored = findPoseTrack(db, videoId, 'detection');
  if (!stored) return null;
  try {
    const samples = trackSamples(readPosebin(await blobs.read(stored.path)));
    if (samples.length === 0) return [];
    return activityChart(detectorSignals(samples, estimateFloor(samples))).map((point) => ({
      ...point,
      tUs: us(point.tUs),
    }));
  } catch {
    return null;
  }
}
