#!/usr/bin/env node
import { SCHEMA_VERSION } from '@climbing-coach/schema';

const [, , command = 'help'] = process.argv;

if (command === 'version' || command === '--version' || command === '-V') {
  console.log(`coach schema ${SCHEMA_VERSION}`);
  process.exit(0);
}

console.log(`coach — Climbing Coach CLI (schema ${SCHEMA_VERSION})`);
console.log('Commands (Phase 1): process, cut, align, eval, bench');
console.log('Available now: version');
process.exit(command === 'help' || command === '--help' ? 0 : 1);
