import { copyFile, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';

import { VideoToolError, type MediaFiles } from '@climbing-coach/core';

import { resolveUnderRoot } from './paths.js';

function destination(root: string, relativePath: string): string {
  const resolved = resolveUnderRoot(root, relativePath);
  if (!resolved) throw new VideoToolError('VALIDATION_FAILED', 'path escapes the library');
  return resolved;
}

/** Copy, move, or resolve files under the library root. Absolute reference paths pass through. */
export function libraryMediaFiles(root: string): MediaFiles {
  return {
    async stat(path) {
      const info = await stat(path);
      return { size: info.size };
    },
    async copyInto(sourcePath, relativePath) {
      const dest = destination(root, relativePath);
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(sourcePath, dest);
    },
    async moveInto(sourcePath, relativePath) {
      const dest = destination(root, relativePath);
      await mkdir(dirname(dest), { recursive: true });
      try {
        await rename(sourcePath, dest);
      } catch {
        await copyFile(sourcePath, dest);
        await unlink(sourcePath);
      }
    },
    absolute(storedPath) {
      if (!storedPath) throw new VideoToolError('VALIDATION_FAILED', 'video has no file yet');
      if (isAbsolute(storedPath)) return storedPath;
      return destination(root, storedPath);
    },
  };
}

export function proxyRelative(videoId: string): string {
  return join('proxies', `${videoId}.mp4`);
}

export function clipRelative(videoId: string): string {
  return join('clips', `${videoId}.mp4`);
}
