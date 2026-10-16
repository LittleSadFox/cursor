import { useEffect, useRef } from 'react';

import { paint } from '../../render/canvas.js';
import type { DrawCommand } from '../../render/skeleton.js';

import type { CanvasSize } from './scene.js';

export function PoseCanvas(props: { commands: DrawCommand[]; size: CanvasSize; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { commands, size } = props;

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) paint(ctx, commands, size);
  }, [commands, size]);

  return (
    <canvas
      ref={ref}
      className="pose-canvas"
      width={size.width}
      height={size.height}
      role="img"
      aria-label={props.label}
    />
  );
}
