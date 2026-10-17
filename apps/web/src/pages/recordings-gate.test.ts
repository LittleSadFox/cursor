import { describe, expect, it } from 'vitest';

import { defaultHealth } from '@climbing-coach/api';

import { messages } from '../locales/en.js';
import { recordingsGate, recordingsImportReady } from './recordings-gate.js';

describe('recordingsImportReady', () => {
  it('exposes import when ffmpeg is ready even if health is degraded and pose is missing', () => {
    const health = defaultHealth({
      status: 'degraded',
      ffmpeg: { available: true, version: '8.1.3', note: 'bundled' },
      pose: {
        available: false,
        version: null,
        note: 'Pose adapter arrives with ADR-001; not bundled yet.',
      },
    });
    expect(health.status).toBe('degraded');
    expect(health.pose.available).toBe(false);
    expect(recordingsImportReady(health)).toBe(true);
    expect(recordingsGate({ isLoading: false, isError: false, data: health })).toBe('ready');
  });

  it('blocks import only when ffmpeg is unavailable', () => {
    const health = defaultHealth({
      status: 'degraded',
      ffmpeg: { available: false, version: null, note: 'missing' },
      pose: { available: false, version: null, note: 'missing' },
    });
    expect(recordingsImportReady(health)).toBe(false);
    expect(recordingsGate({ isLoading: false, isError: false, data: health })).toBe(
      'ffmpeg-missing',
    );
  });

  it('treats a failed health fetch as api-down, not a blank page', () => {
    expect(recordingsGate({ isLoading: false, isError: true, data: undefined })).toBe('api-down');
    expect(recordingsGate({ isLoading: false, isError: false, data: undefined })).toBe('api-down');
    expect(recordingsGate({ isLoading: true, isError: false, data: undefined })).toBe('loading');
    expect(recordingsImportReady(undefined)).toBe(false);
    expect(recordingsImportReady(null)).toBe(false);
  });

  it('does not revive the old pose+ffmpeg placeholder copy', () => {
    expect(messages).not.toHaveProperty('placeholder.recordings');
    const catalog = Object.values(messages).join('\n');
    expect(catalog).not.toMatch(/pose adapter/i);
    expect(messages['recordings.ffmpegMissing']).toMatch(/build-macos-arm64\.sh/);
    expect(messages['recordings.ffmpegMissing']).toMatch(/COACH_FFMPEG/);
    expect(messages['recordings.ffmpegMissing']).not.toMatch(/pose/i);
    expect(messages['api.down']).toMatch(/127\.0\.0\.1:8787/);
    expect(messages['api.down']).toMatch(/@climbing-coach\/server dev/);
  });
});
