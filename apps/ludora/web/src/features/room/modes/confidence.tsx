import { useEffect, useRef, useState } from 'react';
import { Check, Scale, X } from 'lucide-react';
import type { Answer, AnswerReveal, Media } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard, QuestionImage } from '../game/QuestionCard.tsx';
import { TimerBar } from '../game/TimerBar.tsx';
import { ChoicesDisplay, RevealAnswer } from '../game/Reveal.tsx';
import { Leaderboard, TeamScores, type LeaderRow } from '../game/Leaderboard.tsx';
import { Explanation, IntroScreen, LockedIn, RoundHeader, myAvatar } from '../game/parts.tsx';
import { Pill, SIGN, StagePanel } from '../game/stage.tsx';
import { Burst } from '../../../art/bursts.tsx';
import { formatNumber } from '../../../lib/format.ts';
import { useNow } from '../../../lib/useNow.ts';

/* Confidence: choose how sure you are from the prompt alone, then answer. Teaches calibration. */

type Level = 1 | 2 | 3;
type Phase = 'intro' | 'wager' | 'question' | 'reveal' | 'leaderboard' | 'done';

export interface ConfidenceView {
  sync: { phase: Phase; phaseEndsAt: number | null };
  phase: Phase;
  round: number;
  total: number;
  phaseEndsAt: number | null;
  roundStartedAt: number;
  highStakes: boolean;
  stakes: { level: Level; gain: number; loss: number }[];
  /** Wager phase only: the prompt and its picture, nothing else. */
  prompt: { prompt: string; media?: Media } | null;
  question: QuestionView | null;
  reveal: AnswerReveal | null;
  explanation: string | null;
  levels: { level: Level; players: number; right: number }[] | null;
  distribution: Record<string, number> | null;
  chosen: number;
  answered: number;
  players: number;
  board: { rows: LeaderRow[]; you: LeaderRow | null };
  teams: { teamId: string; name: string; hue: number; score: number; members: number }[] | null;
  you: {
    wager: Level | null;
    answered: boolean;
    outcome: { level: Level; answered: boolean; correct: boolean; change: number } | null;
    score: number;
    tally: { picks: number[]; right: number[] } | null;
  } | null;
}

const LEVEL_NAME: Record<Level, string> = { 1: 'Guessing', 2: 'Fairly sure', 3: 'Certain' };
const LEVEL_BG: Record<Level, string> = { 1: 'var(--tile-b)', 2: 'var(--tile-a)', 3: 'var(--tile-c)' };

