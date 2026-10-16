import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  FEATURE_SPEC_PLACEHOLDER,
  SCHEMA_VERSION,
  exportJsonSchemas,
  stringifyFeatureSpec,
} from '@climbing-coach/schema';
import {
  STARTING_PARAMS,
  activeWindows,
  activitySeries,
  align,
  bandedDtw,
  clipRangeOf,
  detectAttempts,
  proposeItems,
  validateDraft,
  type AlignFrame,
  type PoseSample,
} from '@climbing-coach/engine';

import { formatEvalReport, loadEvalFixture, runEval } from './eval/run-eval.js';

export function printHelp(): void {
  console.log(`coach — Climbing Coach CLI (schema ${SCHEMA_VERSION})`);
  console.log('Commands:');
  console.log('  version');
  console.log('  schema export [--out <dir>]   write JSON Schema + feature_spec.json');
  console.log('  eval --fixture <path> [--json <out>]');
  console.log('  detect --poses <path> [--json <out>]');
  console.log('  align --a <path> --b <path> [--json <out>]');
  console.log('  cut --draft <path> [--json <out>]');
  console.log('  bench');
  console.log('  process <video>               needs the macOS ffmpeg build (P1.7)');
}

function takeFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith('--')) return 'true';
  return value;
}

function runSchemaExport(outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  const docs = exportJsonSchemas();
  for (const [name, doc] of Object.entries(docs)) {
    writeFileSync(resolve(outDir, `${name}.json`), `${JSON.stringify(doc, null, 2)}\n`);
  }
  writeFileSync(
    resolve(outDir, 'feature_spec.json'),
    stringifyFeatureSpec(FEATURE_SPEC_PLACEHOLDER),
  );
  console.log(`exported ${Object.keys(docs).length + 1} files to ${outDir}`);
}

function writeJson(path: string | undefined, value: unknown): void {
  if (!path || path === 'true') return;
  const abs = resolve(path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `${JSON.stringify(value, null, 2)}\n`);
  console.log(`wrote ${abs}`);
}

type RawPose = { samples?: { tUs?: number; landmarks?: number[][] }[] };

function loadPoses(path: string): PoseSample[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as RawPose;
  const samples = parsed.samples ?? [];
  return samples.map((sample) => ({
    tUs: sample.tUs ?? 0,
    landmarks: (sample.landmarks ?? []).map((point) => ({
      x: point[0] ?? 0,
      y: point[1] ?? 0,
      z: point[2] ?? 0,
      visibility: point[3] ?? 0,
    })),
  }));
}

function loadAlign(path: string): AlignFrame[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
    frames?: { tUs?: number; values?: number[]; speed?: number }[];
  };
  return (parsed.frames ?? []).map((frame) => ({
    tUs: frame.tUs ?? 0,
    values: frame.values ?? [],
    speed: frame.speed ?? 0,
  }));
}

function videoBlocked(command: string): void {
  console.error(
    `coach ${command}: video tools need the macOS LGPL ffmpeg build (P1.7, ADR-002). Use detect/align/cut --draft on JSON until that lands.`,
  );
  process.exitCode = 2;
}

