import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Delete, Eraser, Keyboard, Lightbulb, SkipForward } from 'lucide-react';
import type { Answer, PublicQuestion } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown, TimerBar } from '../game/TimerBar.tsx';
import { ResultBanner } from '../game/Reveal.tsx';
import { Leaderboard, TeamScores, type LeaderRow } from '../game/Leaderboard.tsx';
import { Explanation } from '../game/parts.tsx';
import { NIGHT, Pill, SIGN, StagePanel } from '../game/stage.tsx';
import { Button } from '../../../ui/Button.tsx';
import { formatNumber, plural } from '../../../lib/format.ts';

/* Word Scramble: spell the answer from shuffled letter tiles. */

interface Tile {
  id: string;
  ch: string;
}

interface ScrambleWord {
  kind: 'scramble';
  iid: string;
  q: PublicQuestion;
  shownAt: number;
  deadline: number | null;
  tiles: Tile[];
  /** Letters in each word of the answer. */
  words: number[];
  /** Tile ids revealed by hints, in answer order. */
  hinted: string[];
  hints: number;
  maxHints: number;
  value: number;
  tries: number;
}

interface PlainWord {
  kind: 'plain';
  iid: string;
  question: QuestionView;
  value: number;
  deadline: number | null;
}

interface Row {
  playerId: string;
  name: string;
  teamId: string | null;
  rank: number;
  points: number;
  done: number;
  solved: number;
  finished: boolean;
  isYou: boolean;
}

export interface WordScrambleView {
  endsAt: number;
  total: number;
  hints: boolean;
  timed: boolean;
  playing: number;
  finished: number;
  leaders: Row[];
  teams: { teamId: string; name: string; hue: number; score: number; members: number }[] | null;
  you: {
    points: number;
    done: number;
    solved: number;
    finished: boolean;
    nextAt: number | null;
    word: ScrambleWord | PlainWord | null;
    last: FeedbackView | null;
    answerText: string | null;
    lastQuestion: QuestionView | null;
  } | null;
}

/** Upper case without accents, so typing "e" picks an "É" tile. */
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

