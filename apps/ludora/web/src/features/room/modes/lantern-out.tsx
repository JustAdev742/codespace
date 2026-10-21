import { Eye, Flame, Sparkles, Wind } from 'lucide-react';
import type { Answer, AnswerReveal, RoomPlayerView } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { TimerBar } from '../game/TimerBar.tsx';
import { ChoicesDisplay, ResultBanner, RevealAnswer } from '../game/Reveal.tsx';
import { TeamScores } from '../game/Leaderboard.tsx';
import { Explanation, IntroScreen, RoundHeader, myAvatar } from '../game/parts.tsx';
import { NIGHT, Pill, PlayerGlim, SIGN, StagePanel, avatarOf } from '../game/stage.tsx';
import { formatNumber } from '../../../lib/format.ts';

/* Lantern Out: survival with lanterns as lives, and revival rounds for players who are out. */

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

interface RosterRow {
  playerId: string;
  name: string;
  teamId: string | null;
  lanterns: number;
  outAt: number | null;
  points: number;
}

export interface LanternOutView {
  sync: SyncView;
  lives: number;
  reviveEvery: number;
  /** The open (or just revealed) question is a revival round. */
  revival: boolean;
  /** 1-based number of the next question due to be a revival round, or null. */
  nextRevival: number | null;
  alive: number;
  out: number;
  roster: RosterRow[];
  last: { blown: number; out: string[]; relit: string[] } | null;
  teams: { teamId: string; name: string; hue: number; score: number; members: number }[] | null;
  you: { lanterns: number; out: boolean; outAt: number | null; points: number; lost: boolean; knockedOut: boolean; relit: boolean } | null;
}

const lanternWord = (n: number) => `${n} ${n === 1 ? 'lantern' : 'lanterns'}`;

