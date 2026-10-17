import { createReadStream, statSync } from 'node:fs';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ProblemError } from '@climbing-coach/api';

type Range = { start: number; end: number };

export function parseByteRange(
  header: string | undefined,
  size: number,
): Range | 'unsatisfiable' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return 'unsatisfiable';
  const startText = match[1] ?? '';
  const endText = match[2] ?? '';
  if (!startText && !endText) return 'unsatisfiable';
  if (!startText) {
    const suffix = Number(endText);
    if (!Number.isInteger(suffix) || suffix <= 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(startText);
  const end = endText ? Number(endText) : size - 1;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return 'unsatisfiable';
  }
  return { start, end: Math.min(end, size - 1) };
}

/** Send a file, honoring a single `Range: bytes=` request so `<video>` can seek. */
export function sendFile(
  request: FastifyRequest,
  reply: FastifyReply,
  filePath: string,
  contentType: string,
): FastifyReply {
  let size: number;
  try {
    size = statSync(filePath).size;
  } catch {
    throw new ProblemError('NOT_FOUND', 'media file is missing on disk');
  }
  const rangeHeader = typeof request.headers.range === 'string' ? request.headers.range : undefined;
  const range = parseByteRange(rangeHeader, size);
  reply.header('accept-ranges', 'bytes').type(contentType);
  if (range === 'unsatisfiable') {
    reply.header('content-range', `bytes */${size}`);
    return reply.code(416).send();
  }
  if (!range) {
    reply.header('content-length', size);
    return reply.send(createReadStream(filePath));
  }
  reply.header('content-range', `bytes ${range.start}-${range.end}/${size}`);
  reply.header('content-length', range.end - range.start + 1);
  return reply.code(206).send(createReadStream(filePath, { start: range.start, end: range.end }));
}
