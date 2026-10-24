import type { CSSProperties } from 'react';
import { Eye, Flame, Wind } from 'lucide-react';
import type { Answer, AnswerReveal, RoomPlayerView } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { TimerBar } from '../game/TimerBar.tsx';
import { ChoicesDisplay, ResultBanner, RevealAnswer, shortAnswer } from '../game/Reveal.tsx';
import { TeamScores } from '../game/Leaderboard.tsx';
import { Explanation, HudCount, HudScore, IntroScreen, RoundHeader, myAvatar } from '../game/parts.tsx';
import { useAnnounce } from '../game/announce.tsx';
import { NIGHT, Pill, PlayerGlim, StagePanel, avatarOf } from '../game/stage.tsx';

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
  /** `joinedLate`: this player arrived after the open question began, so it does not count for them. */
  you: { eligible: boolean; answered: boolean; correct: boolean | null; points: number | null; partial: number | null; streak: number; joinedLate?: boolean } | null;
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
  /** `kindled` and `slow` (names) are only filled by the kindling and slowest-flame rules. */
  last: { blown: number; out: string[]; relit: string[]; kindled?: string[]; slow?: string[] } | null;
  teams: { teamId: string; name: string; hue: number; score: number; members: number }[] | null;
  /** `slow` (right but slowest, so a lantern went out) and `kindled` (a streak relit one) come from the rule options. */
  you: { lanterns: number; out: boolean; outAt: number | null; points: number; lost: boolean; knockedOut: boolean; relit: boolean; slow?: boolean; kindled?: boolean } | null;
}

const lanternWord = (n: number) => `${n} ${n === 1 ? 'lantern' : 'lanterns'}`;

