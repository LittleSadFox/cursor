/**
 * Starting detector parameters from BUILD_PLAN §2.4.
 * Version 0.2.0 is the untuned table plus comparison thresholds. P1.11 (dev-split grid search) is blocked
 * on the real climbing dataset, so these values are not yet a 1.0 release.
 */
export const PARAMS_VERSION = '0.2.0';

export const STARTING_PARAMS = {
  activity: {
    /** Keyframes, or this rate when GOP > 2 s. Frame source is P1.7. */
    sampleFps: 2,
    grayscalePx: 160,
    /** Mean absolute difference on pixels scaled 0..1. */
    energyThreshold: 0.01,
    maxGapUs: 5_000_000,
    padUs: 3_000_000,
    fullRecordingFraction: 0.8,
    cameraMinPeak: 0.25,
    cameraMinShiftPx: 1.5,
    cameraMinFraction: 0.6,
  },
  pose: {
    detectionFps: 15,
    hqFps: 30,
    minVisibility: 0.5,
    maxGapFrames: 5,
    oneEuro: { minCutoffHz: 1, beta: 0.007, dCutoffHz: 1 },
    /**
     * Body height ≈ this multiple of torso length (mid-shoulder to mid-hip).
     * Used when a full standing height is not on screen. Assumption, not a tuned constant.
     */
    torsoToBodyHeight: 2.5,
  },
  detect: {
    ankleLiftBodyHeights: 0.15,
    hipStillBodyHeightsPerSec: 0.3,
    hipStillUs: 500_000,
    fallDownBodyHeightsPerSec: 1.5,
    topDwellUs: 700_000,
    walkOutGapUs: 3_000_000,
    wristAtMaxEpsilonBodyHeights: 0.05,
    /** Hip within this fraction of the frame edge counts as leaving through it. */
    exitEdgeMargin: 0.02,
    /** When the exit frame has no hip position, use the last in-frame hip within this margin. */
    lastSeenEdgeMargin: 0.2,
    floorWindowUs: 1_000_000,
    boundaryOffsetBoundUs: 1_000_000,
    boundaryOffsetMinLabels: 20,
    boundaryOffsetSameSignFraction: 0.7,
  },
  moves: {
    stationaryLimbTorsoPerSec: 0.15,
    stationaryMinUs: 250_000,
    holdSeparationTorso: 0.2,
  },
  align: {
    restSpeedTorsoPerSec: 0.1,
    restMinUs: 1_000_000,
    restKeepFrames: 3,
    dtwBandFraction: 0.2,
    pcaComponents: 16,
  },
  compare: {
    /** Divergence score units: this many degrees, or torso lengths, count as 1. */
    angleScaleDeg: 30,
    torsoScale: 0.5,
    /** Per-move mean deltas below these are not reported as differences. */
    minAngleDeltaDeg: 10,
    minTorsoDelta: 0.15,
    topDifferences: 3,
    /** Score at or above which a joint is highlighted on the overlay. */
    highlightScore: 0.5,
  },
  padding: {
    preUs: 2_000_000,
    postUs: 1_500_000,
  },
} as const;

export type StartingParams = typeof STARTING_PARAMS;
