import { Check, X } from 'lucide-react';
import type { AnswerReveal, PublicQuestion } from '@ludora/shared';
import { ChoiceTile, HOST_PAIR, choiceGrid, type TileSize } from './AnswerInput.tsx';
import { Burst } from '../../../art/bursts.tsx';
import { useOverview } from '../../../lib/queries.ts';
import { useAnnounce } from './announce.tsx';
import { myAnswerWords, useMyAnswer } from './answerMemory.tsx';
import { useSfx, useSoundRole } from '../../../lib/sound/react.tsx';

/** The choices of a live question with nothing marked: the host screen while answers are open. */
export function ChoicesDisplay({ q, size = 'lg' }: { q: PublicQuestion; size?: TileSize }) {
  const host = size === 'lg';
  if (q.type === 'mcq' || q.type === 'multi') {
    const { grid, layout, dense } = choiceGrid(
      q.choices.map((c) => c.text),
      host,
    );
    return (
      <div className={grid}>
        {q.choices.map((c, i) => (
          <ChoiceTile key={c.id} index={i} text={c.text} media={c.media} disabled size={size} layout={layout} tall={host && q.choices.length <= 4 && !q.media} dense={dense} />
        ))}
      </div>
    );
  }
  if (q.type === 'truefalse') {
    return (
      <div className={host ? HOST_PAIR : 'grid grid-cols-2 gap-3'}>
        <ChoiceTile index={0} text="True" disabled size={size} layout={host ? 'row' : 'stack'} tall={host && !q.media} />
        <ChoiceTile index={1} text="False" disabled size={size} layout={host ? 'row' : 'stack'} tall={host && !q.media} />
      </div>
    );
  }
  const line = q.type === 'order' ? `Players are putting ${q.items.length} items in order.` : q.type === 'match' ? `Players are matching ${q.left.length} pairs.` : 'Players are typing their answers.';
  return <p className={`font-semibold text-text-2 ${host ? 'text-[clamp(1.4rem,2.2vw,2.5rem)]' : 'text-xl'}`}>{line}</p>;
}

/** The right answer in words, for screen readers; null when the question has no short way to say it. */
export function answerWords(q: PublicQuestion, reveal: AnswerReveal): string | null {
  const choice = (id: string) => {
    if (q.type !== 'mcq' && q.type !== 'multi') return id;
    const i = q.choices.findIndex((c) => c.id === id);
    return i < 0 ? id : `${String.fromCharCode(65 + i)}, ${q.choices[i]!.text || q.choices[i]!.media?.alt || 'a picture'}`;
  };
  switch (reveal.type) {
    case 'mcq':
      return `The answer was ${choice(reveal.correct)}.`;
    case 'multi':
      return `The answers were ${reveal.correct.map(choice).join(' and ')}.`;
    case 'truefalse':
      return `The answer was ${reveal.correct ? 'True' : 'False'}.`;
    case 'short':
      return reveal.accepted.length > 1 ? `Accepted answers: ${reveal.accepted.join(', ')}.` : `The answer was ${reveal.accepted[0]}.`;
    case 'numeric':
      return `The answer was ${reveal.answer}${reveal.unit ? ` ${reveal.unit}` : ''}.`;
    case 'order':
      return q.type === 'order' ? `The right order: ${reveal.itemIds.map((id) => q.items.find((i) => i.id === id)?.text ?? id).join(', ')}.` : null;
    case 'flashcard':
      return `The answer: ${reveal.back}.`;
    default:
      return null;
  }
}

/**
 * The right answer in a few words for a result banner, when the answer was a choice ("C, Paris",
 * "True"): the tiles underneath show it by place, the banner says it. Null for typed answers,
 * whose reveal underneath already says them in big words, and for answers that need the full
 * reveal (several answers, an order, pairs).
 */
