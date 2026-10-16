/** Stream maps for iPhone .MOV files. `-map 0` / `-map 0:a` fail on the `apac` track. */
export const IPHONE_VIDEO_MAP = '0:v:0';
export const IPHONE_AUDIO_MAP = '0:a:0';

export type HdrTransfer = 'smpte2084' | 'arib-std-b67';

const TRANSFER_ALIASES: Record<string, HdrTransfer> = {
  smpte2084: 'smpte2084',
  pq: 'smpte2084',
  'arib-std-b67': 'arib-std-b67',
  hlg: 'arib-std-b67',
  'bt2020-10': 'arib-std-b67',
};

/** Map ffprobe `color_transfer` to a zscale `tin=` value. Null for SDR / unknown. */
export function hdrTransferFromProbe(colorTransfer: string | null | undefined): HdrTransfer | null {
  if (!colorTransfer) return null;
  return TRANSFER_ALIASES[colorTransfer.trim().toLowerCase()] ?? null;
}

export function isIphoneMediaName(name: string): boolean {
  return /\.(mov|mp4|m4v)$/i.test(name);
}

/** Args after `-i <file>`. Never pass `-map 0` or `-map 0:a` (Apple `apac` is not decodable). */
export function ffmpegMappedOutputArgs(options: { audio?: boolean; vfr?: boolean } = {}): string[] {
  const args = ['-map', IPHONE_VIDEO_MAP];
  if (options.audio) args.push('-map', IPHONE_AUDIO_MAP);
  else args.push('-an');
  if (options.vfr !== false) args.push('-fps_mode', 'vfr');
  return args;
}

export function tonemapFilter(transfer: HdrTransfer): string {
  return [
    `zscale=tin=${transfer}:min=bt2020nc:pin=bt2020:t=linear:npl=100`,
    'tonemap=tonemap=hable:desat=0',
    'zscale=p=bt709:t=bt709:m=bt709',
    'format=yuv420p',
    'scale=160:-2',
  ].join(',');
}
