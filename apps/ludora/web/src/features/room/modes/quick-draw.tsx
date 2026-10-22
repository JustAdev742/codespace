import { Lock, Target, Timer, Zap } from 'lucide-react';
import type { Answer, AnswerReveal, RoomPlayerView } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { TimerBar } from '../game/TimerBar.tsx';
import { ChoicesDisplay, RevealAnswer } from '../game/Reveal.tsx';
import { Leaderboard, TeamScores, type LeaderRow } from '../game/Leaderboard.tsx';
import { Explanation, IntroScreen, RoundHeader, myAvatar } from '../game/parts.tsx';
import { NIGHT, Pill, PlayerGlim, SIGN, StagePanel, avatarOf } from '../game/stage.tsx';

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

function Intro({ view, gameNow, room, big = false }: { view: QuickDrawView; gameNow: () => number; room: ModeScreenProps['room']; big?: boolean }) {
  return (
    <IntroScreen title="Quick Draw" until={view.sync.phaseEndsAt} gameNow={gameNow} room={room} big={big} art={<Zap className={`${big ? 'size-[clamp(4rem,10vh,6.5rem)]' : 'size-14'} fill-lantern text-ink`} aria-hidden />}>
      The first right answer takes each round. You get one try per question, so make it count.
      {view.target > 0 ? ` First to ${points(view.target)} wins.` : ''} {view.sync.total} questions.
    </IntroScreen>
  );
}

/** The big "who was first" moment. */
function FirstIn({ winner, players, you, big = false }: { winner: Buzz | null; players: RoomPlayerView[]; you?: QuickDrawView['you']; big?: boolean }) {
  if (!winner) {
    return (
      <StagePanel className={`border-2 border-dashed border-white/30 text-center ${big ? 'px-6 py-5' : 'px-5 py-4'}`}>
        <div role="status" style={{ animation: 'pop-in 260ms var(--ease-spring)' }}>
          <p className={`font-display font-extrabold ${big ? 'text-[clamp(2rem,3.6vw,4rem)]' : 'text-3xl'}`}>Nobody got it</p>
          <p className={`font-semibold text-text-2 ${big ? 'text-[clamp(1.1rem,1.6vw,1.75rem)]' : ''}`}>No point this round.</p>
        </div>
      </StagePanel>
    );
  }
  const mine = you?.won;
  const time = (
    <span className="flex items-center gap-2 font-display font-extrabold tabular">
      <Timer className="size-[1em]" aria-hidden />
      <span>
        <span className="sr-only">Answered in </span>
        {seconds(winner.responseMs)}
      </span>
    </span>
  );
  return (
    <div
      role="status"
      className={`flex items-center rounded-[24px] border-[3px] border-ink text-on-accent shadow-[0_5px_0_var(--ink)] ${big ? 'gap-[clamp(1rem,2vw,2rem)] px-[clamp(1rem,2vw,2rem)] py-2' : 'gap-4 px-4 py-3'} ${mine ? 'bg-glim' : 'bg-lantern'}`}
      style={{ animation: 'pop-in 320ms var(--ease-spring)' }}
    >
      <PlayerGlim avatar={avatarOf(players, winner.playerId)} seed={winner.playerId} size={big ? 110 : 76} aura="legendary" pose="cheer" bob className={big ? 'size-[clamp(4rem,10vh,6.5rem)] shrink-0' : 'shrink-0'} />
      <div className="min-w-0 flex-1">
        <p className={`font-display font-bold ${big ? 'text-[clamp(1.1rem,1.7vw,1.9rem)]' : 'text-lg'}`}>{mine ? 'You were first!' : 'First in'}</p>
        <p className={`truncate font-display leading-tight font-extrabold ${big ? 'text-[clamp(2rem,3.8vw,4.25rem)]' : 'text-4xl'}`}>{mine ? '+1 point' : winner.name}</p>
        {big ? null : <p className="text-xl">{time}</p>}
      </div>
      {big ? <span className="shrink-0 rounded-full bg-white/55 px-4 py-1 text-[clamp(1.4rem,2.6vw,3rem)]">{time}</span> : null}
    </div>
  );
}

function Tally({ view, room, big = false, dense = false }: { view: QuickDrawView; room: ModeScreenProps['room']; big?: boolean; dense?: boolean }) {
  // Gains belong to the round being revealed. Penalties show as their own line rather than as a "+" gain.
  const revealed = view.sync.phase === 'reveal';
  const gain = (r: LeaderRow) => ({ ...r, gain: revealed ? Math.max(0, r.gain ?? 0) : 0 });
  const rows = view.board.rows.map(gain);
  const you = view.board.you ? gain(view.board.you) : null;
  const lost = revealed ? view.board.rows.filter((r) => (r.gain ?? 0) < 0).map((r) => r.name) : [];
  return (
    <div className="flex flex-col gap-3">
      {view.teams ? <TeamScores teams={view.teams} big={big} /> : null}
      <Leaderboard rows={rows} you={you} players={room.players} teams={room.room.teams} big={big} dense={dense} label={(r) => points(r.score)} />
      {lost.length ? <p className={`rounded-[14px] px-3 py-2 font-semibold text-ember ${NIGHT} ${big ? 'text-[clamp(1rem,1.4vw,1.5rem)]' : 'text-sm'}`}>Lost a point for a wrong answer: {lost.join(', ')}</p> : null}
    </div>
  );
}

