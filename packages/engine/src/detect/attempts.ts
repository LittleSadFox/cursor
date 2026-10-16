import { at } from '../math.js';
import { STARTING_PARAMS, type StartingParams } from '../params.js';
import type { PoseSample } from '../pose/types.js';
import { estimateFloor } from './floor.js';
import { detectorSignals } from './signals.js';
import type { AttemptDetection, ExitDirection, FrameSignal } from './types.js';

type DetectParams = StartingParams['detect'];

export function detectStarts(signals: readonly FrameSignal[], params: DetectParams): number[] {
  const starts: number[] = [];
  let index = 0;
  while (index < signals.length) {
    if (!confirmedStart(signals, index, params)) {
      index += 1;
      continue;
    }
    starts.push(at(signals, index).tUs);
    const end = findEnd(signals, index, params, 1);
    index = end.nextIndex;
  }
  return starts;
}

export function detectEnds(
  signals: readonly FrameSignal[],
  params: DetectParams,
  bodyHeight: number,
): { tUs: number; outcome: AttemptDetection['outcome']; exitDirection: ExitDirection }[] {
  const ends: {
    tUs: number;
    outcome: AttemptDetection['outcome'];
    exitDirection: ExitDirection;
  }[] = [];
  let index = 0;
  while (index < signals.length) {
    if (!confirmedStart(signals, index, params)) {
      index += 1;
      continue;
    }
    const end = findEnd(signals, index, params, bodyHeight);
    ends.push({
      tUs: at(signals, end.endIndex).tUs,
      outcome: end.outcome,
      exitDirection: end.exitDirection,
    });
    index = end.nextIndex;
  }
  return ends;
}

export function classifyOutcome(
  attempt: Pick<AttemptDetection, 'outcome'>,
): AttemptDetection['outcome'] {
  return attempt.outcome;
}

export function exitDirectionOf(signal: FrameSignal): ExitDirection {
  return signal.exitEdge;
}

export function detectAttempts(
  samples: readonly PoseSample[],
  params: StartingParams = STARTING_PARAMS,
): {
  floor: ReturnType<typeof estimateFloor>;
  attempts: AttemptDetection[];
  signals: FrameSignal[];
} {
  const floor = estimateFloor(samples, params);
  const signals = detectorSignals(samples, floor, params);
  return { floor, signals, attempts: detectFromSignals(signals, floor, params) };
}

export function detectFromSignals(
  signals: readonly FrameSignal[],
  floor: { confidence: 'high' | 'low'; bodyHeight: number },
  params: StartingParams = STARTING_PARAMS,
): AttemptDetection[] {
  const attempts: AttemptDetection[] = [];
  let index = 0;
  while (index < signals.length) {
    if (!confirmedStart(signals, index, params.detect)) {
      index += 1;
      continue;
    }
    const start = at(signals, index);
    const end = findEnd(signals, index, params.detect, floor.bodyHeight);
    const endSignal = at(signals, end.endIndex);
    attempts.push({
      startUs: start.tUs,
      endUs: endSignal.tUs,
      outcome: end.outcome,
      exitDirection: end.exitDirection,
      startConfidence: floor.confidence,
    });
    index = end.nextIndex;
  }
  return attempts;
}

function confirmedStart(
  signals: readonly FrameSignal[],
  index: number,
  params: DetectParams,
): boolean {
  const start = at(signals, index);
  if (!start.inFrame || !start.bothAnklesUp || !start.hipStill) return false;
  if (!start.wristsAboveShoulders && !start.crouched) return false;
  let reached = false;
  for (let cursor = index; cursor < signals.length; cursor += 1) {
    const frame = at(signals, cursor);
    const dt = frame.tUs - start.tUs;
    if (!frame.inFrame || !frame.bothAnklesUp || !frame.hipStill) return false;
    if (dt >= params.hipStillUs) {
      reached = true;
      break;
    }
  }
  return reached;
}

type EndMatch = {
  endIndex: number;
  nextIndex: number;
  outcome: AttemptDetection['outcome'];
  exitDirection: ExitDirection;
};

function findReturn(
  signals: readonly FrameSignal[],
  gapIndex: number,
  gapUs: number,
): number | null {
  const leftAt = at(signals, gapIndex).tUs;
  for (let cursor = gapIndex; cursor < signals.length; cursor += 1) {
    const frame = at(signals, cursor);
    if (frame.tUs - leftAt >= gapUs) return null;
    if (frame.inFrame && frame.bothAnklesUp) return cursor;
  }
  return null;
}

function findEnd(
  signals: readonly FrameSignal[],
  startIndex: number,
  params: DetectParams,
  bodyHeight: number,
): EndMatch {
  let maxWrist = Number.POSITIVE_INFINITY;
  let dwellStartUs: number | null = null;
  let topped = false;
  const slack = params.wristAtMaxEpsilonBodyHeights * bodyHeight;
  for (let cursor = startIndex; cursor < signals.length; cursor += 1) {
    const frame = at(signals, cursor);
    if (!frame.inFrame) {
      const returned = findReturn(signals, cursor, params.walkOutGapUs);
      if (returned !== null) {
        dwellStartUs = null;
        cursor = returned - 1;
        continue;
      }
      const edge = frame.exitEdge;
      return {
        endIndex: Math.max(startIndex, cursor - 1),
        nextIndex: cursor,
        outcome: edge === 'top' ? 'top' : 'unknown',
        exitDirection: edge,
      };
    }
    if (frame.wristY < maxWrist - 1e-9) {
      maxWrist = frame.wristY;
      dwellStartUs = null;
      topped = false;
    }
    const atMax = frame.wristY <= maxWrist + slack;
    if (atMax && frame.wristsStationary) {
      if (dwellStartUs === null) dwellStartUs = frame.tUs;
      if (frame.tUs - dwellStartUs >= params.topDwellUs) topped = true;
    } else {
      dwellStartUs = null;
    }
    if (cursor > startIndex && frame.hipVy > params.fallDownBodyHeightsPerSec) {
      return {
        endIndex: cursor,
        nextIndex: cursor + 1,
        outcome: topped ? 'top' : 'fall',
        exitDirection: 'none',
      };
    }
    if (topped && cursor > startIndex && frame.hipVy > params.hipStillBodyHeightsPerSec) {
      return { endIndex: cursor, nextIndex: cursor + 1, outcome: 'top', exitDirection: 'none' };
    }
    if (cursor > startIndex && !frame.bothAnklesUp) {
      return {
        endIndex: cursor,
        nextIndex: cursor + 1,
        outcome: topped ? 'top' : 'drop',
        exitDirection: 'none',
      };
    }
  }
  const last = signals.length - 1;
  return {
    endIndex: last,
    nextIndex: signals.length,
    outcome: topped ? 'top' : 'unknown',
    exitDirection: 'none',
  };
}
