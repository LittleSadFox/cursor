import { BLAZEPOSE_LANDMARKS } from '@climbing-coach/schema';
import { describe, expect, it } from 'vitest';

import { BONES, renderPose, toPixels } from './skeleton.js';
import { pointsOf, STYLE } from './test-points.js';

describe('renderPose', () => {
  const arm = pointsOf({ rightShoulder: [10, 10], rightElbow: [20, 20], rightWrist: [30, 10] });

  it('draws bones between visible landmarks, then joints', () => {
    const commands = renderPose(arm, STYLE);
    expect(commands.filter((c) => c.kind === 'line')).toEqual([
      { kind: 'line', x1: 10, y1: 10, x2: 20, y2: 20, color: '#fff', width: 3, alpha: 1 },
      { kind: 'line', x1: 20, y1: 20, x2: 30, y2: 10, color: '#fff', width: 3, alpha: 1 },
    ]);
    expect(commands.filter((c) => c.kind === 'circle')).toHaveLength(3);
    expect(commands.at(-1)?.kind).toBe('circle');
  });

  it('skips landmarks below the visibility floor', () => {
    const hidden = arm.map((point, index) =>
      BLAZEPOSE_LANDMARKS[index] === 'rightElbow' ? { ...point, visibility: 0.1 } : point,
    );
    expect(renderPose(hidden, STYLE).filter((c) => c.kind === 'line')).toEqual([]);
  });

  it('enlarges and recolors highlighted joints', () => {
    const commands = renderPose(arm, { ...STYLE, highlights: new Set(['rightElbow']) });
    const elbow = commands.find((c) => c.kind === 'circle' && c.x === 20);
    expect(elbow).toMatchObject({ color: '#f00', r: 4 });
  });

  it('covers a full body with 14 bones', () => {
    expect(BONES).toHaveLength(14);
  });
});

describe('toPixels', () => {
  it('scales normalized coordinates by the canvas size', () => {
    const [nose] = toPixels([{ x: 0.5, y: 0.25, visibility: 1 }], 200, 100);
    expect(nose).toEqual({ x: 100, y: 25, visibility: 1 });
  });
});
