import { describe, expect, it } from 'vitest';

import { backingScale, backingSize, paint, type Canvas2D } from './canvas.js';

function recorder(): Canvas2D & { calls: string[] } {
  const calls: string[] = [];
  const log =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.join(',')})`);
    };
  return {
    calls,
    setTransform: log('setTransform'),
    clearRect: log('clearRect'),
    beginPath: log('beginPath'),
    moveTo: log('moveTo'),
    lineTo: log('lineTo'),
    arc: log('arc'),
    stroke: log('stroke'),
    fill: log('fill'),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    globalAlpha: 1,
  };
}

describe('paint', () => {
  it('clears, then strokes lines and fills circles in order', () => {
    const ctx = recorder();
    paint(
      ctx,
      [
        { kind: 'line', x1: 0, y1: 1, x2: 2, y2: 3, color: '#fff', width: 4, alpha: 0.5 },
        { kind: 'circle', x: 5, y: 6, r: 2, color: '#f00', alpha: 1 },
      ],
      { width: 10, height: 20 },
    );
    expect(ctx.calls).toEqual([
      'setTransform(1,0,0,1,0,0)',
      'clearRect(0,0,10,20)',
      'beginPath()',
      'moveTo(0,1)',
      'lineTo(2,3)',
      'stroke()',
      'beginPath()',
      `arc(5,6,2,0,${Math.PI * 2})`,
      'fill()',
    ]);
    expect(ctx.fillStyle).toBe('#f00');
    expect(ctx.lineWidth).toBe(4);
    expect(ctx.globalAlpha).toBe(1);
  });

  it('scales CSS-pixel commands onto a high-DPI backing store', () => {
    const ctx = recorder();
    paint(ctx, [], { width: 10, height: 20 }, 2);
    expect(ctx.calls).toEqual(['setTransform(2,0,0,2,0,0)', 'clearRect(0,0,10,20)']);
  });
});

describe('backing store', () => {
  it('uses the device pixel ratio, never below 1×', () => {
    expect(backingScale(2)).toBe(2);
    expect(backingScale(0.5)).toBe(1);
    expect(backingScale(Number.NaN)).toBe(1);
    expect(backingSize({ width: 270, height: 480 }, 1.5)).toEqual({ width: 405, height: 720 });
  });
});
