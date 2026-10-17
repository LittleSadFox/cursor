import { BLAZEPOSE_LANDMARKS, LANDMARK_COUNT, LANDMARK_STRIDE } from '@climbing-coach/schema';

/** Halpe-26 keypoint names in model output order (MMPose `halpe26.py`). */
export const HALPE26_LANDMARKS = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
  'head',
  'neck',
  'hip',
  'left_big_toe',
  'right_big_toe',
  'left_small_toe',
  'right_small_toe',
  'left_heel',
  'right_heel',
] as const;

export type Halpe26Landmark = (typeof HALPE26_LANDMARKS)[number];

export const HALPE26_COUNT = HALPE26_LANDMARKS.length;

/** Halpe-26 index → BlazePose landmark name. Unlisted BlazePose points stay NaN. */
const HALPE_TO_BLAZE: ReadonlyArray<{ halpe: number; blaze: (typeof BLAZEPOSE_LANDMARKS)[number] }> =
  [
    { halpe: 0, blaze: 'nose' },
    { halpe: 1, blaze: 'leftEye' },
    { halpe: 2, blaze: 'rightEye' },
    { halpe: 3, blaze: 'leftEar' },
    { halpe: 4, blaze: 'rightEar' },
    { halpe: 5, blaze: 'leftShoulder' },
    { halpe: 6, blaze: 'rightShoulder' },
    { halpe: 7, blaze: 'leftElbow' },
    { halpe: 8, blaze: 'rightElbow' },
    { halpe: 9, blaze: 'leftWrist' },
    { halpe: 10, blaze: 'rightWrist' },
    { halpe: 11, blaze: 'leftHip' },
    { halpe: 12, blaze: 'rightHip' },
    { halpe: 13, blaze: 'leftKnee' },
    { halpe: 14, blaze: 'rightKnee' },
    { halpe: 15, blaze: 'leftAnkle' },
    { halpe: 16, blaze: 'rightAnkle' },
    { halpe: 20, blaze: 'leftFootIndex' },
    { halpe: 21, blaze: 'rightFootIndex' },
    { halpe: 24, blaze: 'leftHeel' },
    { halpe: 25, blaze: 'rightHeel' },
  ];

const BLAZE_INDEX = new Map(BLAZEPOSE_LANDMARKS.map((name, index) => [name, index]));

/**
 * Map Halpe-26 (x, y, score) into a BlazePose landmark slot: x, y, z=0, visibility=score.
 * Coordinates stay in the caller's pixel/display space; the caller normalizes.
 */
export function mapHalpe26ToBlaze(
  xs: Float32Array,
  ys: Float32Array,
  scores: Float32Array,
): Float32Array {
  const out = new Float32Array(LANDMARK_COUNT * LANDMARK_STRIDE);
  out.fill(Number.NaN);
  for (const { halpe, blaze } of HALPE_TO_BLAZE) {
    const dest = (BLAZE_INDEX.get(blaze) ?? -1) * LANDMARK_STRIDE;
    if (dest < 0) continue;
    const score = scores[halpe] ?? 0;
    const x = xs[halpe] ?? Number.NaN;
    const y = ys[halpe] ?? Number.NaN;
    if (!(score > 0) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    out[dest] = x;
    out[dest + 1] = y;
    out[dest + 2] = 0;
    out[dest + 3] = score;
  }
  return out;
}
