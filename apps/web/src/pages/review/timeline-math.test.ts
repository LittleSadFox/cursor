import { describe, expect, it } from 'vitest';

import {
  fluidTileStyle,
  formatSeconds,
  frameUs,
  loupeCenterUs,
  nearestTile,
  rangeStyle,
  tileStyle,
  usAtClientX,
} from './timeline-math.js';

const tiles = [
  { tUs: 0, x: 0, y: 0, w: 120, h: 68 },
  { tUs: 1_000_000, x: 120, y: 0, w: 120, h: 68 },
  { tUs: 2_000_000, x: 0, y: 68, w: 120, h: 68 },
];

describe('timeline math', () => {
  it('maps pointer position to time and clamps to the recording', () => {
    const rect = { left: 100, width: 400 };
    expect(usAtClientX(300, rect, 10_000_000)).toBe(5_000_000);
    expect(usAtClientX(0, rect, 10_000_000)).toBe(0);
    expect(usAtClientX(900, rect, 10_000_000)).toBe(10_000_000);
    expect(usAtClientX(300, { left: 0, width: 0 }, 10_000_000)).toBe(0);
  });

  it('places a range as percentages', () => {
    expect(rangeStyle({ startUs: 2_500_000, endUs: 5_000_000 }, 10_000_000)).toEqual({
      left: '25.000%',
      width: '25.000%',
    });
  });

  it('steps one frame, falling back to 30 fps', () => {
    expect(frameUs(60)).toBe(16_667);
    expect(frameUs(null)).toBe(33_333);
    expect(formatSeconds(1_234_567)).toBe('1.23');
  });

  it('snaps loupe centres to whole seconds', () => {
    expect(loupeCenterUs(2_400_000)).toBe(2_000_000);
    expect(loupeCenterUs(2_600_000)).toBe(3_000_000);
  });

  it('finds the nearest tile and scales its sprite window', () => {
    expect(nearestTile(tiles, 1_400_000)?.tUs).toBe(1_000_000);
    expect(nearestTile([], 0)).toBeUndefined();
    const sprite = { spriteUrl: '/s.jpg', width: 240, height: 136, tiles };
    expect(tileStyle(sprite, tiles[2]!, 60)).toEqual({
      width: '60.00px',
      height: '34.00px',
      backgroundImage: 'url("/s.jpg")',
      backgroundPosition: '-0.00px -34.00px',
      backgroundSize: '120.00px 68.00px',
    });
  });

  it('scales a sprite tile into a fluid box', () => {
    const sprite = { spriteUrl: '/s.jpg', width: 240, height: 136, tiles };
    expect(fluidTileStyle(sprite, tiles[1]!)).toEqual({
      aspectRatio: '120 / 68',
      backgroundImage: 'url("/s.jpg")',
      backgroundPosition: '100.000% 0.000%',
      backgroundSize: '200.000% 200.000%',
    });
    const single = { spriteUrl: '/one.jpg', width: 120, height: 68, tiles: [tiles[0]!] };
    expect(fluidTileStyle(single, tiles[0]!).backgroundPosition).toBe('0% 0%');
  });
});
