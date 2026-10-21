import type { ReactNode } from 'react';
import type { PublicQuestion } from '@ludora/shared';

/** The prompt, with its image if it has one. */
export function QuestionCard({ q, index, total, children, size = 'md' }: { q: PublicQuestion; index?: number | undefined; total?: number | undefined; children?: ReactNode; size?: 'md' | 'lg' }) {
  const long = q.prompt.length > 120;
  return (
    <div className="flex flex-col gap-3">
      {index !== undefined && total ? (
        <div className="text-sm font-semibold text-text-3">
          Question {index + 1} of {total}
        </div>
      ) : null}
      <h2 className={`font-display font-bold text-text ${size === 'lg' ? (long ? 'text-3xl' : 'text-4xl sm:text-5xl') : long ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'}`}>{q.prompt}</h2>
      {q.media ? <img src={q.media.url} alt={q.media.alt} className="max-h-[38vh] w-auto self-start rounded-[14px] border border-line object-contain" /> : null}
      {children}
    </div>
  );
}
