import { Check, X } from 'lucide-react';
import type { AnswerReveal, PublicQuestion } from '@ludora/shared';
import { ChoiceTile, choiceGrid, type TileSize } from './AnswerInput.tsx';
import { Burst } from '../../../art/bursts.tsx';
import { useOverview } from '../../../lib/queries.ts';

/** The choices of a live question with nothing marked: the host screen while answers are open. */
export function ChoicesDisplay({ q, size = 'lg' }: { q: PublicQuestion; size?: TileSize }) {
  const host = size === 'lg';
  if (q.type === 'mcq' || q.type === 'multi') {
    const { grid, layout } = choiceGrid(
      q.choices.map((c) => c.text),
      host,
    );
    return (
      <div className={grid}>
        {q.choices.map((c, i) => (
          <ChoiceTile key={c.id} index={i} text={c.text} disabled size={size} layout={layout} />
        ))}
      </div>
    );
  }
  if (q.type === 'truefalse') {
    return (
      <div className={host ? 'grid grid-cols-2 gap-[clamp(0.75rem,1.4vw,1.5rem)]' : 'grid grid-cols-2 gap-3'}>
        <ChoiceTile index={0} text="True" disabled size={size} layout={host ? 'row' : 'stack'} />
        <ChoiceTile index={1} text="False" disabled size={size} layout={host ? 'row' : 'stack'} />
      </div>
    );
  }
  const line = q.type === 'order' ? `Players are putting ${q.items.length} items in order.` : q.type === 'match' ? `Players are matching ${q.left.length} pairs.` : 'Players are typing their answers.';
  return <p className={`font-display font-bold text-text-2 ${host ? 'text-[clamp(1.4rem,2.2vw,2.5rem)]' : 'text-xl'}`}>{line}</p>;
}

/** The correct answer, shown in the form the question was asked in. With `distribution`, each choice shows how many picked it. */
export function RevealAnswer({ q, reveal, mine, distribution, compact, size }: { q: PublicQuestion; reveal: AnswerReveal; mine?: string | null; distribution?: Record<string, number> | null; compact?: boolean; size?: TileSize }) {
  const sz: TileSize = size ?? (compact ? 'sm' : distribution ? 'lg' : 'md');
  const host = sz === 'lg';
  const max = distribution ? Math.max(1, ...Object.values(distribution)) : 0;
  const count = (key: string) => (distribution ? (distribution[key] ?? 0) : null);
  if ((q.type === 'mcq' || q.type === 'multi') && (reveal.type === 'mcq' || reveal.type === 'multi')) {
    const correct = new Set(reveal.type === 'mcq' ? [reveal.correct] : reveal.correct);
    const { grid, layout } = choiceGrid(
      q.choices.map((c) => c.text),
      host,
    );
    return (
      <div className={grid}>
        {q.choices.map((c, i) => (
          <ChoiceTile key={c.id} index={i} text={c.text} correct={correct.has(c.id)} dimmed={!correct.has(c.id)} wrong={mine === c.id && !correct.has(c.id)} disabled size={sz} layout={layout} count={count(c.id)} max={max} />
        ))}
      </div>
    );
  }
  if (q.type === 'truefalse' && reveal.type === 'truefalse') {
    return (
      <div className={host ? 'grid grid-cols-2 gap-[clamp(0.75rem,1.4vw,1.5rem)]' : 'grid grid-cols-2 gap-3'}>
        <ChoiceTile index={0} text="True" correct={reveal.correct} dimmed={!reveal.correct} disabled size={sz} layout={host ? 'row' : 'stack'} count={count('true')} max={max} />
        <ChoiceTile index={1} text="False" correct={!reveal.correct} dimmed={reveal.correct} disabled size={sz} layout={host ? 'row' : 'stack'} count={count('false')} max={max} />
      </div>
    );
  }
  const rowText = host ? 'text-[clamp(1.2rem,1.9vw,2.2rem)] px-5 py-3' : 'text-lg px-4 py-2.5';
  if (q.type === 'order' && reveal.type === 'order') {
    const byId = new Map(q.items.map((i) => [i.id, i.text]));
    return (
      <ol className="flex flex-col gap-2" aria-label="The right order">
        {reveal.itemIds.map((id, i) => (
          <li key={id} className={`flex items-center gap-3 rounded-[16px] border-[3px] border-ink bg-glim font-bold text-on-accent shadow-[0_3px_0_var(--ink)] ${rowText}`}>
            <span className="grid size-[1.8em] shrink-0 place-items-center rounded-full bg-white/60 font-display font-extrabold tabular">{i + 1}</span>
            {byId.get(id)}
          </li>
        ))}
      </ol>
    );
  }
  if (q.type === 'match' && reveal.type === 'match') {
    const right = new Map(q.right.map((r) => [r.id, r.text]));
    return (
      <ul className="flex flex-col gap-2" aria-label="The right pairs">
        {q.left.map((l) => (
          <li key={l.id} className={`grid grid-cols-2 gap-3 rounded-[16px] border-[3px] border-ink bg-glim font-bold text-on-accent shadow-[0_3px_0_var(--ink)] ${rowText}`}>
            <span>{l.text}</span>
            <span>{right.get(reveal.pairs[l.id] ?? '')}</span>
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
    <div className={`rounded-[20px] border-[3px] border-ink bg-glim text-on-accent shadow-[0_4px_0_var(--ink)] ${host ? 'px-7 py-5' : 'px-5 py-4'}`}>
      <div className={`font-bold ${host ? 'text-[clamp(1rem,1.4vw,1.5rem)]' : 'text-sm'}`}>Answer</div>
      <div className={`font-display font-extrabold break-words ${host ? 'text-[clamp(2rem,3.6vw,4.25rem)]' : 'text-3xl'}`}>{text}</div>
    </div>
  );
}

/**
 * The player's own result. A correct answer bursts with the player's equipped
 * answer effect, or with the festival mix when they have none; a miss stays calm.
 */
export function ResultBanner({ correct, partial, points, text }: { correct: boolean | null; partial?: number | null; points?: number | null; text?: string | undefined }) {
  const overview = useOverview();
  const effect = overview.data?.equipped.effect?.art;
  if (correct === null) return null;
  const part = !correct && partial && partial > 0;
  const own = correct && effect && effect.kind === 'effect' ? effect : null;
  return (
    <div
      role="status"
      className={`relative isolate flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[22px] border-[3px] border-ink px-4 py-3.5 text-on-accent shadow-[0_5px_0_var(--ink)] ${correct ? 'bg-glim' : part ? 'bg-lantern' : 'bg-ember'}`}
      style={{ animation: 'pop-in 280ms var(--ease-spring)' }}
    >
      {correct ? <Burst style={own?.style ?? 'festival'} hue={own?.hue ?? 42} size={300} /> : null}
      <span className="grid size-12 shrink-0 place-items-center rounded-full border-[3px] border-ink bg-white/60" aria-hidden>
        {correct || part ? <Check className="size-7" strokeWidth={3.2} /> : <X className="size-7" strokeWidth={3.2} />}
      </span>
      <span className="min-w-0 flex-1 font-display text-[1.75rem] leading-tight font-extrabold">{correct ? 'Correct!' : part ? `Partly right (${Math.round(partial! * 100)}%)` : 'Not this time'}</span>
      {points ? <span className="font-display text-[1.75rem] leading-tight font-extrabold tabular">+{points.toLocaleString('en-GB')}</span> : null}
      {text ? <span className="basis-full pl-[3.75rem] text-base font-bold">{text}</span> : null}
    </div>
  );
}
