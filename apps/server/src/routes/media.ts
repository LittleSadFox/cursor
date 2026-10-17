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

const ThumbQuerySchema = z.object({ sig: z.string().min(1) });

export type MediaOptions = {
  mediaSecret: string;
  resolveMedia?:
    ((videoId: string, variant: 'original' | 'proxy') => Promise<MediaFile>) | undefined;
  /** Filmstrip and loupe JPEGs under `thumbs/<videoId>/`. */
  resolveThumb?: ((videoId: string, name: string) => MediaFile) | undefined;
};

/** Signature scope for a thumbs file, distinct from the video variants. */
export function thumbVariant(name: string): string {
  return `thumb:${name}`;
}

function videoIdOf(params: unknown): string {
  const parsed = UlidSchema.safeParse((params as { videoId?: string }).videoId);
  if (!parsed.success) throw new ProblemError('NOT_FOUND', 'no such video');
  return parsed.data;
}

/** Authenticated by the signed URL alone (see SIGNED_URL_PREFIX); Host/Origin checks still apply. */
export function registerMediaRoutes(app: FastifyInstance, options: MediaOptions): void {
  app.get('/api/v1/media/videos/:videoId', async (request, reply) => {
    const query = MediaQuerySchema.parse(request.query);
    const videoId = videoIdOf(request.params);
    if (!verifyMedia(options.mediaSecret, videoId, query.variant, query.sig)) {
      throw new ProblemError('INVALID_SIGNATURE', 'stale or invalid media signature');
    }
    if (!options.resolveMedia)
      throw new ProblemError('NOT_FOUND', 'library files are not configured');
    const file = await options.resolveMedia(videoId, query.variant);
    return sendFile(request, reply, file.path, file.contentType);
  });

  app.get('/api/v1/media/thumbs/:videoId/:name', async (request, reply) => {
    const query = ThumbQuerySchema.parse(request.query);
    const videoId = videoIdOf(request.params);
    const name = String((request.params as { name?: string }).name ?? '');
    if (!verifyMedia(options.mediaSecret, videoId, thumbVariant(name), query.sig)) {
      throw new ProblemError('INVALID_SIGNATURE', 'stale or invalid media signature');
    }
    if (!options.resolveThumb) {
      throw new ProblemError('NOT_FOUND', 'library files are not configured');
    }
    const file = options.resolveThumb(videoId, name);
    return sendFile(request, reply, file.path, file.contentType);
  });
}
