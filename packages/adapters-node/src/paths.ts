import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export function defaultLibraryRoot(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Movies', 'Climbing Coach Library');
  }
  return join(homedir(), 'Climbing Coach Library');
}

/** Resolve `requestPath` under `root`. Returns null when it escapes the root or names the root itself. */
export function resolveUnderRoot(root: string, requestPath: string): string | null {
  const resolvedRoot = resolve(root);
  const candidate = resolve(resolvedRoot, requestPath);
  const rel = relative(resolvedRoot, candidate);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return candidate;
}

export function libraryDbPath(libraryRoot: string): string {
  return join(libraryRoot, 'library.db');
}

export function backupsDir(libraryRoot: string): string {
  return join(libraryRoot, 'backups');
}

/**
 * Per-user app config, outside any library: the library location cannot live inside the
 * library it points to. Electron's `userData` takes over in P2-D.
 */
export function appConfigDir(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Climbing Coach');
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'climbing-coach');
}

type AppConfig = { libraryRoot?: string };

function configFile(dir: string): string {
  return join(dir, 'config.json');
}

export function readLibraryPointer(dir: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(configFile(dir), 'utf8')) as AppConfig;
    return typeof parsed.libraryRoot === 'string' && parsed.libraryRoot !== ''
      ? parsed.libraryRoot
      : null;
  } catch {
    return null;
  }
}

export function writeLibraryPointer(dir: string, libraryRoot: string | null): void {
  mkdirSync(dir, { recursive: true });
  const config: AppConfig = libraryRoot === null ? {} : { libraryRoot };
  writeFileSync(configFile(dir), `${JSON.stringify(config, null, 2)}\n`);
}
