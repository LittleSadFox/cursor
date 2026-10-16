const SYNC_MARKERS = [
  'Mobile Documents',
  'iCloud Drive',
  'Library/Mobile Documents',
  'Dropbox',
  'Google Drive',
  'OneDrive',
  '.dropbox',
];

/**
 * Refuse library roots inside iCloud Drive / Dropbox / etc.
 * Syncing a live SQLite WAL database corrupts it (BUILD_PLAN §3.2).
 */
export function isSyncFolder(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return SYNC_MARKERS.some((marker) => normalized.includes(marker));
}
