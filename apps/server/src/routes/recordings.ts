import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';

import {
  ProblemError,
  RecordingCutSchema,
  RecordingImportSchema,
  type CoachApi,
} from '@climbing-coach/api';

import { idParam } from './params.js';

function uploadName(header: unknown): string {
  if (typeof header !== 'string' || header.trim() === '') return 'upload.mp4';
  try {
    return decodeURIComponent(header);
  } catch {
    return 'upload.mp4';
  }
}

export function registerRecordingRoutes(app: FastifyInstance, api: CoachApi): void {
  app.addContentTypeParser('application/octet-stream', (_request, payload, done) => {
    done(null, payload);
  });

  app.get('/api/v1/recordings', async () => api.recordings.list());
  app.get('/api/v1/recordings/:id', async (request) => api.recordings.get(idParam(request)));
  app.post('/api/v1/recordings', async (request, reply) => {
    const created = await api.recordings.importPath(RecordingImportSchema.parse(request.body));
    return reply.code(202).send(created);
  });
  app.post('/api/v1/recordings/:id/cut', async (request, reply) => {
    const created = await api.recordings.cut(
      idParam(request),
      RecordingCutSchema.parse(request.body),
    );
    return reply.code(202).send(created);
  });

  app.post(
    '/api/v1/recordings/upload',
    { bodyLimit: 8 * 1024 * 1024 * 1024 },
    async (request, reply) => {
      const body = request.body;
      if (!body || typeof (body as Readable).pipe !== 'function') {
        throw new ProblemError(
          'VALIDATION_FAILED',
          'Upload the video as application/octet-stream.',
        );
      }
      const dir = await mkdtemp(join(tmpdir(), 'coach-upload-'));
      const dest = join(dir, 'upload');
      try {
        await pipeline(body as Readable, createWriteStream(dest));
        const created = await api.recordings.importPath({
          sourcePath: dest,
          importMode: 'move',
          fileName: uploadName(request.headers['x-filename']),
        });
        return reply.code(202).send(created);
      } catch (error) {
        await rm(dir, { recursive: true, force: true });
        throw error;
      }
    },
  );
}
