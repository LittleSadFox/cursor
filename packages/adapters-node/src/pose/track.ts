import { bboxIoU, type BBox } from './bbox.js';

export type TrackedPerson = {
  trackIndex: number;
  box: BBox;
  missed: number;
};

/**
 * Greedy IoU association of detections to existing tracks.
 * Unmatched detections spawn new tracks up to `maxPersons`.
 */
export function associateDetections(
  tracks: readonly TrackedPerson[],
  detections: readonly BBox[],
  options: { iouThreshold: number; maxPersons: number; maxMissed: number },
): TrackedPerson[] {
  const used = new Set<number>();
  const next: TrackedPerson[] = [];
  for (const track of tracks) {
    let bestIndex = -1;
    let bestIoU = options.iouThreshold;
    for (let i = 0; i < detections.length; i += 1) {
      if (used.has(i)) continue;
      const score = bboxIoU(track.box, detections[i]!);
      if (score > bestIoU) {
        bestIoU = score;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0) {
      used.add(bestIndex);
      next.push({ trackIndex: track.trackIndex, box: detections[bestIndex]!, missed: 0 });
    } else if (track.missed + 1 <= options.maxMissed) {
      next.push({ ...track, missed: track.missed + 1 });
    }
  }
  let nextIndex =
    tracks.reduce((max, track) => Math.max(max, track.trackIndex), -1) + 1;
  for (let i = 0; i < detections.length; i += 1) {
    if (used.has(i) || next.length >= options.maxPersons) continue;
    next.push({ trackIndex: nextIndex, box: detections[i]!, missed: 0 });
    nextIndex += 1;
  }
  return next;
}

/**
 * Decide whether to re-run the person detector this frame.
 * Reuses the previous crop when the interval has not elapsed.
 */
export function shouldRunDetector(frameIndex: number, interval: number): boolean {
  return interval <= 1 || frameIndex % interval === 0;
}
