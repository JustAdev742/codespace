import type { ReactNode } from 'react';
import type { PublicQuestion } from '@ludora/shared';

/**
 * The prompt, with its image if it has one.
 * `size="lg"` is the projector card: dark ink on white paper, as big as the prompt allows.
 * `size="md"` is the phone version, white on the dusk sky.
 */
export function QuestionCard({ q, index, total, children, size = 'md' }: { q: PublicQuestion; index?: number | undefined; total?: number | undefined; children?: ReactNode; size?: 'md' | 'lg' }) {
  const len = q.prompt.length;
  const counter =
    index !== undefined && total ? (
      <p className={`font-display font-bold ${size === 'lg' ? 'text-[clamp(1.1rem,1.7vw,1.9rem)] text-text-2' : 'text-base text-text-2'}`}>
        Question {index + 1} of {total}
      </p>
    ) : null;
  if (size === 'lg') {
    const text = len > 160 ? 'text-[clamp(1.6rem,2.5vw,3rem)]' : len > 90 ? 'text-[clamp(2rem,3.2vw,3.9rem)]' : 'text-[clamp(2.5rem,4.2vw,5.25rem)]';
    return (
      <div className="paper stage-card flex flex-col gap-3 px-[clamp(1.25rem,2.6vw,3.25rem)] py-[clamp(1rem,2.6vh,2.25rem)]">
        {counter}
        <div className="flex items-center gap-[clamp(1rem,2vw,2.5rem)]">
          <h2 className={`min-w-0 flex-1 font-display leading-[1.06] font-extrabold text-text ${text}`}>{q.prompt}</h2>
          {q.media ? <img src={q.media.url} alt={q.media.alt} className="max-h-[30vh] w-auto max-w-[40%] shrink-0 rounded-[14px] border-2 border-ink object-contain" /> : null}
        </div>
        {children}
      </div>
    );
  }
  const text = len > 140 ? 'text-lg sm:text-xl' : len > 70 ? 'text-xl sm:text-2xl' : 'text-[1.7rem] leading-[1.12] sm:text-3xl';
  return (
    <div className="flex flex-col gap-2">
      {counter}
      <h2 className={`font-display font-extrabold text-text ${text}`}>{q.prompt}</h2>
      {q.media ? <img src={q.media.url} alt={q.media.alt} className="max-h-[32vh] w-auto self-start rounded-[14px] border-2 border-ink bg-white object-contain" /> : null}
      {children}
    </div>
  );
}