function ScrambleBoard({ word, paused, onSolve, onHint, onSkip }: { word: ScrambleWord; paused: boolean; onSolve: (text: string) => Promise<void>; onHint: () => Promise<void>; onSkip: () => Promise<void> }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const byId = new Map(word.tiles.map((t) => [t.id, t]));
  // Hinted letters are locked into the first slots; the player's own picks follow.
  const mine = picked.filter((id) => !word.hinted.includes(id));
  const slots = [...word.hinted, ...mine];
  const used = new Set(slots);
  const rack = word.tiles.filter((t) => !used.has(t.id));
  const total = word.tiles.length;
  const full = slots.length === total;
  const locked = paused || busy;

  const spell = (ids: string[]) => {
    let k = 0;
    return word.words
      .map((len) => {
        const part = ids
          .slice(k, k + len)
          .map((id) => byId.get(id)?.ch ?? '')
          .join('');
        k += len;
        return part;
      })
      .join(' ');
  };
  const run = async (fn: () => Promise<void>) => {
    if (locked) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const pick = (id: string) => {
    if (locked || used.has(id) || full) return;
    const next = [...mine, id];
    setPicked(next);
    // Check as soon as every slot is filled.
    if (word.hinted.length + next.length === total) void run(() => onSolve(spell([...word.hinted, ...next])));
  };
  const unpick = (id: string) => !locked && !word.hinted.includes(id) && setPicked(mine.filter((x) => x !== id));

  // Keyboard: letters pick tiles, Backspace takes the last one back, Escape clears, Enter checks.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'Backspace' && mine.length) {
      e.preventDefault();
      unpick(mine[mine.length - 1]!);
    } else if (e.key === 'Escape') setPicked([]);
    else if (e.key === 'Enter' && full) {
      e.preventDefault();
      void run(() => onSolve(spell(slots)));
    } else if (e.key.length === 1 && /[\p{L}\p{N}]/u.test(e.key)) {
      const tile = rack.find((t) => fold(t.ch) === fold(e.key));
      if (tile) {
        e.preventDefault();
        pick(tile.id);
      }
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const submitTyped = (e: FormEvent) => {
    e.preventDefault();
    if (typed.trim()) void run(() => onSolve(typed.slice(0, 200)));
  };

  const small = total > 12;
  const slotSize = small ? 'size-9 text-lg sm:size-10 sm:text-xl' : 'size-11 text-2xl sm:size-12';
  const hintsLeft = word.maxHints - word.hints;
  let k = 0;
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex flex-wrap items-center gap-2 font-semibold text-text-2">
        <Pill tone="lantern">Worth {word.value}</Pill>
        <span>{plural(total, 'letter')}</span>
        {word.tries ? <span className="tabular">{plural(word.tries, 'try', 'tries')} so far</span> : null}
      </div>
      <QuestionCard q={word.q} />
      {/* The answer slots, with a gap between words. */}
      <div className="flex flex-wrap gap-x-5 gap-y-2" role="group" aria-label={`Your answer so far: ${spell(slots) || 'empty'}`}>
        {word.words.map((len, w) => {
          const start = k;
          k += len;
          return (
            <div key={w} className="flex gap-1.5">
              {Array.from({ length: len }, (_, j) => {
                const id = slots[start + j];
                const tile = id ? byId.get(id) : undefined;
                const hinted = id ? word.hinted.includes(id) : false;
                const next = !id && start + j === slots.length;
                if (!tile) {
                  return <span key={j} className={`grid place-items-center rounded-[12px] border-[3px] border-dashed ${slotSize} ${next ? 'border-lantern bg-lantern/15' : 'border-white/40'}`} aria-hidden />;
                }
                return (
                  <button
                    key={j}
                    type="button"
                    onClick={() => unpick(tile.id)}
                    disabled={hinted || locked}
                    aria-label={hinted ? `${tile.ch}, from a hint` : `${tile.ch}, tap to take back`}
                    className={`grid place-items-center rounded-[12px] border-[3px] font-display font-extrabold ${slotSize} ${hinted ? 'border-ink bg-lantern text-on-accent' : 'paper border-ink'}`}
                  >
                    {tile.ch}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {word.tries ? (
        <p key={word.tries} className={`self-start rounded-[14px] border-2 border-ember px-3 py-2 font-bold text-ember ${NIGHT}`} role="status" style={{ animation: 'pop-in 220ms var(--ease-spring)' }}>
          Not quite. Move some letters and try again.
        </p>
      ) : null}
      {/* The rack of tiles still to place. */}
      {rack.length ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Letter tiles">
          {rack.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t.id)}
              disabled={locked}
              aria-label={`Letter ${t.ch}`}
              className={`grid place-items-center rounded-[14px] border-[3px] border-ink bg-lantern font-display font-extrabold text-on-accent shadow-[0_4px_0_var(--ink)] transition-[translate,box-shadow] duration-[120ms] ease-[var(--ease-out)] enabled:active:translate-y-[3px] enabled:active:shadow-[0_1px_0_var(--ink)] ${small ? 'size-11 text-xl' : 'size-12 text-2xl sm:size-14 sm:text-3xl'}`}
            >
              {t.ch}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {full ? (
          <Button variant="primary" size="lg" onClick={() => void run(() => onSolve(spell(slots)))} disabled={locked}>
            Check
          </Button>
        ) : null}
        <Button size="lg" icon={<Delete className="size-5" />} onClick={() => mine.length && unpick(mine[mine.length - 1]!)} disabled={locked || !mine.length}>
          Back
        </Button>
        <Button size="lg" icon={<Eraser className="size-5" />} onClick={() => setPicked([])} disabled={locked || !mine.length}>
          Clear
        </Button>
        {word.maxHints > 0 ? (
          <Button size="lg" icon={<Lightbulb className="size-5" />} onClick={() => void run(onHint)} disabled={locked || hintsLeft <= 0}>
            Hint, −10 ({hintsLeft} left)
          </Button>
        ) : null}
        <Button size="lg" variant="ghost" icon={<Keyboard className="size-5" />} onClick={() => setTyping((t) => !t)} aria-pressed={typing}>
          {typing ? 'Use the tiles' : 'Type it'}
        </Button>
        <Button size="lg" variant="ghost" icon={<SkipForward className="size-5" />} onClick={() => void run(onSkip)} disabled={locked}>
          Skip
        </Button>
      </div>
      {typing ? (
        <form onSubmit={submitTyped} className="flex flex-wrap items-center gap-2">
          <label htmlFor="scramble-typed" className="sr-only">
            Type the answer
          </label>
          <input
            id="scramble-typed"
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            maxLength={200}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Type the answer"
            disabled={locked}
            className="paper h-14 min-w-0 flex-1 rounded-[16px] border-[3px] border-ink px-4 font-display text-xl font-bold placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-text-3 focus:outline-none focus-visible:ring-4 focus-visible:ring-lantern"
          />
          <Button type="submit" variant="primary" size="lg" disabled={locked || !typed.trim()}>
            Check
          </Button>
        </form>
      ) : (
        <p className="hidden text-sm font-semibold text-text-2 sm:block">Type letters on your keyboard to pick tiles. Backspace takes one back.</p>
      )}
    </div>
  );
}

function PlainQuestion({ word, act, paused, onSkip }: { word: PlainWord; act: ModeScreenProps['act']; paused: boolean; onSkip: () => Promise<void> }) {
  const submit = async (answer: Answer) => (await act({ type: 'answer', iid: word.iid, answer })).ok;
  return (
    <div className="flex flex-col gap-4">
      <p className="font-semibold text-text-2">This answer cannot be scrambled, so answer it as a normal question. Worth {word.value}.</p>
      <QuestionCard q={word.question.q} />
      <AnswerInput key={word.iid} q={word.question.q} onSubmit={submit} disabled={paused} compact />
      <Button variant="ghost" icon={<SkipForward className="size-5" />} onClick={() => void onSkip()} disabled={paused} className="self-start">
        Skip
      </Button>
    </div>
  );
}

function Between({ last, answer, onNext, paused }: { last: FeedbackView; answer: string | null; onNext: () => void; paused: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <ResultBanner key={last.iid} correct={last.correct} partial={last.partial} points={last.points ?? null} text={last.correct ? undefined : last.text} />
      {answer ? (
        <div className="rounded-[20px] border-[3px] border-ink bg-glim px-5 py-4 text-on-accent shadow-[0_4px_0_var(--ink)]">
          <div className="text-sm font-bold">{last.correct ? 'You spelt' : 'The answer was'}</div>
          <div className="font-display text-3xl font-extrabold break-words">{answer}</div>
        </div>
      ) : null}
      <Explanation text={last.explanation} />
      <Button variant="primary" size="xl" onClick={onNext} disabled={paused} className="self-start">
        Next word
      </Button>
    </div>
  );
}

const toLeaderRows = (rows: Row[]): LeaderRow[] => rows.map((r) => ({ playerId: r.playerId, name: r.name, score: r.points, rank: r.rank, teamId: r.teamId }));

export function WordScramblePlayer({ view, act, gameNow, paused, room }: ModeScreenProps<WordScrambleView>) {
  const you = view.you;
  if (!you) return <p className="text-text-2">Watching the game.</p>;
  const w = you.word;
  const send = async (action: unknown) => {
    await act(action);
  };
  const mine = view.leaders.find((r) => r.isYou) ?? null;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>
            Word {Math.min(you.done + (w ? 1 : 0), view.total)} of {view.total}
          </Pill>
          <Pill>{plural(you.points, 'point')}</Pill>
          {mine && view.leaders.length > 1 ? <span className="font-bold text-text-2">Place {mine.rank}</span> : null}
        </div>
        <Pill>
          <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
        </Pill>
      </div>
      {w?.deadline ? <TimerBar deadline={w.deadline} start={w.kind === 'scramble' ? w.shownAt : w.question.shownAt} gameNow={gameNow} paused={paused} /> : null}
      {you.finished ? (
        <StagePanel className="px-5 py-6 text-center">
          <div role="status">
          <p className="font-display text-3xl font-extrabold">Every word done!</p>
          <p className="font-semibold text-text-2">
            {plural(you.solved, 'word')} solved for {plural(you.points, 'point')}.
            {view.playing > 1 ? ` ${view.finished} of ${view.playing} players have finished.` : ''}
          </p>
          </div>
        </StagePanel>
      ) : w?.kind === 'scramble' ? (
        <ScrambleBoard
          key={w.iid}
          word={w}
          paused={paused}
          onSolve={(text) => send({ type: 'solve', iid: w.iid, text })}
          onHint={() => send({ type: 'hint', iid: w.iid })}
          onSkip={() => send({ type: 'skip', iid: w.iid })}
        />
      ) : w?.kind === 'plain' ? (
        <PlainQuestion word={w} act={act} paused={paused} onSkip={() => send({ type: 'skip', iid: w.iid })} />
      ) : you.last ? (
        <Between last={you.last} answer={you.answerText} onNext={() => void send({ type: 'next' })} paused={paused} />
      ) : null}
      {view.leaders.length > 1 ? (
        <div className="flex flex-col gap-2">
          <h3 className={`font-display text-xl font-extrabold ${SIGN}`}>Leaderboard</h3>
          <Leaderboard rows={toLeaderRows(view.leaders)} you={mine ? toLeaderRows([mine])[0] : null} players={room.players} teams={room.room.teams} label={(r) => `${formatNumber(r.score)} pts`} />
        </div>
      ) : null}
    </div>
  );
}

/** Rows of the projector board that fit a 768-pixel screen under the title. */
const BOARD_ROWS = 10;

export function WordScrambleHost({ view, gameNow, room }: ModeScreenProps<WordScrambleView>) {
  // The server sends up to forty rows; past ten, nine show and the rest are counted, so the board never scrolls.
  const rows = view.leaders.length > BOARD_ROWS ? view.leaders.slice(0, BOARD_ROWS - 1) : view.leaders;
  const more = room.players.length - rows.length;
  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-[clamp(0.75rem,2vh,1.5rem)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={`font-display text-[clamp(2.25rem,min(4vw,7vh),4.75rem)] leading-none font-extrabold ${SIGN}`}>Word Scramble</h2>
          <p className="mt-1 text-[clamp(1.05rem,min(1.6vw,2.8vh),1.75rem)] font-semibold text-text-2">
            {view.finished} of {view.playing} finished all {view.total} words{view.timed ? '. Every word is on a timer' : ''}.
          </p>
        </div>
        <Pill className="px-5 py-1.5 text-[clamp(1.25rem,2.2vw,2.5rem)]">
          <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
        </Pill>
      </div>
      <div className={`grid grid-cols-1 gap-[clamp(1rem,2vw,2rem)] ${view.teams ? 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]' : ''}`}>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Leaderboard rows={toLeaderRows(rows)} players={room.players} teams={room.room.teams} big label={(r) => `${formatNumber(r.score)} pts`} />
          {more > 0 ? <p className="text-[clamp(1rem,min(1.5vw,2.6vh),1.6rem)] font-semibold text-text-2">And {more} more {more === 1 ? 'player' : 'players'}.</p> : null}
        </div>
        {view.teams ? (
          <StagePanel className="flex flex-col gap-3 p-5">
            <h3 className="font-display text-[clamp(1.4rem,2.2vw,2.5rem)] font-extrabold">Teams: average points</h3>
            <TeamScores teams={view.teams} big />
          </StagePanel>
        ) : null}
      </div>
    </div>
  );
}
