import { describe, expect, it } from 'vitest';

import type { TrainingLog, TrainingLogDay } from '@climbing-coach/api';

import { draftFromDay, draftToInput, toggleFocus } from './today-draft.js';

const NO_PREFILL: TrainingLogDay['prefill'] = {
  sessionExertion: null,
  basis: { attempts: 0, mean: null, max: null },
  boulderCount: 0,
  grades: [],
};

const ENTRY: TrainingLog = {
  date: '2026-10-16',
  tzOffsetMin: 120,
  sessionExertion: 8,
  exertionSource: 'user',
  boulderCount: 12,
  routeCount: 0,
  durationMin: 120,
  sessionType: 'board',
  primaryFocusId: 'power',
  secondaryFocusIds: ['technique', 'projecting'],
  grades: [{ discipline: 'boulder', grade: 'V5', attempted: 6, sent: 2 }],
  body: null,
  notes: 'moonboard',
  load: 960,
  version: 3,
  createdAt: '2026-10-16T18:00:00.000Z',
  updatedAt: '2026-10-16T19:00:00.000Z',
};

describe('today draft', () => {
  it('starts empty, not at a made-up exertion, when there is no prefill or entry', () => {
    const day = { entry: null, prefill: NO_PREFILL };
    const draft = draftFromDay(day);
    expect(draft.exertion).toBe('');
    const result = draftToInput(draft, day, 0);
    expect(result.ok && result.input).toMatchObject({
      sessionExertion: null,
      exertionSource: 'user',
    });
  });

  it('marks an untouched prefilled exertion as prefill and an edited one as user', () => {
    const day = { entry: null, prefill: { ...NO_PREFILL, sessionExertion: 6, boulderCount: 4 } };
    const draft = draftFromDay(day);
    expect(draft).toMatchObject({ exertion: '6', boulders: '4' });
    expect(draftToInput(draft, day, 0)).toMatchObject({
      ok: true,
      input: { exertionSource: 'prefill' },
    });
    const edited = { ...draft, exertion: '7', exertionEdited: true };
    expect(draftToInput(edited, day, 0)).toMatchObject({
      ok: true,
      input: { exertionSource: 'user', sessionExertion: 7 },
    });
  });

  it('round-trips a saved entry without dropping secondary focus or grades', () => {
    const day = { entry: ENTRY, prefill: { ...NO_PREFILL, sessionExertion: 3 } };
    const result = draftToInput(draftFromDay(day), day, 120);
    expect(result).toEqual({
      ok: true,
      input: {
        tzOffsetMin: 120,
        sessionExertion: 8,
        exertionSource: 'user',
        boulderCount: 12,
        routeCount: 0,
        durationMin: 120,
        sessionType: 'board',
        primaryFocusId: 'power',
        secondaryFocusIds: ['technique', 'projecting'],
        grades: [{ discipline: 'boulder', grade: 'V5', attempted: 6, sent: 2 }],
        notes: 'moonboard',
        expectedVersion: 3,
      },
    });
  });

  it('keeps a prefill-sourced entry as prefill until the user edits exertion', () => {
    const entry = { ...ENTRY, exertionSource: 'prefill' as const };
    const day = { entry, prefill: NO_PREFILL };
    expect(draftToInput(draftFromDay(day), day, 0)).toMatchObject({
      input: { exertionSource: 'prefill' },
    });
  });

  it('reports invalid numbers and grade rows instead of saving them', () => {
    const day = { entry: null, prefill: NO_PREFILL };
    const draft = {
      ...draftFromDay(day),
      exertion: '11',
      boulders: '-1',
      duration: '1.5',
      grades: [
        { discipline: 'boulder' as const, grade: 'V3', attempted: 1, sent: 2 },
        { discipline: 'boulder' as const, grade: 'V3', attempted: 1, sent: 0 },
      ],
    };
    expect(draftToInput(draft, day, 0)).toEqual({
      ok: false,
      errors: ['exertion', 'boulders', 'duration', 'grades'],
    });
  });

  it('never lists the primary focus as secondary too', () => {
    const day = { entry: null, prefill: NO_PREFILL };
    const draft = {
      ...draftFromDay(day),
      primaryFocusId: 'power',
      secondaryFocusIds: ['power', 'technique'],
    };
    expect(draftToInput(draft, day, 0)).toMatchObject({
      input: { secondaryFocusIds: ['technique'] },
    });
  });

  it('toggles focus ids', () => {
    expect(toggleFocus(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleFocus(['a', 'b'], 'a')).toEqual(['b']);
  });
});
