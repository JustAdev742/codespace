import { memo } from 'react';
import { QUESTION_TYPE_LABELS, QUESTION_TYPES, type QuestionType } from '@ludora/shared';
import { LIMITS } from './model.ts';
import { TYPE_HINTS, TYPE_ICONS } from './parts.tsx';

/** One button per question type. The new question opens with its prompt focused. */
export const AddQuestion = memo(function AddQuestion({ onAdd, full }: { onAdd: (type: QuestionType) => void; full: boolean }) {
  return (
    <section aria-labelledby="add-question-heading" className="rounded-[var(--radius-m)] border border-dashed border-line-strong p-4">
      <h3 id="add-question-heading" className="font-display text-lg font-bold text-text">
        Add a question
      </h3>
      <p className="text-sm text-text-2">{full ? `A set can hold up to ${LIMITS.questions} questions. Delete one to add another.` : 'Choose a type. You can change it later.'}</p>
      <div className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {QUESTION_TYPES.map((t) => {
          const Icon = TYPE_ICONS[t];
          return (
            <button
              key={t}
              id={`add-${t}`}
              type="button"
              disabled={full}
              onClick={() => onAdd(t)}
              aria-describedby={`add-${t}-hint`}
              className="flex min-w-0 items-start gap-3 rounded-[12px] border border-line bg-raised p-3 text-left transition-colors hover:border-line-strong hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Icon className="mt-0.5 size-5 shrink-0 text-link" aria-hidden />
              <span className="min-w-0">
                <span className="block font-semibold text-text">{QUESTION_TYPE_LABELS[t]}</span>
                <span id={`add-${t}-hint`} className="block text-xs text-text-3">
                  {TYPE_HINTS[t]}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
});
