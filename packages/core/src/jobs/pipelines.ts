import type { Pipeline } from './types.js';

export const BACKUP_PIPELINE: Pipeline = {
  type: 'backup-db',
  steps: [{ name: 'backup', resource: 'idle', dependsOn: [] }],
};

export const PURGE_PIPELINE: Pipeline = {
  type: 'purge-trash',
  steps: [{ name: 'purge', resource: 'idle', dependsOn: [] }],
};

/** BUILD_PLAN §3.3 `compare`: HQ tracks (same pose model) → align → compare → write-result. */
export const COMPARE_PIPELINE: Pipeline = {
  type: 'compare',
  steps: [
    { name: 'load-tracks', resource: 'compute', dependsOn: [] },
    { name: 'align', resource: 'compute', dependsOn: ['load-tracks'] },
    { name: 'compare', resource: 'compute', dependsOn: ['align'] },
    { name: 'write-result', resource: 'compute', dependsOn: ['compare'] },
  ],
};

export const P2A_PIPELINES: readonly Pipeline[] = [BACKUP_PIPELINE, PURGE_PIPELINE];

export const CORE_PIPELINES: readonly Pipeline[] = [...P2A_PIPELINES, COMPARE_PIPELINE];
