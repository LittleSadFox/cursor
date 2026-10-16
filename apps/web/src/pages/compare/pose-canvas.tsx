import { useEffect, useRef } from 'react';

import { backingScale, backingSize, paint } from '../../render/canvas.js';
import type { DrawCommand } from '../../render/skeleton.js';

import type { CanvasSize } from './scene.js';

/** Skeleton canvas laid out at `size` CSS pixels and painted at the screen's pixel density. */
export function PoseCanvas(props: { commands: DrawCommand[]; size: CanvasSize; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { commands, size } = props;
  const scale = backingScale(window.devicePixelRatio);
  const backing = backingSize(size, scale);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) paint(ctx, commands, size, scale);
  }, [commands, size, scale]);

  return (
    <canvas
      ref={ref}
      className="pose-canvas"
      width={backing.width}
      height={backing.height}
      style={{ width: `${size.width}px` }}
      role="img"
      aria-label={props.label}
    />
  );
}
