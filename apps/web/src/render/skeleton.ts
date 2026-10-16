import { BLAZEPOSE_LANDMARKS, type BlazePoseLandmark } from '@climbing-coach/schema';

import type { PosePoint } from '../hooks/compare/pose.js';

export type DrawCommand =
  | {
      kind: 'line';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
      width: number;
      alpha: number;
    }
  | { kind: 'circle'; x: number; y: number; r: number; color: string; alpha: number };

export type PoseStyle = {
  color: string;
  highlightColor: string;
  alpha: number;
  lineWidth: number;
  jointRadius: number;
  /** Landmark names drawn in `highlightColor` with a larger marker. */
  highlights: ReadonlySet<string>;
};

/** Landmarks below this visibility are not drawn. */
export const MIN_VISIBILITY = 0.3;

export const BONES: readonly (readonly [BlazePoseLandmark, BlazePoseLandmark])[] = [
  ['leftShoulder', 'rightShoulder'],
  ['leftHip', 'rightHip'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['leftAnkle', 'leftFootIndex'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
  ['rightAnkle', 'rightFootIndex'],
];

const JOINTS: readonly BlazePoseLandmark[] = [
  'nose',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
];

const INDEX = new Map<string, number>(BLAZEPOSE_LANDMARKS.map((name, index) => [name, index]));

/** Display-normalized points scaled to a `width × height` canvas. */
export function toPixels(points: readonly PosePoint[], width: number, height: number): PosePoint[] {
  return points.map((point) => ({ ...point, x: point.x * width, y: point.y * height }));
}

export function pointOf(points: readonly PosePoint[], name: BlazePoseLandmark): PosePoint | null {
  const point = points[INDEX.get(name) ?? -1];
  if (!point || point.visibility < MIN_VISIBILITY) return null;
  return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
}

function boneCommands(points: readonly PosePoint[], style: PoseStyle): DrawCommand[] {
  return BONES.flatMap(([from, to]) => {
    const p = pointOf(points, from);
    const q = pointOf(points, to);
    if (!p || !q) return [];
    return [
      {
        kind: 'line' as const,
        x1: p.x,
        y1: p.y,
        x2: q.x,
        y2: q.y,
        color: style.color,
        width: style.lineWidth,
        alpha: style.alpha,
      },
    ];
  });
}

function jointCommands(points: readonly PosePoint[], style: PoseStyle): DrawCommand[] {
  return JOINTS.flatMap((name) => {
    const p = pointOf(points, name);
    if (!p) return [];
    const highlighted = style.highlights.has(name);
    return [
      {
        kind: 'circle' as const,
        x: p.x,
        y: p.y,
        r: highlighted ? style.jointRadius * 2 : style.jointRadius,
        color: highlighted ? style.highlightColor : style.color,
        alpha: style.alpha,
      },
    ];
  });
}

/** Bones then joints, in pixel coordinates; invisible or missing landmarks are skipped. */
export function renderPose(points: readonly PosePoint[], style: PoseStyle): DrawCommand[] {
  return [...boneCommands(points, style), ...jointCommands(points, style)];
}
