#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { exportJsonSchemas, FEATURE_SPEC_PLACEHOLDER, stringifyFeatureSpec } from '../dist/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT_DIR = join(ROOT, 'packages/schema/json-schema');

mkdirSync(OUT_DIR, { recursive: true });
const docs = exportJsonSchemas();
for (const [name, doc] of Object.entries(docs)) {
  const path = join(OUT_DIR, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`wrote ${path}`);
}
writeFileSync(join(OUT_DIR, 'feature_spec.json'), stringifyFeatureSpec(FEATURE_SPEC_PLACEHOLDER));
console.log(`wrote ${join(OUT_DIR, 'feature_spec.json')}`);
