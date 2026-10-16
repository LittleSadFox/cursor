import { posix } from 'node:path';

export const APP_PROTOCOL = 'app';
export const APP_ORIGIN = 'app://-';

function underRoot(root: string, candidate: string): boolean {
  const base = posix.normalize(root).replace(/\/+$/, '');
  const resolved = posix.normalize(candidate);
  return resolved === base || resolved.startsWith(`${base}/`);
}

/**
 * Map an `app://-` request onto a file under the renderer dist.
 * Rejects host mismatches and paths that escape the renderer root.
 */
export function resolveAppRequest(requestUrl: string, rendererRoot: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${APP_PROTOCOL}:`) return null;
  if (parsed.hostname !== '-' && parsed.hostname !== '') return null;
  const rawPath =
    parsed.pathname === '/' || parsed.pathname === '' ? '/index.html' : parsed.pathname;
  const relative = posix.normalize(rawPath).replace(/^\/+/, '');
  const root = rendererRoot.replaceAll('\\', '/');
  const candidate = posix.join(root, relative);
  if (!underRoot(root, candidate)) return null;
  return candidate;
}

export function isAppOrigin(origin: string): boolean {
  return origin === APP_ORIGIN;
}
