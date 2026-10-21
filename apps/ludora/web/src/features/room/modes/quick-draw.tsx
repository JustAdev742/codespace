import { Lock, Target, Timer, Zap } from 'lucide-react';
import type { Answer, AnswerReveal, RoomPlayerView } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown, TimerBar } from '../game/TimerBar.tsx';
import { ChoicesDisplay, RevealAnswer } from '../game/Reveal.tsx';
import { Leaderboard, TeamScores, type LeaderRow } from '../game/Leaderboard.tsx';
import { Glim } from '../../../art/glim/Glim.tsx';

/* Quick Draw: buzzer rounds. The first correct answer takes the round; a wrong answer locks you out of it. */

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

interface Buzz {
  playerId: string;
  name: string;
  responseMs: number;
}

export interface QuickDrawView {
  sync: SyncView;
  target: number;
  penalty: boolean;
  /** Who took the round that is being revealed. */
  winner: Buzz | null;
  /** Players locked out of the open round by a wrong answer. */
  lockedOut: number;
  fastest: Buzz | null;
  recent: (Buzz & { round: number })[];
  board: { rows: LeaderRow[]; you: LeaderRow | null };
  teams: { teamId: string; name: string; hue: number; score: number; members: number }[] | null;
  you: { score: number; lockedOut: boolean; won: boolean; lostPoint: boolean; wins: number } | null;
}

const seconds = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
const points = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`;
const avatarOf = (players: RoomPlayerView[], id: string) => players.find((p) => p.id === id)?.avatar ?? null;

function Intro({ view, gameNow, big = false }: { view: QuickDrawView; gameNow: () => number; big?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center" style={{ animation: 'pop-in 300ms var(--ease-spring)' }}>
      <Zap className={`${big ? 'size-20' : 'size-14'} text-lantern`} aria-hidden />
      <h2 className={`font-display font-extrabold ${big ? 'text-6xl' : 'text-5xl'}`}>Quick Draw</h2>
      <p className={`max-w-xl text-text-2 ${big ? 'text-2xl' : 'text-lg'}`}>
        The first right answer takes each round. You get one try per question, so make it count.
        {view.target > 0 ? ` First to ${points(view.target)} wins.` : ''}
      </p>
      <p className={`font-semibold text-text-2 ${big ? 'text-xl' : ''}`}>
        {view.sync.total} questions. First one in <Countdown until={view.sync.phaseEndsAt} gameNow={gameNow} />
      </p>
    </div>
  );
}

/** The big "who was first" moment. */
function FirstIn({ winner, players, you, big = false }: { winner: Buzz | null; players: RoomPlayerView[]; you?: QuickDrawView['you']; big?: boolean }) {
  if (!winner) {
    return (
      <div role="status" className="rounded-[20px] border-2 border-dashed border-line-strong px-6 py-6 text-center" style={{ animation: 'pop-in 260ms var(--ease-spring)' }}>
        <p className={`font-display font-extrabold ${big ? 'text-5xl' : 'text-3xl'}`}>Nobody got it</p>
        <p className={`text-text-2 ${big ? 'text-xl' : ''}`}>No point this round.</p>
      </div>
    );
  }
  const avatar = avatarOf(players, winner.playerId);
  const mine = you?.won;
  return (
    <div role="status" className={`flex items-center gap-4 rounded-[22px] border-2 border-ink px-5 text-on-accent ${big ? 'gap-6 py-6' : 'py-4'} ${mine ? 'bg-glim' : 'bg-lantern'}`} style={{ animation: 'pop-in 320ms var(--ease-spring)' }}>
      {avatar ? <Glim art={avatar.art} accessories={avatar.accessories} size={big ? 132 : 72} aura="legendary" bob /> : <Zap className={big ? 'size-24' : 'size-14'} aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className={`font-display font-bold ${big ? 'text-2xl' : 'text-lg'}`}>{mine ? 'You were first!' : 'First in'}</p>
        <p className={`truncate font-display font-extrabold ${big ? 'text-6xl' : 'text-4xl'}`}>{mine ? '+1 point' : winner.name}</p>
        <p className={`flex items-center gap-2 font-display font-bold tabular ${big ? 'text-3xl' : 'text-xl'}`}>
          <Timer className={big ? 'size-8' : 'size-5'} aria-hidden />
          <span>
            <span className="sr-only">Answered in </span>
            {seconds(winner.responseMs)}
          </span>
        </p>
      </div>
    </div>
  );
}

function Tally({ view, room, big = false }: { view: QuickDrawView; room: ModeScreenProps['room']; big?: boolean }) {
  // Gains belong to the round being revealed. Penalties show as their own line rather than as a "+" gain.
  const revealed = view.sync.phase === 'reveal';
  const gain = (r: LeaderRow) => ({ ...r, gain: revealed ? Math.max(0, r.gain ?? 0) : 0 });
  const rows = view.board.rows.map(gain);
  const you = view.board.you ? gain(view.board.you) : null;
  const lost = revealed ? view.board.rows.filter((r) => (r.gain ?? 0) < 0).map((r) => r.name) : [];
  return (
    <div className="flex flex-col gap-3">
      {view.teams ? <TeamScores teams={view.teams} /> : null}
      <Leaderboard rows={rows} you={you} players={room.players} teams={room.room.teams} big={big} label={(r) => points(r.score)} />
      {lost.length ? <p className={`font-semibold text-ember ${big ? 'text-lg' : 'text-sm'}`}>Lost a point for a wrong answer: {lost.join(', ')}</p> : null}
    </div>
  );
}

function TargetBadge({ target, big = false }: { target: number; big?: boolean }) {
  if (target <= 0) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1 font-display font-bold ${big ? 'text-lg' : 'text-sm'}`}>
      <Target className="size-4" aria-hidden /> First to {target}
    </span>
  );
}

