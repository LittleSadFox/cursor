import type { DrawCommand } from './skeleton.js';

/** The slice of `CanvasRenderingContext2D` the painter uses. */
export type Canvas2D = Pick<
  CanvasRenderingContext2D,
  | 'clearRect'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'arc'
  | 'stroke'
  | 'fill'
  | 'strokeStyle'
  | 'fillStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'globalAlpha'
>;

function paintCommand(ctx: Canvas2D, command: DrawCommand): void {
  ctx.globalAlpha = command.alpha;
  ctx.beginPath();
  if (command.kind === 'line') {
    ctx.strokeStyle = command.color;
    ctx.lineWidth = command.width;
    ctx.moveTo(command.x1, command.y1);
    ctx.lineTo(command.x2, command.y2);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = command.color;
  ctx.arc(command.x, command.y, command.r, 0, Math.PI * 2);
  ctx.fill();
}

/** Clears the canvas and draws `commands` in order. */
export function paint(
  ctx: Canvas2D,
  commands: readonly DrawCommand[],
  size: { width: number; height: number },
): void {
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.lineCap = 'round';
  for (const command of commands) paintCommand(ctx, command);
  ctx.globalAlpha = 1;
}
