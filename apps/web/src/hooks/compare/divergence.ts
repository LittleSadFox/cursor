import { BLAZEPOSE_LANDMARKS } from '@climbing-coach/schema';

/** Divergence rows as served: `steps × channels.length` Float32, signed A − B deltas then `score`. */
export type DivergenceTable = {
  channels: readonly string[];
  values: Float32Array;
  steps: number;
};

/** Same threshold as the engine's `highlightScore` × `angleScaleDeg` (0.5 × 30°). */
export const HIGHLIGHT_MIN_DEG = 15;

const LANDMARK_NAMES: ReadonlySet<string> = new Set(BLAZEPOSE_LANDMARKS);

export function divergenceTable(
  values: Float32Array,
  channels: readonly string[],
): DivergenceTable {
  const steps = channels.length > 0 ? Math.floor(values.length / channels.length) : 0;
  return { channels, values, steps };
}

export function cellAt(table: DivergenceTable, step: number, channel: string): number {
  const column = table.channels.indexOf(channel);
  if (column < 0 || step < 0 || step >= table.steps) return Number.NaN;
  return table.values[step * table.channels.length + column] ?? Number.NaN;
}

export function scoreSeries(table: DivergenceTable): Float32Array {
  const series = new Float32Array(table.steps);
  for (let step = 0; step < table.steps; step += 1) series[step] = cellAt(table, step, 'score');
  return series;
}

/** Angle channels are named after their pivot landmark; composites are not landmarks. */
export function isJointChannel(channel: string): boolean {
  return LANDMARK_NAMES.has(channel);
}

/** Joints whose angle differs by at least `minDeg` on `step`. */
export function highlightedJoints(
  table: DivergenceTable,
  step: number,
  minDeg = HIGHLIGHT_MIN_DEG,
): Set<string> {
  return new Set(
    table.channels.filter(
      (channel) => isJointChannel(channel) && Math.abs(cellAt(table, step, channel)) >= minDeg,
    ),
  );
}