export function QuickDrawPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<QuickDrawView>) {
  const s = view.sync;
  const you = view.you;
  if (s.phase === 'intro') return <Intro view={view} gameNow={gameNow} />;
  if (s.phase === 'leaderboard' || s.phase === 'done') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <h2 className="font-display text-3xl font-extrabold">Round wins</h2>
        <Tally view={view} room={room} />
      </div>
    );
  }
  const q = s.question;
  if (!q) return null;
  const submit = async (answer: Answer) => (await act({ type: 'answer', iid: q.iid, answer })).ok;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-semibold text-text-2">
        <span>
          Question {s.round + 1} of {s.total}
        </span>
        <span className="flex items-center gap-2">
          <TargetBadge target={view.target} />
          <span className="font-display text-base font-bold text-text tabular">{points(you?.score ?? 0)}</span>
        </span>
      </div>
      {s.phase === 'question' ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} /> : null}
      <QuestionCard q={q.q} />
      {s.phase === 'question' ? (
        you?.lockedOut ? (
          <div className="flex flex-col items-center gap-2 rounded-[18px] border-2 border-ember bg-ember/10 px-5 py-6 text-center" role="status">
            <Lock className="size-9 text-ember" aria-hidden />
            <p className="font-display text-2xl font-bold">Locked out</p>
            <p className="text-text-2">
              That was not it. Wait for the next question.
              {you?.lostPoint ? ' It cost you a point.' : ''}
            </p>
            {view.lockedOut > 1 ? <p className="text-sm text-text-3">{view.lockedOut} players are locked out of this one.</p> : null}
          </div>
        ) : s.you?.answered ? (
          <div className="rounded-[16px] border-2 border-dashed border-line-strong px-5 py-6 text-center" role="status">
            <p className="font-display text-2xl font-bold">Answer in</p>
          </div>
        ) : (
          <>
            {view.penalty ? <p className="text-sm font-semibold text-text-2">One try. A wrong answer costs a point.</p> : <p className="text-sm font-semibold text-text-2">One try. First right answer wins the round.</p>}
            <AnswerInput key={q.iid} q={q.q} onSubmit={submit} disabled={paused} />
          </>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <FirstIn winner={view.winner} players={room.players} you={you} />
          {you?.lostPoint ? <p className="font-semibold text-ember">Your wrong answer cost a point.</p> : null}
          {s.reveal ? <RevealAnswer q={q.q} reveal={s.reveal} compact /> : null}
          {s.explanation ? <p className="rounded-[14px] bg-surface-2 px-4 py-3 text-text-2">{s.explanation}</p> : null}
          <Tally view={view} room={room} />
        </div>
      )}
    </div>
  );
}

export function QuickDrawHost({ view, gameNow, paused, room }: ModeScreenProps<QuickDrawView>) {
  const s = view.sync;
  if (s.phase === 'intro') return <Intro view={view} gameNow={gameNow} big />;
  if (s.phase === 'leaderboard' || s.phase === 'done') {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <h2 className="mb-4 font-display text-4xl font-extrabold">Round wins</h2>
        <Tally view={view} room={room} big />
      </div>
    );
  }
  const q = s.question;
  if (!q) return null;
  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-display text-xl font-bold text-text-2">
            Question {s.round + 1} of {s.total}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <TargetBadge target={view.target} big />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-3 py-1 font-display text-lg font-bold tabular" aria-live="polite">
              <Lock className="size-4" aria-hidden /> {view.lockedOut} locked out
            </span>
          </span>
        </div>
        {s.phase === 'question' ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} /> : null}
        {s.phase === 'reveal' ? <FirstIn winner={view.winner} players={room.players} big /> : null}
        <QuestionCard q={q.q} size="lg" />
        {s.phase === 'question' ? (
          <ChoicesDisplay q={q.q} />
        ) : s.reveal ? (
          <div className="flex flex-col gap-4">
            <RevealAnswer q={q.q} reveal={s.reveal} distribution={s.distribution} />
            {s.explanation ? <p className="rounded-[14px] bg-surface-2 px-5 py-4 text-lg text-text-2">{s.explanation}</p> : null}
          </div>
        ) : null}
      </div>
      <aside className="flex min-w-0 flex-col gap-4">
        <h3 className="font-display text-2xl font-bold">Tally</h3>
        <Tally view={view} room={room} big />
        {view.fastest ? (
          <p className="rounded-[14px] bg-surface-2 px-4 py-3 text-lg text-text-2">
            Fastest so far: <span className="font-semibold text-text">{view.fastest.name}</span>, {seconds(view.fastest.responseMs)}
          </p>
        ) : null}
        {view.recent.length ? (
          <div>
            <h4 className="mb-2 font-display text-lg font-bold text-text-2">Recent rounds</h4>
            <ol className="flex flex-col gap-1.5">
              {view.recent.map((r) => (
                <li key={r.round} className="flex items-center justify-between gap-3 rounded-[12px] border border-line bg-raised px-3 py-2">
                  <span className="text-text-3 tabular">Q{r.round + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                  <span className="font-display font-bold tabular">{seconds(r.responseMs)}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
