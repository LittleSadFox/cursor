/**
 * Yosemite Decimal System. Index is 10 × the numeric grade plus a letter step:
 * 5.9 = 90, 5.10a = 100, 5.10b = 103, 5.10c = 106, 5.10d = 109, 5.11a = 110.
 */
const LETTER_STEP: Readonly<Record<string, number>> = {
  a: 0,
  b: 3,
  c: 6,
  d: 9,
};

const YDS_RE = /^5\.([0-9]|1[0-5])([abcd])?$/i;

export function parseYdsGrade(grade: string): number | null {
  const match = YDS_RE.exec(grade.trim());
  if (!match) return null;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return null;
  const letter = match[2]?.toLowerCase();
  const step = letter === undefined ? 0 : (LETTER_STEP[letter] ?? 0);
  return numeric * 10 + step;
}

export function formatYdsGrade(index: number): string {
  const clamped = Math.min(159, Math.max(0, Math.round(index)));
  const numeric = Math.min(15, Math.floor(clamped / 10));
  const remainder = clamped - numeric * 10;
  if (numeric < 10) return `5.${numeric}`;
  const letter = remainder <= 1 ? 'a' : remainder <= 4 ? 'b' : remainder <= 7 ? 'c' : 'd';
  return `5.${numeric}${letter}`;
}
