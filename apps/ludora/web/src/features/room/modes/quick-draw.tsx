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
import { useAnnounce } from '../game/announce.tsx';

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
  /** `joinedLate`: this player arrived after the open question began, so it does not count for them. */
  you: { eligible: boolean; answered: boolean; correct: boolean | null; points: number | null; partial: number | null; streak: number; joinedLate?: boolean } | null;
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

/** The rules in play: the buzzer, then each rule a variant (or the host) switched on. */
function rulesText(view: QuickDrawView, room: ModeScreenProps['room']): string {
  const teamTry = room.room.settings.teamTry === true && room.room.teams.length > 0;
  const parts = ['The first right answer takes each round.'];
  parts.push(teamTry ? 'Each team gets one try per question: if anyone on your team answers wrong, the whole team is locked out until the next one.' : 'You get one try per question, so make it count.');
  if (view.penalty) parts.push('A wrong answer also costs a point.');
  if (view.target > 0) parts.push(`First to ${points(view.target)} wins.`);
  parts.push(`${view.sync.total} questions.`);
  return parts.join(' ');
}

/** A long set of rules steps down a size on the projector, so the countdown and the line-up stay on screen. */
function RulesText({ text, big }: { text: string; big: boolean }) {
  return big && text.length > 150 ? <span className="text-[0.85em]">{text}</span> : <>{text}</>;
}

function Intro({ view, gameNow, room, big = false }: { view: QuickDrawView; gameNow: () => number; room: ModeScreenProps['room']; big?: boolean }) {
  return (
    <IntroScreen title={room.room.title} until={view.sync.phaseEndsAt} gameNow={gameNow} room={room} big={big} art={<Zap className={`${big ? 'size-[clamp(4rem,10vh,6.5rem)]' : 'size-14'} fill-lantern text-ink`} aria-hidden />}>
      <RulesText text={rulesText(view, room)} big={big} />
    </IntroScreen>
  );
}

const LATE = 'You joined during this question, so it does not count. You play from the next one.';

function JoinedLate() {
  useAnnounce(LATE, 'late');
  return <StagePanel className="px-4 py-3 font-semibold text-text">{LATE}</StagePanel>;
}

/** The big "who was first" moment. `side` is the projector's side panel. */
function FirstIn({ winner, players, you, side = false }: { winner: Buzz | null; players: RoomPlayerView[]; you?: QuickDrawView['you']; side?: boolean }) {
  if (!winner) {
    return (
      <StagePanel className={`border-2 border-dashed border-white/30 text-center ${side ? 'px-5 py-[clamp(0.6rem,1.6vh,1.25rem)]' : 'px-5 py-4'}`}>
        <div role="status" style={{ animation: 'pop-in 260ms var(--ease-spring)' }}>
          <p className={`font-display font-extrabold ${side ? 'text-[clamp(1.75rem,min(3vw,5.4vh),3.5rem)]' : 'text-3xl'}`}>Nobody got it</p>
          <p className={`font-semibold text-text-2 ${side ? 'text-[clamp(1rem,min(1.4vw,2.5vh),1.6rem)]' : ''}`}>No point this round.</p>
        </div>
      </StagePanel>
    );
  }
  const mine = you?.won;
  return (
    <div
      role="status"
      className={`flex items-center rounded-[24px] border-[3px] border-ink text-on-accent shadow-[0_5px_0_var(--ink)] ${side ? 'gap-[clamp(0.75rem,1.4vw,1.25rem)] px-[clamp(0.75rem,1.4vw,1.25rem)] py-[clamp(0.4rem,1.2vh,0.75rem)]' : 'gap-4 px-4 py-3'} ${mine ? 'bg-glim' : 'bg-lantern'}`}
      style={{ animation: 'pop-in 320ms var(--ease-spring)' }}
    >
      <PlayerGlim avatar={avatarOf(players, winner.playerId)} seed={winner.playerId} size={side ? 110 : 76} aura="legendary" pose="cheer" bob className={side ? 'size-[clamp(3.25rem,9vh,6rem)] shrink-0' : 'shrink-0'} />
      <div className="min-w-0 flex-1">
        <p className={`font-display font-bold ${side ? 'text-[clamp(1rem,min(1.5vw,2.7vh),1.6rem)]' : 'text-lg'}`}>{mine ? 'You were first!' : 'First in'}</p>
        <p className={`truncate font-display leading-tight font-extrabold ${side ? 'text-[clamp(1.6rem,min(2.8vw,5vh),3.25rem)]' : 'text-4xl'}`}>{mine ? '+1 point' : winner.name}</p>
        <p className={side ? 'text-[clamp(1.05rem,min(1.6vw,2.8vh),1.75rem)]' : 'text-xl'}>
          <span className="flex items-center gap-2 font-display font-extrabold tabular">
            <Timer className="size-[1em]" aria-hidden />
            <span>
              <span className="sr-only">Answered in </span>
              {seconds(winner.responseMs)}
            </span>
          </span>
        </p>
      </div>
    </div>
  );
}

