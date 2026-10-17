import { describe, expect, it } from 'vitest';

import { reprocessGate, reviewNotice } from './review-gate.js';

const on = { available: true, version: '1', note: '' };
const off = { available: false, version: null, note: '' };
const done = { jobId: null, jobStatus: null, complete: true, proxyReady: true };
const running = { ...done, jobStatus: 'running' as const, complete: false };

describe('reprocessGate', () => {
  it('needs ffmpeg, pose, and no job in flight', () => {
    expect(reprocessGate({ ffmpeg: on, pose: on }, done)).toBe('ready');
    expect(reprocessGate({ ffmpeg: on, pose: on }, running)).toBe('busy');
    expect(reprocessGate({ ffmpeg: off, pose: on }, done)).toBe('ffmpeg-missing');
    expect(reprocessGate({ ffmpeg: on, pose: off }, done)).toBe('pose-missing');
    expect(reprocessGate(undefined, done)).toBe('ffmpeg-missing');
  });
});

describe('reviewNotice', () => {
  it('explains a running job or an empty draft', () => {
    expect(reviewNotice(running, 2)).toBe('review.processing');
    expect(reviewNotice(done, 0)).toBe('review.noProposals');
    expect(reviewNotice(done, 1)).toBeNull();
  });
});
