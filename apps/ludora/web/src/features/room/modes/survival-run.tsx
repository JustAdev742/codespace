import { ArrowRight, Heart, HeartCrack, HeartPlus } from 'lucide-react';
import type { Answer } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown, TimerBar } from '../game/TimerBar.tsx';
import { ResultBanner, RevealAnswer } from '../game/Reveal.tsx';
import { Button } from '../../../ui/Button.tsx';
import { plural } from '../../../lib/format.ts';

/* Survival Run: hearts, a shrinking timer and no finish line. */

export interface SurvivalRunView {
  endsAt: number | null;
  maxHearts: number;
  restores: boolean;
  rows: { playerId: string; name: string; correct: number; hearts: number; timerMs: number; over: boolean }[];
  you: {
    phase: 'question' | 'result' | 'over';
    hearts: number;
    timerMs: number;
    correct: number;
    answered: number;
    streak: number;
    bestStreak: number;
    restored: number;
    nextHeartIn: number | null;
    question: QuestionView | null;
    last: FeedbackView | null;
    heartChange: number;
    nextAt: number | null;
    lastQuestion: QuestionView | null;
    answerText: string | null;
  } | null;
}

function Hearts({ hearts, max, big = false }: { hearts: number; max: number; big?: boolean }) {
  return (
    <span className="flex items-center gap-1" role="img" aria-label={`${hearts} of ${max} ${max === 1 ? 'heart' : 'hearts'} left`}>
      {Array.from({ length: max }, (_, i) => (
        <Heart key={i} className={`${big ? 'size-8' : 'size-6'} ${i < hearts ? 'fill-ember text-ink' : 'text-line-strong'}`} strokeWidth={2.2} aria-hidden />
      ))}
    </span>
  );
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(ms % 1000 ? 1 : 0)} s`;

export function SurvivalRunPlayer({ view, act, gameNow, paused }: ModeScreenProps<SurvivalRunView>) {
  const you = view.you;
  if (!you) return <p className="text-text-2">Watching.</p>;
  const q = you.question;
  const submit = async (answer: Answer) => (q ? (await act({ type: 'answer', iid: q.iid, answer })).ok : false);
  const last = you.last;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Hearts hearts={you.hearts} max={view.maxHearts} big />
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span className="rounded-full bg-surface-3 px-3 py-1 font-display text-base font-bold tabular">{you.correct} correct</span>
          {you.streak > 1 ? <span className="text-lantern">Streak {you.streak}</span> : null}
          {view.endsAt ? (
            <span className="rounded-full bg-surface-2 px-3 py-1">
              <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
            </span>
          ) : null}
        </div>
      </div>
      {you.phase !== 'over' ? (
        <p className="text-sm text-text-2">
          {seconds(you.timerMs)} per question.
          {view.restores
            ? you.hearts < view.maxHearts && you.nextHeartIn !== null
              ? ` ${plural(you.nextHeartIn, 'more correct answer')} to win back a heart.`
              : ' Every 10 correct answers win back a lost heart.'
            : ''}
        </p>
      ) : null}
      {you.phase === 'over' ? (
        <div className="rounded-[16px] border-2 border-dashed border-line-strong px-5 py-8 text-center" role="status">
          <HeartCrack className="mx-auto mb-2 size-10 text-ember" aria-hidden />
          <p className="font-display text-3xl font-extrabold">Out of hearts</p>
          <p className="mt-1 text-lg text-text-2">
            You got {plural(you.correct, 'question')} right. Best streak {you.bestStreak}.
          </p>
        </div>
      ) : you.phase === 'result' && last ? (
        <div className="flex flex-col gap-3">
          <ResultBanner correct={last.correct} partial={last.partial} text={last.text} />
          {you.heartChange < 0 ? (
            <p className="flex items-center gap-2 font-semibold text-ember" role="status">
              <HeartCrack className="size-5" aria-hidden /> You lost a heart.
            </p>
          ) : you.heartChange > 0 ? (
            <p className="flex items-center gap-2 font-semibold text-glim" role="status">
              <HeartPlus className="size-5" aria-hidden /> Heart won back!
            </p>
          ) : null}
          {!last.correct && you.lastQuestion ? <RevealAnswer q={you.lastQuestion.q} reveal={last.reveal} compact /> : null}
          {!last.correct && last.explanation ? <p className="rounded-[14px] bg-surface-2 px-4 py-3 text-text-2">{last.explanation}</p> : null}
          <Button variant="primary" size="lg" icon={<ArrowRight className="size-5" />} onClick={() => void act({ type: 'next' })} disabled={paused} className="self-start">
            Next question
          </Button>
        </div>
      ) : q ? (
        <div className="flex flex-col gap-4">
          <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} />
          <QuestionCard q={q.q} />
          <AnswerInput key={q.iid} q={q.q} onSubmit={submit} disabled={paused} compact />
        </div>
      ) : null}
    </div>
  );
}

/** Solo games have no big screen in practice; this is a read-only summary. */
export function SurvivalRunHost({ view }: ModeScreenProps<SurvivalRunView>) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h2 className="font-display text-3xl font-extrabold">Survival Run</h2>
      <ul className="flex flex-col gap-2">
        {view.rows.map((r) => (
          <li key={r.playerId} className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-raised px-4 py-3 text-lg">
            <span className="min-w-0 truncate font-semibold">{r.name}</span>
            {r.over ? <span className="text-text-2">Out of hearts</span> : <Hearts hearts={r.hearts} max={view.maxHearts} />}
            <span className="font-display text-2xl font-bold tabular">{r.correct} correct</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
