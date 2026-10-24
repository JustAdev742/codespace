import { useEffect, useRef, useState } from 'react';
import { Timer, Zap } from 'lucide-react';
import type { Answer } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { ResultBanner } from '../game/Reveal.tsx';
import { ModeTitle, myAvatar } from '../game/parts.tsx';
import { NIGHT, PlayerGlim, StagePanel } from '../game/stage.tsx';
import { useNow } from '../../../lib/useNow.ts';
import { formatNumber, plural } from '../../../lib/format.ts';

/* Time Attack: a solo score attack against a clock that wrong answers shorten. */

const STREAK_FOR_BOOST = 5;

export interface TimeAttackView {
  clockMs: number;
  penaltyMs: number;
  suddenDeath: boolean;
  rows: { playerId: string; name: string; score: number; multiplier: number; correct: number; endsAt: number; over: 'time' | 'mistake' | null }[];
  you: {
    startedAt: number;
    endsAt: number;
    over: 'time' | 'mistake' | null;
    score: number;
    multiplier: number;
    inRow: number;
    nextBoostIn: number | null;
    correct: number;
    answered: number;
    bestStreak: number;
    mistakes: number;
    question: QuestionView | null;
    last: FeedbackView | null;
    lastQuestion: QuestionView | null;
    answerText: string | null;
  } | null;
}

