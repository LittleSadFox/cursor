import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { appConfigDir } from '../paths.js';
import { detectRepoRoot } from '../ffmpeg/repo-root.js';

export type PoseModelRole = 'detector' | 'pose';

export type PoseModelEntry = {
  role: PoseModelRole;
  family: string;
  keypointSet: string | null;
  inputSize: [number, number];
  url: string;
  zipSha256: string;
  onnxRelative: string;
  onnxSha256: string;
  license: string;
  licenseUrl: string;
  simccSplitRatio?: number;
  mean?: [number, number, number];
  std?: [number, number, number];
};

export type PoseManifest = {
  version: string;
  license: string;
  models: Record<string, PoseModelEntry>;
};

export const DETECTOR_ID = 'rtmdet-nano-person';
export const POSE_ID = 'rtmpose-m-halpe26';
export const MODEL_VERSION = '20230605';

export type LocatedPoseModels = {
  root: string;
  source: 'env' | 'vendor' | 'config' | 'missing';
  detectorOnnx: string | null;
  poseOnnx: string | null;
  manifest: PoseManifest | null;
};

function readManifest(path: string): PoseManifest | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PoseManifest;
  } catch {
    return null;
  }
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function onnxPath(root: string, entry: PoseModelEntry): string {
  return join(root, entry.role === 'detector' ? 'detector' : 'pose', 'end2end.onnx');
}

function modelsPresent(root: string, manifest: PoseManifest): boolean {
  const det = manifest.models[DETECTOR_ID];
  const pose = manifest.models[POSE_ID];
  if (!det || !pose) return false;
  const detPath = onnxPath(root, det);
  const posePath = onnxPath(root, pose);
  if (!existsSync(detPath) || !existsSync(posePath)) return false;
  return sha256File(detPath) === det.onnxSha256 && sha256File(posePath) === pose.onnxSha256;
}

export function defaultPoseModelDirs(options: {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  configDir?: string;
}): string[] {
  const env = options.env ?? process.env;
  const dirs: string[] = [];
  if (env.COACH_POSE_MODELS) dirs.push(env.COACH_POSE_MODELS);
  const repo = detectRepoRoot(options.cwd ?? process.cwd());
  if (repo) dirs.push(join(repo, 'vendor', 'pose', 'models'));
  dirs.push(join(options.configDir ?? appConfigDir(), 'models', 'pose'));
  if (process.platform !== 'darwin') {
    dirs.push(join(env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'climbing-coach', 'pose'));
  }
  return dirs;
}

export function loadBundledManifest(cwd = process.cwd()): PoseManifest | null {
  const repo = detectRepoRoot(cwd);
  if (!repo) return null;
  return readManifest(join(repo, 'vendor', 'pose', 'manifest.json'));
}

/** Locate checksum-verified ONNX weights. Missing weights → not ready. */
export function locatePoseModels(options: {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  configDir?: string;
} = {}): LocatedPoseModels {
  const manifest = loadBundledManifest(options.cwd);
  if (!manifest) {
    return {
      root: '',
      source: 'missing',
      detectorOnnx: null,
      poseOnnx: null,
      manifest: null,
    };
  }
  const env = options.env ?? process.env;
  for (const root of defaultPoseModelDirs(options)) {
    if (!modelsPresent(root, manifest)) continue;
    const source: LocatedPoseModels['source'] = env.COACH_POSE_MODELS === root
      ? 'env'
      : root.includes(`${join('vendor', 'pose')}`)
        ? 'vendor'
        : 'config';
    return {
      root,
      source,
      detectorOnnx: onnxPath(root, manifest.models[DETECTOR_ID]!),
      poseOnnx: onnxPath(root, manifest.models[POSE_ID]!),
      manifest,
    };
  }
  return {
    root: '',
    source: 'missing',
    detectorOnnx: null,
    poseOnnx: null,
    manifest,
  };
}
