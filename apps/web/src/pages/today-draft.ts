import type {
  GradeBreakdown,
  SessionType,
  TrainingLog,
  TrainingLogDay,
  TrainingLogInput,
} from '@climbing-coach/api';

export const SESSION_TYPES: readonly SessionType[] = [
  'climbing',
  'board',
  'hangboard',
  'gym',
  'cardio',
  'rest',
];

/** Form state: numbers stay strings while editing so an empty field is distinguishable from 0. */
export type TodayDraft = {
  exertion: string;
  /** True once the user edits exertion, which makes the saved value theirs, not the prefill's. */
  exertionEdited: boolean;
  boulders: string;
  routes: string;
  duration: string;
  sessionType: SessionType;
  primaryFocusId: string;
  secondaryFocusIds: string[];
  grades: GradeBreakdown[];
  notes: string;
};

function fromEntry(entry: TrainingLog): TodayDraft {
  return {
    exertion: entry.sessionExertion === null ? '' : String(entry.sessionExertion),
    exertionEdited: false,
    boulders: String(entry.boulderCount),
    routes: String(entry.routeCount),
    duration: entry.durationMin === null ? '' : String(entry.durationMin),
    sessionType: entry.sessionType,
    primaryFocusId: entry.primaryFocusId ?? '',
    secondaryFocusIds: [...entry.secondaryFocusIds],
    grades: entry.grades.map((row) => ({ ...row })),
    notes: entry.notes,
  };
}

/** A saved entry wins; otherwise start from the prefill, leaving unknown fields empty. */
export function draftFromDay(day: TrainingLogDay): TodayDraft {
  if (day.entry) return fromEntry(day.entry);
  const { prefill } = day;
  return {
    exertion: prefill.sessionExertion === null ? '' : String(prefill.sessionExertion),
    exertionEdited: false,
    boulders: String(prefill.boulderCount),
    routes: '0',
    duration: '',
    sessionType: 'climbing',
    primaryFocusId: '',
    secondaryFocusIds: [],
    grades: prefill.grades.map((row) => ({ ...row })),
    notes: '',
  };
}

export function exertionSourceFor(
  draft: TodayDraft,
  day: TrainingLogDay,
): TrainingLogInput['exertionSource'] {
  if (draft.exertionEdited) return 'user';
  if (day.entry) return day.entry.exertionSource;
  return day.prefill.sessionExertion !== null && draft.exertion !== '' ? 'prefill' : 'user';
}

export type DraftError = 'exertion' | 'boulders' | 'routes' | 'duration' | 'grades';

function wholeNumber(value: string, max = Number.MAX_SAFE_INTEGER): number | null | 'invalid' {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= max ? parsed : 'invalid';
}

function gradesValid(grades: readonly GradeBreakdown[]): boolean {
  const keys = new Set(grades.map((row) => `${row.discipline}:${row.grade.trim()}`));
  return (
    keys.size === grades.length &&
    grades.every(
      (row) =>
        row.grade.trim() !== '' && row.sent <= row.attempted && row.attempted >= 0 && row.sent >= 0,
    )
  );
}

export type DraftResult =
  { ok: true; input: TrainingLogInput } | { ok: false; errors: DraftError[] };

export function draftToInput(
  draft: TodayDraft,
  day: TrainingLogDay,
  tzOffsetMin: number,
): DraftResult {
  const exertion = wholeNumber(draft.exertion, 10);
  const boulders = wholeNumber(draft.boulders);
  const routes = wholeNumber(draft.routes);
  const duration = wholeNumber(draft.duration);
  const errors: DraftError[] = [];
  if (exertion === 'invalid') errors.push('exertion');
  if (boulders === 'invalid') errors.push('boulders');
  if (routes === 'invalid') errors.push('routes');
  if (duration === 'invalid') errors.push('duration');
  if (!gradesValid(draft.grades)) errors.push('grades');
  if (
    errors.length > 0 ||
    exertion === 'invalid' ||
    boulders === 'invalid' ||
    routes === 'invalid' ||
    duration === 'invalid'
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    input: {
      tzOffsetMin,
      sessionExertion: exertion,
      exertionSource: exertionSourceFor(draft, day),
      boulderCount: boulders ?? 0,
      routeCount: routes ?? 0,
      durationMin: duration,
      sessionType: draft.sessionType,
      primaryFocusId: draft.primaryFocusId === '' ? null : draft.primaryFocusId,
      secondaryFocusIds: draft.secondaryFocusIds.filter((id) => id !== draft.primaryFocusId),
      grades: draft.grades.map((row) => ({ ...row, grade: row.grade.trim() })),
      notes: draft.notes,
      ...(day.entry ? { expectedVersion: day.entry.version } : {}),
    },
  };
}

export function toggleFocus(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

export function emptyGradeRow(discipline: GradeBreakdown['discipline']): GradeBreakdown {
  return { discipline, grade: '', attempted: 1, sent: 0 };
}
