/** Display helpers for the recordings page. Times are integer microseconds. */

export function formatDuration(durationUs: number | null): string {
  if (durationUs === null || durationUs < 0) return '—';
  const totalSeconds = durationUs / 1_000_000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}

export function formatFps(fps: number | null): string {
  if (fps === null || fps <= 0) return '—';
  const rounded = Math.round(fps * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export function formatResolution(width: number | null, height: number | null): string {
  if (!width || !height) return '—';
  return `${width}×${height}`;
}

/** Clips are not content-hashed. A finished job with no digest is done, not still working. */
export function hashSettled(jobStatus: string | null): boolean {
  return jobStatus === 'succeeded' || jobStatus === 'failed' || jobStatus === 'cancelled';
}

export function secondsToUs(seconds: number): number | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1_000_000);
}
