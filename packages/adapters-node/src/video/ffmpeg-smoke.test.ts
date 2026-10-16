import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { us } from '@climbing-coach/schema';

import { locateFfmpeg } from '../ffmpeg/locate.js';
import { createNodeVideoTools } from './tools.js';

const located = locateFfmpeg();
const enabled = located.ffmpegPath !== null && located.ffprobePath !== null;

describe.skipIf(!enabled)('ffmpeg video tools', () => {
  it('probes, hashes, proxies, and cuts a generated clip', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'coach-video-'));
    const src = join(dir, 'src.mp4');
    const proxy = join(dir, 'proxy.mp4');
    const cut = join(dir, 'cut.mp4');
    try {
      const { spawn } = await import('node:child_process');
      await new Promise<void>((resolve, reject) => {
        const child = spawn(located.ffmpegPath!, [
          '-hide_banner',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'testsrc=size=160x120:rate=30:duration=1',
          '-pix_fmt',
          'yuv420p',
          src,
        ]);
        child.on('error', reject);
        child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`lavfi ${code}`))));
      });
      const tools = createNodeVideoTools();
      const info = await tools.probe(src);
      expect(info.codec).toBe('h264');
      expect(info.displayWidth).toBe(160);
      expect(info.frames.length).toBeGreaterThan(10);
      expect(info.frames[0]?.keyframe).toBe(true);
      const quick = await tools.quickHash(src);
      const full = await tools.fullHash(src);
      expect(quick).toMatch(/^[a-f0-9]{64}$/);
      expect(full).toMatch(/^[a-f0-9]{64}$/);
      expect(quick).not.toBe(full);
      await tools.makeProxy(src, proxy);
      const proxied = await tools.probe(proxy);
      expect(proxied.codec).toBe('h264');
      expect(proxied.frames.length).toBeGreaterThan(5);
      const result = await tools.cut(
        src,
        cut,
        { startUs: us(200_000), endUs: us(700_000) },
        'auto',
      );
      expect(result.frameCount).toBeGreaterThan(0);
      expect(result.actualRange.startUs).toBeLessThanOrEqual(200_000);
      expect(result.actualRange.endUs).toBeGreaterThanOrEqual(700_000);
      const bytes = await readFile(proxy);
      expect(bytes.length).toBeGreaterThan(100);
      const frames = [];
      for await (const frame of tools.keyframes(src, { maxSide: 80 })) frames.push(frame);
      expect(frames.length).toBeGreaterThan(0);
      expect(frames[0]?.format).toBe('gray');
      expect(frames[0]?.width).toBeLessThanOrEqual(80);
      const thumb = join(dir, 'thumb.jpg');
      await tools.thumbnail(src, us(100_000), thumb, 64);
      expect((await readFile(thumb)).length).toBeGreaterThan(50);
      const strip = join(dir, 'strip.jpg');
      const layout = await tools.filmstrip(
        src,
        { startUs: us(0), endUs: info.durationUs },
        4,
        strip,
        40,
      );
      expect(layout.tiles.length).toBeGreaterThan(0);
      expect((await readFile(strip)).length).toBeGreaterThan(50);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a truncated file as unsupported media', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'coach-bad-'));
    const src = join(dir, 'broken.mp4');
    try {
      await writeFile(src, Buffer.from('not a video'));
      const tools = createNodeVideoTools();
      await expect(tools.probe(src)).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
