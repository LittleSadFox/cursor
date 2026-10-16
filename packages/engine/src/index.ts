/**
 * Pure analysis algorithms (PLAN 2.1–2.9, 2.11).
 * Video decode and the pose runtime stay in adapters (P1.7, P1.8).
 */
export const ENGINE_VERSION = '0.1.0';

export { PARAMS_VERSION, STARTING_PARAMS, type StartingParams } from './params.js';
export { clamp, median } from './math.js';

export { createMulberry32, type Rng } from './eval/rng.js';
export { wilsonInterval, type ProportionInterval } from './eval/wilson.js';
export { bootstrapMedianCi, type MedianInterval } from './eval/bootstrap.js';
export {
  matchClimbRanges,
  scoreDetection,
  falsePositivesPerMinute,
  type BoundaryMatch,
  type DetectionScore,
  type MatchOptions,
} from './eval/detection.js';
export { overlapUs, rangesOverlap, type ClimbRange } from './eval/ranges.js';

export { activityEnergy, activitySeries, type GrayFrame } from './activity/energy.js';
export { globalMotion, cameraMovingWarning, type GlobalShift } from './activity/motion.js';
export { activeWindows, type ActivityWindow, type ActiveWindowParams } from './activity/windows.js';

export type { PoseSample, TrackSamples, WallRect, XyzV } from './pose/types.js';
export { DEFAULT_WALL, selectClimberTrack } from './pose/select-track.js';
export { oneEuroFilter, lowPassAlpha, type OneEuroParams } from './pose/one-euro.js';
export { fillGaps, type GapFillParams } from './pose/gaps.js';
export { normalize } from './pose/normalize.js';
export { bodyMetrics, estimateBodyHeight, type BodyMetrics } from './pose/metrics.js';
export { preprocess, type PreprocessParams } from './pose/preprocess.js';

export { FEATURE_SPEC, FEATURE_SPEC_VERSION, FEATURE_NAMES } from './features/spec.js';
export {
  frameFeatures,
  attemptFeatures,
  moveFeatures,
  type FrameFeatures,
} from './features/frame.js';

export { estimateFloor } from './detect/floor.js';
export { detectorSignals } from './detect/signals.js';
export {
  detectAttempts,
  detectFromSignals,
  detectStarts,
  detectEnds,
  classifyOutcome,
  exitDirectionOf,
} from './detect/attempts.js';
export { applyBoundaryOffset, boundaryOffsetUs } from './detect/offset.js';
export type {
  AttemptDetection,
  ExitDirection,
  FloorEstimate,
  FrameSignal,
} from './detect/types.js';

export {
  proposeItems,
  clipRangeOf,
  splitItem,
  mergeItems,
  validateDraft,
  mergeDetectorUpdate,
  manualItem,
} from './cut/draft.js';
export { deriveLabels } from './cut/labels.js';
export type { DraftItem, DraftSource, DerivedLabel } from './cut/types.js';

export {
  stationaryPeriods,
  segmentMoves,
  fallMoveIndex,
  MOVE_LIMBS,
  type MoveLimb,
  type MoveSegment,
  type StationaryPeriod,
} from './moves/segment.js';

export { matchMoves } from './align/nw.js';
export { collapseRests, type RestCollapseParams } from './align/rest.js';
export { bandedDtw, openEndDtw, type DtwResult, type DtwStep } from './align/dtw.js';
export { reduceFeatures } from './align/pca.js';
export { align, type AlignFrame, type AlignOptions, type AlignResult } from './align/align.js';

export { GRADE_SYSTEMS, BOULDER_SYSTEMS, ROUTE_SYSTEMS, isGradeSystem, type GradeSystem } from './grades/systems.js';
export { toDifficultyIndex, formatGrade, parseGrade } from './grades/convert.js';

export { addDays, eachDay, isoWeek, daysBetween } from './stats/dates.js';
export { sessionLoad } from './stats/load.js';
export { prefillTrainingLog } from './stats/prefill.js';
export { rollingAverages, ewmaLoad } from './stats/averages.js';
export { acwr, acwrBand } from './stats/acwr.js';
export { trainingLoad } from './stats/training-load.js';
export { exertionVolume, focusDistribution, gradePyramid, weeklySummary } from './stats/charts.js';
export type {
  AcwrBand,
  AttemptSummary,
  DailyLoadPoint,
  DailyLog,
  DateRange,
  Discipline,
  ExertionVolumePoint,
  FocusBucket,
  GradeTally,
  LoadMethod,
  TrainingLoadSeries,
  TrainingLogPrefill,
  WeeklySummary,
} from './stats/types.js';
