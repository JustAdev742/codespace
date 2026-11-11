import { Check, Circle, Clock, Minus, Triangle, X } from 'lucide-react';
import { SUBJECT_LABELS } from '@ludora/shared';
import { percent } from '../reports/reportUi.tsx';
import type { GradeCell, QuestionResult } from './classData.ts';

/*
 * How results look in the gradebook, mastery grid and student report. Never by
 * colour alone: each band has its own shape and words, and the number is shown.
 */

export type Band = 'secure' | 'developing' | 'support';

export function bandOf(rate: number): Band {
  return rate >= 0.8 ? 'secure' : rate >= 0.5 ? 'developing' : 'support';
}

export const BAND_INFO: Record<Band, { label: string; cell: string; icon: typeof Check }> = {
  secure: { label: '80% or more', cell: 'bg-glim/20 text-text', icon: Check },
  developing: {
    label: '50 to 79%',
    cell: 'bg-lantern/25 text-text',
    icon: Triangle,
  },
  support: { label: 'Under 50%', cell: 'bg-ember/20 text-text', icon: Circle },
};

export const subjectLabel = (s: string) => SUBJECT_LABELS[s as keyof typeof SUBJECT_LABELS] ?? (s === 'other' ? 'Other' : s);

export function BandIcon({ band, className = 'size-3.5' }: { band: Band; className?: string }) {
  const Icon = BAND_INFO[band].icon;
  return <Icon className={`${className} shrink-0`} aria-hidden strokeWidth={2.5} />;
}

/** The key under a grid: shape, colour and words together. */
export function BandLegend({ extra }: { extra?: React.ReactNode }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-text-2" aria-label="Key">
      {(Object.keys(BAND_INFO) as Band[]).map((b) => (
        <li key={b} className="flex items-center gap-1.5">
          <span className={`grid size-6 place-items-center rounded-[var(--radius-s)] ${BAND_INFO[b].cell}`}>
            <BandIcon band={b} />
          </span>
          {BAND_INFO[b].label}
        </li>
      ))}
      {extra}
    </ul>
  );
}

/** A gradebook cell: best accuracy with its band, right of answered, attempts, and a late mark. */
export function GradeCellView({ cell, maxAttempts, notSet = false }: { cell: GradeCell | undefined; maxAttempts: number | null; notSet?: boolean }) {
  // Work set for another group of the class: not this student's.
  if (notSet) return <span className="block text-center text-xs text-text-3">Not set</span>;
  if (!cell || !cell.best) {
    return (
      <span className="flex items-center justify-center text-text-3">
        <Minus className="size-4" aria-hidden />
        <span className="sr-only">Not played</span>
      </span>
    );
  }
  const rate = cell.best.accuracy ?? 0;
  const band = bandOf(rate);
  return (
    <span className={`mx-auto flex w-28 flex-col items-center rounded-[var(--radius-s)] px-2 py-1 ${BAND_INFO[band].cell}`}>
      <span className="flex items-center gap-1 font-display text-lg leading-none font-bold tabular">
        <BandIcon band={band} />
        {percent(rate)}
      </span>
      <span className="text-xs whitespace-nowrap text-text-2 tabular">
        {cell.best.correct}/{cell.best.answered}
        {cell.attempts > 1 || maxAttempts !== null ? `, ${cell.attempts}${maxAttempts !== null ? ` of ${maxAttempts}` : ''} tries` : ''}
      </span>
      {cell.late ? (
        <span className="mt-0.5 inline-flex items-center gap-0.5 text-xs font-semibold text-text">
          <Clock className="size-3" aria-hidden />
          Late
        </span>
      ) : null}
    </span>
  );
}

/** A mastery cell: right or wrong first time, by shape and word as well as colour. */
export function ResultMark({ result, label }: { result: QuestionResult | undefined; label: string }) {
  if (!result) {
    return (
      <span className="grid size-8 place-items-center text-text-3" title={`${label}: not asked`}>
        <Minus className="size-4" aria-hidden />
        <span className="sr-only">Not asked</span>
      </span>
    );
  }
  const right = result === 'right';
  return (
    <span className={`grid size-8 place-items-center rounded-[var(--radius-s)] ${right ? 'bg-glim/25 text-text' : 'bg-ember/20 text-text'}`} title={`${label}: ${right ? 'right first time' : 'wrong first time'}`}>
      {right ? <Check className="size-4" aria-hidden strokeWidth={3} /> : <X className="size-4" aria-hidden strokeWidth={3} />}
      <span className="sr-only">{right ? 'Right' : 'Wrong'}</span>
    </span>
  );
}
