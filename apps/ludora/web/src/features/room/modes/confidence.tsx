import { useEffect, useRef, useState } from 'react';
import { Check, Scale, X } from 'lucide-react';
import type { Answer, AnswerReveal, Media } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown, TimerBar } from '../game/TimerBar.tsx';
import { ChoicesDisplay, RevealAnswer } from '../game/Reveal.tsx';
import { Leaderboard, TeamScores, type LeaderRow } from '../game/Leaderboard.tsx';
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
  return (
    <div className="flex flex-col gap-3">
      <h2 className={`font-display font-bold text-text ${big ? (long ? 'text-3xl' : 'text-4xl sm:text-5xl') : long ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'}`}>{prompt.prompt}</h2>
      {prompt.media ? <img src={prompt.media.url} alt={prompt.media.alt} className="max-h-[34vh] w-auto self-start rounded-[14px] border border-line object-contain" /> : null}
    </div>
  );
}

/** The wager clock: a calm violet bar. (The question timer turns red near the end; a 6 second wager would be red throughout.) */
function WagerClock({ start, end, gameNow, paused }: { start: number; end: number | null; gameNow: () => number; paused: boolean }) {
  useNow(100, end !== null && !paused);
  if (end === null) return null;
  const left = Math.max(0, end - gameNow());
  const pct = (left / Math.max(1, end - start)) * 100;
  const secs = Math.ceil(left / 1000);
  return (
    <div className="flex items-center gap-3" aria-label={`${secs} seconds to choose`}>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-dusk transition-[width] duration-100 ease-linear" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right font-display text-xl font-bold text-text tabular">{secs}</span>
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
      <p className="font-display text-xl font-bold">How sure are you?</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="How sure are you?">
        {view.stakes.map((st) => {
          const on = chosen === st.level;
          return (
            <button
              key={st.level}
              type="button"
              role="radio"
              aria-checked={on}
              data-pressed={on || undefined}
              disabled={paused}
              onClick={() => void pick(st.level)}
              className={`sticker relative flex min-h-[96px] flex-row items-center gap-3 rounded-[18px] px-4 py-3 text-left text-on-accent sm:flex-col sm:items-start ${on ? 'ring-4 ring-[var(--focus)] ring-offset-2 ring-offset-[var(--bg)]' : chosen !== null ? 'opacity-60' : ''}`}
              style={{ background: LEVEL_BG[st.level] }}
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-[12px] bg-white/45 font-display text-3xl font-extrabold">{st.level}</span>
              <span className="flex min-w-0 flex-col">
                <span className="font-display text-xl font-bold">{LEVEL_NAME[st.level]}</span>
                <span className="text-sm font-semibold">{stakeText(st)}</span>
              </span>
              {on ? <Check className="absolute top-2 right-2 size-6" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-text-2">
        {chosen ? `You chose ${LEVEL_NAME[chosen].toLowerCase()}. You can change your mind until the answers appear.` : 'Pick before the answers appear, or you will be guessing. Keys 1, 2 and 3 work too.'}
      </p>
    </div>
  );
}

/** How sure everyone was, and how often each level was right. */
function Calibration({ levels, big = false }: { levels: NonNullable<ConfidenceView['levels']>; big?: boolean }) {
  const max = Math.max(1, ...levels.map((l) => l.players));
  return (
    <div className="flex flex-col gap-2" aria-label="How sure everyone was">
      <h3 className={`font-display font-bold ${big ? 'text-2xl' : 'text-lg'}`}>How sure was everyone?</h3>
      {levels.map((l) => (
        <div key={l.level} className={big ? 'flex items-center gap-3' : 'grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:flex'}>
          <span className={`shrink-0 font-semibold ${big ? 'w-32 text-lg' : 'text-sm sm:w-28'}`}>
            {l.level}. {LEVEL_NAME[l.level]}
          </span>
          <span className={`shrink-0 text-right tabular sm:order-last ${big ? 'w-32 text-lg' : 'text-sm sm:w-28'}`}>{l.players ? `${l.right} of ${l.players} right` : 'nobody'}</span>
          <div className={`col-span-2 flex flex-1 overflow-hidden rounded-[10px] bg-surface-3 ${big ? 'h-9' : 'h-5 sm:h-7'}`}>
            <div className="h-full bg-glim transition-[width] duration-700" style={{ width: `${(l.right / max) * 100}%` }} />
            <div className="h-full bg-ember/70 transition-[width] duration-700" style={{ width: `${((l.players - l.right) / max) * 100}%` }} />
          </div>
        </div>
      ))}
      <p className={`text-text-3 ${big ? 'text-base' : 'text-xs'}`}>Green is right, red is wrong.</p>
    </div>
  );
}

function YourCalibration({ tally }: { tally: { picks: number[]; right: number[] } }) {
  const rows = ([1, 2, 3] as Level[]).filter((l) => (tally.picks[l - 1] ?? 0) > 0);
  if (!rows.length) return null;
  return (
    <div className="rounded-[14px] bg-surface-2 px-4 py-3">
      <p className="mb-1 font-semibold">So far, when you were…</p>
      <ul className="flex flex-col gap-0.5 text-text-2">
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
    </div>
  );
}

function OutcomeBanner({ outcome, stakes }: { outcome: NonNullable<NonNullable<ConfidenceView['you']>['outcome']>; stakes: ConfidenceView['stakes'] }) {
  const level = LEVEL_NAME[outcome.level].toLowerCase();
  // Whether this level costs anything when wrong (the score floor at 0 can hide it in the change itself).
  const risky = (stakes.find((st) => st.level === outcome.level)?.loss ?? 0) > 0;
  const text = outcome.correct
    ? `Right, and you were ${level}.`
    : !outcome.answered
      ? `No answer, and you were ${level}.`
      : risky
        ? `Wrong, and you were ${level}.`
        : `Wrong, but you were only ${level}.`;
  const change = outcome.change > 0 ? `+${formatNumber(outcome.change)}` : outcome.change < 0 ? `−${formatNumber(-outcome.change)}` : '±0';
  return (
    <div role="status" className={`flex items-center gap-3 rounded-[16px] border-2 border-ink px-4 py-3 font-display text-xl font-bold text-on-accent ${outcome.correct ? 'bg-glim' : outcome.change < 0 ? 'bg-ember' : 'bg-lantern'}`} style={{ animation: 'pop-in 220ms var(--ease-spring)' }}>
      {outcome.correct ? <Check className="size-7" aria-hidden /> : <X className="size-7" aria-hidden />}
      <span className="flex-1">{text}</span>
      <span className="tabular">{change}</span>
    </div>
  );
}

function Intro({ view, gameNow, big = false }: { view: ConfidenceView; gameNow: () => number; big?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center" style={{ animation: 'pop-in 300ms var(--ease-spring)' }}>
      <Scale className={`${big ? 'size-20' : 'size-14'} text-dusk`} aria-hidden />
      <h2 className={`font-display font-extrabold ${big ? 'text-6xl' : 'text-5xl'}`}>Confidence</h2>
      <p className={`max-w-xl text-text-2 ${big ? 'text-2xl' : 'text-lg'}`}>
        You will see each question before its answers. Decide how sure you are, then answer. Being sure and right pays most; being sure and wrong costs points.
      </p>
      <p className={`font-semibold text-text-2 ${big ? 'text-xl' : ''}`}>
        {view.total} questions. First one in <Countdown until={view.phaseEndsAt} gameNow={gameNow} />
      </p>
    </div>
  );
}

function Board({ view, room, big = false }: { view: ConfidenceView; room: ModeScreenProps['room']; big?: boolean }) {
  // Lost points show in each player's own result, not as a "+" gain here.
  const rows = view.board.rows.map((r) => ({ ...r, gain: Math.max(0, r.gain ?? 0) }));
  const you = view.board.you ? { ...view.board.you, gain: Math.max(0, view.board.you.gain ?? 0) } : null;
  return (
    <div className="flex flex-col gap-4">
      {view.teams ? <TeamScores teams={view.teams} /> : null}
      <Leaderboard rows={rows} you={you} players={room.players} teams={room.room.teams} big={big} />
    </div>
  );
}

export function ConfidencePlayer({ view, act, gameNow, paused, room }: ModeScreenProps<ConfidenceView>) {
  const you = view.you;
  if (view.phase === 'intro') return <Intro view={view} gameNow={gameNow} />;
  if (view.phase === 'leaderboard' || view.phase === 'done') {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <h2 className="font-display text-3xl font-extrabold">Leaderboard</h2>
        <Board view={view} room={room} />
        {you?.tally ? <YourCalibration tally={you.tally} /> : null}
      </div>
    );
  }
  const header = (
    <div className="flex items-center justify-between gap-3 text-sm font-semibold text-text-2">
      <span>
        Question {view.round + 1} of {view.total}
      </span>
      <span className="font-display text-base font-bold text-text tabular">{formatNumber(you?.score ?? 0)} pts</span>
    </div>
  );
  if (view.phase === 'wager') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {header}
      {view.phase === 'question' ? (
        <>
          <p className="inline-flex items-center gap-2 self-start rounded-full px-3 py-1 font-semibold text-on-accent" style={{ background: LEVEL_BG[level] }}>
            <span className="font-display font-extrabold">{level}</span> {LEVEL_NAME[level]}
            {you?.wager === null ? ' (you did not choose)' : ''}
          </p>
          <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} />
        </>
      ) : null}
      <QuestionCard q={q.q} />
      {view.phase === 'question' ? (
        you?.answered ? (
          <div className="rounded-[16px] border-2 border-dashed border-line-strong px-5 py-6 text-center" role="status">
            <p className="font-display text-2xl font-bold">Answer locked in</p>
            <p className="text-text-2">
              {view.answered} of {view.players} have answered.
            </p>
          </div>
        ) : (
          <AnswerInput key={q.iid} q={q.q} onSubmit={submit} disabled={paused} />
        )
      ) : (
        <div className="flex flex-col gap-4">
          {you?.outcome ? <OutcomeBanner outcome={you.outcome} stakes={view.stakes} /> : null}
          {view.reveal ? <RevealAnswer q={q.q} reveal={view.reveal} compact /> : null}
          {view.explanation ? <p className="rounded-[14px] bg-surface-2 px-4 py-3 text-text-2">{view.explanation}</p> : null}
          {view.levels ? <Calibration levels={view.levels} /> : null}
          {you?.tally ? <YourCalibration tally={you.tally} /> : null}
        </div>
      )}
    </div>
  );
}

export function ConfidenceHost({ view, gameNow, paused, room }: ModeScreenProps<ConfidenceView>) {
  if (view.phase === 'intro') return <Intro view={view} gameNow={gameNow} big />;
  if (view.phase === 'leaderboard' || view.phase === 'done') {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <h2 className="mb-4 font-display text-4xl font-extrabold">Leaderboard</h2>
        <Board view={view} room={room} big />
      </div>
    );
  }
  const header = (count: string) => (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="font-display text-xl font-bold text-text-2">
        Question {view.round + 1} of {view.total}
      </span>
      <span className="rounded-full bg-surface-3 px-3 py-1 font-display text-lg font-bold tabular" aria-live="polite">
        {count}
      </span>
    </div>
  );
  if (view.phase === 'wager') {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        {header(`${view.chosen} / ${view.players} have chosen`)}
        <WagerClock start={view.roundStartedAt} end={view.phaseEndsAt} gameNow={gameNow} paused={paused} />
        {view.prompt ? <PromptCard prompt={view.prompt} big /> : null}
        <div className="flex flex-col gap-3">
          <p className="font-display text-3xl font-extrabold">How sure are you?</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {view.stakes.map((st) => (
              <div key={st.level} className="flex items-center gap-3 rounded-[18px] border-2 border-ink px-4 py-3 text-on-accent" style={{ background: LEVEL_BG[st.level] }}>
                <span className="grid size-14 shrink-0 place-items-center rounded-[12px] bg-white/45 font-display text-4xl font-extrabold">{st.level}</span>
                <span className="flex flex-col">
                  <span className="font-display text-2xl font-bold">{LEVEL_NAME[st.level]}</span>
                  <span className="font-semibold">{stakeText(st)}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="text-lg text-text-2">The answers appear when everyone has chosen or the time runs out.</p>
        </div>
      </div>
    );
  }
  const q = view.question;
  if (!q) return null;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {header(view.phase === 'question' ? `${view.answered} / ${view.players} answered` : `${view.answered} answered`)}
      {view.phase === 'question' ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} /> : null}
      <QuestionCard q={q.q} size="lg" />
      {view.phase === 'question' ? (
        <ChoicesDisplay q={q.q} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            {view.reveal ? <RevealAnswer q={q.q} reveal={view.reveal} distribution={view.distribution} /> : null}
            {view.explanation ? <p className="rounded-[14px] bg-surface-2 px-5 py-4 text-lg text-text-2">{view.explanation}</p> : null}
          </div>
          {view.levels ? <Calibration levels={view.levels} big /> : null}
        </div>
      )}
    </div>
  );
}
