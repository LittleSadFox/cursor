import type { MoveSegment } from '../moves/segment.js';
import { STARTING_PARAMS } from '../params.js';
import { CHANNEL_COUNT, DIVERGENCE_CHANNELS, channelMetric } from './channels.js';
import { describeDifference, type DifferenceFacts } from './describe.js';
import type { CompareParams, DivergenceSeries } from './divergence.js';

export type MoveSummary = {
  moveIndexA: number;
  /** Warp steps whose A frame falls inside the move. */
  steps: number;
  meanScore: number;
  /** Mean signed delta (A − B) per channel; NaN when the channel never had data. */
  meanDeltas: number[];
};

export type Difference = DifferenceFacts & { text: string };

export type ComparisonSummary = {
  meanDivergence: number;
  topDifferences: Difference[];
};

/** Every move of A in progress at `tUs`; different limbs can move at once. */
function movesAt(moves: readonly MoveSegment[], tUs: number): MoveSegment[] {
  return moves.filter((move) => tUs >= move.startUs && tUs < move.endUs);
}

type Accumulator = {
  steps: number;
  score: number;
  scored: number;
  sums: number[];
  counts: number[];
};

function emptyAccumulator(): Accumulator {
  return {
    steps: 0,
    score: 0,
    scored: 0,
    sums: Array.from({ length: CHANNEL_COUNT }, () => 0),
    counts: Array.from({ length: CHANNEL_COUNT }, () => 0),
  };
}

function addStep(acc: Accumulator, series: DivergenceSeries, step: number): void {
  acc.steps += 1;
  const score = series.score[step] ?? Number.NaN;
  if (Number.isFinite(score)) {
    acc.score += score;
    acc.scored += 1;
  }
  for (let channel = 0; channel < CHANNEL_COUNT; channel += 1) {
    const value = series.deltas[step * CHANNEL_COUNT + channel] ?? Number.NaN;
    if (!Number.isFinite(value)) continue;
    acc.sums[channel] = (acc.sums[channel] ?? 0) + value;
    acc.counts[channel] = (acc.counts[channel] ?? 0) + 1;
  }
}

/** Per-move aggregates over warp steps, keyed by attempt A's moves. */
export function summarizeByMove(
  series: DivergenceSeries,
  warp: Int32Array,
  tUsA: Float64Array,
  movesA: readonly MoveSegment[],
): MoveSummary[] {
  const byMove = new Map<number, Accumulator>(
    movesA.map((move) => [move.index, emptyAccumulator()]),
  );
  for (let step = 0; step < series.score.length; step += 1) {
    const frame = warp[step * 2] ?? -1;
    for (const move of movesAt(movesA, tUsA[frame] ?? Number.NaN)) {
      const acc = byMove.get(move.index);
      if (acc) addStep(acc, series, step);
    }
  }
  return movesA.map((move) => {
    const acc = byMove.get(move.index) ?? emptyAccumulator();
    return {
      moveIndexA: move.index,
      steps: acc.steps,
      meanScore: acc.scored === 0 ? Number.NaN : acc.score / acc.scored,
      meanDeltas: acc.sums.map((sum, channel) =>
        (acc.counts[channel] ?? 0) === 0 ? Number.NaN : sum / (acc.counts[channel] ?? 1),
      ),
    };
  });
}

function minimumFor(metric: DifferenceFacts['metric'], params: CompareParams): number {
  return metric === 'angleDeg' ? params.minAngleDeltaDeg : params.minTorsoDelta;
}

function scaleFor(metric: DifferenceFacts['metric'], params: CompareParams): number {
  return metric === 'angleDeg' ? params.angleScaleDeg : params.torsoScale;
}

type WeightedFacts = DifferenceFacts & { weight: number };

function weightedFacts(move: MoveSummary, params: CompareParams): WeightedFacts[] {
  const facts: WeightedFacts[] = [];
  move.meanDeltas.forEach((meanDelta, channel) => {
    const joint = DIVERGENCE_CHANNELS[channel];
    if (joint === undefined || !Number.isFinite(meanDelta)) return;
    const metric = channelMetric(joint);
    if (Math.abs(meanDelta) < minimumFor(metric, params)) return;
    const weight = Math.abs(meanDelta) / scaleFor(metric, params);
    facts.push({ moveIndexA: move.moveIndexA, joint, metric, meanDelta, weight });
  });
  return facts;
}

function byWeight(x: WeightedFacts, y: WeightedFacts): number {
  return y.weight - x.weight || x.moveIndexA - y.moveIndexA;
}

function described({ weight: _weight, ...facts }: WeightedFacts): Difference {
  return { ...facts, text: describeDifference(facts) };
}

/** Every difference of one move above the reporting minimum, largest first, with English text. */
export function moveDifferences(
  move: MoveSummary,
  params: CompareParams = STARTING_PARAMS.compare,
): Difference[] {
  return weightedFacts(move, params).sort(byWeight).map(described);
}

/** Each channel's largest difference only, so one steady offset does not fill the list. */
function strongestPerChannel(facts: readonly WeightedFacts[]): WeightedFacts[] {
  const best = new Map<string, WeightedFacts>();
  for (const fact of facts) {
    const current = best.get(fact.joint);
    if (!current || byWeight(fact, current) < 0) best.set(fact.joint, fact);
  }
  return [...best.values()];
}

/** Largest per-move differences above the reporting minimum, one per channel, with text. */
export function topDifferences(
  moves: readonly MoveSummary[],
  params: CompareParams = STARTING_PARAMS.compare,
): Difference[] {
  const candidates = strongestPerChannel(moves.flatMap((move) => weightedFacts(move, params)));
  return candidates.sort(byWeight).slice(0, params.topDifferences).map(described);
}

export function meanFinite(values: ArrayLike<number>): number {
  let sum = 0;
  let count = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? Number.NaN;
    if (!Number.isFinite(value)) continue;
    sum += value;
    count += 1;
  }
  return count === 0 ? Number.NaN : sum / count;
}
