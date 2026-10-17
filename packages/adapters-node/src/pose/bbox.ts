export type BBox = { x1: number; y1: number; x2: number; y2: number; score: number };

export function bboxArea(box: BBox): number {
  return Math.max(0, box.x2 - box.x1) * Math.max(0, box.y2 - box.y1);
}

export function bboxIoU(a: BBox, b: BBox): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = bboxArea(a) + bboxArea(b) - inter;
  return union <= 0 ? 0 : inter / union;
}

export function bboxCenter(box: BBox): { x: number; y: number } {
  return { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
}

/** Expand a box by `padding` (1.25 matches MMPose TopDownGetBboxCenterScale). */
export function bboxWithPadding(box: BBox, padding: number): BBox {
  const cx = (box.x1 + box.x2) / 2;
  const cy = (box.y1 + box.y2) / 2;
  const halfW = ((box.x2 - box.x1) * padding) / 2;
  const halfH = ((box.y2 - box.y1) * padding) / 2;
  return {
    x1: cx - halfW,
    y1: cy - halfH,
    x2: cx + halfW,
    y2: cy + halfH,
    score: box.score,
  };
}

export function clampBBox(box: BBox, width: number, height: number): BBox {
  return {
    x1: Math.min(Math.max(0, box.x1), width - 1),
    y1: Math.min(Math.max(0, box.y1), height - 1),
    x2: Math.min(Math.max(0, box.x2), width),
    y2: Math.min(Math.max(0, box.y2), height),
    score: box.score,
  };
}

/** Keep the highest-scoring boxes after class-agnostic NMS. */
export function nms(boxes: readonly BBox[], iouThreshold: number): BBox[] {
  const ordered = [...boxes].sort((a, b) => b.score - a.score);
  const kept: BBox[] = [];
  for (const box of ordered) {
    if (kept.every((other) => bboxIoU(box, other) < iouThreshold)) kept.push(box);
  }
  return kept;
}