function Tally({ view, room, big = false, dense = false, limit }: { view: QuickDrawView; room: ModeScreenProps['room']; big?: boolean; dense?: boolean; limit?: number }) {
  // Gains belong to the round being revealed. Penalties show as their own line rather than as a "+" gain.
  const revealed = view.sync.phase === 'reveal';
  const gain = (r: LeaderRow) => ({ ...r, gain: revealed ? Math.max(0, r.gain ?? 0) : 0 });
  const rows = view.board.rows.slice(0, limit).map(gain);
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
  // Arrived after this question began and did not answer it: it does not count for them.
  const late = Boolean(s.you?.joinedLate && !s.you.answered);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-4">
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
          {late ? <JoinedLate /> : null}
          {you?.lostPoint ? <p className={`rounded-[14px] px-3 py-2 font-semibold text-ember ${NIGHT}`}>Your wrong answer cost a point.</p> : null}
          {s.reveal ? <RevealAnswer q={q.q} reveal={s.reveal} compact /> : null}
          <Explanation text={s.explanation} />
          <Tally view={view} room={room} />
        </div>
      )}
    </div>
  );
}

/** Rows of the tally that fit the projector's side panel beside a question. */
const SIDE_TALLY = 5;

export function QuickDrawHost({ view, gameNow, paused, room }: ModeScreenProps<QuickDrawView>) {
  const s = view.sync;
  if (s.phase === 'intro') return <Intro view={view} gameNow={gameNow} room={room} big />;
  if (s.phase === 'leaderboard' || s.phase === 'done') {
    return (
      <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
        <h2 className={`font-display text-[clamp(2.5rem,min(4.6vw,8vh),5.5rem)] leading-none font-extrabold ${SIGN}`}>Round wins</h2>
        <Tally view={view} room={room} big />
      </div>
    );
  }
  const q = s.question;
  if (!q) return null;
  const small = 'text-[clamp(1rem,min(1.3vw,2.4vh),1.4rem)]';
  const revealed = s.phase === 'reveal';
  const tallied = Math.min(view.board.rows.length, revealed ? SIDE_TALLY - 1 : SIDE_TALLY);
  return (
    // The question takes two thirds of the width, so long prompts wrap less and the reveal fits a 768-pixel projector.
    <div className="mx-auto grid w-full max-w-[110rem] flex-1 grid-cols-1 gap-[clamp(1rem,2vw,2rem)] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-[clamp(0.6rem,1.4vh,1.25rem)]">
        <RoundHeader round={s.round} total={s.total} big>
          <TargetBadge target={view.target} big />
          <Pill className="px-5 py-1.5">
            <Lock className="size-[0.9em]" aria-hidden /> {view.lockedOut} locked out
          </Pill>
        </RoundHeader>
        {s.phase === 'question' ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} size="lg" /> : null}
        <QuestionCard q={q.q} size="lg" />
        {s.phase === 'question' ? (
          <ChoicesDisplay q={q.q} />
        ) : s.reveal ? (
          <div className="flex flex-col gap-[clamp(0.6rem,1.4vh,1.25rem)]">
            <RevealAnswer q={q.q} reveal={s.reveal} distribution={s.distribution} size="lg" />
            <div className="lg:hidden">
              <Explanation text={s.explanation} big />
            </div>
          </div>
        ) : null}
      </div>
      {/* The side panel keeps to what fits a 768-pixel projector: who was first and why (at the reveal), the top of the tally, the fastest and the last few rounds. */}
      <aside className="flex min-w-0 flex-col gap-[clamp(0.5rem,1.4vh,0.75rem)]">
        <h3 className={`font-display text-[clamp(1.5rem,min(2.4vw,4.2vh),2.75rem)] leading-tight font-extrabold ${SIGN}`}>Tally</h3>
        {revealed ? <FirstIn winner={view.winner} players={room.players} side /> : null}
        {revealed && s.explanation ? (
          <StagePanel className={`px-4 py-[clamp(0.4rem,1.2vh,0.75rem)] font-semibold text-text max-lg:hidden ${small}`}>{s.explanation}</StagePanel>
        ) : null}
        <Tally view={view} room={room} big dense limit={revealed ? SIDE_TALLY - 1 : SIDE_TALLY} />
        {room.players.length > tallied ? <p className={`font-semibold text-text-2 ${small}`}>And {room.players.length - tallied} more {room.players.length - tallied === 1 ? 'player' : 'players'}.</p> : null}
        {view.fastest && !revealed ? (
          <StagePanel className={`px-4 py-[clamp(0.4rem,1.2vh,0.75rem)] font-semibold text-text-2 ${small}`}>
            Fastest so far: <span className="font-bold text-text">{view.fastest.name}</span>, {seconds(view.fastest.responseMs)}
          </StagePanel>
        ) : null}
        {view.recent.length && s.phase === 'question' && !view.teams ? (
          <div>
            <h4 className="mb-1.5 font-display text-[clamp(1.1rem,min(1.6vw,2.8vh),1.75rem)] font-extrabold">Recent rounds</h4>
            <ol className={`flex flex-col gap-1.5 ${small}`}>
              {view.recent.slice(0, 3).map((r) => (
                <li key={r.round} className={`flex items-center justify-between gap-3 rounded-[14px] border border-white/12 px-3 py-[clamp(0.25rem,0.9vh,0.5rem)] ${NIGHT}`}>
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
