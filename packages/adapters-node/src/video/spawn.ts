import { spawn } from 'node:child_process';

import { VideoToolError } from '@climbing-coach/core';

export type ProcessResult = { code: number; stdout: Buffer; stderr: string };

function tail(text: string): string {
  const line = text
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .at(-1);
  return line ?? 'ffmpeg failed';
}

export function runProcess(
  bin: string,
  args: string[],
  signal?: AbortSignal,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
    let killTimer: NodeJS.Timeout | undefined;
    const onAbort = () => {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5_000);
      killTimer.unref();
    };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (error: NodeJS.ErrnoException) => {
      signal?.removeEventListener('abort', onAbort);
      if (killTimer) clearTimeout(killTimer);
      if (error.code === 'ENOENT') {
        reject(new VideoToolError('FFMPEG_UNAVAILABLE', `missing binary ${bin}`));
        return;
      }
      reject(error);
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (killTimer) clearTimeout(killTimer);
      if (signal?.aborted) {
        reject(new VideoToolError('VALIDATION_FAILED', 'cancelled'));
        return;
      }
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out),
        stderr: Buffer.concat(err).toString('utf8'),
      });
    });
  });
}

export async function runChecked(
  bin: string,
  args: string[],
  signal?: AbortSignal,
): Promise<ProcessResult> {
  const result = await runProcess(bin, args, signal);
  if (result.code !== 0) throw new VideoToolError('UNSUPPORTED_MEDIA', tail(result.stderr));
  return result;
}
