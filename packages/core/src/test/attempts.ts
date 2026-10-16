import { BLAZEPOSE_LANDMARKS, LANDMARK_COUNT, writePosebin } from '@climbing-coach/schema';
import { PoseBuilder, REACH, STAND, type RawSample } from '@climbing-coach/test-fixtures';

import { attempts, poseTracks, videos } from '../db/schema.js';
import { createIdGen, sequentialRandomBytes } from '../ids/ulid.js';
import type { BlobStore } from '../ports/blobs.js';
import type { Clock } from '../ports/clock.js';
import type { AppDatabase } from '../ports/sql.js';

const INDEX = Object.fromEntries(BLAZEPOSE_LANDMARKS.map((name, i) => [name, i]));
const RIGHT_HIP = INDEX.rightHip ?? 0;
const RIGHT_KNEE = INDEX.rightKnee ?? 0;
const RIGHT_ANKLE = INDEX.rightAnkle ?? 0;
const LEFT_KNEE = INDEX.leftKnee ?? 0;

/** Stand, step onto the wall, rest, reach higher, hold. Knees bent so angles are well defined. */
export function climbFrames(restSeconds = 1): RawSample[] {
  const builder = new PoseBuilder();
  const high = { ...REACH, wristY: -0.15, leftWristY: 0.02 };
  builder.hold(STAND, 1);
  builder.ramp(STAND, REACH, 1);
  builder.hold(REACH, restSeconds);
  builder.ramp(REACH, high, 0.6);
  builder.hold(high, 1);
  return builder.samples.map((sample) => {
    const landmarks = sample.landmarks.map((point) => [...point]);
    (landmarks[RIGHT_KNEE] as number[])[0] = ((landmarks[RIGHT_KNEE] as number[])[0] ?? 0) + 0.07;
    (landmarks[LEFT_KNEE] as number[])[0] = ((landmarks[LEFT_KNEE] as number[])[0] ?? 0) - 0.07;
    return { tUs: sample.tUs, landmarks };
  });
}

/** Rotate the right shank toward the thigh by `degrees`, closing the right knee. */
export function closeRightKnee(frames: readonly RawSample[], degrees: number): RawSample[] {
  return frames.map((sample) => {
    const landmarks = sample.landmarks.map((point) => [...point]);
    const [hx = 0, hy = 0] = landmarks[RIGHT_HIP] ?? [];
    const [kx = 0, ky = 0] = landmarks[RIGHT_KNEE] ?? [];
    const ankle = landmarks[RIGHT_ANKLE] ?? [0, 0, 0, 1];
    const sx = (ankle[0] ?? 0) - kx;
    const sy = (ankle[1] ?? 0) - ky;
    const sign = Math.sign(sx * (hy - ky) - sy * (hx - kx));
    const radians = (sign * degrees * Math.PI) / 180;
    ankle[0] = kx + sx * Math.cos(radians) - sy * Math.sin(radians);
    ankle[1] = ky + sx * Math.sin(radians) + sy * Math.cos(radians);
    landmarks[RIGHT_ANKLE] = ankle;
    return { tUs: sample.tUs, landmarks };
  });
}

export function posebinOf(
  videoId: string,
  trackId: string,
  frames: readonly RawSample[],
  model: string,
  modelVersion: string,
): Uint8Array {
  const buffer = new Float32Array(frames.length * LANDMARK_COUNT * 4);
  frames.forEach((sample, frame) => {
    sample.landmarks.forEach((point, index) =>
      buffer.set(point, (frame * LANDMARK_COUNT + index) * 4),
    );
  });
  return writePosebin({
    header: {
      videoId,
      kind: 'hq',
      runtime: 'test',
      model,
      modelVersion,
      sampleFps: 15,
      windows: [],
      coordinateSpace: 'display',
      displayWidth: 1920,
      displayHeight: 1080,
      rotation: 0,
      tracks: [{ trackId, firstFrame: 0, lastFrame: frames.length - 1 }],
      selectedTrackId: trackId,
      frameCount: frames.length,
    },
    tUs: Float64Array.from(frames, (sample) => sample.tUs),
    landmarksByTrack: new Map([[trackId, buffer]]),
  });
}

export type SeedOptions = {
  frames?: RawSample[];
  outcome?: string;
  model?: string;
  modelVersion?: string;
  /** false → the attempt has no HQ pose track. */
  hq?: boolean;
};

export type SeededAttempt = {
  attemptId: string;
  videoId: string;
  poseTrackId: string;
  path: string;
};

/**
 * Inserts a clip video, its HQ pose track (posebin in `blobs`), and an attempt over the whole
 * clip — the rows P2-B's commit pipeline will write once ingest exists.
 */
export function attemptSeeder(db: AppDatabase, clock: Clock, blobs: BlobStore) {
  const ids = createIdGen(clock, sequentialRandomBytes(77));
  return async (options: SeedOptions = {}): Promise<SeededAttempt> => {
    const frames = options.frames ?? climbFrames();
    const now = clock.nowIso();
    const videoId = ids.ulid();
    const poseTrackId = ids.ulid();
    const attemptId = ids.ulid();
    const path = `pose/${videoId}.hq.posebin`;
    db.insert(videos)
      .values({
        id: videoId,
        kind: 'clip',
        path: `clips/${videoId}.mov`,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    if (options.hq !== false) {
      const model = options.model ?? 'rtmpose-m-body26';
      const modelVersion = options.modelVersion ?? '1';
      await blobs.write(path, posebinOf(videoId, poseTrackId, frames, model, modelVersion));
      db.insert(poseTracks)
        .values({
          id: poseTrackId,
          videoId,
          kind: 'hq',
          runtime: 'test',
          model,
          modelVersion,
          sampleFps: 15,
          path,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
    db.insert(attempts)
      .values({
        id: attemptId,
        clipVideoId: videoId,
        sessionId: ids.ulid(),
        climbStartUs: 0,
        climbEndUs: (frames[frames.length - 1]?.tUs ?? 0) + 1,
        outcome: options.outcome ?? 'top',
        recordedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { attemptId, videoId, poseTrackId, path };
  };
}
