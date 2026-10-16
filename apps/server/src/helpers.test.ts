import { describe, expect, it, vi } from 'vitest';

import { APP_ORIGIN, DEV_TOKEN, launchConfig, resolveLibraryRoot, VITE_ORIGINS } from './config.js';
import { runMaintenancePass, startScheduler } from './scheduler.js';
import { bearerMatches, isAllowedHost } from './security.js';
import { formatSseEvent } from './sse.js';

const hex = (bytes: number) => 'ab'.repeat(bytes);

describe('launchConfig', () => {
  it('generates a per-launch token and allows only the packaged origin by default', () => {
    const config = launchConfig({}, hex);
    expect(config.token).toBe(hex(32));
    expect(config.token).not.toBe(DEV_TOKEN);
    expect(config.tokenSource).toBe('random');
    expect(config.allowedOrigins).toEqual([APP_ORIGIN]);
    expect(config.port).toBe(8787);
  });

  it('uses the fixed dev token and Vite origins only with COACH_DEV=1', () => {
    const config = launchConfig({ COACH_DEV: '1', COACH_DEV_ORIGIN: 'http://127.0.0.1:4173' }, hex);
    expect(config.token).toBe(DEV_TOKEN);
    expect(config.allowedOrigins).toEqual([APP_ORIGIN, ...VITE_ORIGINS, 'http://127.0.0.1:4173']);
    expect(launchConfig({ COACH_DEV_ORIGIN: 'http://127.0.0.1:4173' }, hex).allowedOrigins).toEqual(
      [APP_ORIGIN],
    );
  });

  it('prefers a launcher-provided token', () => {
    const config = launchConfig({ COACH_TOKEN: 'from-desktop', COACH_DEV: '1', PORT: '0' }, hex);
    expect(config).toMatchObject({ token: 'from-desktop', tokenSource: 'env', port: 0 });
    expect(launchConfig({ COACH_TOKEN: '   ' }, hex).tokenSource).toBe('random');
  });

  it('rejects a malformed PORT', () => {
    expect(() => launchConfig({ PORT: 'eighty' }, hex)).toThrow(RangeError);
  });
});

describe('resolveLibraryRoot', () => {
  it('prefers the env override, then the saved pointer, then the default', () => {
    expect(resolveLibraryRoot({ COACH_LIBRARY: '/env' }, '/saved', '/default')).toBe('/env');
    expect(resolveLibraryRoot({}, '/saved', '/default')).toBe('/saved');
    expect(resolveLibraryRoot({}, null, '/default')).toBe('/default');
  });
});

describe('security helpers', () => {
  it('accepts only loopback hosts on the listening port', () => {
    expect(isAllowedHost('127.0.0.1:8787', 8787)).toBe(true);
    expect(isAllowedHost('LOCALHOST:8787', 8787)).toBe(true);
    expect(isAllowedHost('127.0.0.1:9999', 8787)).toBe(false);
    expect(isAllowedHost('localhost.evil.example:8787', 8787)).toBe(false);
    expect(isAllowedHost('evil.example', undefined)).toBe(false);
    expect(isAllowedHost(undefined, 8787)).toBe(false);
  });

  it('matches the bearer token exactly', () => {
    expect(bearerMatches('Bearer t0ken', 't0ken')).toBe(true);
    expect(bearerMatches('Bearer t0ke', 't0ken')).toBe(false);
    expect(bearerMatches('bearer t0ken', 't0ken')).toBe(false);
    expect(bearerMatches(undefined, 't0ken')).toBe(false);
  });
});

describe('formatSseEvent', () => {
  it('writes id, event, and JSON data lines', () => {
    const line = formatSseEvent({
      id: '7-1',
      type: 'job.completed',
      jobId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      jobType: 'backup-db',
    });
    expect(line).toBe(
      'id: 7-1\nevent: job.completed\ndata: {"id":"7-1","type":"job.completed","jobId":"01ARZ3NDEKTSV4RRFFQ69G5FAV","jobType":"backup-db"}\n\n',
    );
  });
});

describe('scheduler', () => {
  it('queues the daily maintenance jobs before ticking', async () => {
    const calls: string[] = [];
    await runMaintenancePass({
      ensureDaily: (type) => {
        calls.push(type);
        return null;
      },
      tick: async () => {
        calls.push('tick');
      },
    });
    expect(calls).toEqual(['backup-db', 'purge-trash', 'tick']);
  });

  it('logs a failed pass instead of crashing', async () => {
    const error = vi.fn();
    const stop = startScheduler(
      { ensureDaily: () => null, tick: () => Promise.reject(new Error('locked')) },
      { error },
      60_000,
    );
    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
    stop();
  });
});
