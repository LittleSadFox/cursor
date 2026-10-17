import { us, type Us } from '@climbing-coach/schema';

import { hdrTransferFromProbe, type HdrTransfer } from '../ffmpeg/iphone.js';
import type { PacketFrame, ProbeResult } from '@climbing-coach/core';

export function usFromSeconds(seconds: number): Us {
  if (!Number.isFinite(seconds) || seconds < 0) return us(0);
  return us(Math.round(seconds * 1_000_000));
}

export function secondsText(value: number): string {
  return (value / 1_000_000).toFixed(6);
}

/** `30000/1001` and plain decimals. */
export function parseRate(rate: string | number | null | undefined): number | null {
  if (typeof rate === 'number') return Number.isFinite(rate) && rate > 0 ? rate : null;
  if (!rate) return null;
  const text = String(rate).trim();
  const slash = text.indexOf('/');
  if (slash >= 0) {
    const num = Number(text.slice(0, slash));
    const den = Number(text.slice(slash + 1));
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    const value = num / den;
    return value > 0 ? value : null;
  }
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function parsePacketCsv(text: string): PacketFrame[] {
  const frames: PacketFrame[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [pts, duration, flags = ''] = trimmed.split(',');
    if (!pts) continue;
    const t = Number(pts);
    if (!Number.isFinite(t) || t < 0) continue;
    const dur = duration ? Number(duration) : 0;
    frames.push({
      tUs: usFromSeconds(t),
      durationUs: usFromSeconds(Number.isFinite(dur) && dur > 0 ? dur : 0),
      keyframe: flags.includes('K'),
    });
  }
  frames.sort((a, b) => a.tUs - b.tUs);
  return frames;
}

export function durationsVary(frames: readonly PacketFrame[]): boolean {
  const durations = frames.map((frame) => frame.durationUs).filter((duration) => duration > 0);
  if (durations.length < 2) return false;
  return Math.max(...durations) - Math.min(...durations) > 1_000;
}

type SideData = {
  side_data_type?: string;
  rotation?: number;
  dv_profile?: number;
  dv_bl_signal_compatibility_id?: number;
};

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  coded_width?: number;
  coded_height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  color_transfer?: string;
  side_data_list?: SideData[];
  tags?: { rotate?: string };
};

type ProbeJson = {
  streams?: ProbeStream[];
  format?: { duration?: string };
};

function asProbe(value: unknown): ProbeJson {
  if (typeof value !== 'object' || value === null) return {};
  return value as ProbeJson;
}

export function normalizeRotation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  const mod = ((rounded % 360) + 360) % 360;
  if (mod === 270) return -90;
  if (mod === 90 || mod === 180 || mod === 0) return mod === 0 ? 0 : mod;
  return rounded;
}

export function readRotation(stream: ProbeStream): number {
  const matrix = stream.side_data_list?.find((side) => typeof side.rotation === 'number');
  if (matrix && typeof matrix.rotation === 'number') return normalizeRotation(matrix.rotation);
  const tag = stream.tags?.rotate;
  if (tag !== undefined && tag !== '' && Number.isFinite(Number(tag))) {
    return normalizeRotation(Number(tag));
  }
  return 0;
}

export function readDolbyVision(stream: ProbeStream): string | null {
  const side = stream.side_data_list?.find((item) => item.dv_profile != null);
  if (!side || side.dv_profile == null) return null;
  if (side.dv_bl_signal_compatibility_id == null) return String(side.dv_profile);
  return `${side.dv_profile}.${side.dv_bl_signal_compatibility_id}`;
}

export function displaySize(
  width: number,
  height: number,
  rotation: number,
): { displayWidth: number; displayHeight: number } {
  const quarter = Math.abs(rotation) % 180 === 90;
  return quarter
    ? { displayWidth: height, displayHeight: width }
    : { displayWidth: width, displayHeight: height };
}

export function assembleProbe(json: unknown, packetText: string): ProbeResult | null {
  const parsed = asProbe(json);
  const streams = parsed.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  if (!video) return null;
  const width = video.coded_width ?? video.width ?? 0;
  const height = video.coded_height ?? video.height ?? 0;
  const rotation = readRotation(video);
  const display = displaySize(width, height, rotation);
  const frames = parsePacketCsv(packetText);
  const avg = parseRate(video.avg_frame_rate);
  const raw = parseRate(video.r_frame_rate);
  const fps = avg ?? raw ?? 0;
  const colorTransfer = video.color_transfer?.trim() || null;
  const hdrTransfer: HdrTransfer | null = hdrTransferFromProbe(colorTransfer);
  const dolbyVision = readDolbyVision(video);
  const last = frames[frames.length - 1];
  const packetEnd = last ? last.tUs + last.durationUs : 0;
  const formatDuration = parseRate(parsed.format?.duration);
  const durationUs = us(
    Math.max(packetEnd, formatDuration ? Math.round(formatDuration * 1_000_000) : 0),
  );
  const rateMismatch = avg !== null && raw !== null && Math.abs(avg - raw) > 0.01;
  return {
    durationUs,
    codec: video.codec_name ?? 'unknown',
    width,
    height,
    displayWidth: display.displayWidth,
    displayHeight: display.displayHeight,
    rotation,
    fps,
    isHdr: hdrTransfer !== null || dolbyVision !== null,
    isVfr: durationsVary(frames) || rateMismatch,
    colorTransfer,
    hdrTransfer,
    dolbyVision,
    hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
    frames,
  };
}
