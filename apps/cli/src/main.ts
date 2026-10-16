#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  SCHEMA_VERSION,
  exportJsonSchemas,
  FEATURE_SPEC_PLACEHOLDER,
  stringifyFeatureSpec,
} from '@climbing-coach/schema';

import { formatEvalReport, loadEvalFixture, runEval } from './eval/run-eval.js';

function printHelp(): void {
  console.log(`coach — Climbing Coach CLI (schema ${SCHEMA_VERSION})`);
  console.log('Commands:');
  console.log('  version');
  console.log('  schema export [--out <dir>]   write JSON Schema + feature_spec.json');
  console.log('  eval --fixture <path> [--json <out>]');
  console.log('Later (P1): process, cut, align, bench');
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
  writeFileSync(resolve(outDir, 'feature_spec.json'), stringifyFeatureSpec(FEATURE_SPEC_PLACEHOLDER));
  console.log(`exported ${Object.keys(docs).length + 1} files to ${outDir}`);
}

function main(): void {
  const [, , command = 'help', ...rest] = process.argv;

  if (command === 'version' || command === '--version' || command === '-V') {
    console.log(`coach schema ${SCHEMA_VERSION}`);
    return;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'schema') {
    const sub = rest[0];
    if (sub !== 'export') {
      console.error('usage: coach schema export [--out <dir>]');
      process.exitCode = 1;
      return;
    }
    const out = takeFlag(rest, 'out') ?? 'packages/schema/json-schema';
    runSchemaExport(resolve(out));
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
    const jsonOut = takeFlag(rest, 'json');
    if (jsonOut && jsonOut !== 'true') {
      const abs = resolve(jsonOut);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, `${JSON.stringify(report, null, 2)}\n`);
      console.log(`wrote ${abs}`);
    }
    return;
  }

  printHelp();
  process.exitCode = 1;
}

main();