/** One lantern: lit (amber, with a flame) or blown out (dark, with a wisp of smoke). */
function LanternIcon({ lit, size = 28 }: { lit: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 32 40" width={size} height={(size * 40) / 32} aria-hidden focusable={false} style={lit ? { filter: 'drop-shadow(0 0 6px rgb(255 176 32 / 0.65))' } : undefined}>
      <path d="M16 1.5V6" stroke={lit ? 'var(--ink)' : 'rgb(255 255 255 / 0.45)'} strokeWidth="2.4" strokeLinecap="round" />
      <rect x="10" y="5" width="12" height="5" rx="2" fill={lit ? 'var(--lantern-deep)' : 'rgb(255 255 255 / 0.12)'} stroke={lit ? 'var(--ink)' : 'rgb(255 255 255 / 0.45)'} strokeWidth="2" />
      <path d="M6.5 15C6.5 11.2 10.8 9.5 16 9.5C21.2 9.5 25.5 11.2 25.5 15V28C25.5 31.8 21.2 33.5 16 33.5C10.8 33.5 6.5 31.8 6.5 28Z" fill={lit ? 'var(--lantern)' : 'rgb(255 255 255 / 0.12)'} stroke={lit ? 'var(--ink)' : 'rgb(255 255 255 / 0.45)'} strokeWidth="2" />
      {lit ? (
        <path d="M16 14.5C17.6 17.6 20.2 19.3 20.2 23C20.2 26.2 18.3 28.4 16 28.4C13.7 28.4 11.8 26.4 11.8 23.7C11.8 21.2 13.6 20 14.3 18C14.9 19.6 15.4 20.2 16.1 20.7C15.6 18.7 15.5 16.8 16 14.5Z" fill="#fff6c8" />
      ) : (
        <path d="M15 27C13 24.5 17.5 22.5 15.5 19.5C14.5 18 16 16.5 17 15.5" stroke="rgb(255 255 255 / 0.7)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      )}
      <rect x="11" y="32.5" width="10" height="4.5" rx="1.6" fill={lit ? 'var(--lantern-deep)' : 'rgb(255 255 255 / 0.12)'} stroke={lit ? 'var(--ink)' : 'rgb(255 255 255 / 0.45)'} strokeWidth="2" />
    </svg>
  );
}

function LanternRow({ lit, total, size = 28, showCount = true }: { lit: number; total: number; size?: number; showCount?: boolean }) {
  const count = Math.max(total, lit);
  return (
    <span className="inline-flex items-center gap-1.5" role="img" aria-label={`${lit} of ${count} lanterns lit`}>
      {Array.from({ length: count }, (_, i) => (
        <LanternIcon key={i} lit={i < lit} size={size} />
      ))}
      {showCount ? (
        <span className="ml-1 font-display font-extrabold tabular" aria-hidden>
          {lit}/{count}
        </span>
      ) : null}
    </span>
  );
}

function revivalText(view: LanternOutView): string {
  if (view.reviveEvery <= 0) return 'There are no revival rounds in this game.';
  if (view.nextRevival === null) return 'There are no revival rounds left.';
  return `Next revival round: question ${view.nextRevival}.`;
}

function Intro({ view, gameNow, room, big = false }: { view: LanternOutView; gameNow: () => number; room: ModeScreenProps['room']; big?: boolean }) {
  return (
    <IntroScreen title="Lantern Out" until={view.sync.phaseEndsAt} gameNow={gameNow} room={room} big={big} art={<LanternRow lit={view.lives} total={view.lives} size={big ? 64 : 44} showCount={false} />}>
      Everyone has {lanternWord(view.lives)}. A wrong or missed answer blows one out.
      {view.reviveEvery > 0 ? ` Every ${view.reviveEvery} questions, players who are out get a chance to relight one.` : ' Once you are out, you stay out.'} {view.sync.total} questions.
    </IntroScreen>
  );
}

function RevivalBanner({ view, big = false }: { view: LanternOutView; big?: boolean }) {
  // Instructions for the open question; at the reveal, the round summary says who relit a lantern.
  if (!view.revival || view.sync.phase !== 'question') return null;
  const mine = view.you;
  const text = !mine
    ? 'Only players who are out can answer. A correct answer relights one lantern.'
    : mine.out
      ? 'Your chance to get back in: answer correctly to relight a lantern.'
      : 'Players who are out are trying to get back in. Sit this one out; your lanterns are safe.';
  return (
    <div role="status" className={`flex items-center gap-3 rounded-[22px] border-[3px] border-ink bg-dusk px-4 py-3 text-on-accent shadow-[0_4px_0_var(--ink)] ${big ? 'text-[clamp(1.1rem,1.6vw,1.75rem)]' : ''}`} style={{ animation: 'pop-in 260ms var(--ease-spring)' }}>
      <Sparkles className={big ? 'size-[clamp(2rem,3vw,3rem)] shrink-0' : 'size-7 shrink-0'} aria-hidden />
      <div>
        <p className={`font-display font-extrabold ${big ? 'text-[clamp(1.6rem,2.6vw,3rem)]' : 'text-xl'}`}>Revival round</p>
        <p className="font-semibold">{text}</p>
      </div>
    </div>
  );
}

/** A lantern blowing out (or coming back), with the lanterns drawn as well as written. */
function LanternNews({ tone, title, detail, lit, total }: { tone: 'bad' | 'good'; title: string; detail: string; lit: number; total: number }) {
  return (
    <div role="status" className={`flex flex-wrap items-center gap-3 rounded-[22px] border-[3px] border-ink px-4 py-3 text-on-accent shadow-[0_5px_0_var(--ink)] ${tone === 'good' ? 'bg-glim' : 'bg-ember'}`} style={{ animation: 'pop-in 220ms var(--ease-spring)' }}>
      {tone === 'good' ? <Sparkles className="size-8 shrink-0" aria-hidden /> : <Wind className="size-8 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className="font-display text-2xl leading-tight font-extrabold">{title}</p>
        <p className="font-semibold">{detail}</p>
      </div>
      <span className="rounded-full bg-ink/80 px-2 py-1">
        <LanternRow lit={lit} total={total} size={20} showCount={false} />
      </span>
    </div>
  );
}

function Outcome({ view }: { view: LanternOutView }) {
  const you = view.you;
  const s = view.sync;
  if (!you) return null;
  if (you.relit) return <LanternNews tone="good" title="Lantern relit!" detail="You are back in the game." lit={you.lanterns} total={view.lives} />;
  if (you.knockedOut) {
    const later = view.reviveEvery > 0 && view.nextRevival !== null ? 'Watch for now: a revival round can bring you back.' : 'You can keep watching to the end.';
    return <LanternNews tone="bad" title="Your last lantern went out" detail={later} lit={0} total={view.lives} />;
  }
  if (you.lost) return <LanternNews tone="bad" title="A lantern blew out" detail={`${lanternWord(you.lanterns)} left.`} lit={you.lanterns} total={view.lives} />;
  if (s.you?.eligible && s.you.answered) return <ResultBanner correct={s.you.correct ?? false} points={s.you.points} />;
  return null;
}

function RoundSummary({ view, big = false }: { view: LanternOutView; big?: boolean }) {
  const last = view.last;
  if (!last) return null;
  const parts: string[] = [];
  if (view.revival) parts.push(last.relit.length ? `Relit: ${last.relit.join(', ')}.` : 'Nobody relit a lantern.');
  else {
    parts.push(last.blown ? `${lanternWord(last.blown)} blew out.` : 'Every lantern survived that one.');
    if (last.out.length) parts.push(`Out: ${last.out.join(', ')}.`);
  }
  return <StagePanel className={`font-semibold ${big ? 'px-6 py-4 text-[clamp(1.1rem,1.7vw,1.9rem)]' : 'px-4 py-3'}`}>{parts.join(' ')}</StagePanel>;
}

/** `wall` is the whole projector screen (two columns), `side` a projector side panel, `phone` the player's screen. */
function Roster({ view, players, meId = null, size = 'phone' }: { view: LanternOutView; players: RoomPlayerView[]; meId?: string | null; size?: 'phone' | 'side' | 'wall' }) {
  const big = size !== 'phone';
  return (
    <ul className={`grid gap-1.5 ${size === 'wall' ? 'grid-cols-1 text-[clamp(1.05rem,1.6vw,1.75rem)] sm:grid-cols-2' : size === 'side' ? 'grid-cols-1 text-[clamp(1rem,1.3vw,1.4rem)]' : 'grid-cols-1'}`} aria-label="Lanterns">
      {view.roster.map((r) => {
        const out = r.lanterns <= 0;
        const mine = r.playerId === meId;
        return (
          <li key={r.playerId} className={`flex items-center gap-3 rounded-[18px] border px-2.5 py-1.5 ${NIGHT} ${mine ? 'border-lantern ring-2 ring-lantern' : 'border-white/12'}`}>
            <PlayerGlim avatar={avatarOf(players, r.playerId)} seed={r.playerId} size={44} className={`${big ? 'size-[clamp(2.5rem,5vh,3.75rem)]' : 'size-11'} shrink-0 ${out ? 'opacity-60 grayscale' : ''}`} />
            <span className="min-w-0 flex-1 truncate font-bold">
              {r.name}
              {mine ? <span className="sr-only"> (you)</span> : null}
            </span>
            {out ? (
              <Pill className="px-2 py-0.5 text-xs">
                <Wind className="size-3.5" aria-hidden /> Out
              </Pill>
            ) : null}
            <LanternRow lit={r.lanterns} total={view.lives} size={big ? 24 : 18} />
          </li>
        );
      })}
    </ul>
  );
}

export function LanternOutPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<LanternOutView>) {
  const s = view.sync;
  const you = view.you;
  if (s.phase === 'intro') return <Intro view={view} gameNow={gameNow} room={room} />;
  if (s.phase === 'leaderboard' || s.phase === 'done') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <h2 className={`font-display text-3xl font-extrabold ${SIGN}`}>Lanterns</h2>
        {view.teams ? <TeamScores teams={view.teams} /> : null}
        <Roster view={view} players={room.players} meId={room.me.playerId} />
      </div>
    );
  }
  const q = s.question;
  if (!q) return null;
  const submit = async (answer: Answer) => (await act({ type: 'answer', iid: q.iid, answer })).ok;
  const canAnswer = Boolean(s.you?.eligible);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <RoundHeader round={s.round} total={s.total}>
        <Pill>
          <Flame className="size-4 text-lantern" aria-hidden /> {view.alive} still lit
        </Pill>
      </RoundHeader>
      {you ? (
        <StagePanel className="flex items-center justify-between gap-3 px-4 py-2.5">
          <LanternRow lit={you.lanterns} total={view.lives} />
          <span className="font-display text-lg font-extrabold tabular">{formatNumber(you.points)} pts</span>
        </StagePanel>
      ) : null}
      <RevivalBanner view={view} />
      {you?.out && !view.revival && !(s.phase === 'reveal' && you.knockedOut) ? (
        <StagePanel className="flex items-center gap-3 border-2 border-dashed border-white/30 px-4 py-3">
          <Eye className="size-7 shrink-0 text-text-2" aria-hidden />
          <div role="status">
            <p className="font-display text-xl font-extrabold">Your lanterns are out</p>
            <p className="font-semibold text-text-2">You are watching for now. {revivalText(view)}</p>
          </div>
        </StagePanel>
      ) : null}
      {s.phase === 'question' ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} tone={view.revival ? 'violet' : 'amber'} /> : null}
      <QuestionCard q={q.q} />
      {s.phase === 'question' ? (
        canAnswer ? (
          s.you?.answered ? (
            <StagePanel className="flex items-center gap-4 px-4 py-4">
              <PlayerGlim avatar={myAvatar(room)} seed={room.me.playerId ?? 'you'} size={72} bob className="shrink-0" />
              <div role="status">
                <p className="font-display text-2xl font-extrabold">Answer locked in</p>
                <p className="font-semibold text-text-2">
                  {s.answered} of {s.eligible} have answered.
                </p>
              </div>
            </StagePanel>
          ) : (
            <AnswerInput key={q.iid} q={q.q} onSubmit={submit} disabled={paused} />
          )
        ) : (
          <div className="pointer-events-none opacity-60">
            <ChoicesDisplay q={q.q} size="sm" />
          </div>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <Outcome view={view} />
          {canAnswer && !s.you?.answered ? <p className="font-semibold text-text-2">No answer this time.</p> : null}
          {s.reveal ? <RevealAnswer q={q.q} reveal={s.reveal} compact /> : null}
          <Explanation text={s.explanation} />
          <RoundSummary view={view} />
        </div>
      )}
      {view.teams ? (
        <div className="flex flex-col gap-2">
          <TeamScores teams={view.teams} />
          <p className="text-sm font-semibold text-text-2">Each bar is the share of that team's lanterns still lit.</p>
        </div>
      ) : null}
    </div>
  );
}

