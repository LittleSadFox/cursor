/**
 * French sport grades. Index is 10 × the band plus a 0/3/6 letter step, with + as +2:
 * 6a = 60, 6a+ = 62, 6b = 63, 6c = 66, 7a = 70.
 */
const LETTER_STEP: Readonly<Record<string, number>> = { a: 0, b: 3, c: 6 };

const FRENCH_RE = /^([3-9])([abc])?(\+)?$/i;

export function parseFrenchGrade(grade: string): number | null {
  const match = FRENCH_RE.exec(grade.trim());
  if (!match) return null;
  const band = Number(match[1]);
  if (!Number.isFinite(band)) return null;
  const letter = match[2]?.toLowerCase();
  const step = letter === undefined ? 0 : (LETTER_STEP[letter] ?? 0);
  const plus = match[3] === '+' ? 2 : 0;
  return band * 10 + step + plus;
}

export function formatFrenchGrade(index: number): string {
  const clamped = Math.min(96, Math.max(30, Math.round(index)));
  const band = Math.min(9, Math.max(3, Math.floor(clamped / 10)));
  const remainder = clamped - band * 10;
  if (band <= 4 && remainder < 3) return remainder >= 2 ? `${band}+` : `${band}`;
  const letter = remainder < 3 ? 'a' : remainder < 6 ? 'b' : 'c';
  const plus = remainder === 2 || remainder === 5 || remainder >= 8;
  return plus ? `${band}${letter}+` : `${band}${letter}`;
}
