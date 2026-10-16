import type { DrawCommand } from './skeleton.js';

/** The slice of `CanvasRenderingContext2D` the painter uses. */
export type Canvas2D = Pick<
  CanvasRenderingContext2D,
  | 'setTransform'
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

/** Device pixels behind a CSS-pixel canvas; at least 1× so drawing never goes blurry-small. */
export function backingScale(devicePixelRatio: number): number {
  return Number.isFinite(devicePixelRatio) && devicePixelRatio > 1 ? devicePixelRatio : 1;
}

export function backingSize(
  size: { width: number; height: number },
  scale: number,
): { width: number; height: number } {
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}

/**
 * Clears the canvas and draws `commands` in order. Commands are in CSS pixels; `scale` maps
 * them onto a backing store that is `scale` times larger (high-DPI screens).
 */
export function paint(
  ctx: Canvas2D,
  commands: readonly DrawCommand[],
  size: { width: number; height: number },
  scale = 1,
): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.lineCap = 'round';
  for (const command of commands) paintCommand(ctx, command);
  ctx.globalAlpha = 1;
}
