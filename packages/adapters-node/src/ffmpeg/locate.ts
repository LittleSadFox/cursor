import { statSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

import { detectRepoRoot } from './repo-root.js';

export const SHIPPED_FFMPEG_TRIPLE = 'darwin-arm64';

export type FfmpegSource = 'env' | 'bundled' | 'system-fallback' | 'missing';

export type LocatedFfmpeg = {
  source: FfmpegSource;
  ffmpegPath: string | null;
  ffprobePath: string | null;
};

export type LocateFfmpegOptions = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  arch?: string;
  cwd?: string;
  vendorRoot?: string;
  lookupOnPath?: (name: string) => string | null;
  isRunnable?: (path: string) => boolean;
};

export function shippedFfmpegTriple(platform: NodeJS.Platform, arch: string): string | null {
  if (platform === 'darwin' && arch === 'arm64') return SHIPPED_FFMPEG_TRIPLE;
  return null;
}

export function isRunnableFile(path: string): boolean {
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return false;
    return (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

export function lookupOnPath(name: string, pathEnv = process.env.PATH ?? ''): string | null {
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (isRunnableFile(candidate)) return candidate;
  }
  return null;
}

function siblingBinary(path: string, name: string): string {
  return join(dirname(path), name);
}

function pairIfRunnable(
  ffmpegPath: string,
  ffprobePath: string,
  isRunnable: (path: string) => boolean,
): { ffmpegPath: string; ffprobePath: string } | null {
  if (isRunnable(ffmpegPath) && isRunnable(ffprobePath)) return { ffmpegPath, ffprobePath };
  return null;
}

function fromDirectory(
  dir: string,
  isRunnable: (path: string) => boolean,
): { ffmpegPath: string; ffprobePath: string } | null {
  return (
    pairIfRunnable(join(dir, 'bin', 'ffmpeg'), join(dir, 'bin', 'ffprobe'), isRunnable) ??
    pairIfRunnable(join(dir, 'ffmpeg'), join(dir, 'ffprobe'), isRunnable)
  );
}

export function bundledFfmpegPrefix(options: LocateFfmpegOptions = {}): string | null {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const triple = shippedFfmpegTriple(platform, arch);
  if (!triple) return null;
  if (options.vendorRoot) return join(options.vendorRoot, triple);
  const repo = detectRepoRoot(options.cwd ?? process.cwd());
  if (!repo) return null;
  return join(repo, 'vendor', 'ffmpeg', triple);
}

/**
 * Find ffmpeg/ffprobe for desktop tools.
 * Order: `COACH_FFMPEG` / `COACH_FFMPEG_DIR`, then the CI prefix, then Linux PATH.
 * A Darwin PATH fallback is omitted so Homebrew GPL builds cannot be mistaken for the shippable binary.
 */
export function locateFfmpeg(options: LocateFfmpegOptions = {}): LocatedFfmpeg {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const isRunnable = options.isRunnable ?? isRunnableFile;
  const lookup = options.lookupOnPath ?? ((name: string) => lookupOnPath(name, env.PATH ?? ''));

  if (env.COACH_FFMPEG) {
    const ffmpegPath = env.COACH_FFMPEG;
    const ffprobePath = env.COACH_FFPROBE ?? siblingBinary(ffmpegPath, 'ffprobe');
    const pair = pairIfRunnable(ffmpegPath, ffprobePath, isRunnable);
    return pair
      ? { source: 'env', ...pair }
      : { source: 'env', ffmpegPath: null, ffprobePath: null };
  }

  if (env.COACH_FFMPEG_DIR) {
    const pair = fromDirectory(env.COACH_FFMPEG_DIR, isRunnable);
    return pair
      ? { source: 'env', ...pair }
      : { source: 'env', ffmpegPath: null, ffprobePath: null };
  }

  const prefix = bundledFfmpegPrefix(options);
  if (prefix) {
    const pair = fromDirectory(prefix, isRunnable);
    if (pair) return { source: 'bundled', ...pair };
  }

  if (platform !== 'darwin') {
    const ffmpegPath = lookup('ffmpeg');
    const ffprobePath = lookup('ffprobe');
    if (ffmpegPath && ffprobePath) {
      return { source: 'system-fallback', ffmpegPath, ffprobePath };
    }
  }

  return { source: 'missing', ffmpegPath: null, ffprobePath: null };
}

export function binariesPresent(located: LocatedFfmpeg): boolean {
  return located.ffmpegPath !== null && located.ffprobePath !== null;
}
