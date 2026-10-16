import { homedir } from 'node:os';
import { delimiter, join, normalize, relative, resolve, sep } from 'node:path';

export function defaultLibraryRoot(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Movies', 'Climbing Coach Library');
  }
  return join(homedir(), 'Climbing Coach Library');
}

/** Resolve `requestPath` under `root`. Returns null on traversal. */
export function resolveUnderRoot(root: string, requestPath: string): string | null {
  const resolvedRoot = resolve(root);
  const candidate = resolve(resolvedRoot, requestPath);
  const rel = relative(resolvedRoot, candidate);
  if (rel.startsWith('..') || rel.includes(`..${sep}`) || rel.includes(`..${delimiter}`)) return null;
  if (normalize(rel).startsWith('..')) return null;
  if (!candidate.startsWith(resolvedRoot)) return null;
  return candidate;
}

export function libraryDbPath(libraryRoot: string): string {
  return join(libraryRoot, 'library.db');
}

export function backupsDir(libraryRoot: string): string {
  return join(libraryRoot, 'backups');
}
