import { Flame } from 'lucide-react';
import type { Answer, AnswerReveal } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { TimerBar } from '../game/TimerBar.tsx';
import { ChoicesDisplay, ResultBanner, RevealAnswer } from '../game/Reveal.tsx';
import { Leaderboard, TeamScores, type LeaderRow } from '../game/Leaderboard.tsx';
import { Explanation, IntroScreen, LockedIn, RoundHeader, myAvatar } from '../game/parts.tsx';
import { Pill, PlayerGlim, SIGN } from '../game/stage.tsx';
import { formatNumber, ordinal } from '../../../lib/format.ts';

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

export function ClassicPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<ClassicView>) {
  const s = view.sync;
  const seed = room.me.playerId ?? 'you';
  if (s.phase === 'intro') {
    return (
      <IntroScreen kicker="Get ready" title={room.room.title} until={s.phaseEndsAt} gameNow={gameNow} room={room} art={<PlayerGlim avatar={myAvatar(room)} seed={seed} size={120} bob />}>
        {s.total} questions
      </IntroScreen>
    );
  }
  if (s.phase === 'leaderboard' || s.phase === 'done') {
    const me = view.board.you;
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <PlayerGlim avatar={myAvatar(room)} seed={seed} size={76} className="shrink-0" />
          <div>
            <h2 className={`font-display text-3xl font-extrabold ${SIGN}`}>{me ? `You are ${ordinal(me.rank)}` : 'Standings'}</h2>
            {me ? <p className="font-semibold text-text-2">{formatNumber(me.score)} points so far</p> : null}
          </div>
        </div>
        {view.teams ? <TeamScores teams={view.teams} /> : null}
        <Leaderboard rows={view.board.rows} you={view.board.you} players={room.players} teams={room.room.teams} />
      </div>
    );
  }
  const q = s.question;
  if (!q) return null;
  if (view.out) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 text-center">
        <PlayerGlim avatar={myAvatar(room)} seed={seed} size={96} className="opacity-70 grayscale" />
        <h2 className="font-display text-3xl font-extrabold">You are out</h2>
        <p className="font-semibold text-text-2">Keep watching: {view.alive} still standing.</p>
        <QuestionCard q={q.q} index={q.index} total={q.total} />
      </div>
    );
  }
  const submit = async (answer: Answer) => {
    const ack = await act({ type: 'answer', iid: q.iid, answer });
    return ack.ok;
  };
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <RoundHeader round={s.round} total={s.total}>
        {s.you && s.you.streak > 1 ? (
          <Pill tone="lantern">
            <Flame className="size-4" aria-hidden /> Streak {s.you.streak}
          </Pill>
        ) : null}
        <Pill>{formatNumber(view.score ?? 0)} pts</Pill>
      </RoundHeader>
      {s.phase === 'question' ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} /> : null}
      <QuestionCard q={q.q} />
      {s.phase === 'question' ? (
        s.you?.answered ? (
          <LockedIn answered={s.answered} eligible={s.eligible} avatar={myAvatar(room)} seed={seed} />
        ) : (
          <AnswerInput key={q.iid} q={q.q} onSubmit={submit} disabled={paused} />
        )
      ) : (
        <div className="flex flex-col gap-4">
          <ResultBanner correct={s.you?.answered ? (s.you.correct ?? false) : false} partial={s.you?.partial} points={s.you?.points} />
          {!s.you?.answered ? <p className="font-semibold text-text-2">No answer this time.</p> : null}
          {s.reveal ? <RevealAnswer q={q.q} reveal={s.reveal} compact /> : null}
          <Explanation text={s.explanation} />
        </div>
      )}
    </div>
  );
}

export function ClassicHost({ view, gameNow, paused, room }: ModeScreenProps<ClassicView>) {
  const s = view.sync;
  if (s.phase === 'intro') {
    return (
      <IntroScreen kicker="Get ready" title={room.room.title} until={s.phaseEndsAt} gameNow={gameNow} room={room} big>
        {s.total} questions
      </IntroScreen>
    );
  }
  if (s.phase === 'leaderboard' || s.phase === 'done') {
    return (
      <div className={`mx-auto grid w-full grid-cols-1 gap-[clamp(1rem,2.5vw,2.5rem)] ${view.teams ? 'max-w-[100rem] lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]' : 'max-w-[76rem]'}`}>
        <div className="flex flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
          <h2 className={`font-display text-[clamp(2.5rem,4.6vw,5.5rem)] leading-none font-extrabold ${SIGN}`}>Leaderboard</h2>
          <Leaderboard rows={view.board.rows} players={room.players} teams={room.room.teams} big />
        </div>
        {view.teams ? (
          <section className="flex flex-col gap-3 lg:pt-[clamp(3.5rem,6.5vw,7rem)]" aria-label="Teams">
            <h3 className="font-display text-[clamp(1.5rem,2.4vw,2.75rem)] font-extrabold">Teams</h3>
            <TeamScores teams={view.teams} big />
          </section>
        ) : null}
      </div>
    );
  }
  const q = s.question;
  if (!q) return null;
  return (
    <div className="mx-auto flex w-full max-w-[100rem] flex-1 flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
      <RoundHeader round={s.round} total={s.total} big>
        {view.suddenDeath ? <Pill className="px-5 py-1.5">{view.alive} still standing</Pill> : null}
        <span aria-live="polite">
          <Pill className="px-5 py-1.5">
            {s.answered} of {s.eligible} answered
          </Pill>
        </span>
      </RoundHeader>
      {s.phase === 'question' ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} size="lg" /> : null}
      <QuestionCard q={q.q} size="lg" />
      {s.phase === 'question' ? (
        <ChoicesDisplay q={q.q} />
      ) : s.reveal ? (
        <div className="flex flex-col gap-[clamp(0.75rem,2vh,1.25rem)]">
          <RevealAnswer q={q.q} reveal={s.reveal} distribution={s.distribution} size="lg" />
          <Explanation text={s.explanation} big />
        </div>
      ) : null}
    </div>
  );
}