/** One lantern, a life: lit (solid gold with a flame) or blown out (hollow, with a wisp of smoke), so its state never relies on colour. */
function LanternIcon({ lit, size = 28 }: { lit: boolean; size?: number }) {
  const line = lit ? 'var(--lantern-deep)' : 'rgb(255 255 255 / 0.5)';
  const fill = lit ? 'var(--lantern)' : 'transparent';
  return (
    <svg viewBox="0 0 32 40" width={size} height={(size * 40) / 32} aria-hidden focusable={false}>
      <path d="M16 1.5V6" stroke={line} strokeWidth="2.4" strokeLinecap="round" />
      <rect x="10" y="5" width="12" height="5" rx="1.5" fill={lit ? 'var(--lantern-deep)' : 'transparent'} stroke={line} strokeWidth="2" />
      <path d="M6.5 15C6.5 11.2 10.8 9.5 16 9.5C21.2 9.5 25.5 11.2 25.5 15V28C25.5 31.8 21.2 33.5 16 33.5C10.8 33.5 6.5 31.8 6.5 28Z" fill={fill} stroke={line} strokeWidth="2" />
      {lit ? (
        <path d="M16 14.5C17.6 17.6 20.2 19.3 20.2 23C20.2 26.2 18.3 28.4 16 28.4C13.7 28.4 11.8 26.4 11.8 23.7C11.8 21.2 13.6 20 14.3 18C14.9 19.6 15.4 20.2 16.1 20.7C15.6 18.7 15.5 16.8 16 14.5Z" fill="#fff6c8" />
      ) : (
        <path d="M15 27C13 24.5 17.5 22.5 15.5 19.5C14.5 18 16 16.5 17 15.5" stroke="rgb(255 255 255 / 0.7)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      )}
      <rect x="11" y="32.5" width="10" height="4.5" rx="1.5" fill={lit ? 'var(--lantern-deep)' : 'transparent'} stroke={line} strokeWidth="2" />
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

/** The rules in play, in the order they matter: lives, revival, then any rule a variant or the host switched on. */
function rulesText(view: LanternOutView, room: ModeScreenProps['room']): string {
  const st = room.room.settings;
  const parts = [`Everyone has ${lanternWord(view.lives)}. A wrong or missed answer blows one out.`];
  parts.push(view.reviveEvery > 0 ? `Every ${view.reviveEvery} questions, players who are out get a chance to relight one.` : 'Once you are out, you stay out.');
  if (st.kindling === true) parts.push('Three right answers in a row relight one of your lanterns.');
  if (st.slowest === true) parts.push('When two or more players are right, the slowest of them loses a lantern too.');
  if (st.lastTeam === true && view.teams) parts.push('The last team with a lantern lit wins.');
  if (st.vigil === true) parts.push('You play together: the room wins if at least half of you still have a lantern lit at the end.');
  parts.push(`${view.sync.total} questions.`);
  return parts.join(' ');
}

/** A long set of rules steps down a size on the projector, so the countdown and the line-up stay on screen. */
function RulesText({ text, big }: { text: string; big: boolean }) {
  return big && text.length > 150 ? <span className="text-[0.85em]">{text}</span> : <>{text}</>;
}

function Intro({ view, gameNow, room, big = false }: { view: LanternOutView; gameNow: () => number; room: ModeScreenProps['room']; big?: boolean }) {
  return (
    <IntroScreen kicker="Get ready" title={room.room.title} until={view.sync.phaseEndsAt} gameNow={gameNow} room={room} big={big} art={<LanternRow lit={view.lives} total={view.lives} size={big ? 64 : 44} showCount={false} />}>
      <RulesText text={rulesText(view, room)} big={big} />
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
    <div role="status" className={`lift flex items-center gap-3 rounded-[var(--radius-l)] bg-dusk text-on-accent ${big ? 'px-4 py-[clamp(0.4rem,1.2vh,0.75rem)] text-[clamp(1.05rem,min(1.5vw,2.7vh),1.75rem)]' : 'px-4 py-3'}`} style={{ animation: 'pop-in 200ms var(--ease-out)' }}>
      <Flame className={big ? 'size-[clamp(1.75rem,min(2.6vw,4.6vh),3rem)] shrink-0' : 'size-7 shrink-0'} aria-hidden />
      {big ? (
        <p className="font-semibold">
          <span className="mr-2 font-display text-[1.4em] font-extrabold">Revival round.</span>
          {text}
        </p>
      ) : (
        <div>
          <p className="font-display text-2xl leading-tight font-extrabold">Revival round</p>
          <p className="font-semibold">{text}</p>
        </div>
      )}
    </div>
  );
}

/** A lantern blowing out (or coming back), with the lanterns drawn as well as written. */
function LanternNews({ tone, title, detail, lit, total }: { tone: 'bad' | 'good'; title: string; detail: string; lit: number; total: number }) {
  return (
    <div role="status" className={`lift flex flex-wrap items-center gap-3 rounded-[var(--radius-l)] px-4 py-3 text-on-accent ${tone === 'good' ? 'bg-glim' : 'bg-ember'}`} style={{ animation: 'pop-in 200ms var(--ease-out)' }}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink/85 text-white" aria-hidden>
        {tone === 'good' ? <Flame className="size-6" /> : <Wind className="size-6" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[1.75rem] leading-tight font-extrabold italic">{title}</p>
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
  // The slowest right answer can cost a lantern; three in a row can relight one.
  const slow = Boolean(you.slow);
  const kindled = Boolean(you.kindled);
  if (you.relit) return <LanternNews tone="good" title="Lantern relit" detail="You are back in the game." lit={you.lanterns} total={view.lives} />;
  if (kindled) return <LanternNews tone="good" title="Three in a row" detail={`Your streak relit a lantern. ${lanternWord(you.lanterns)} lit.`} lit={you.lanterns} total={view.lives} />;
  if (you.knockedOut) {
    const later = view.reviveEvery > 0 && view.nextRevival !== null ? 'Watch for now: a revival round can bring you back.' : 'You can keep watching to the end.';
    return <LanternNews tone="bad" title="Your last lantern went out" detail={slow ? `Right, but the slowest answer. ${later}` : later} lit={0} total={view.lives} />;
  }
  if (you.lost) {
    const left = `${lanternWord(you.lanterns)} left.`;
    return <LanternNews tone="bad" title={slow ? 'Right, but slowest' : 'A lantern blew out'} detail={slow ? `The slowest right answer loses a lantern. ${left}` : left} lit={you.lanterns} total={view.lives} />;
  }
  if (s.you?.eligible && s.you.answered) return <ResultBanner correct={s.you.correct ?? false} points={s.you.points} answer={s.question && s.reveal ? shortAnswer(s.question.q, s.reveal) : null} />;
  return null;
}

const LATE = 'You joined during this question, so it does not count. You play from the next one.';

function JoinedLate() {
  useAnnounce(LATE, 'late');
  return <StagePanel className="px-4 py-3 font-semibold text-text">{LATE}</StagePanel>;
}

function RoundSummary({ view, big = false }: { view: LanternOutView; big?: boolean }) {
  const last = view.last;
  if (!last) return null;
  const parts: string[] = [];
  if (view.revival) parts.push(last.relit.length ? `Relit: ${last.relit.join(', ')}.` : 'Nobody relit a lantern.');
  else {
    parts.push(last.blown ? `${lanternWord(last.blown)} blew out.` : 'Every lantern survived that one.');
    if (last.slow?.length) parts.push(`Right but slowest: ${last.slow.join(', ')}.`);
    if (last.out.length) parts.push(`Out: ${last.out.join(', ')}.`);
    if (last.kindled?.length) parts.push(`Three in a row relit a lantern for ${last.kindled.join(', ')}.`);
  }
  return <StagePanel className={`font-semibold ${big ? 'px-4 py-[clamp(0.5rem,1.4vh,1rem)] text-[clamp(1rem,min(1.4vw,2.5vh),1.6rem)]' : 'px-4 py-3'}`}>{parts.join(' ')}</StagePanel>;
}

/** Rows a projector side panel shows before counting the rest. */
const SIDE_ROWS = 10;
/** The standings wall: two columns, three past 24 players, and at most twelve rows a column. */
const wallColumns = (n: number) => (n > 24 ? 3 : 2);
const WALL_ROWS = 12;

/** `wall` is the whole projector screen (columns), `side` a projector side panel, `phone` the player's screen. */
function Roster({ view, players, meId = null, size = 'phone', sideRows = SIDE_ROWS }: { view: LanternOutView; players: RoomPlayerView[]; meId?: string | null; size?: 'phone' | 'side' | 'wall'; sideRows?: number }) {
  const big = size !== 'phone';
  const all = view.roster;
  const cols = size === 'wall' ? wallColumns(all.length) : 1;
  const cap = size === 'side' ? sideRows : size === 'wall' ? cols * WALL_ROWS : all.length;
  // Showing every row but one would waste the line that counts them.
  const shown = all.length > cap ? all.slice(0, cap - 1) : all;
  const rest = all.slice(shown.length);
  const rows = Math.ceil(shown.length / cols);
  const glim = size === 'wall' ? 'size-[clamp(1.75rem,calc((76dvh-6rem)/var(--rows)-1rem),3.75rem)]' : size === 'side' ? 'size-[clamp(2rem,4.2vh,3.25rem)]' : 'size-11';
  return (
    <div className="flex flex-col gap-1.5">
      <ul
        className={`grid gap-1.5 ${size === 'wall' ? 'grid-flow-col gap-x-[clamp(0.75rem,1.4vw,1.25rem)] text-[clamp(1.05rem,min(1.6vw,2.8vh),1.75rem)]' : size === 'side' ? 'grid-cols-1 text-[clamp(1rem,min(1.3vw,2.4vh),1.4rem)]' : 'grid-cols-1'}`}
        style={size === 'wall' ? ({ '--rows': rows, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, auto)` } as CSSProperties) : undefined}
        aria-label="Lanterns"
      >
        {shown.map((r) => {
          const out = r.lanterns <= 0;
          const mine = r.playerId === meId;
          return (
            <li key={r.playerId} className={`flex min-w-0 items-center gap-3 rounded-[var(--radius-m)] px-2.5 ${big ? 'py-1' : 'py-1.5'} ${mine ? 'bg-lantern/[0.14] ring-2 ring-lantern ring-inset' : NIGHT}`}>
              <PlayerGlim avatar={avatarOf(players, r.playerId)} seed={r.playerId} size={44} className={`${glim} shrink-0 ${out ? 'opacity-60 grayscale' : ''}`} />
              <span className="min-w-0 flex-1 truncate font-bold">
                {r.name}
                {mine ? <span className="sr-only"> (you)</span> : null}
              </span>
              {out ? (
                <Pill className="px-2! py-0.5! text-xs">
                  <Wind className="size-3.5" aria-hidden /> Out
                </Pill>
              ) : null}
              <LanternRow lit={r.lanterns} total={view.lives} size={big ? 22 : 18} />
            </li>
          );
        })}
      </ul>
      {rest.length ? (
        <p className={`font-semibold text-text-2 ${size === 'wall' ? 'text-[clamp(1rem,min(1.5vw,2.6vh),1.6rem)]' : 'text-[clamp(1rem,min(1.3vw,2.4vh),1.4rem)]'}`}>
          And {rest.length} more: {rest.filter((r) => r.lanterns > 0).length} still lit, {rest.filter((r) => r.lanterns <= 0).length} out.
        </p>
      ) : null}
    </div>
  );
}

export function LanternOutPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<LanternOutView>) {
  const s = view.sync;
  const you = view.you;
  if (s.phase === 'intro') return <Intro view={view} gameNow={gameNow} room={room} />;
  if (s.phase === 'leaderboard' || s.phase === 'done') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <h2 className="font-display text-[2.25rem] font-bold">Lanterns</h2>
        {view.teams ? <TeamScores teams={view.teams} /> : null}
        <Roster view={view} players={room.players} meId={room.me.playerId} />
      </div>
    );
  }
  const q = s.question;
  if (!q) return null;
  const submit = async (answer: Answer) => (await act({ type: 'answer', iid: q.iid, answer })).ok;
  const canAnswer = Boolean(s.you?.eligible);
  // Arrived after this question began and did not answer it: it does not count, so no result for it.
  const late = Boolean(s.you?.joinedLate && !s.you.answered);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-4">
      <RoundHeader round={s.round} total={s.total}>
        <Pill>
          <Flame className="size-4 text-lantern" aria-hidden /> <span className="font-display text-[1.25em] font-extrabold">{view.alive}</span> still lit
        </Pill>
      </RoundHeader>
      {you ? (
        <StagePanel className="flex items-center justify-between gap-3 px-3 py-1.5 sm:px-4 sm:py-2.5">
          <LanternRow lit={you.lanterns} total={view.lives} size={22} />
          <HudScore value={you.points} />
        </StagePanel>
      ) : null}
      <RevivalBanner view={view} />
      {you?.out && !view.revival && !(s.phase === 'reveal' && you.knockedOut) ? (
        <StagePanel className="flex items-center gap-3 px-4 py-3">
          <Eye className="size-7 shrink-0 text-text-2" aria-hidden />
          <div role="status">
            <p className="font-display text-2xl leading-tight font-extrabold">Your lanterns are out</p>
            <p className="font-semibold text-text-2">You are watching for now. {revivalText(view)}</p>
          </div>
        </StagePanel>
      ) : null}
      {s.phase === 'question' ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} tone={view.revival ? 'violet' : 'amber'} /> : null}
      <QuestionCard q={q.q} />
      {s.phase === 'question' ? (
        canAnswer ? (
          s.you?.answered ? (
            <StagePanel className="flex items-center gap-4 px-4 py-3.5">
              <PlayerGlim avatar={myAvatar(room)} seed={room.me.playerId ?? 'you'} size={72} className="shrink-0" />
              <div role="status">
                <p className="font-display text-[1.75rem] leading-tight font-extrabold">Answer locked in</p>
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
          {late ? <JoinedLate /> : <Outcome view={view} />}
          {canAnswer && !s.you?.answered && !late ? <p className="font-semibold text-text-2">You did not answer.</p> : null}
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
      <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
        <h2 className="font-display text-[clamp(2.75rem,min(5vw,8.5vh),6rem)] leading-none font-extrabold">Lanterns</h2>
        <Roster view={view} players={room.players} size="wall" />
      </div>
    );
  }
  const q = s.question;
  if (!q) return null;
  // At the reveal, why the answer is right and what happened to the lanterns sit in the side panel, so the answer fits the left column.
  const summary = s.phase === 'reveal' && view.last;
  const pill = 'px-4 py-1.5 text-[clamp(1rem,min(1.5vw,2.8vh),1.75rem)]';
  return (
    // The question takes two thirds of the width, so long prompts wrap less and the reveal fits a 768-pixel projector.
    <div className="mx-auto grid w-full max-w-[110rem] flex-1 grid-cols-1 gap-[clamp(1rem,2vw,2rem)] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-[clamp(0.6rem,1.4vh,1.25rem)]">
        <RoundHeader round={s.round} total={s.total} big>
          <Pill tone="lantern" className={pill}>
            <Flame className="size-[0.9em]" aria-hidden /> <span className="font-display text-[1.25em] font-extrabold">{view.alive}</span> still lit
          </Pill>
          <Pill className={pill}>
            <Wind className="size-[0.9em]" aria-hidden /> <span className="font-display text-[1.25em] font-extrabold">{view.out}</span> out
          </Pill>
          <HudCount value={s.answered} total={s.eligible} label="answered" big className="text-[clamp(1rem,min(1.5vw,2.8vh),1.75rem)]" />
        </RoundHeader>
        <RevivalBanner view={view} big />
        {s.phase === 'question' ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} tone={view.revival ? 'violet' : 'amber'} size="lg" /> : null}
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
      <aside className="flex min-w-0 flex-col gap-[clamp(0.5rem,1.4vh,0.75rem)]">
        <h3 className="font-display text-[clamp(1.75rem,min(2.7vw,4.6vh),3rem)] leading-tight font-bold">Lanterns</h3>
        {s.phase === 'reveal' && s.explanation ? <StagePanel className="px-4 py-[clamp(0.4rem,1.2vh,0.75rem)] text-[clamp(1rem,min(1.3vw,2.4vh),1.4rem)] font-semibold text-text max-lg:hidden">{s.explanation}</StagePanel> : null}
        {summary ? <RoundSummary view={view} big /> : null}
        {view.teams ? <TeamScores teams={view.teams} /> : null}
        <p className="text-[clamp(1rem,min(1.3vw,2.4vh),1.4rem)] font-semibold text-text-2">{revivalText(view)}</p>
        <Roster view={view} players={room.players} size="side" sideRows={view.teams ? 5 : s.phase === 'reveal' ? 6 : SIDE_ROWS} />
      </aside>
    </div>
  );
}
