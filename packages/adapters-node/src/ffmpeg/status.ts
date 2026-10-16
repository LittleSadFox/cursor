import { forbiddenConfigureFlags, missingRequiredLgplFlags } from './forbidden-flags.js';
import {
  binariesPresent,
  locateFfmpeg,
  type FfmpegSource,
  type LocateFfmpegOptions,
} from './locate.js';
import { parseFfmpegBanner, readFfmpegBanner } from './probe.js';

export type FfmpegStatus = {
  available: boolean;
  shipping: boolean;
  source: FfmpegSource;
  ffmpegPath: string | null;
  ffprobePath: string | null;
  version: string | null;
  note: string;
};

export type ProbeFfmpegOptions = LocateFfmpegOptions & {
  readVersion?: boolean;
};

function noteFor(source: FfmpegSource, version: string | null, present: boolean): string {
  const tagged = version ? ` (${version})` : '';
  if (source === 'bundled' && present) {
    return `Shipped LGPL ffmpeg${tagged} from vendor/ffmpeg/darwin-arm64 (ADR-002).`;
  }
  if (source === 'env' && present) {
    return `ffmpeg${tagged} from COACH_FFMPEG / COACH_FFMPEG_DIR (explicit override).`;
  }
  if (source === 'env' && !present) {
    return 'COACH_FFMPEG or COACH_FFMPEG_DIR is set but ffmpeg/ffprobe are not runnable.';
  }
  if (source === 'system-fallback' && present) {
    return `System ffmpeg${tagged} on PATH — Linux/dev fallback only. Not a shipping binary; VideoToolbox cannot exist here.`;
  }
  return 'Shipped LGPL ffmpeg is not on this machine (P0.8 locator / ADR-002).';
}

export function ffmpegStatusFromLocation(
  located: ReturnType<typeof locateFfmpeg>,
  version: string | null = null,
): FfmpegStatus {
  const present = binariesPresent(located);
  const shipping = located.source === 'bundled' && present;
  const available = present && (located.source === 'bundled' || located.source === 'env');
  return {
    available,
    shipping,
    source: located.source,
    ffmpegPath: located.ffmpegPath,
    ffprobePath: located.ffprobePath,
    version,
    note: noteFor(located.source, version, present),
  };
}

/** Locate binaries and optionally read `ffmpeg -version`. Does not implement P1.7 video tools. */
export function probeFfmpegStatus(options: ProbeFfmpegOptions = {}): FfmpegStatus {
  const located = locateFfmpeg(options);
  if (!located.ffmpegPath || options.readVersion === false) {
    return ffmpegStatusFromLocation(located, null);
  }
  try {
    const banner = parseFfmpegBanner(readFfmpegBanner(located.ffmpegPath));
    const configuration = banner.configuration ?? '';
    const forbidden = forbiddenConfigureFlags(configuration);
    const missing = missingRequiredLgplFlags(configuration);
    const status = ffmpegStatusFromLocation(located, banner.version);
    if (located.source !== 'system-fallback' && (forbidden.length > 0 || missing.length > 0)) {
      return {
        ...status,
        available: false,
        shipping: false,
        note: `Refusing ffmpeg at ${located.ffmpegPath}: ${[...forbidden, ...missing.map((flag) => `missing ${flag}`)].join(', ')}`,
      };
    }
    return status;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ...ffmpegStatusFromLocation(located, null),
      available: false,
      shipping: false,
      note: `ffmpeg -version failed: ${reason}`,
    };
  }
}