export function LanternOutHost({ view, gameNow, paused, room }: ModeScreenProps<LanternOutView>) {
  const s = view.sync;
  if (s.phase === 'intro') return <Intro view={view} gameNow={gameNow} room={room} big />;
  if (s.phase === 'leaderboard' || s.phase === 'done') {
    return (
      <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
        <h2 className={`font-display text-[clamp(2.5rem,4.6vw,5.5rem)] leading-none font-extrabold ${SIGN}`}>Lanterns</h2>
        <Roster view={view} players={room.players} size="wall" />
      </div>
    );
  }
  const q = s.question;
  if (!q) return null;
  return (
    <div className="mx-auto grid w-full max-w-[110rem] flex-1 grid-cols-1 gap-[clamp(1rem,2vw,2rem)] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-[clamp(0.75rem,2vh,1.25rem)]">
        <RoundHeader round={s.round} total={s.total} big>
          <Pill tone="lantern" className="px-4 py-1.5">
            <Flame className="size-[0.9em]" aria-hidden /> {view.alive} still lit
          </Pill>
          <Pill className="px-4 py-1.5">
            <Wind className="size-[0.9em]" aria-hidden /> {view.out} out
          </Pill>
          <span aria-live="polite">
            <Pill className="px-4 py-1.5">
              {s.answered} of {s.eligible} answered
            </Pill>
          </span>
        </RoundHeader>
        <RevivalBanner view={view} big />
        {s.phase === 'question' ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} tone={view.revival ? 'violet' : 'amber'} size="lg" /> : null}
        <QuestionCard q={q.q} size="lg" />
        {s.phase === 'question' ? (
          <ChoicesDisplay q={q.q} />
        ) : s.reveal ? (
          <div className="flex flex-col gap-[clamp(0.75rem,2vh,1.25rem)]">
            <RevealAnswer q={q.q} reveal={s.reveal} distribution={s.distribution} size="lg" />
            <Explanation text={s.explanation} big />
            <RoundSummary view={view} big />
          </div>
        ) : null}
      </div>
      <aside className="flex min-w-0 flex-col gap-3">
        <h3 className={`font-display text-[clamp(1.5rem,2.4vw,2.75rem)] font-extrabold ${SIGN}`}>Lanterns</h3>
        {view.teams ? <TeamScores teams={view.teams} /> : null}
        <p className="text-[clamp(1rem,1.3vw,1.4rem)] font-semibold text-text-2">{revivalText(view)}</p>
        <Roster view={view} players={room.players} size="side" />
      </aside>
    </div>
  );
}
