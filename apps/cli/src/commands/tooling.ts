import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  FEATURE_SPEC_PLACEHOLDER,
  SCHEMA_VERSION,
  exportJsonSchemas,
  stringifyFeatureSpec,
} from '@climbing-coach/schema';

import { flagValue, usage } from '../args.js';
import { formatEvalReport, loadEvalFixture, runEval } from '../eval/run-eval.js';
import { writeJson } from '../io.js';

export function printHelp(): void {
  console.log(`coach — Climbing Coach CLI (schema ${SCHEMA_VERSION})`);
  console.log('Commands:');
  console.log('  version');
  console.log('  schema export [--out <dir>]   write JSON Schema + feature_spec.json');
  console.log('  eval --fixture <path> [--json <out>]');
  console.log('  detect --poses <path> [--json <out>]');
  console.log('  align --a <path> --b <path> [--open-end] [--json <out>]');
  console.log('  compare --a <poses> --b <poses> [--open-end] [--json <out>]');
  console.log('  cut --draft <path> [--json <out>]');
  console.log('  bench [--check]               engine timings vs BUILD_PLAN 6.4 budgets');
  console.log('  process <video>               needs the macOS ffmpeg build (P1.7)');
}

export function versionCommand(): void {
  console.log(`coach schema ${SCHEMA_VERSION}`);
}

export function schemaCommand(args: readonly string[]): void {
  if (args[0] !== 'export') return usage('coach schema export [--out <dir>]');
  const outDir = resolve(flagValue(args, 'out') ?? 'packages/schema/json-schema');
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

export function evalCommand(args: readonly string[]): void {
  const fixturePath = flagValue(args, 'fixture');
  if (!fixturePath) return usage('coach eval --fixture <path> [--json <out>]');
  const report = runEval(loadEvalFixture(resolve(fixturePath)));
  console.log(formatEvalReport(report));
  writeJson(flagValue(args, 'json'), report);
}
