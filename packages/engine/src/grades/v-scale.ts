/**
 * V-scale as the canonical boulder difficulty index: tenths of a grade.
 * V0 = 0, V4 = 40, VB = −10. Optional + / − shift by 3 so they do not collide
 * with the next whole grade.
 */
const V_RE = /^(VB|V([0-9]|1[0-7]))([+-])?$/i;

export function parseVGrade(grade: string): number | null {
  const trimmed = grade.trim();
  const match = V_RE.exec(trimmed);
  if (!match) return null;
  const letter = match[1];
  if (letter === undefined) return null;
  const base = letter.toUpperCase() === 'VB' ? -10 : Number(match[2]) * 10;
  if (!Number.isFinite(base)) return null;
  const suffix = match[3];
  if (suffix === '+') return base + 3;
  if (suffix === '-') return base - 3;
  return base;
}

export function formatVGrade(index: number): string {
  if (index <= -7) return 'VB';
  const rounded = Math.round(index / 10);
  const clamped = Math.min(17, Math.max(0, rounded));
  const base = clamped * 10;
  const delta = index - base;
  if (delta >= 2) return `V${clamped}+`;
  if (delta <= -2) return `V${clamped}-`;
  return `V${clamped}`;
}
