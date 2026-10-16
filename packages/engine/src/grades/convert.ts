import { parseFrenchGrade, formatFrenchGrade } from './french.js';
import { parseFontGrade, formatFontGrade } from './font.js';
import { type GradeSystem } from './systems.js';
import { parseVGrade, formatVGrade } from './v-scale.js';
import { parseYdsGrade, formatYdsGrade } from './yds.js';

/** Map a grade string in `system` onto a sortable integer index. */
export function toDifficultyIndex(grade: string, system: GradeSystem): number | null {
  switch (system) {
    case 'v':
      return parseVGrade(grade);
    case 'font':
      return parseFontGrade(grade);
    case 'yds':
      return parseYdsGrade(grade);
    case 'french':
      return parseFrenchGrade(grade);
  }
}

/** Format an index back into the given system. */
export function formatGrade(index: number, system: GradeSystem): string {
  switch (system) {
    case 'v':
      return formatVGrade(index);
    case 'font':
      return formatFontGrade(index);
    case 'yds':
      return formatYdsGrade(index);
    case 'french':
      return formatFrenchGrade(index);
  }
}

export function parseGrade(grade: string, system: GradeSystem): number | null {
  return toDifficultyIndex(grade, system);
}
