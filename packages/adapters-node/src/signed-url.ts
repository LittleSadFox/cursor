import { createHmac, timingSafeEqual } from 'node:crypto';

export function signMedia(secret: string, videoId: string, variant: string): string {
  return createHmac('sha256', secret).update(`${videoId}:${variant}`).digest('base64url');
}

export function verifyMedia(secret: string, videoId: string, variant: string, sig: string): boolean {
  const expected = signMedia(secret, videoId, variant);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
