import { us, type SignalsFile, type Us } from '@climbing-coach/schema';

export type DetectionWindow = { startUs: Us; endUs: Us };

/**
 * Pose runs on the activity windows when the pass found any.
 * An empty pass, or a missing signals file, falls back to the whole recording so a
 * quiet or failed activity scan still produces a skeleton.
 */
export function detectionWindows(
  signals: SignalsFile | null,
  durationUs: number,
): DetectionWindow[] {
  if (signals && signals.activeWindows.length > 0) {
    return signals.activeWindows.map((window) => ({
      startUs: us(window.startUs),
      endUs: us(window.endUs),
    }));
  }
  if (durationUs > 0) return [{ startUs: us(0), endUs: us(durationUs) }];
  return [];
}
