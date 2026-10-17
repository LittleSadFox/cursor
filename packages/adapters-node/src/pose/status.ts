import { locatePoseModels, MODEL_VERSION, POSE_ID, type LocatedPoseModels } from './models.js';

export type PoseStatus = {
  available: boolean;
  version: string | null;
  note: string;
  located: LocatedPoseModels;
};

function noteFor(located: LocatedPoseModels, available: boolean): string {
  if (available) {
    return `Pose runtime ready: RTMDet-nano + RTMPose-m Halpe-26 (Apache-2.0) from ${located.source}.`;
  }
  if (!located.manifest) {
    return 'Pose manifest missing (vendor/pose/manifest.json).';
  }
  return (
    'Pose weights missing. Run `node scripts/pose/fetch-models.mjs` ' +
    '(or set COACH_POSE_MODELS) to download RTMDet-nano + RTMPose-m Halpe-26. ADR-001.'
  );
}

/** Honest health probe: weights present and checksum-verified. Does not load ORT. */
export function probePoseStatus(options: {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  configDir?: string;
} = {}): PoseStatus {
  const located = locatePoseModels(options);
  const available = Boolean(located.detectorOnnx && located.poseOnnx);
  return {
    available,
    version: available ? `${POSE_ID}@${MODEL_VERSION}` : null,
    note: noteFor(located, available),
    located,
  };
}
