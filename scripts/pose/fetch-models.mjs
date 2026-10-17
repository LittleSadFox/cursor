#!/usr/bin/env node
/**
 * Download RTMDet-nano + RTMPose-m Halpe-26 ONNX weights with checksum verification.
 * Weights stay out of git (vendor/pose/models is gitignored).
 *
 * Usage:
 *   node scripts/pose/fetch-models.mjs [--dir <path>]
 */
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../..');
const manifestPath = join(repoRoot, 'vendor/pose/manifest.json');

function parseArgs(argv) {
  let dir = join(repoRoot, 'vendor/pose/models');
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dir' && argv[i + 1]) {
      dir = argv[i + 1];
      i += 1;
    }
  }
  return { dir };
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

async function download(url, dest) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} → ${response.status}`);
  await pipeline(response.body, createWriteStream(dest));
}

function extractOnnx(zipPath, onnxRelative, destOnnx) {
  mkdirSync(dirname(destOnnx), { recursive: true });
  const staging = join(tmpdir(), `coach-pose-${process.pid}`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  execFileSync('unzip', ['-o', zipPath, '-d', staging], { stdio: 'inherit' });
  const source = join(staging, onnxRelative);
  if (!existsSync(source)) {
    throw new Error(`ONNX not found in zip: ${onnxRelative}`);
  }
  renameSync(source, destOnnx);
  rmSync(staging, { recursive: true, force: true });
}

async function ensureModel(id, entry, root) {
  const roleDir = join(root, entry.role === 'detector' ? 'detector' : 'pose');
  const onnxPath = join(roleDir, 'end2end.onnx');
  if (existsSync(onnxPath) && sha256File(onnxPath) === entry.onnxSha256) {
    console.log(`[pose] ${id}: already present`);
    return;
  }
  mkdirSync(roleDir, { recursive: true });
  const zipPath = join(roleDir, 'weights.zip');
  console.log(`[pose] ${id}: downloading ${entry.url}`);
  await download(entry.url, zipPath);
  const zipHash = sha256File(zipPath);
  if (zipHash !== entry.zipSha256) {
    throw new Error(`${id} zip sha256 mismatch: got ${zipHash}, expected ${entry.zipSha256}`);
  }
  extractOnnx(zipPath, entry.onnxRelative, onnxPath);
  const onnxHash = sha256File(onnxPath);
  if (onnxHash !== entry.onnxSha256) {
    throw new Error(`${id} onnx sha256 mismatch: got ${onnxHash}, expected ${entry.onnxSha256}`);
  }
  rmSync(zipPath, { force: true });
  console.log(`[pose] ${id}: ready (${entry.license})`);
}

async function main() {
  const { dir } = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  mkdirSync(dir, { recursive: true });
  for (const [id, entry] of Object.entries(manifest.models)) {
    await ensureModel(id, entry, dir);
  }
  console.log(`[pose] models in ${dir}`);
  console.log(`[pose] license: ${manifest.license} — ${manifest.licenseNote}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
