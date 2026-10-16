import { spawn } from 'node:child_process';

import { us, type Us } from '@climbing-coach/schema';

import { VideoToolError, type VideoFrame } from '@climbing-coach/core';

import { usFromSeconds } from './parse.js';
import { drainImages } from './ppm.js';

const SHOWINFO = /pts_time:([0-9.]+)/;

function killLater(child: ReturnType<typeof spawn>): void {
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
  timer.unref();
}

/** Decode `image2pipe` PGM/PPM and pair each image with the `showinfo` pts on stderr. */
export async function* decodePipedFrames(
  bin: string,
  args: string[],
  signal?: AbortSignal,
): AsyncGenerator<VideoFrame> {
  const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const times: Us[] = [];
  const images: VideoFrame[] = [];
  let pending = Buffer.alloc(0);
  let stderr = '';
  let failed: Error | null = null;

  const onAbort = () => killLater(child);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener('abort', onAbort, { once: true });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
    const lines = stderr.split('\n');
    stderr = lines.pop() ?? '';
    for (const line of lines) {
      const match = SHOWINFO.exec(line);
      if (!match?.[1]) continue;
      times.push(usFromSeconds(Number(match[1])));
    }
  });
  child.stdout.on('data', (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);
    const drained = drainImages(pending);
    pending = Buffer.from(drained.rest);
    images.push(...drained.images.map((image) => ({ ...image, tUs: us(0) })));
  });
  child.on('error', (error) => {
    failed = error;
  });

  await new Promise<void>((resolve) => {
    child.on('close', () => resolve());
  });
  signal?.removeEventListener('abort', onAbort);
  if (signal?.aborted) throw new VideoToolError('VALIDATION_FAILED', 'cancelled');
  if (failed) throw failed;
  if (child.exitCode !== 0) {
    throw new VideoToolError('UNSUPPORTED_MEDIA', 'frame decode failed');
  }
  const last = SHOWINFO.exec(stderr);
  if (last?.[1]) times.push(usFromSeconds(Number(last[1])));
  if (images.length === 0) return;
  if (times.length < images.length) {
    throw new VideoToolError('UNSUPPORTED_MEDIA', 'decoded frames without timestamps');
  }
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index]!;
    yield { ...image, tUs: times[index] ?? us(0) };
  }
}
