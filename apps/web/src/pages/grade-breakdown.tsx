import { useLingui } from '@lingui/react';

import type { GradeBreakdown } from '@climbing-coach/api';

import { emptyGradeRow } from './today-draft.js';

type Props = {
  rows: GradeBreakdown[];
  defaultDiscipline: GradeBreakdown['discipline'];
  onChange: (rows: GradeBreakdown[]) => void;
};

function count(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function GradeBreakdownEditor({ rows, defaultDiscipline, onChange }: Props) {
  const { i18n } = useLingui();
  const update = (index: number, patch: Partial<GradeBreakdown>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <fieldset className="grade-breakdown">
      <legend>{i18n._('home.grades')}</legend>
      {rows.map((row, index) => (
        <div className="grade-row" key={index}>
          <select
            aria-label={i18n._('home.gradeDiscipline')}
            value={row.discipline}
            onChange={(event) =>
              update(index, { discipline: event.target.value as GradeBreakdown['discipline'] })
            }
          >
            <option value="boulder">{i18n._('discipline.boulder')}</option>
            <option value="route">{i18n._('discipline.route')}</option>
          </select>
          <input
            aria-label={i18n._('home.gradeGrade')}
            placeholder={i18n._('home.gradeGrade')}
            value={row.grade}
            onChange={(event) => update(index, { grade: event.target.value })}
          />
          <input
            aria-label={i18n._('home.gradeAttempted')}
            type="number"
            min={0}
            value={row.attempted}
            onChange={(event) => update(index, { attempted: count(event.target.value) })}
          />
          <input
            aria-label={i18n._('home.gradeSent')}
            type="number"
            min={0}
            value={row.sent}
            onChange={(event) => update(index, { sent: count(event.target.value) })}
          />
          <button
            type="button"
            className="ghost"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            {i18n._('home.gradeRemove')}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="ghost"
        onClick={() => onChange([...rows, emptyGradeRow(defaultDiscipline)])}
      >
        {i18n._('home.gradeAdd')}
      </button>
    </fieldset>
  );
}
