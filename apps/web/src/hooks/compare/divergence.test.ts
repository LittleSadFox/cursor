import { describe, expect, it } from 'vitest';

import {
  cellAt,
  divergenceTable,
  highlightedJoints,
  isJointChannel,
  scoreSeries,
} from './divergence.js';

const CHANNELS = ['leftKnee', 'rightKnee', 'hipToHands', 'score'];

const table = divergenceTable(
  Float32Array.from([2, -20, 0.6, 0.5, Number.NaN, 14.9, 0.1, 0.2]),
  CHANNELS,
);

describe('divergence table', () => {
  it('reads cells by step and channel name', () => {
    expect(table.steps).toBe(2);
    expect(cellAt(table, 0, 'rightKnee')).toBe(-20);
    expect(cellAt(table, 1, 'missing')).toBeNaN();
    expect(cellAt(table, 5, 'score')).toBeNaN();
  });

  it('extracts the score column', () => {
    expect(Array.from(scoreSeries(table))).toEqual([0.5, expect.closeTo(0.2, 5)]);
  });

  it('highlights joints whose angle differs by at least 15°, either sign', () => {
    expect([...highlightedJoints(table, 0)]).toEqual(['rightKnee']);
    expect([...highlightedJoints(table, 1)]).toEqual([]);
  });

  it('treats only landmark-named channels as joints', () => {
    expect(isJointChannel('rightKnee')).toBe(true);
    expect(isJointChannel('hipToHands')).toBe(false);
    expect(isJointChannel('score')).toBe(false);
  });
});