export function run(argv: readonly string[]): void {
  const [command = 'help', ...rest] = argv;

  if (command === 'version' || command === '--version' || command === '-V') {
    console.log(`coach schema ${SCHEMA_VERSION}`);
    return;
  }
  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }
  if (command === 'schema') {
    if (rest[0] !== 'export') {
      console.error('usage: coach schema export [--out <dir>]');
      process.exitCode = 1;
      return;
    }
    runSchemaExport(resolve(takeFlag(rest, 'out') ?? 'packages/schema/json-schema'));
    return;
  }
  if (command === 'eval') {
    const fixturePath = takeFlag(rest, 'fixture');
    if (!fixturePath || fixturePath === 'true') {
      console.error('usage: coach eval --fixture <path> [--json <out>]');
      process.exitCode = 1;
      return;
    }
    const report = runEval(loadEvalFixture(resolve(fixturePath)));
    console.log(formatEvalReport(report));
    writeJson(takeFlag(rest, 'json'), report);
    return;
  }
  if (command === 'detect') {
    const poses = takeFlag(rest, 'poses');
    if (!poses || poses === 'true') {
      console.error('usage: coach detect --poses <path> [--json <out>]');
      process.exitCode = 1;
      return;
    }
    const result = detectAttempts(loadPoses(resolve(poses)));
    const body = {
      floor: result.floor,
      attempts: result.attempts,
    };
    console.log(JSON.stringify(body));
    writeJson(takeFlag(rest, 'json'), body);
    return;
  }
  if (command === 'align') {
    const a = takeFlag(rest, 'a');
    const b = takeFlag(rest, 'b');
    if (!a || a === 'true' || !b || b === 'true') {
      console.error('usage: coach align --a <path> --b <path> [--json <out>]');
      process.exitCode = 1;
      return;
    }
    const result = align(loadAlign(resolve(a)), loadAlign(resolve(b)), { openEnd: false });
    console.log(JSON.stringify({ cost: result.cost, steps: result.path.length }));
    writeJson(takeFlag(rest, 'json'), result);
    return;
  }
  if (command === 'cut') {
    const draftPath = takeFlag(rest, 'draft');
    if (!draftPath || draftPath === 'true') {
      videoBlocked('cut');
      return;
    }
    const draft = JSON.parse(readFileSync(resolve(draftPath), 'utf8')) as {
      video?: { startUs: number; endUs: number };
      padding?: { preUs: number; postUs: number };
      items?: {
        id: string;
        startUs: number;
        endUs: number;
        outcome?: 'fall' | 'drop' | 'top' | 'unknown';
        touched?: boolean;
        rejected?: boolean;
        source?: 'detector' | 'manual' | 'split' | 'merge';
        parentIds?: string[];
      }[];
    };
    const items = (draft.items ?? []).map((item) => ({
      id: item.id,
      climb: { startUs: item.startUs, endUs: item.endUs },
      outcome: item.outcome ?? 'unknown',
      touched: item.touched ?? false,
      rejected: item.rejected ?? false,
      source: item.source ?? 'detector',
      parentIds: item.parentIds ?? [item.id],
    }));
    const video = draft.video ?? { startUs: 0, endUs: Number.MAX_SAFE_INTEGER };
    const padding = draft.padding ?? STARTING_PARAMS.padding;
    const validation = validateDraft(items);
    const clips = items
      .filter((item) => !item.rejected)
      .map((item) => ({ id: item.id, clip: clipRangeOf(item, padding, video) }));
    const body = { ok: validation.ok, conflicts: validation.conflicts, clips };
    console.log(JSON.stringify(body));
    writeJson(takeFlag(rest, 'json'), body);
    if (!validation.ok) process.exitCode = 1;
    return;
  }
  if (command === 'bench') {
    const frames = Array.from({ length: 120 }, (_, index) => ({
      tUs: index * 66_667,
      width: 16,
      height: 16,
      pixels: Float32Array.from({ length: 256 }, (_, pixel) => ((pixel + index) % 7 === 0 ? 1 : 0)),
    }));
    const started = Date.now();
    const windows = activeWindows(activitySeries(frames), 119 * 66_667, STARTING_PARAMS.activity);
    const series = Array.from({ length: 180 }, (_, index) => [
      Math.sin(index / 8),
      Math.cos(index / 11),
    ]);
    bandedDtw(series, series, STARTING_PARAMS.align.dtwBandFraction);
    const attempts = proposeItems(
      [
        {
          startUs: 0,
          endUs: 1_000_000,
          outcome: 'fall',
          exitDirection: 'none',
          startConfidence: 'high',
        },
      ],
      ['bench'],
    );
    const elapsedMs = Date.now() - started;
    console.log(JSON.stringify({ elapsedMs, windows: windows.length, proposals: attempts.length }));
    return;
  }
  if (command === 'process') {
    videoBlocked('process');
    return;
  }
  printHelp();
  process.exitCode = 1;
}