function Clock({ endsAt, clockMs, gameNow, running }: { endsAt: number; clockMs: number; gameNow: () => number; running: boolean }) {
  useNow(100, running);
  const left = Math.max(0, endsAt - gameNow());
  const secs = Math.ceil(left / 1000);
  const urgent = secs <= 10;
  return (
    <div className="flex items-center gap-3" role="timer" aria-label={`${secs} seconds left`}>
      <span className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 font-display text-[1.9rem] leading-none font-extrabold text-on-accent tabular ${urgent ? 'bg-ember' : 'bg-lantern'}`}>
        <Timer className="size-6" aria-hidden />
        {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
      </span>
      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-white/[0.12]" aria-hidden>
        <div className={`absolute inset-0 rounded-full transition-transform duration-100 ease-linear ${urgent ? 'bg-ember' : 'bg-lantern'}`} style={{ transform: `translateX(${Math.min(100, (left / clockMs) * 100) - 100}%)` }} />
      </div>
    </div>
  );
}

/** Five dots towards the next multiplier. */
function Boost({ multiplier, inRow, nextBoostIn }: { multiplier: number; inRow: number; nextBoostIn: number | null }) {
  // Full only at the top multiplier; in overdrive there is none, so the dots keep counting towards the next.
  const filled = nextBoostIn === null ? STREAK_FOR_BOOST : inRow % STREAK_FOR_BOOST;
  return (
    <div className="flex items-center gap-3">
      <span className={`plate text-[1.6rem] ${multiplier === 1 ? `${NIGHT} text-text` : multiplier === 2 ? 'bg-lantern text-on-accent' : 'bg-glim text-on-accent'}`}>
        <span className="flex items-center gap-1">
          <Zap className="size-5" aria-hidden />×{multiplier}
          <span className="sr-only"> multiplier</span>
        </span>
      </span>
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: STREAK_FOR_BOOST }, (_, i) => (
          // Filled or hollow, so progress reads without the colour.
          <span key={i} className={`size-3.5 rounded-full ${i < filled ? 'bg-lantern' : 'ring-2 ring-white/35 ring-inset'}`} />
        ))}
      </span>
      <span className="text-sm font-bold text-text-2">{nextBoostIn === null ? 'Top multiplier' : `${nextBoostIn} more right for ×${multiplier + 1}`}</span>
    </div>
  );
}

/** The last answer's result, shown for a moment above the next question without holding it up. */
function useFlash(last: FeedbackView | null) {
  const [shown, setShown] = useState<FeedbackView | null>(null);
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!last || last.iid === seen.current) return;
    seen.current = last.iid;
    setShown(last);
    const t = setTimeout(() => setShown(null), last.correct ? 1200 : 2400);
    return () => clearTimeout(t);
  }, [last]);
  return shown;
}

export function TimeAttackPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<TimeAttackView>) {
  const you = view.you;
  const running = Boolean(you && !you.over && !paused);
  useNow(250, running);
  const flash = useFlash(you?.last ?? null);
  if (!you) return <p className="font-semibold text-text-2">Watching.</p>;
  const timeUp = gameNow() >= you.endsAt;
  const q = you.question;
  const submit = async (answer: Answer) => (q ? (await act({ type: 'answer', iid: q.iid, answer })).ok : false);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-4">
      {/* The clock and the score share a line, so the question sits higher on a small phone. */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Clock endsAt={you.endsAt} clockMs={view.clockMs} gameNow={gameNow} running={running} />
        </div>
        <span className="shrink-0 font-display text-[2.25rem] leading-none font-extrabold tabular sm:text-[2.6rem]">
          <span className="sr-only">Score: </span>
          {formatNumber(you.score)}
        </span>
      </div>
      <Boost multiplier={you.multiplier} inRow={you.inRow} nextBoostIn={you.nextBoostIn} />
      {you.over ? (
        <StagePanel className="flex flex-col items-center gap-2 px-5 py-7 text-center">
          <PlayerGlim avatar={myAvatar(room)} seed={room.me.playerId ?? 'you'} size={110} />
          <div role="status" className="flex flex-col items-center gap-1">
            <p className="font-display text-[2.25rem] leading-tight font-extrabold">{you.over === 'mistake' ? 'Run over: one wrong answer' : "Time's up"}</p>
            <p className="mt-1 text-lg font-semibold text-text-2">
              {plural(you.score, 'point')} from {plural(you.correct, 'correct answer')}. Best streak {you.bestStreak}.
            </p>
          </div>
        </StagePanel>
      ) : (
        <>
          <div className="min-h-[3.25rem]" aria-live="polite">
            {flash ? (
              <div className="flex flex-col gap-1">
                <ResultBanner key={flash.iid} correct={flash.correct} partial={flash.partial} points={flash.points ?? null} text={flash.text} answer={flash.iid === you.last?.iid ? you.answerText : null} />
              </div>
            ) : (
              <p className="pt-3 text-sm font-semibold text-text-2">
                {view.suddenDeath ? 'One wrong answer ends the run.' : view.penaltyMs ? `A wrong answer costs ${view.penaltyMs / 1000} seconds.` : 'Wrong answers cost nothing but your multiplier.'}
              </p>
            )}
          </div>
          {q ? (
            <div className="flex flex-col gap-4">
              <QuestionCard q={q.q} />
              <AnswerInput key={q.iid} q={q.q} onSubmit={submit} disabled={paused || timeUp} compact />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Solo games have no big screen in practice; this is a read-only summary. */
export function TimeAttackHost({ view, gameNow }: ModeScreenProps<TimeAttackView>) {
  useNow(500, view.rows.some((r) => !r.over));
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <ModeTitle className="self-start">Time Attack</ModeTitle>
      <ul className="flex flex-col gap-2">
        {view.rows.map((r) => (
          <li key={r.playerId} className={`flex items-center justify-between gap-3 rounded-[var(--radius-m)] px-4 py-3 text-lg ${NIGHT}`}>
            <span className="min-w-0 truncate font-semibold">{r.name}</span>
            <span className="text-text-2 tabular">
              {r.over ? (r.over === 'mistake' ? 'One slip' : 'Time is up') : `${Math.max(0, Math.ceil((r.endsAt - gameNow()) / 1000))} s left`}, ×{r.multiplier}
            </span>
            <span className="font-display text-[1.75rem] font-extrabold tabular">{formatNumber(r.score)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
