import {
  BLAZEPOSE_LANDMARKS,
  LANDMARK_COUNT,
  type BlazePoseLandmark,
} from '@climbing-coach/schema';
import { describe, expect, it } from 'vitest';

import { canvasSize, ghostCommands, poseStyles, sideCommands, type ScenePose } from './scene.js';

const TORSO: Partial<Record<BlazePoseLandmark, [number, number]>> = {
  leftShoulder: [0.4, 0.4],
  rightShoulder: [0.6, 0.4],
  leftHip: [0.4, 0.6],
  rightHip: [0.6, 0.6],
};

function scenePose(offset: number): ScenePose {
  const landmarks = new Float32Array(LANDMARK_COUNT * 4).fill(Number.NaN);
  BLAZEPOSE_LANDMARKS.forEach((name, index) => {
    const at = TORSO[name];
    if (at) landmarks.set([at[0] + offset, at[1], 0, 1], index * 4);
  });
  return { tUs: Float64Array.from([0]), landmarks, displayWidth: 1080, displayHeight: 1920 };
}

describe('compare scene', () => {
  const styles = poseStyles(new Set(['leftHip']), 0.4);

  it('sizes canvases to the display aspect', () => {
    expect(canvasSize(scenePose(0))).toEqual({ width: 236, height: 420 });
    expect(canvasSize(null)).toEqual({ width: 236, height: 420 });
  });

  it('draws one side in canvas pixels with highlights', () => {
    const commands = sideCommands(scenePose(0), 0, styles.a);
    expect(commands.filter((c) => c.kind === 'line')).toHaveLength(4);
    const hip = commands.find((c) => c.kind === 'circle' && c.color === '#ff8a5c');
    expect(hip).toMatchObject({ x: expect.closeTo(94.4, 1), y: expect.closeTo(252, 3) });
    expect(sideCommands(undefined, 0, styles.a)).toEqual([]);
  });

  it('overlays B as a translucent ghost aligned on A', () => {
    const commands = ghostCommands(
      { a: scenePose(0), b: scenePose(0.2) },
      { tA: 0, tB: 0 },
      styles,
    );
    const ghostLines = commands.filter((c) => c.kind === 'line' && c.alpha === 0.4);
    const solidLines = commands.filter((c) => c.kind === 'line' && c.alpha === 1);
    expect(ghostLines).toHaveLength(4);
    expect(ghostLines.map((c) => c.kind === 'line' && Math.round(c.x1))).toEqual(
      solidLines.map((c) => c.kind === 'line' && Math.round(c.x1)),
    );
  });

  it('falls back to A alone without a B pose', () => {
    const commands = ghostCommands({ a: scenePose(0), b: null }, { tA: 0, tB: 0 }, styles);
    expect(commands.every((c) => c.alpha === 1)).toBe(true);
    expect(ghostCommands({ a: null, b: scenePose(0) }, { tA: 0, tB: 0 }, styles)).toEqual([]);
  });
});