export function shortAnswer(q: PublicQuestion, reveal: AnswerReveal): string | null {
  switch (reveal.type) {
    case 'mcq': {
      if (q.type !== 'mcq' && q.type !== 'multi') return null;
      const i = q.choices.findIndex((c) => c.id === reveal.correct);
      if (i < 0) return null;
      const c = q.choices[i]!;
      return `${String.fromCharCode(65 + i)}, ${c.text || c.media?.alt || 'the picture'}`;
    }
    case 'truefalse':
      return reveal.correct ? 'True' : 'False';
    default:
      return null;
  }
}

/** The correct answer, shown in the form the question was asked in. With `distribution`, each choice shows how many picked it. */
export function RevealAnswer({ q, reveal, mine, distribution, compact, size }: { q: PublicQuestion; reveal: AnswerReveal; mine?: string | null; distribution?: Record<string, number> | null; compact?: boolean; size?: TileSize }) {
  // What this player sent, so their pick is marked and, if it was wrong, read out too.
  const sent = useMyAnswer(q);
  const picked = new Set<string>(mine ? [mine] : sent?.type === 'mcq' ? [sent.choiceId] : sent?.type === 'multi' ? sent.choiceIds : sent?.type === 'truefalse' ? [String(sent.value)] : []);
  const missed =
    (reveal.type === 'mcq' && sent?.type === 'mcq' && sent.choiceId !== reveal.correct) || (reveal.type === 'truefalse' && sent?.type === 'truefalse' && sent.value !== reveal.correct);
  const said = answerWords(q, reveal);
  useAnnounce(said && missed && sent ? `${said} You answered ${myAnswerWords(q, sent)}.` : said, `${q.prompt}|${JSON.stringify(reveal)}`);
  // The big screen chimes as the answer appears; players hear their own result instead (ResultBanner).
  const role = useSoundRole();
  useSfx('reveal', `${q.prompt}|${JSON.stringify(reveal)}`, role === 'host');
  const sz: TileSize = size ?? (compact ? 'sm' : distribution ? 'lg' : 'md');
  const host = sz === 'lg';
  const max = distribution ? Math.max(1, ...Object.values(distribution)) : 0;
  const count = (key: string) => (distribution ? (distribution[key] ?? 0) : null);
  if ((q.type === 'mcq' || q.type === 'multi') && (reveal.type === 'mcq' || reveal.type === 'multi')) {
    const correct = new Set(reveal.type === 'mcq' ? [reveal.correct] : reveal.correct);
    const { grid, layout, dense } = choiceGrid(
      q.choices.map((c) => c.text),
      host,
    );
    return (
      <div className={grid}>
        {q.choices.map((c, i) => (
          <ChoiceTile key={c.id} index={i} text={c.text} media={c.media} dense={dense} correct={correct.has(c.id)} dimmed={!correct.has(c.id)} wrong={picked.has(c.id) && !correct.has(c.id)} mine={picked.has(c.id)} disabled size={sz} layout={layout} count={count(c.id)} max={max} tall={host && q.choices.length <= 4 && !q.media} />
        ))}
      </div>
    );
  }
  if (q.type === 'truefalse' && reveal.type === 'truefalse') {
    return (
      <div className={host ? HOST_PAIR : 'grid grid-cols-2 gap-3'}>
        <ChoiceTile index={0} text="True" correct={reveal.correct} dimmed={!reveal.correct} wrong={picked.has('true') && !reveal.correct} mine={picked.has('true')} disabled size={sz} layout={host ? 'row' : 'stack'} count={count('true')} max={max} tall={host && !q.media} />
        <ChoiceTile index={1} text="False" correct={!reveal.correct} dimmed={reveal.correct} wrong={picked.has('false') && reveal.correct} mine={picked.has('false')} disabled size={sz} layout={host ? 'row' : 'stack'} count={count('false')} max={max} tall={host && !q.media} />
      </div>
    );
  }
  const rowText = host ? 'text-[clamp(1.2rem,1.9vw,2.2rem)] px-5 py-3' : 'text-lg px-3.5 py-2.5';
  if (q.type === 'order' && reveal.type === 'order') {
    const byId = new Map(q.items.map((i) => [i.id, i.text]));
    return (
      <ol className="flex flex-col gap-2" aria-label="The right order">
        {reveal.itemIds.map((id, i) => (
          <li key={id} className={`flex items-center gap-3 rounded-[var(--radius-m)] bg-glim font-bold text-on-accent ${rowText}`}>
            <span className="grid size-[1.8em] shrink-0 place-items-center rounded-full bg-ink font-display font-extrabold text-white tabular">{i + 1}</span>
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
          <li key={l.id} className={`grid grid-cols-2 gap-3 rounded-[var(--radius-m)] bg-glim font-bold text-on-accent ${rowText}`}>
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
    <div className={`lift rounded-[var(--radius-l)] bg-glim text-on-accent ${host ? 'px-7 py-5' : 'px-5 py-4'}`}>
      <div className={`font-bold ${host ? 'text-[clamp(1rem,1.4vw,1.5rem)]' : 'text-sm'}`}>Answer</div>
      <div className={`font-display font-extrabold break-words ${host ? 'text-[clamp(2.25rem,4vw,4.75rem)] leading-[1.02]' : 'text-[2rem] leading-tight'}`}>{text}</div>
    </div>
  );
}

/**
 * The player's own result: "Correct" with the points on a plate as the hero
 * number, "Partly right (60%)", or "Incorrect" with the right answer when the
 * caller passes `answer`. A correct answer bursts with the player's equipped
 * answer effect, or the default mix when they have none; a miss stays calm.
 */
export function ResultBanner({ correct, partial, points, text, answer }: { correct: boolean | null; partial?: number | null; points?: number | null; text?: string | undefined; answer?: string | null | undefined }) {
  const part = !correct && Boolean(partial && partial > 0);
  const percent = Math.round((partial ?? 0) * 100);
  const said = correct === null ? null : `${correct ? 'Correct.' : part ? `Partly right, ${percent} percent.` : 'Incorrect.'}${points ? ` Plus ${points.toLocaleString('en-GB')} points.` : ''}${text ? ` ${text}` : ''}`;
  useAnnounce(said);
  // Each result is its own component (call sites key it by question), so it plays once as it appears.
  const role = useSoundRole();
  useSfx(correct ? 'correct' : part ? 'rankUp' : 'wrong', said, correct !== null && role !== 'host');
  const overview = useOverview();
  const effect = overview.data?.equipped.effect?.art;
  if (correct === null) return null;
  const own = correct && effect && effect.kind === 'effect' ? effect : null;
  const showAnswer = !correct && answer;
  return (
    <div className={`lift relative isolate flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[var(--radius-l)] px-4 py-3 text-on-accent ${correct ? 'bg-glim' : part ? 'bg-lantern' : 'bg-ember'}`} style={{ animation: 'pop-in 200ms var(--ease-out)' }}>
      {correct ? <Burst style={own?.style ?? 'festival'} hue={own?.hue ?? 42} size={300} /> : null}
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink/85 text-white" aria-hidden>
        {correct || part ? <Check className="size-6" strokeWidth={3.2} /> : <X className="size-6" strokeWidth={3.2} />}
      </span>
      <span className={`min-w-0 flex-1 font-display leading-none font-extrabold italic ${part ? 'text-[1.7rem]' : 'text-[2.1rem]'}`}>{correct ? 'Correct' : part ? `Partly right (${percent}%)` : 'Incorrect'}</span>
      {points ? (
        <span className="plate text-[2.1rem] tabular">
          <span>+{points.toLocaleString('en-GB')}</span>
        </span>
      ) : null}
      {showAnswer ? <span className="basis-full pl-[3.25rem] text-lg leading-snug font-bold break-words">Answer: {answer}</span> : null}
      {text ? <span className="basis-full pl-[3.25rem] text-base leading-snug font-bold">{text}</span> : null}
    </div>
  );
}
