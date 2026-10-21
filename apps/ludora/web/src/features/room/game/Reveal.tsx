import { Check, X } from 'lucide-react';
import type { AnswerReveal, PublicQuestion } from '@ludora/shared';
import { ChoiceTile } from './AnswerInput.tsx';
import { Burst } from '../../../art/bursts.tsx';
import { useOverview } from '../../../lib/queries.ts';

/** The choices of a live question with nothing marked, for the host screen while answers are open. */
export function ChoicesDisplay({ q }: { q: PublicQuestion }) {
  if (q.type === 'mcq' || q.type === 'multi') {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {q.choices.map((c, i) => (
          <ChoiceTile key={c.id} index={i} text={c.text} disabled />
        ))}
      </div>
    );
  }
  if (q.type === 'truefalse') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <ChoiceTile index={0} text="True" disabled />
        <ChoiceTile index={1} text="False" disabled />
      </div>
    );
  }
  if (q.type === 'order') return <p className="text-xl text-text-2">Players are putting {q.items.length} items in order.</p>;
  if (q.type === 'match') return <p className="text-xl text-text-2">Players are matching {q.left.length} pairs.</p>;
  return <p className="text-xl text-text-2">Players are typing their answers.</p>;
}

/** The correct answer, shown in the form the question was asked in. */
export function RevealAnswer({ q, reveal, mine, distribution, compact }: { q: PublicQuestion; reveal: AnswerReveal; mine?: string | null; distribution?: Record<string, number> | null; compact?: boolean }) {
  if ((q.type === 'mcq' || q.type === 'multi') && (reveal.type === 'mcq' || reveal.type === 'multi')) {
    const correct = new Set(reveal.type === 'mcq' ? [reveal.correct] : reveal.correct);
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {q.choices.map((c, i) => (
          <div key={c.id} className="relative">
            <ChoiceTile index={i} text={c.text} correct={correct.has(c.id)} dimmed={!correct.has(c.id)} wrong={mine === c.id && !correct.has(c.id)} disabled compact={compact} />
            {distribution ? <span className="absolute right-3 bottom-2 rounded-full bg-ink/70 px-2 text-xs font-bold text-white tabular">{distribution[c.id] ?? 0}</span> : null}
          </div>
        ))}
      </div>
    );
  }
  if (q.type === 'truefalse' && reveal.type === 'truefalse') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <ChoiceTile index={0} text="True" correct={reveal.correct} dimmed={!reveal.correct} disabled compact={compact} />
        <ChoiceTile index={1} text="False" correct={!reveal.correct} dimmed={reveal.correct} disabled compact={compact} />
      </div>
    );
  }
  if (q.type === 'order' && reveal.type === 'order') {
    const byId = new Map(q.items.map((i) => [i.id, i.text]));
    return (
      <ol className="flex flex-col gap-2">
        {reveal.itemIds.map((id, i) => (
          <li key={id} className="flex items-center gap-3 rounded-[14px] border-2 border-glim bg-glim/10 px-4 py-2.5 font-semibold">
            <span className="font-display text-text-3 tabular">{i + 1}</span>
            {byId.get(id)}
          </li>
        ))}
      </ol>
    );
  }
  if (q.type === 'match' && reveal.type === 'match') {
    const right = new Map(q.right.map((r) => [r.id, r.text]));
    return (
      <ul className="flex flex-col gap-2">
        {q.left.map((l) => (
          <li key={l.id} className="grid grid-cols-2 gap-2 rounded-[14px] border-2 border-glim bg-glim/10 px-4 py-2.5 font-semibold">
            <span>{l.text}</span>
            <span className="text-text-2">{right.get(reveal.pairs[l.id] ?? '')}</span>
          </li>
        ))}
      </ul>
    );
  }
  let text = '';
  if (reveal.type === 'short') text = reveal.accepted.join(' or ');
  else if (reveal.type === 'numeric') text = `${reveal.answer}${reveal.unit ? ` ${reveal.unit}` : ''}${reveal.tolerance ? ` (give or take ${reveal.tolerance})` : ''}`;
  else if (reveal.type === 'flashcard') text = reveal.back;
  return (
    <div className="rounded-[16px] border-2 border-glim bg-glim/10 px-5 py-4">
      <div className="text-sm font-semibold text-text-2">Answer</div>
      <div className="font-display text-2xl font-bold">{text}</div>
    </div>
  );
}

export function ResultBanner({ correct, partial, points, text }: { correct: boolean | null; partial?: number | null; points?: number | null; text?: string | undefined }) {
  const overview = useOverview();
  const effect = overview.data?.equipped.effect?.art;
  if (correct === null) return null;
  const part = !correct && partial && partial > 0;
  return (
    <div role="status" className={`relative flex items-center gap-3 rounded-[16px] border-2 border-ink px-4 py-3 font-display text-xl font-bold text-on-accent ${correct ? 'bg-glim' : part ? 'bg-lantern' : 'bg-ember'}`} style={{ animation: 'pop-in 220ms var(--ease-spring)' }}>
      {correct && effect?.kind === 'effect' ? <Burst style={effect.style} hue={effect.hue} size={180} /> : null}
      {correct ? <Check className="size-7" /> : <X className="size-7" />}
      <span className="flex-1">{correct ? 'Correct!' : part ? `Partly right (${Math.round(partial! * 100)}%)` : 'Not this time'}</span>
      {points ? <span className="tabular">+{points.toLocaleString('en-GB')}</span> : null}
      {text ? <span className="text-base">{text}</span> : null}
    </div>
  );
}
