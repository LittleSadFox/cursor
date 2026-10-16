import { spawnSync } from 'node:child_process';

export type FfmpegBanner = {
  version: string | null;
  configuration: string | null;
};

export function parseFfmpegBanner(text: string): FfmpegBanner {
  const versionMatch = text.match(/^ffmpeg version (\S+)/m);
  const configurationMatch = text.match(/^configuration:\s*(.*)$/m);
  return {
    version: versionMatch?.[1] ?? null,
    configuration: configurationMatch?.[1] ?? null,
  };
}

export function readFfmpegBanner(ffmpegPath: string): string {
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-version'], {
    encoding: 'utf8',
    timeout: 8_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `ffmpeg -version exited ${String(result.status)}: ${(result.stderr || result.stdout).trim()}`,
    );
  }
  return `${result.stdout}${result.stderr}`;
}

export function readFfmpegVersion(ffmpegPath: string): string | null {
  return parseFfmpegBanner(readFfmpegBanner(ffmpegPath)).version;
}
