import { poseAt, type PoseFrames } from '../../hooks/compare/pose.js';
import { renderGhost } from '../../render/ghost.js';
import { renderPose, toPixels, type DrawCommand, type PoseStyle } from '../../render/skeleton.js';

export type CompareLayout = 'side_by_side' | 'ghost';

export type ScenePose = PoseFrames & { displayWidth: number; displayHeight: number };

export type CanvasSize = { width: number; height: number };

export const CANVAS_HEIGHT = 420;

const COLORS = { a: '#e8f0ec', b: '#7fd3ff', highlight: '#ff8a5c' };

/** Fixed height, display aspect ratio (portrait 9:16 until the pose is loaded). */
export function canvasSize(pose: ScenePose | null | undefined): CanvasSize {
  const aspect = pose ? pose.displayWidth / pose.displayHeight : 9 / 16;
  return { width: Math.round(CANVAS_HEIGHT * aspect), height: CANVAS_HEIGHT };
}

export function poseStyles(
  highlights: ReadonlySet<string>,
  ghostOpacity: number,
): { a: PoseStyle; b: PoseStyle; ghost: PoseStyle } {
  const base = { highlightColor: COLORS.highlight, lineWidth: 4, jointRadius: 3, highlights };
  const b = { ...base, color: COLORS.b, alpha: 1 };
  return { a: { ...base, color: COLORS.a, alpha: 1 }, b, ghost: { ...b, alpha: ghostOpacity } };
}

function pixelPose(pose: ScenePose | null | undefined, tUs: number, size: CanvasSize) {
  const points = pose ? poseAt(pose, tUs) : null;
  return points ? toPixels(points, size.width, size.height) : null;
}

export function sideCommands(
  pose: ScenePose | null | undefined,
  tUs: number,
  style: PoseStyle,
): DrawCommand[] {
  const points = pixelPose(pose, tUs, canvasSize(pose));
  return points ? renderPose(points, style) : [];
}

/** A on its own canvas with B aligned onto it (mid-hip and torso length). */
export function ghostCommands(
  poses: { a: ScenePose | null | undefined; b: ScenePose | null | undefined },
  times: { tA: number; tB: number },
  styles: { a: PoseStyle; ghost: PoseStyle },
): DrawCommand[] {
  const a = pixelPose(poses.a, times.tA, canvasSize(poses.a));
  const b = pixelPose(poses.b, times.tB, canvasSize(poses.b));
  if (!a) return [];
  return b ? renderGhost(a, b, { a: styles.a, b: styles.ghost }) : renderPose(a, styles.a);
}
