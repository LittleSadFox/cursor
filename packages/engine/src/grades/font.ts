/**
 * Fontainebleau boulder grades mapped onto the V-scale index (BUILD_PLAN §2.4).
 * Conversion is the common gym table: 6A ≈ V3, 7A ≈ V6, 8A ≈ V11.
 */
const FONT_TABLE: Readonly<Record<string, number>> = {
  '3': -20,
  '3+': -15,
  '4': -10,
  '4+': -5,
  '5': 0,
  '5+': 10,
  '6A': 30,
  '6A+': 35,
  '6B': 40,
  '6B+': 45,
  '6C': 50,
  '6C+': 55,
  '7A': 60,
  '7A+': 70,
  '7B': 80,
  '7B+': 85,
  '7C': 90,
  '7C+': 100,
  '8A': 110,
  '8A+': 120,
  '8B': 130,
  '8B+': 140,
  '8C': 150,
  '8C+': 160,
  '9A': 170,
};

const FONT_RE = /^(3|4|5)(\+)?$|^([6-9])([ABC])(\+)?$/i;

export function parseFontGrade(grade: string): number | null {
  const key = normalizeFont(grade);
  if (key === null) return null;
  const index = FONT_TABLE[key];
  return index === undefined ? null : index;
}

export function formatFontGrade(index: number): string {
  let best: string = '3';
  let bestDelta = Infinity;
  for (const [label, value] of Object.entries(FONT_TABLE)) {
    const delta = Math.abs(value - index);
    if (delta < bestDelta) {
      best = label;
      bestDelta = delta;
    }
  }
  return best;
}

export function normalizeFont(grade: string): string | null {
  const trimmed = grade.trim().toUpperCase().replace(/\s+/g, '');
  const match = FONT_RE.exec(trimmed);
  if (!match) return null;
  if (match[1] !== undefined) {
    return match[2] === '+' ? `${match[1]}+` : match[1];
  }
  const band = match[3];
  const letter = match[4];
  if (band === undefined || letter === undefined) return null;
  return match[5] === '+' ? `${band}${letter}+` : `${band}${letter}`;
}
