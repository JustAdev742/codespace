import type { InsightQuestion, LiveInsightView } from '@ludora/shared';
import { HeartHandshake, Lightbulb, TrendingDown } from 'lucide-react';
import { StagePanel } from '../game/stage.tsx';
import { MathText } from '../../sets/math/MathText.tsx';

/*
 * The class, as the game is going: on the teacher's own remote, never on the big screen. What the
 * report will say afterwards, in time to do something about it: the wrong answer most of the class
 * gave (worth a word now), the questions found hardest, and who might like someone to come over.
 * It says nothing about the question still open (the server leaves it out, D61).
 *
 * The wording is for a teacher glancing at a phone between questions, and it is kind: nobody is
 * "failing", someone "might like a hand".
 */

const share = (q: InsightQuestion) => `${q.right} of ${q.players} right`;

function Question({ q }: { q: InsightQuestion }) {
  return (
    <li className="flex flex-col gap-0.5 rounded-[var(--radius-m)] bg-white/[0.06] px-3 py-2">
      <span className="line-clamp-2 font-semibold">
        <MathText text={q.prompt} />
      </span>
      <span className="text-sm text-text-2">
        {share(q)}
        {q.commonWrong ? (
          <>
            {' · '}
            {q.commonWrong.count} said <span className="font-bold text-text">&ldquo;{q.commonWrong.text}&rdquo;</span>
          </>
        ) : null}
      </span>
    </li>
  );
}

export function ClassInsight({ insight }: { insight: LiveInsightView }) {
  const rate = insight.answered ? Math.round((insight.right / insight.answered) * 100) : null;
  const talk = insight.talkAbout;
  const others = insight.hardest.filter((q) => q.questionId !== talk?.questionId).slice(0, 3);
  return (
    <StagePanel as="section" className="flex flex-col gap-3 p-4" label="How the class is finding it">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-bold">How the class is finding it</h2>
        {rate !== null ? (
          <span className="font-display text-2xl font-extrabold tabular">
            {rate}%<span className="sr-only"> of answers right so far</span>
          </span>
        ) : null}
      </div>
      {rate === null ? (
        <p className="text-text-2">Nothing yet. After the first question you will see here what the class found hard and who might like a hand.</p>
      ) : (
        <>
          {talk?.commonWrong ? (
            <div className="rounded-[var(--radius-m)] bg-lantern px-3.5 py-3 text-on-accent">
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <Lightbulb className="size-4" aria-hidden /> Worth a word now
              </p>
              <p className="mt-1 font-semibold">
                <MathText text={talk.prompt} />
              </p>
              <p className="mt-1 text-sm">
                {talk.commonWrong.count} of {talk.players} said <span className="font-bold">&ldquo;{talk.commonWrong.text}&rdquo;</span>.
              </p>
            </div>
          ) : null}
          {others.length ? (
            <div>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-text-2">
                <TrendingDown className="size-4" aria-hidden /> Found hardest so far
              </h3>
              <ul className="flex flex-col gap-1.5">
                {others.map((q) => (
                  <Question key={q.questionId} q={q} />
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-text-2">
              <HeartHandshake className="size-4" aria-hidden /> Might like a hand
            </h3>
            {insight.checkIn.length ? (
              <ul className="flex flex-col gap-1.5">
                {insight.checkIn.map((p) => (
                  <li key={p.playerId} className="flex items-baseline justify-between gap-3 rounded-[var(--radius-m)] bg-white/[0.06] px-3 py-2">
                    <span className="min-w-0 truncate font-semibold">{p.name}</span>
                    <span className="shrink-0 text-sm text-text-2">{p.reason === 'run' ? `${p.wrongRun} missed in a row` : `${p.correct} of ${p.answered} right`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-2">Nobody stands out. Everyone is keeping up so far.</p>
            )}
          </div>
        </>
      )}
      <p className="text-xs text-text-3">Only you see this, on this remote. It is not on the big screen, and it never includes the question still open.</p>
    </StagePanel>
  );
}