function PromptCard({ prompt, big = false }: { prompt: { prompt: string; media?: Media }; big?: boolean }) {
  const long = prompt.prompt.length > 120;
  if (big) {
    return (
      <div className="paper stage-card flex items-center gap-[clamp(1rem,2vw,2.5rem)] px-[clamp(1.25rem,2.6vw,3.25rem)] py-[clamp(1rem,2.6vh,2.25rem)]">
        <h2 className={`min-w-0 flex-1 font-display leading-[1.06] font-extrabold text-text ${long ? 'text-[clamp(1.75rem,2.8vw,3.25rem)]' : 'text-[clamp(2.5rem,4.2vw,5.25rem)]'}`}>{prompt.prompt}</h2>
        {prompt.media ? <QuestionImage media={prompt.media} size="host" className="max-w-[42%]" /> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <h2 className={`font-display font-extrabold text-text ${long ? 'text-xl sm:text-2xl' : 'text-[1.7rem] leading-[1.12] sm:text-3xl'}`}>{prompt.prompt}</h2>
      {prompt.media ? <QuestionImage media={prompt.media} size="phone" className="self-start" /> : null}
    </div>
  );
}

/** The wager clock: a calm violet bar. (The question timer turns coral near the end; the wager is short enough that it would be coral throughout.) */
function WagerClock({ start, end, gameNow, paused, big = false }: { start: number; end: number | null; gameNow: () => number; paused: boolean; big?: boolean }) {
  useNow(100, end !== null && !paused);
  if (end === null) return null;
  const left = Math.max(0, end - gameNow());
  const pct = (left / Math.max(1, end - start)) * 100;
  const secs = Math.ceil(left / 1000);
  return (
    <div className={`flex items-center ${big ? 'gap-4' : 'gap-3'}`} role="timer" aria-label={`${secs} seconds to choose`}>
      <div className={`relative flex-1 overflow-hidden rounded-full border-ink bg-sunken ${big ? 'h-[clamp(1.25rem,2.2vh,1.75rem)] border-[3px]' : 'h-4 border-2'}`}>
        <div className="absolute inset-0 rounded-full bg-dusk transition-transform duration-100 ease-linear" style={{ transform: `translateX(${pct - 100}%)` }} />
      </div>
      <span className={`grid shrink-0 place-items-center rounded-full border-ink bg-dusk font-display font-extrabold text-on-accent tabular ${big ? 'size-[clamp(4rem,7vh,5.5rem)] border-[3px] text-[clamp(2rem,3.6vh,3rem)] shadow-[0_4px_0_var(--ink)]' : 'size-11 border-2 text-xl shadow-[0_2px_0_var(--ink)]'}`}>{secs}</span>
    </div>
  );
}

function stakeText(st: { gain: number; loss: number }) {
  return `+${formatNumber(st.gain)} if right, ${st.loss ? `−${formatNumber(st.loss)}` : 'nothing lost'} if wrong`;
}

function useLevelKeys(onPick: (level: Level) => void, enabled: boolean) {
  const ref = useRef(onPick);
  ref.current = onPick;
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        e.preventDefault();
        ref.current(Number(e.key) as Level);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [enabled]);
}

/** A confidence level as a game piece: the same ink edge and press as the answer tiles. */
const LEVEL_PIECE =
  'relative flex items-center gap-3 rounded-[22px] border-[3px] border-ink text-left text-on-accent shadow-[0_5px_0_var(--ink)] transition-[translate,box-shadow,filter] duration-[120ms] ease-[var(--ease-out)] enabled:hover:brightness-105 enabled:active:translate-y-1 enabled:active:shadow-[0_1px_0_var(--ink)]';

function WagerPicker({ view, act, paused }: { view: ConfidenceView; act: ModeScreenProps['act']; paused: boolean }) {
  const [sending, setSending] = useState<Level | null>(null);
  const chosen = sending ?? view.you?.wager ?? null;
  const pick = async (level: Level) => {
    if (paused) return;
    setSending(level);
    await act({ type: 'wager', level });
    setSending(null);
  };
  useLevelKeys((l) => void pick(l), !paused);
  return (
    <div className="flex flex-col gap-3">
      <p className={`font-display text-2xl font-extrabold ${SIGN}`}>How sure are you?</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="How sure are you?">
        {view.stakes.map((st) => {
          const on = chosen === st.level;
          return (
            <button
              key={st.level}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={paused}
              onClick={() => void pick(st.level)}
              className={`${LEVEL_PIECE} min-h-[5.5rem] px-4 py-3 sm:min-h-[8rem] sm:flex-col sm:items-start ${on ? 'translate-y-1 shadow-[0_1px_0_var(--ink)] ring-[5px] ring-lantern ring-offset-[3px] ring-offset-ink' : chosen !== null ? 'brightness-90' : ''}`}
              style={{ background: LEVEL_BG[st.level] }}
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-white/55 font-display text-3xl font-extrabold">{st.level}</span>
              <span className="flex min-w-0 flex-col">
                <span className="font-display text-xl font-extrabold">{LEVEL_NAME[st.level]}</span>
                <span className="text-sm font-bold">{stakeText(st)}</span>
              </span>
              {on ? (
                <span className="absolute -top-3 -right-3 grid size-9 place-items-center rounded-full border-[3px] border-ink bg-lantern" aria-hidden>
                  <Check className="size-5" strokeWidth={3} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="font-semibold text-text-2">
        {chosen ? `You chose ${LEVEL_NAME[chosen].toLowerCase()}. You can change your mind until the answers appear.` : 'Pick before the answers appear, or you will be guessing. Keys 1, 2 and 3 work too.'}
      </p>
    </div>
  );
}

/** How sure everyone was, and how often each level was right. */
function Calibration({ levels, big = false }: { levels: NonNullable<ConfidenceView['levels']>; big?: boolean }) {
  const max = Math.max(1, ...levels.map((l) => l.players));
  return (
    <StagePanel className={`flex flex-col gap-2.5 ${big ? 'p-5 text-[clamp(1rem,1.5vw,1.6rem)]' : 'p-4'}`} label="How sure everyone was">
      <h3 className={`font-display font-extrabold ${big ? 'text-[clamp(1.4rem,2.2vw,2.5rem)]' : 'text-lg'}`}>How sure was everyone?</h3>
      {levels.map((l) => (
        <div key={l.level} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
          <span className="font-bold">
            {l.level}. {LEVEL_NAME[l.level]}
          </span>
          <span className="text-right font-semibold text-text-2 tabular">{l.players ? `${l.right} of ${l.players} right` : 'nobody'}</span>
          <div className={`col-span-2 flex overflow-hidden rounded-[10px] border-2 border-ink bg-[rgb(17_10_62/0.7)] ${big ? 'h-9' : 'h-6'}`} aria-hidden>
            <div className="h-full origin-left bg-glim" style={{ width: `${(l.right / max) * 100}%`, animation: 'stage-grow 600ms var(--ease-out) both' }} />
            <div className="h-full origin-left bg-ember" style={{ width: `${((l.players - l.right) / max) * 100}%`, animation: 'stage-grow 600ms var(--ease-out) 120ms both' }} />
          </div>
        </div>
      ))}
      <p className={`font-semibold text-text-2 ${big ? '' : 'text-sm'}`}>Mint is right, coral is wrong.</p>
    </StagePanel>
  );
}

function YourCalibration({ tally }: { tally: { picks: number[]; right: number[] } }) {
  const rows = ([1, 2, 3] as Level[]).filter((l) => (tally.picks[l - 1] ?? 0) > 0);
  if (!rows.length) return null;
  return (
    <StagePanel className="px-4 py-3">
      <p className="mb-1 font-bold">So far, when you were…</p>
      <ul className="flex flex-col gap-0.5 font-semibold text-text-2">
        {rows.map((l) => {
          const n = tally.picks[l - 1] ?? 0;
          const r = tally.right[l - 1] ?? 0;
          return (
            <li key={l} className="tabular">
              {LEVEL_NAME[l].toLowerCase()}: right {r} of {n} ({Math.round((100 * r) / n)}%)
            </li>
          );
        })}
      </ul>
    </StagePanel>
  );
}

function OutcomeBanner({ outcome, stakes }: { outcome: NonNullable<NonNullable<ConfidenceView['you']>['outcome']>; stakes: ConfidenceView['stakes'] }) {
  const level = LEVEL_NAME[outcome.level].toLowerCase();
  // Whether this level costs anything when wrong (the score floor at 0 can hide it in the change itself).
  const risky = (stakes.find((st) => st.level === outcome.level)?.loss ?? 0) > 0;
  const text = outcome.correct ? `Right, and you were ${level}.` : !outcome.answered ? `No answer, and you were ${level}.` : risky ? `Wrong, and you were ${level}.` : `Wrong, but you were only ${level}.`;
  const change = outcome.change > 0 ? `+${formatNumber(outcome.change)}` : outcome.change < 0 ? `−${formatNumber(-outcome.change)}` : '±0';
  return (
    <div role="status" className={`relative isolate flex items-center gap-3 rounded-[22px] border-[3px] border-ink px-4 py-3.5 text-on-accent shadow-[0_5px_0_var(--ink)] ${outcome.correct ? 'bg-glim' : outcome.change < 0 ? 'bg-ember' : 'bg-lantern'}`} style={{ animation: 'pop-in 280ms var(--ease-spring)' }}>
      {outcome.correct ? <Burst size={300} /> : null}
      <span className="grid size-12 shrink-0 place-items-center rounded-full border-[3px] border-ink bg-white/60" aria-hidden>
        {outcome.correct ? <Check className="size-7" strokeWidth={3.2} /> : <X className="size-7" strokeWidth={3.2} />}
      </span>
      <span className="min-w-0 flex-1 font-display text-xl leading-tight font-extrabold sm:text-2xl">{text}</span>
      <span className="font-display text-2xl font-extrabold tabular">{change}</span>
    </div>
  );
}

/** The rules in play: how confidence pays, then each rule a variant (or the host) switched on. */
function rulesText(view: ConfidenceView, room: ModeScreenProps['room']): string {
  const st = room.room.settings;
  const parts = ['You will see each question before its answers. Decide how sure you are, then answer.'];
  parts.push(view.highStakes ? 'Being sure and right pays most, but a wrong or missed answer costs 100 points for every level of confidence, so even a guess costs 100.' : 'Being sure and right pays most; being sure and wrong costs points.');
  if (st.risingStakes === true) parts.push('Every stake goes up after every four questions: double from question 5, triple from question 9, and so on.');
  if (st.returning === true) parts.push('Questions fewer than half of you get right come back once at the end.');
  parts.push(`${view.total} questions.`);
  return parts.join(' ');
}

/** A long set of rules steps down a size on the projector, so the countdown and the line-up stay on screen. */
function RulesText({ text, big }: { text: string; big: boolean }) {
  return big && text.length > 150 ? <span className="text-[0.85em]">{text}</span> : <>{text}</>;
}

function Intro({ view, gameNow, room, big = false }: { view: ConfidenceView; gameNow: () => number; room: ModeScreenProps['room']; big?: boolean }) {
  return (
    <IntroScreen title={room.room.title} until={view.phaseEndsAt} gameNow={gameNow} room={room} big={big} art={<Scale className={`${big ? 'size-[clamp(4rem,10vh,6.5rem)]' : 'size-14'} text-lantern`} aria-hidden />}>
      <RulesText text={rulesText(view, room)} big={big} />
    </IntroScreen>
  );
}

function Board({ view, room, big = false }: { view: ConfidenceView; room: ModeScreenProps['room']; big?: boolean }) {
  // Lost points show in each player's own result, not as a "+" gain here.
  const rows = view.board.rows.map((r) => ({ ...r, gain: Math.max(0, r.gain ?? 0) }));
  const you = view.board.you ? { ...view.board.you, gain: Math.max(0, view.board.you.gain ?? 0) } : null;
  return (
    <div className="flex flex-col gap-4">
      {view.teams ? <TeamScores teams={view.teams} big={big} /> : null}
      <Leaderboard rows={rows} you={you} players={room.players} teams={room.room.teams} big={big} />
    </div>
  );
}

export function ConfidencePlayer({ view, act, gameNow, paused, room }: ModeScreenProps<ConfidenceView>) {
  const you = view.you;
  if (view.phase === 'intro') return <Intro view={view} gameNow={gameNow} room={room} />;
  if (view.phase === 'leaderboard' || view.phase === 'done') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <h2 className={`font-display text-3xl font-extrabold ${SIGN}`}>Leaderboard</h2>
        <Board view={view} room={room} />
        {you?.tally ? <YourCalibration tally={you.tally} /> : null}
      </div>
    );
  }
  const header = (
    <RoundHeader round={view.round} total={view.total}>
      <Pill>{formatNumber(you?.score ?? 0)} pts</Pill>
    </RoundHeader>
  );
  if (view.phase === 'wager') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-4">
        {header}
        <WagerClock start={view.roundStartedAt} end={view.phaseEndsAt} gameNow={gameNow} paused={paused} />
        {view.prompt ? <PromptCard prompt={view.prompt} /> : null}
        <WagerPicker view={view} act={act} paused={paused} />
      </div>
    );
  }
  const q = view.question;
  if (!q) return null;
  const submit = async (answer: Answer) => (await act({ type: 'answer', iid: q.iid, answer })).ok;
  const level = you?.wager ?? 1;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-4">
      {header}
      {view.phase === 'question' ? (
        <>
          <p className="inline-flex items-center gap-2 self-start rounded-full border-[3px] border-ink py-1 pr-4 pl-1.5 font-bold text-on-accent" style={{ background: LEVEL_BG[level] }}>
            <span className="grid size-7 place-items-center rounded-full bg-white/60 font-display font-extrabold">{level}</span> {LEVEL_NAME[level]}
            {you?.wager === null ? ' (you did not choose)' : ''}
          </p>
          <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} />
        </>
      ) : null}
      <QuestionCard q={q.q} />
      {view.phase === 'question' ? (
        you?.answered ? (
          <LockedIn answered={view.answered} eligible={view.players} avatar={myAvatar(room)} seed={room.me.playerId ?? 'you'} />
        ) : (
          <AnswerInput key={q.iid} q={q.q} onSubmit={submit} disabled={paused} />
        )
      ) : (
        <div className="flex flex-col gap-4">
          {you?.outcome ? <OutcomeBanner outcome={you.outcome} stakes={view.stakes} /> : null}
          {view.reveal ? <RevealAnswer q={q.q} reveal={view.reveal} compact /> : null}
          <Explanation text={view.explanation} />
          {view.levels ? <Calibration levels={view.levels} /> : null}
          {you?.tally ? <YourCalibration tally={you.tally} /> : null}
        </div>
      )}
    </div>
  );
}

export function ConfidenceHost({ view, gameNow, paused, room }: ModeScreenProps<ConfidenceView>) {
  if (view.phase === 'intro') return <Intro view={view} gameNow={gameNow} room={room} big />;
  if (view.phase === 'leaderboard' || view.phase === 'done') {
    return (
      <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
        <h2 className={`font-display text-[clamp(2.5rem,4.6vw,5.5rem)] leading-none font-extrabold ${SIGN}`}>Leaderboard</h2>
        <Board view={view} room={room} big />
      </div>
    );
  }
  const header = (count: string) => (
    <RoundHeader round={view.round} total={view.total} big>
      <Pill className="px-5 py-1.5">{count}</Pill>
    </RoundHeader>
  );
  if (view.phase === 'wager') {
    return (
      <div className="mx-auto flex w-full max-w-[100rem] flex-1 flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
        {header(`${view.chosen} of ${view.players} have chosen`)}
        <WagerClock start={view.roundStartedAt} end={view.phaseEndsAt} gameNow={gameNow} paused={paused} big />
        {view.prompt ? <PromptCard prompt={view.prompt} big /> : null}
        <div className="flex flex-col gap-3">
          <p className={`font-display text-[clamp(1.75rem,3vw,3.5rem)] font-extrabold ${SIGN}`}>How sure are you?</p>
          <div className="grid grid-cols-1 gap-[clamp(0.75rem,1.4vw,1.5rem)] md:grid-cols-3">
            {view.stakes.map((st) => (
              <div key={st.level} className={`${LEVEL_PIECE} px-5 py-4`} style={{ background: LEVEL_BG[st.level] }}>
                <span className="grid size-[clamp(3.5rem,6vh,5rem)] shrink-0 place-items-center rounded-[16px] bg-white/55 font-display text-[clamp(2rem,3.6vh,3rem)] font-extrabold">{st.level}</span>
                <span className="flex flex-col">
                  <span className="font-display text-[clamp(1.5rem,2.4vw,2.75rem)] leading-tight font-extrabold">{LEVEL_NAME[st.level]}</span>
                  <span className="text-[clamp(1rem,1.3vw,1.4rem)] font-bold">{stakeText(st)}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="text-[clamp(1rem,1.5vw,1.6rem)] font-semibold text-text-2">The answers appear when everyone has chosen or the time runs out.</p>
        </div>
      </div>
    );
  }
  const q = view.question;
  if (!q) return null;
  return (
    <div className="mx-auto flex w-full max-w-[100rem] flex-1 flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
      {header(view.phase === 'question' ? `${view.answered} of ${view.players} answered` : `${view.answered} answered`)}
      {view.phase === 'question' ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} size="lg" /> : null}
      <QuestionCard q={q.q} size="lg" />
      {view.phase === 'question' ? (
        <ChoicesDisplay q={q.q} />
      ) : (
        <div className="grid grid-cols-1 gap-[clamp(1rem,2vw,2rem)] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-[clamp(0.75rem,2vh,1.25rem)]">
            {view.reveal ? <RevealAnswer q={q.q} reveal={view.reveal} distribution={view.distribution} size="lg" /> : null}
            <Explanation text={view.explanation} big />
          </div>
          {view.levels ? <Calibration levels={view.levels} big /> : null}
        </div>
      )}
    </div>
  );
}

