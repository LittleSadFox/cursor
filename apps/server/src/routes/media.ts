import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { ProblemError } from '@climbing-coach/api';
import { resolveUnderRoot, verifyMedia } from '@climbing-coach/adapters-node';
import { UlidSchema } from '@climbing-coach/schema';

const MediaQuerySchema = z.object({
  variant: z.enum(['original', 'proxy']).default('proxy'),
  sig: z.string().min(1),
});

export type MediaOptions = { mediaSecret: string; libraryRoot: string | null };

/** Authenticated by the signed URL alone (see SIGNED_URL_PREFIX); Host/Origin checks still apply. */
export function registerMediaRoutes(app: FastifyInstance, options: MediaOptions): void {
  app.get('/api/v1/media/videos/:videoId', async (request) => {
    const query = MediaQuerySchema.parse(request.query);
    const parsedId = UlidSchema.safeParse((request.params as { videoId?: string }).videoId);
    if (!parsedId.success) throw new ProblemError('NOT_FOUND', 'no such video');
    const videoId = parsedId.data;
    if (!verifyMedia(options.mediaSecret, videoId, query.variant, query.sig)) {
      throw new ProblemError('INVALID_SIGNATURE', 'stale or invalid media signature');
    }
    if (!options.libraryRoot) throw new ProblemError('NOT_FOUND', 'library is not configured');
    const resolved = resolveUnderRoot(
      options.libraryRoot,
      `${query.variant === 'proxy' ? 'proxies' : 'originals'}/${videoId}`,
    );
    if (!resolved) throw new ProblemError('NOT_FOUND', 'invalid media path');
    throw new ProblemError(
      'FFMPEG_UNAVAILABLE',
      'media files arrive with the ingest pipeline (P2-B)',
    );
  });
}
