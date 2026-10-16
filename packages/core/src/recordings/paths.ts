const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.webm']);

export function fileBaseName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop()?.trim() || 'video';
  return base.slice(0, 180);
}

export function videoExtension(fileName: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(fileBaseName(fileName));
  const ext = match ? `.${match[1]!.toLowerCase()}` : '.mp4';
  return VIDEO_EXTENSIONS.has(ext) ? ext : '.mp4';
}

/** `originals/YYYY/MM/<id>.<ext>` from the import timestamp. */
export function originalRelative(videoId: string, fileName: string, iso: string): string {
  const year = iso.slice(0, 4);
  const month = iso.slice(5, 7);
  return `originals/${year}/${month}/${videoId}${videoExtension(fileName)}`;
}

export function proxyRelative(videoId: string): string {
  return `proxies/${videoId}.mp4`;
}

export function clipRelative(videoId: string): string {
  return `clips/${videoId}.mp4`;
}

export function contentTypeFor(path: string): string {
  const ext = path.toLowerCase().split('.').pop();
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mkv') return 'video/x-matroska';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'video/mp4';
}
