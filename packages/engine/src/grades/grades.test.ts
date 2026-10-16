import { describe, expect, it } from 'vitest';

import { formatGrade, toDifficultyIndex } from './convert.js';
import { parseFontGrade } from './font.js';
import { parseFrenchGrade } from './french.js';
import { parseVGrade, formatVGrade } from './v-scale.js';
import { parseYdsGrade } from './yds.js';

describe('V-scale', () => {
  it('maps whole grades onto tenths', () => {
    expect(parseVGrade('VB')).toBe(-10);
    expect(parseVGrade('V0')).toBe(0);
    expect(parseVGrade('V4')).toBe(40);
    expect(parseVGrade('V17')).toBe(170);
  });

  it('keeps plus/minus inside the same whole grade', () => {
    expect(parseVGrade('V4+')).toBe(43);
    expect(parseVGrade('V4-')).toBe(37);
    expect(parseVGrade('v10+')).toBe(103);
  });

  it('rejects unknown labels', () => {
    expect(parseVGrade('V18')).toBeNull();
    expect(parseVGrade('5.10a')).toBeNull();
  });

  it('round-trips canonical labels', () => {
    for (const label of ['VB', 'V0', 'V3', 'V7', 'V12'] as const) {
      const index = parseVGrade(label);
      expect(index).not.toBeNull();
      expect(formatVGrade(index as number)).toBe(label);
    }
  });
});

describe('Fontainebleau', () => {
  it('uses the gym conversion table onto V tenths', () => {
    expect(parseFontGrade('6A')).toBe(30);
    expect(parseFontGrade('7A')).toBe(60);
    expect(parseFontGrade('8A')).toBe(110);
    expect(parseFontGrade('6a+')).toBe(35);
  });
});

describe('YDS and French', () => {
  it('parses sport grades', () => {
    expect(parseYdsGrade('5.10a')).toBe(100);
    expect(parseYdsGrade('5.10d')).toBe(109);
    expect(parseYdsGrade('5.9')).toBe(90);
    expect(parseFrenchGrade('6a')).toBe(60);
    expect(parseFrenchGrade('6a+')).toBe(62);
    expect(parseFrenchGrade('7c')).toBe(76);
  });
});

describe('toDifficultyIndex / formatGrade', () => {
  it('dispatches by system', () => {
    expect(toDifficultyIndex('V5', 'v')).toBe(50);
    expect(toDifficultyIndex('6C', 'font')).toBe(50);
    expect(formatGrade(50, 'v')).toBe('V5');
    expect(formatGrade(50, 'font')).toBe('6C');
  });

  it('returns null for a grade that does not belong to the system', () => {
    expect(toDifficultyIndex('V4', 'yds')).toBeNull();
    expect(toDifficultyIndex('5.12a', 'v')).toBeNull();
  });
});