function TargetBadge({ target, big = false }: { target: number; big?: boolean }) {
  if (target <= 0) return null;
  return (
    <Pill className={big ? 'px-5 py-1.5' : ''}>
      <Target className="size-[0.9em]" aria-hidden /> First to {target}
    </Pill>
  );
}

export function QuickDrawPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<QuickDrawView>) {
  const s = view.sync;
  const you = view.you;
  if (s.phase === 'intro') return <Intro view={view} gameNow={gameNow} room={room} />;
  if (s.phase === 'leaderboard' || s.phase === 'done') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <h2 className={`font-display text-3xl font-extrabold ${SIGN}`}>Round wins</h2>
        <Tally view={view} room={room} />
      </div>
    );
  }
  const q = s.question;
  if (!q) return null;
  const submit = async (answer: Answer) => (await act({ type: 'answer', iid: q.iid, answer })).ok;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <RoundHeader round={s.round} total={s.total}>
        <TargetBadge target={view.target} />
        <Pill>{points(you?.score ?? 0)}</Pill>
      </RoundHeader>
      {s.phase === 'question' ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} /> : null}
      <QuestionCard q={q.q} />
      {s.phase === 'question' ? (
        you?.lockedOut ? (
          <StagePanel className="flex items-center gap-4 border-2 border-ember px-4 py-4">
            <PlayerGlim avatar={myAvatar(room)} seed={room.me.playerId ?? 'you'} size={72} className="shrink-0 opacity-70 grayscale" />
            <div role="status">
              <p className="flex items-center gap-2 font-display text-2xl font-extrabold">
                <Lock className="size-6 text-ember" aria-hidden /> Locked out
              </p>
              <p className="font-semibold text-text-2">
                {s.you?.answered ? 'That was not it.' : 'Your team is out of this one: a teammate answered and it was not right.'} Wait for the next question.
                {you?.lostPoint ? ' It cost you a point.' : ''}
              </p>
              {view.lockedOut > 1 ? <p className="text-sm font-semibold text-text-2">{view.lockedOut} players are locked out of this one.</p> : null}
            </div>
          </StagePanel>
        ) : s.you?.answered ? (
          <StagePanel className="px-5 py-5 text-center">
            <p className="font-display text-2xl font-extrabold" role="status">
              Answer in
            </p>
          </StagePanel>
        ) : (
          <>
            <p className="font-semibold text-text-2">{view.penalty ? 'One try. A wrong answer costs a point.' : 'One try. First right answer wins the round.'}</p>
            <AnswerInput key={q.iid} q={q.q} onSubmit={submit} disabled={paused} />
          </>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <FirstIn winner={view.winner} players={room.players} you={you} />
          {you?.lostPoint ? <p className={`rounded-[14px] px-3 py-2 font-semibold text-ember ${NIGHT}`}>Your wrong answer cost a point.</p> : null}
          {s.reveal ? <RevealAnswer q={q.q} reveal={s.reveal} compact /> : null}
          <Explanation text={s.explanation} />
          <Tally view={view} room={room} />
        </div>
      )}
    </div>
  );
}

export function QuickDrawHost({ view, gameNow, paused, room }: ModeScreenProps<QuickDrawView>) {
  const s = view.sync;
  if (s.phase === 'intro') return <Intro view={view} gameNow={gameNow} room={room} big />;
  if (s.phase === 'leaderboard' || s.phase === 'done') {
    return (
      <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
        <h2 className={`font-display text-[clamp(2.5rem,4.6vw,5.5rem)] leading-none font-extrabold ${SIGN}`}>Round wins</h2>
        <Tally view={view} room={room} big />
      </div>
    );
  }
  const q = s.question;
  if (!q) return null;
  return (
    <div className="mx-auto grid w-full max-w-[110rem] flex-1 grid-cols-1 gap-[clamp(1rem,2vw,2rem)] lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-[clamp(0.75rem,2vh,1.25rem)]">
        <RoundHeader round={s.round} total={s.total} big>
          <TargetBadge target={view.target} big />
          <Pill className="px-5 py-1.5">
            <Lock className="size-[0.9em]" aria-hidden /> {view.lockedOut} locked out
          </Pill>
        </RoundHeader>
        {s.phase === 'question' ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} size="lg" /> : null}
        {s.phase === 'reveal' ? <FirstIn winner={view.winner} players={room.players} big /> : null}
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
      <aside className="flex min-w-0 flex-col gap-3">
        <h3 className={`font-display text-[clamp(1.5rem,2.4vw,2.75rem)] font-extrabold ${SIGN}`}>Tally</h3>
        <Tally view={view} room={room} big dense />
        {view.fastest ? (
          <StagePanel className="px-4 py-3 text-[clamp(1rem,1.3vw,1.4rem)] font-semibold text-text-2">
            Fastest so far: <span className="font-bold text-text">{view.fastest.name}</span>, {seconds(view.fastest.responseMs)}
          </StagePanel>
        ) : null}
        {view.recent.length ? (
          <div>
            <h4 className="mb-2 font-display text-[clamp(1.1rem,1.6vw,1.75rem)] font-extrabold">Recent rounds</h4>
            <ol className="flex flex-col gap-1.5 text-[clamp(1rem,1.3vw,1.4rem)]">
              {view.recent.map((r) => (
                <li key={r.round} className={`flex items-center justify-between gap-3 rounded-[14px] border border-white/12 px-3 py-2 ${NIGHT}`}>
                  <span className="font-semibold text-text-2 tabular">Q{r.round + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
                  <span className="font-display font-extrabold tabular">{seconds(r.responseMs)}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
