import type { FastifyInstance, FastifyReply } from 'fastify';

import {
  littleEndianBytes,
  type AlignmentFeedback,
  type CoachApi,
  type ComparisonExportInput,
  type ComparisonInput,
  type VideoPoseQuery,
} from '@climbing-coach/api';

import { idParam } from './params.js';

// Bodies and queries are validated by core (`parseInput`), the same as in-process calls.

function sendBytes(reply: FastifyReply, bytes: Uint8Array): FastifyReply {
  return reply
    .type('application/octet-stream')
    .send(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}

/** BUILD_PLAN §4.2 comparisons, plus the pose slice the compare view draws from. */
export function registerComparisonRoutes(app: FastifyInstance, api: CoachApi): void {
  app.post('/api/v1/comparisons', async (request, reply) => {
    const comparison = await api.comparisons.create(request.body as ComparisonInput);
    return reply.code(comparison.status === 'ready' ? 200 : 202).send(comparison);
  });
  app.get('/api/v1/comparisons/:id', async (request) => api.comparisons.get(idParam(request)));
  app.get('/api/v1/comparisons/:id/warp', async (request, reply) =>
    sendBytes(reply, littleEndianBytes(await api.comparisons.warp(idParam(request)))),
  );
  app.get('/api/v1/comparisons/:id/divergence', async (request, reply) =>
    sendBytes(reply, littleEndianBytes(await api.comparisons.divergence(idParam(request)))),
  );
  app.post('/api/v1/comparisons/:id/feedback', async (request, reply) => {
    await api.comparisons.feedback(idParam(request), request.body as AlignmentFeedback);
    return reply.code(204).send();
  });
  app.post('/api/v1/comparisons/:id/export', async (request, reply) =>
    reply
      .code(202)
      .send(await api.comparisons.export(idParam(request), request.body as ComparisonExportInput)),
  );
  app.get('/api/v1/videos/:id/pose', async (request, reply) =>
    sendBytes(reply, await api.videos.pose(idParam(request), request.query as VideoPoseQuery)),
  );
}
