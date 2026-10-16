import type { ComparisonDifference, MoveComparison } from '@climbing-coach/api';
import { describe, expect, it } from 'vitest';

import { moveAt, moveSpans, moveViews } from './moves.js';
import { buildTimeline } from './timeline.js';

const knee: ComparisonDifference = {
  moveIndexA: 1,
  joint: 'rightKnee',
  metric: 'angleDeg',
  meanDelta: 15,
  text: 'Right knee 15° straighter through move 2',
};

function move(
  moveIndexA: number,
  startUs: number,
  endUs: number,
  differences: ComparisonDifference[] = [],
): MoveComparison {
  return { moveIndexA, startUs, endUs, steps: 3, meanScore: 0.4, meanDeltas: [], differences };
}

describe('moveViews', () => {
  const views = moveViews(
    [move(0, 0, 100), move(1, 100, 250, [knee])],
    [
      { a: 0, b: null },
      { a: 1, b: 0 },
    ],
  );

  it('pairs each move of A with its counterpart and differences', () => {
    expect(views.map((view) => view.moveIndexB)).toEqual([null, 0]);
    expect(views[0]?.differences).toEqual([]);
    expect(views[1]?.differences).toEqual([knee]);
  });

  it('finds the move playing at a time of A', () => {
    expect(moveAt(views, 120)?.moveIndexA).toBe(1);
    expect(moveAt(views, 250)).toBeNull();
  });

  it('places moves on the timeline, stretched where B rests longer', () => {
    const timeline = buildTimeline(Int32Array.from([0, 0, 100, 100, 100, 300, 250, 450]));
    const climbA = { startUs: 0, endUs: 250 };
    const spans = (mode: 'synced' | 'realtime') =>
      moveSpans(views, timeline, mode, climbA).map(({ from, to }) => [from, to]);
    expect(spans('synced')).toEqual([
      [0, 100],
      [100, 450],
    ]);
    expect(spans('realtime')).toEqual([
      [0, 100],
      [100, 250],
    ]);
  });
});
