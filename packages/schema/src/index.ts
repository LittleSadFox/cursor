export {
  UsSchema,
  us,
  usOrThrow,
  IsoDateTimeSchema,
  LocalDateSchema,
  type Us,
  type LocalDate,
} from './time.js';

export { UlidSchema, isUlid, type Ulid } from './ids.js';

export {
  BLAZEPOSE_LANDMARKS,
  ENGINE_CORE_LANDMARKS,
  LANDMARK_COUNT,
  LANDMARK_STRIDE,
  type BlazePoseLandmark,
} from './landmarks.js';

export {
  PoseTrackKindSchema,
  ActiveWindowSchema,
  PoseTrackRefSchema,
  PoseTrackHeaderSchema,
  landmarkOffset,
  assertPoseTrackInvariants,
  assertTimestamps,
  type PoseTrackKind,
  type ActiveWindow,
  type PoseTrackRef,
  type PoseTrackHeader,
  type PoseTrack,
} from './pose-track.js';

export { writePosebin, readPosebin, POSEBIN_FORMAT_VERSION } from './posebin.js';

export {
  RecordingWarningSchema,
  MotionSampleSchema,
  SignalsFileSchema,
  parseSignalsJson,
  stringifySignals,
  type RecordingWarning,
  type MotionSample,
  type SignalsFile,
} from './signals.js';

export {
  LabelKindSchema,
  AttemptOutcomeSchema,
  ExitDirectionSchema,
  LimbSchema,
  LabelExportRowSchema,
  TemporalLabelSchema,
  parseLabelJsonl,
  stringifyLabelJsonl,
  parseTemporalLabelJsonl,
  stringifyTemporalLabelJsonl,
  type LabelKind,
  type AttemptOutcome,
  type ExitDirection,
  type Limb,
  type LabelExportRow,
  type TemporalLabel,
} from './labels.js';

export {
  FeatureDtypeSchema,
  FeatureFieldSchema,
  FeatureSpecSchema,
  FEATURE_SPEC_PLACEHOLDER,
  parseFeatureSpec,
  stringifyFeatureSpec,
  type FeatureDtype,
  type FeatureField,
  type FeatureSpec,
} from './feature-spec.js';

export {
  WallAngleSchema,
  DatasetSplitSchema,
  RecordingManifestEntrySchema,
  DatasetManifestSchema,
  RelativeMediaPathSchema,
  parseDatasetManifest,
  stringifyDatasetManifest,
  countBySplit,
  testSplitSha256Of,
  type WallAngle,
  type DatasetSplit,
  type RecordingManifestEntry,
  type DatasetManifest,
} from './dataset.js';

export {
  ClimbRangeSchema,
  EvalCaseSchema,
  EvalFixtureSchema,
  parseEvalFixture,
  type ClimbRangeDto,
  type EvalCase,
  type EvalFixture,
} from './eval-fixture.js';

export { sha256Hex } from './sha256.js';

export { exportJsonSchemas } from './json-schema.js';

/** Schema package semver; derived data should record this. Tagged schema v1. */
export const SCHEMA_VERSION = '1.0.0';
