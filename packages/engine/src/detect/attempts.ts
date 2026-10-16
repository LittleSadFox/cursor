import { at } from '../math.js';
import { STARTING_PARAMS, type StartingParams } from '../params.js';
import type { PoseSample } from '../pose/types.js';
import { estimateFloor } from './floor.js';
import { detectorSignals, exitEdge } from './signals.js';
import type { AttemptDetection, ExitDirection, FloorEstimate, FrameSignal } from './types.js';

type DetectParams = StartingParams['detect'];

type EndMatch = {
  endIndex: number;
  nextIndex: number;
  outcome: AttemptDetection['outcome'];
  exitDirection: ExitDirection;
};

type AttemptSpan = { startIndex: number; end: EndMatch };

/**
 * One pass over the signals: each confirmed start is paired with its end, and the
 * next start is searched for after that end. Starts, ends, and attempts all read this.
 */
function scanAttempts(
  signals: readonly FrameSignal[],
  params: DetectParams,
  bodyHeight: number,
): AttemptSpan[] {
  const spans: AttemptSpan[] = [];
  let index = 0;
  while (index < signals.length) {
    if (!confirmedStart(signals, index, params)) {
      index += 1;
      continue;
    }
    const end = findEnd(signals, index, params, bodyHeight);
    spans.push({ startIndex: index, end });
    index = end.nextIndex;
  }
  return spans;
}

export function detectStarts(
  signals: readonly FrameSignal[],
  params: DetectParams,
  bodyHeight: number,
): number[] {
  return scanAttempts(signals, params, bodyHeight).map((span) => at(signals, span.startIndex).tUs);
}

export function detectEnds(
  signals: readonly FrameSignal[],
  params: DetectParams,
  bodyHeight: number,
): { tUs: number; outcome: AttemptDetection['outcome']; exitDirection: ExitDirection }[] {
  return scanAttempts(signals, params, bodyHeight).map(({ end }) => ({
    tUs: at(signals, end.endIndex).tUs,
    outcome: end.outcome,
    exitDirection: end.exitDirection,
  }));
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
  floor: FloorEstimate;
  attempts: AttemptDetection[];
  signals: FrameSignal[];
} {
  const floor = estimateFloor(samples, params);
  const signals = detectorSignals(samples, floor, params);
  return { floor, signals, attempts: detectFromSignals(signals, floor, params) };
}

export function detectFromSignals(
  signals: readonly FrameSignal[],
  floor: Pick<FloorEstimate, 'confidence' | 'bodyHeight'>,
  params: StartingParams = STARTING_PARAMS,
): AttemptDetection[] {
  return scanAttempts(signals, params.detect, floor.bodyHeight).map(({ startIndex, end }) => ({
    startUs: at(signals, startIndex).tUs,
    endUs: at(signals, end.endIndex).tUs,
    outcome: end.outcome,
    exitDirection: end.exitDirection,
    startConfidence: floor.confidence,
  }));
}

function confirmedStart(
  signals: readonly FrameSignal[],
  index: number,
  params: DetectParams,
): boolean {
  const start = at(signals, index);
  if (!start.inFrame || !start.bothAnklesUp || !start.hipStill) return false;
  if (!start.wristsAboveShoulders && !start.crouched) return false;
  for (let cursor = index; cursor < signals.length; cursor += 1) {
    const frame = at(signals, cursor);
    if (!frame.inFrame || !frame.bothAnklesUp || !frame.hipStill) return false;
    if (frame.tUs - start.tUs >= params.hipStillUs) return true;
  }
  return false;
}

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

/**
 * Edge the climber left through. Pose runtimes report missing landmarks as NaN, so
 * when the exit frame has no hip position the last in-frame hip decides, if it was
 * near an edge.
 */
function exitDirectionAt(
  signals: readonly FrameSignal[],
  index: number,
  params: DetectParams,
): ExitDirection {
  const frame = at(signals, index);
  if (frame.exitEdge !== 'none' || index === 0) return frame.exitEdge;
  const last = at(signals, index - 1);
  return exitEdge(last.hipX, last.hipY, params.lastSeenEdgeMargin);
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
      const edge = exitDirectionAt(signals, cursor, params);
      return {
        endIndex: Math.max(startIndex, cursor - 1),
        nextIndex: cursor,
        outcome: topped || edge === 'top' ? 'top' : 'unknown',
        exitDirection: edge,
      };
    }
    if (frame.wristY < maxWrist - 1e-9) {
      maxWrist = frame.wristY;
      dwellStartUs = null;
      topped = false;
    }
    const bothAtMax = frame.lowerWristY <= maxWrist + slack;
    if (bothAtMax && frame.wristsStationary) {
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
  return {
    endIndex: signals.length - 1,
    nextIndex: signals.length,
    outcome: topped ? 'top' : 'unknown',
    exitDirection: 'none',
  };
}
