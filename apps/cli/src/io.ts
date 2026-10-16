import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { AlignFrame, DraftItem, PoseSample } from '@climbing-coach/engine';

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as T;
}

export function writeJson(path: string | undefined, value: unknown): void {
  if (!path) return;
  const abs = resolve(path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `${JSON.stringify(value, null, 2)}\n`);
  console.log(`wrote ${abs}`);
}

/** `[x, y, z, visibility]` rows per landmark. JSON has no NaN, so null means missing. */
export type RawPoseSample = { tUs?: number; landmarks?: (number | null)[][] };

export function toPoseSamples(samples: readonly RawPoseSample[]): PoseSample[] {
  const value = (point: readonly (number | null)[], index: number): number =>
    point[index] ?? Number.NaN;
  return samples.map((sample) => ({
    tUs: sample.tUs ?? 0,
    landmarks: (sample.landmarks ?? []).map((point) => ({
      x: value(point, 0),
      y: value(point, 1),
      z: value(point, 2),
      visibility: value(point, 3),
    })),
  }));
}

export function loadPoses(path: string): PoseSample[] {
  return toPoseSamples(readJson<{ samples?: RawPoseSample[] }>(path).samples ?? []);
}

export function loadAlignFrames(path: string): AlignFrame[] {
  const parsed = readJson<{ frames?: { tUs?: number; values?: number[]; speed?: number }[] }>(path);
  return (parsed.frames ?? []).map((frame) => ({
    tUs: frame.tUs ?? 0,
    values: frame.values ?? [],
    speed: frame.speed ?? 0,
  }));
}

export type DraftFile = {
  video?: { startUs: number; endUs: number };
  padding?: { preUs: number; postUs: number };
  items?: {
    id: string;
    startUs: number;
    endUs: number;
    outcome?: DraftItem['outcome'];
    touched?: boolean;
    rejected?: boolean;
    source?: DraftItem['source'];
    parentIds?: string[];
  }[];
};

export function draftItems(draft: DraftFile): DraftItem[] {
  return (draft.items ?? []).map((item) => {
    const source = item.source ?? 'detector';
    return {
      id: item.id,
      climb: { startUs: item.startUs, endUs: item.endUs },
      outcome: item.outcome ?? 'unknown',
      touched: item.touched ?? false,
      rejected: item.rejected ?? false,
      source,
      parentIds: item.parentIds ?? (source === 'manual' ? [] : [item.id]),
    };
  });
}
