import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ProblemError, type MediaFile } from '@climbing-coach/api';
import { verifyMedia } from '@climbing-coach/adapters-node';
import { UlidSchema } from '@climbing-coach/schema';

import { sendFile } from './send-file.js';

const MediaQuerySchema = z.object({
  variant: z.enum(['original', 'proxy']).default('proxy'),
  sig: z.string().min(1),
});

export type MediaOptions = {
  mediaSecret: string;
  resolveMedia?:
    ((videoId: string, variant: 'original' | 'proxy') => Promise<MediaFile>) | undefined;
};

/** Authenticated by the signed URL alone (see SIGNED_URL_PREFIX); Host/Origin checks still apply. */
export function registerMediaRoutes(app: FastifyInstance, options: MediaOptions): void {
  app.get('/api/v1/media/videos/:videoId', async (request, reply) => {
    const query = MediaQuerySchema.parse(request.query);
    const parsedId = UlidSchema.safeParse((request.params as { videoId?: string }).videoId);
    if (!parsedId.success) throw new ProblemError('NOT_FOUND', 'no such video');
    const videoId = parsedId.data;
    if (!verifyMedia(options.mediaSecret, videoId, query.variant, query.sig)) {
      throw new ProblemError('INVALID_SIGNATURE', 'stale or invalid media signature');
    }
    if (!options.resolveMedia)
      throw new ProblemError('NOT_FOUND', 'library files are not configured');
    const file = await options.resolveMedia(videoId, query.variant);
    return sendFile(request, reply, file.path, file.contentType);
  });
}
