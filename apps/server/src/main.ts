import Fastify from 'fastify';

import { API_VERSION } from '@climbing-coach/api';
import { createCoreApi } from '@climbing-coach/core';

async function main(): Promise<void> {
  const api = createCoreApi();
  const app = Fastify({ logger: true });

  app.get('/api/v1/health', async () => api.health());

  const port = Number(process.env.PORT ?? 8787);
  await app.listen({ host: '127.0.0.1', port });
  app.log.info({ apiVersion: API_VERSION, port }, 'climbing-coach server listening');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
