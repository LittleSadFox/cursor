import type { Pipeline } from './types.js';

export const BACKUP_PIPELINE: Pipeline = {
  type: 'backup-db',
  steps: [{ name: 'backup', resource: 'idle', dependsOn: [] }],
};

export const PURGE_PIPELINE: Pipeline = {
  type: 'purge-trash',
  steps: [{ name: 'purge', resource: 'idle', dependsOn: [] }],
};

export const P2A_PIPELINES: readonly Pipeline[] = [BACKUP_PIPELINE, PURGE_PIPELINE];
