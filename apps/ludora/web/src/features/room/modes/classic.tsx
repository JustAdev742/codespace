import type { Answer, AnswerReveal } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { TimerBar } from '../game/TimerBar.tsx';
import { ChoicesDisplay, ResultBanner, RevealAnswer, shortAnswer } from '../game/Reveal.tsx';
import { Leaderboard, TeamScores, type LeaderRow } from '../game/Leaderboard.tsx';
import { Explanation, HudCount, HudScore, IntroScreen, LockedIn, RoundHeader, StreakChip, myAvatar } from '../game/parts.tsx';
import { Pill, PlayerGlim, StagePanel } from '../game/stage.tsx';
import { formatNumber, ordinal } from '../../../lib/format.ts';
import { useAnnounce } from '../game/announce.tsx';

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
  /** `joinedLate`: joined after this question started, so a missed answer does not count against them. */
  you: { eligible: boolean; answered: boolean; joinedLate?: boolean; correct: boolean | null; points: number | null; partial: number | null; streak: number } | null;
}

export interface ClassicView {
  sync: SyncView;
  board: { rows: LeaderRow[]; you: LeaderRow | null };
  /** With the unison rule, `score` is the team's average plus any `bonus` it earned. */
  teams: { teamId: string; name: string; hue: number; score: number; members: number; average?: number; bonus?: number }[] | null;
  suddenDeath: boolean;
  /** Encore rule: the open question is coming back for half points. */
  encore?: boolean;
  /** Comeback rule: this player is in the bottom half and scores double for the open question. */
  boosted?: boolean;
  alive: number | null;
  out: boolean;
  /** Out because they joined a knockout game after it started: they watch. */
  watching?: boolean;
  score: number | null;
}

export function ClassicPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<ClassicView>) {
  const s = view.sync;
  const seed = room.me.playerId ?? 'you';
  const me = view.board.you;
  useAnnounce(s.phase === 'leaderboard' && me ? `You are ${ordinal(me.rank)} with ${formatNumber(me.score)} points.` : null, `${s.phase}${s.round}`);
  if (s.phase === 'intro') {
    return (
      <IntroScreen kicker="Get ready" title={room.room.title} until={s.phaseEndsAt} gameNow={gameNow} room={room} art={<PlayerGlim avatar={myAvatar(room)} seed={seed} size={120} />}>
        {s.total} questions
      </IntroScreen>
    );
  }
  if (s.phase === 'leaderboard' || s.phase === 'done') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <div className="flex items-center gap-3">
          <PlayerGlim avatar={myAvatar(room)} seed={seed} size={76} className="shrink-0" />
          <div className="flex flex-col items-start gap-1">
            {/* Your rank on the gold plate: the moment of the standings. */}
            <h2 className={me ? 'plate plate-gold text-[2rem]' : 'font-display text-[2.25rem] font-bold'}>{me ? <span>You are {ordinal(me.rank)}</span> : 'Standings'}</h2>
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
        <PlayerGlim avatar={myAvatar(room)} seed={seed} size={96} className={view.watching ? undefined : 'opacity-70 grayscale'} />
        <h2 className="font-display text-[2.25rem] font-bold">{view.watching ? 'You are watching' : 'You are out'}</h2>
        <p className="font-semibold text-text-2">
          {view.watching ? `In a knockout game, people who join after the start watch. ${view.alive} still standing.` : `Keep watching: ${view.alive} still standing.`}
        </p>
        <QuestionCard q={q.q} index={q.index} total={q.total} />
      </div>
    );
  }
  const submit = async (answer: Answer) => {
    const ack = await act({ type: 'answer', iid: q.iid, answer });
    return ack.ok;
  };
  // Joined during this question and did not answer it: no result for it, they play from the next one.
  const lateJoiner = Boolean(s.you?.joinedLate && !s.you.answered);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <RoundHeader round={s.round} total={s.total}>
        {view.encore ? <Pill tone="dusk">Encore, half points</Pill> : null}
        {view.boosted && s.phase === 'question' ? <Pill tone="glim">Double points</Pill> : null}
        <StreakChip streak={s.you?.streak ?? 0} />
        <HudScore value={view.score ?? 0} />
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
          {lateJoiner ? (
            <JoinedMidQuestion />
          ) : (
            <>
              <ResultBanner correct={s.you?.answered ? (s.you.correct ?? false) : false} partial={s.you?.partial} points={s.you?.points} answer={s.reveal ? shortAnswer(q.q, s.reveal) : null} />
              {!s.you?.answered ? <p className="font-semibold text-text-2">You did not answer.</p> : null}
            </>
          )}
          {s.reveal ? <RevealAnswer q={q.q} reveal={s.reveal} compact /> : null}
          <Explanation text={s.explanation} />
        </div>
      )}
    </div>
  );
}

const JOINED_LATE = 'You joined during this question, so it does not count. You play from the next one.';

function JoinedMidQuestion() {
  useAnnounce(JOINED_LATE, 'late');
  return <StagePanel className="px-4 py-3 font-semibold text-text">{JOINED_LATE}</StagePanel>;
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
          <h2 className="font-display text-[clamp(2.75rem,5vw,6rem)] leading-none font-extrabold">Leaderboard</h2>
          <Leaderboard rows={view.board.rows} players={room.players} teams={room.room.teams} big />
        </div>
        {view.teams ? (
          <section className="flex flex-col gap-3 lg:pt-[clamp(3.5rem,6.5vw,7rem)]" aria-label="Teams">
            <h3 className="font-display text-[clamp(1.75rem,2.7vw,3rem)] font-bold">Teams</h3>
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
        {view.encore ? (
          <Pill tone="dusk" className="px-5 py-1.5">
            Encore, half points
          </Pill>
        ) : null}
        {view.suddenDeath ? <HudCount value={view.alive ?? 0} label="still standing" big /> : null}
        <HudCount value={s.answered} total={s.eligible} label="answered" big />
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
