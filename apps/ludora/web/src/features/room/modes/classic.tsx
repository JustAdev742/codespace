import type { Answer, AnswerReveal } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { TimerBar, Countdown } from '../game/TimerBar.tsx';
import { ChoicesDisplay, ResultBanner, RevealAnswer } from '../game/Reveal.tsx';
import { Leaderboard, TeamScores, type LeaderRow } from '../game/Leaderboard.tsx';
import { formatNumber } from '../../../lib/format.ts';

/* Views for Classic (and every host-paced mode built on synced rounds with the same view shape). */

interface SyncView {
  phase: 'intro' | 'question' | 'reveal' | 'leaderboard' | 'done';
  round: number;
  total: number;
  phaseEndsAt: number | null;
  question: QuestionView | null;
  reveal: AnswerReveal | null;
  explanation: string | null;
  answered: number;
  eligible: number;
  distribution: Record<string, number> | null;
  you: { eligible: boolean; answered: boolean; correct: boolean | null; points: number | null; partial: number | null; streak: number } | null;
}

export interface ClassicView {
  sync: SyncView;
  board: { rows: LeaderRow[]; you: LeaderRow | null };
  teams: { teamId: string; name: string; hue: number; score: number; members: number }[] | null;
  suddenDeath: boolean;
  alive: number | null;
  out: boolean;
  score: number | null;
}

function Intro({ view, gameNow, title }: { view: ClassicView; gameNow: () => number; title: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center" style={{ animation: 'pop-in 300ms var(--ease-spring)' }}>
      <p className="text-lg font-semibold text-text-2">Get ready</p>
      <h2 className="font-display text-5xl font-extrabold">{title}</h2>
      <p className="text-text-2">{view.sync.total} questions. First one in <Countdown until={view.sync.phaseEndsAt} gameNow={gameNow} /></p>
    </div>
  );
}

export function ClassicPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<ClassicView>) {
  const s = view.sync;
  if (s.phase === 'intro') return <Intro view={view} gameNow={gameNow} title={room.room.title} />;
  if (s.phase === 'leaderboard' || s.phase === 'done') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <h2 className="font-display text-3xl font-extrabold">Leaderboard</h2>
        {view.teams ? <TeamScores teams={view.teams} /> : null}
        <Leaderboard rows={view.board.rows} you={view.board.you} players={room.players} teams={room.room.teams} />
      </div>
    );
  }
  const q = s.question;
  if (!q) return null;
  if (view.out) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h2 className="font-display text-3xl font-extrabold">You are out</h2>
        <p className="text-text-2">Keep watching: {view.alive} still standing.</p>
        <QuestionCard q={q.q} index={q.index} total={q.total} />
      </div>
    );
  }
  const submit = async (answer: Answer) => {
    const ack = await act({ type: 'answer', iid: q.iid, answer });
    return ack.ok;
  };
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between gap-3 text-sm font-semibold text-text-2">
        <span>
          Question {s.round + 1} of {s.total}
        </span>
        <span className="tabular">
          {formatNumber(view.score ?? 0)} pts{s.you && s.you.streak > 1 ? `, streak ${s.you.streak}` : ''}
        </span>
      </div>
      {s.phase === 'question' ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} /> : null}
      <QuestionCard q={q.q} />
      {s.phase === 'question' ? (
        s.you?.answered ? (
          <div className="rounded-[16px] border-2 border-dashed border-line-strong px-5 py-6 text-center" role="status">
            <p className="font-display text-2xl font-bold">Answer locked in</p>
            <p className="text-text-2">
              {s.answered} of {s.eligible} have answered.
            </p>
          </div>
        ) : (
          <AnswerInput key={q.iid} q={q.q} onSubmit={submit} disabled={paused} />
        )
      ) : (
        <div className="flex flex-col gap-4">
          <ResultBanner correct={s.you?.answered ? (s.you.correct ?? false) : false} partial={s.you?.partial} points={s.you?.points} />
          {!s.you?.answered ? <p className="text-text-2">No answer this time.</p> : null}
          {s.reveal ? <RevealAnswer q={q.q} reveal={s.reveal} compact /> : null}
          {s.explanation ? <p className="rounded-[14px] bg-surface-2 px-4 py-3 text-text-2">{s.explanation}</p> : null}
        </div>
      )}
    </div>
  );
}

export function ClassicHost({ view, gameNow, paused, room }: ModeScreenProps<ClassicView>) {
  const s = view.sync;
  if (s.phase === 'intro') return <Intro view={view} gameNow={gameNow} title={room.room.title} />;
  if (s.phase === 'leaderboard' || s.phase === 'done') {
    return (
      <div className="mx-auto grid grid-cols-1 w-full max-w-5xl gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="mb-4 font-display text-4xl font-extrabold">Leaderboard</h2>
          <Leaderboard rows={view.board.rows} players={room.players} teams={room.room.teams} big />
        </div>
        {view.teams ? (
          <div>
            <h3 className="mb-3 font-display text-2xl font-bold">Teams</h3>
            <TeamScores teams={view.teams} />
          </div>
        ) : null}
      </div>
    );
  }
  const q = s.question;
  if (!q) return null;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-display text-xl font-bold text-text-2">
          Question {s.round + 1} of {s.total}
        </span>
        <span className="rounded-full bg-surface-3 px-3 py-1 font-display text-lg font-bold tabular" aria-live="polite">
          {s.answered} / {s.eligible} answered
        </span>
      </div>
      {s.phase === 'question' ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} /> : null}
      <QuestionCard q={q.q} size="lg" />
      {s.phase === 'question' ? (
        <ChoicesDisplay q={q.q} />
      ) : s.reveal ? (
        <div className="flex flex-col gap-4">
          <RevealAnswer q={q.q} reveal={s.reveal} distribution={s.distribution} />
          {s.explanation ? <p className="rounded-[14px] bg-surface-2 px-5 py-4 text-lg text-text-2">{s.explanation}</p> : null}
        </div>
      ) : null}
      {view.suddenDeath ? <p className="font-semibold text-text-2">Still standing: {view.alive}</p> : null}
    </div>
  );
}
