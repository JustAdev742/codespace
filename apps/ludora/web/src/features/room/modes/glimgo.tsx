import { useState } from 'react';
import { Check, Lock, Megaphone, Star } from 'lucide-react';
import type { Media, RoomPlayerView } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import { Countdown, TimerBar } from '../game/TimerBar.tsx';
import { Glim } from '../../../art/glim/Glim.tsx';
import { useNow } from '../../../lib/useNow.ts';

/* Glimgo: bingo where each call is a question. Find the square on your card that answers it. */

type Phase = 'intro' | 'call' | 'reveal' | 'finale' | 'done';
type WinRule = 'line' | 'two-lines' | 'full';

interface Square {
  text: string;
  free: boolean;
  marked: boolean;
}

interface CallInfo {
  n: number;
  prompt: string;
  media?: Media;
}

interface Progress {
  playerId: string;
  name: string;
  marks: number;
  lines: number;
  toGo: number;
}

export interface GlimgoView {
  sync: { phase: Phase; phaseEndsAt: number | null };
  phase: Phase;
  phaseEndsAt: number | null;
  win: WinRule;
  size: number;
  callCount: number;
  /** The open call: prompt only. */
  call: (CallInfo & { iid: string; startedAt: number; endsAt: number; found: number }) | null;
  /** The call that just closed, with its answer. */
  revealed: (CallInfo & { text: string; found: number }) | null;
  recent: (CallInfo & { text: string; found: number })[];
  oneToGo: number;
  leaders: Progress[];
  winner: { playerId: string; name: string; squares: Square[] | null } | null;
  you: {
    squares: Square[];
    marks: number;
    lines: number;
    toGo: number;
    lockedUntil: number | null;
    found: boolean;
    last: { n: number; square: number; ok: boolean } | null;
  } | null;
}

const GOAL: Record<WinRule, string> = { line: 'Complete a line', 'two-lines': 'Complete two lines', full: 'Fill the whole card' };

function toGoText(n: number): string {
  if (n <= 0) return 'Glimgo!';
  if (n === 1) return 'One to go!';
  return `${n} to go`;
}

const avatarOf = (players: RoomPlayerView[], id: string) => players.find((p) => p.id === id)?.avatar ?? null;

/** Squares that sit on a completed row, column or diagonal. */
function completedSquares(squares: Square[], size: number): Set<number> {
  const idx = Array.from({ length: size }, (_, i) => i);
  const lines = [
    ...idx.map((r) => idx.map((c) => r * size + c)),
    ...idx.map((c) => idx.map((r) => r * size + c)),
    idx.map((i) => i * size + i),
    idx.map((i) => i * size + (size - 1 - i)),
  ];
  const done = new Set<number>();
  for (const line of lines) if (line.every((i) => squares[i]?.free || squares[i]?.marked)) for (const i of line) done.add(i);
  return done;
}

function CallPrompt({ call, big = false }: { call: CallInfo; big?: boolean }) {
  const long = call.prompt.length > 110;
  return (
    <div className="flex flex-col gap-2">
      <h2 className={`font-display font-bold text-text ${big ? (long ? 'text-3xl' : 'text-5xl') : long ? 'text-lg sm:text-xl' : 'text-2xl sm:text-3xl'}`}>{call.prompt}</h2>
      {call.media ? <img src={call.media.url} alt={call.media.alt} className={`${big ? 'max-h-[32vh]' : 'max-h-[22vh]'} w-auto self-start rounded-[14px] border border-line object-contain`} /> : null}
    </div>
  );
}

/** A card of squares. With `onMark`, unmarked squares are buttons. */
function Card({ squares, size, onMark, canMark = false, wrong = null, big = false, showLines = false, label }: { squares: Square[]; size: number; onMark?: (i: number) => void; canMark?: boolean; wrong?: number | null; big?: boolean; showLines?: boolean; label: string }) {
  // Squares grow with long answers (flashcard backs can be a sentence) rather than clipping them.
  const text = size >= 4 ? (big ? 'min-h-32 text-lg' : 'min-h-[4.5rem] text-[11px] min-[380px]:text-xs sm:min-h-24 sm:text-sm') : big ? 'min-h-40 text-xl' : 'min-h-24 text-sm sm:min-h-28 sm:text-base';
  const winning = showLines ? completedSquares(squares, size) : null;
  return (
    <div role="group" aria-label={label} className={`grid gap-2 ${size >= 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
      {squares.map((sq, i) => {
        const done = sq.free || sq.marked;
        const ring = winning?.has(i) ? 'ring-4 ring-lantern ring-offset-2 ring-offset-[var(--bg)]' : '';
        const base = `relative flex items-center justify-center rounded-[14px] p-1.5 text-center font-semibold leading-tight break-words hyphens-auto ${text} ${ring}`;
        if (sq.free) {
          return (
            <div key={i} className={`${base} border-2 border-ink bg-lantern/80 text-on-accent`} role="img" aria-label="Free square">
              <Star className="size-1/3 max-h-10 max-w-10" aria-hidden />
              <span className="sr-only">Free</span>
            </div>
          );
        }
        const body = (
          <>
            <span className="min-w-0">{sq.text}</span>
            {sq.marked ? <Check className="absolute top-1 right-1 size-5 rounded-full border-2 border-ink bg-white p-0.5 text-ink" aria-hidden /> : null}
          </>
        );
        if (!onMark || done) {
          return (
            <div key={i} className={`${base} border-2 ${sq.marked ? 'border-ink bg-glim text-on-accent' : 'border-line bg-raised text-text'}`} aria-label={`${sq.text}${sq.marked ? ', marked' : ''}`} role="img">
              {body}
            </div>
          );
        }
        return (
          <button
            key={i}
            type="button"
            onClick={() => onMark(i)}
            disabled={!canMark}
            aria-label={sq.text}
            className={`sticker ${base} bg-raised text-text ${wrong === i ? 'ring-4 ring-ember ring-offset-2 ring-offset-[var(--bg)]' : ''}`}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

function RecentCalls({ recent, big = false }: { recent: GlimgoView['recent']; big?: boolean }) {
  if (!recent.length) return null;
  return (
    <div>
      <h3 className={`mb-2 font-display font-bold ${big ? 'text-2xl' : 'text-lg'}`}>Recent calls</h3>
      <ol className="flex flex-col gap-1.5">
        {recent.map((c) => (
          <li key={c.n} className={`flex items-baseline gap-3 rounded-[12px] border border-line bg-raised px-3 py-2 ${big ? 'text-lg' : 'text-sm'}`}>
            <span className="shrink-0 font-display font-bold text-text-3 tabular">{c.n}</span>
            <span className="min-w-0 flex-1 truncate text-text-2">{c.prompt}</span>
            <span className="max-w-[45%] shrink-0 truncate font-semibold">{c.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Leaders({ view, big = false }: { view: GlimgoView; big?: boolean }) {
  if (!view.leaders.length) return null;
  return (
    <div>
      <h3 className={`mb-2 font-display font-bold ${big ? 'text-2xl' : 'text-lg'}`}>Closest to Glimgo</h3>
      <ol className="flex flex-col gap-1.5" aria-label="Players closest to Glimgo">
        {view.leaders.map((p) => (
          <li key={p.playerId} className={`flex items-center gap-3 rounded-[12px] border px-3 py-2 ${p.toGo === 1 ? 'border-lantern bg-lantern/15' : 'border-line bg-raised'} ${big ? 'text-lg' : 'text-sm'}`}>
            <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
            <span className="text-text-2 tabular">
              {p.marks} {p.marks === 1 ? 'mark' : 'marks'}
            </span>
            <span className={`w-24 text-right font-display font-bold ${p.toGo === 1 ? 'text-lantern' : ''}`}>{toGoText(p.toGo)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Finale({ view, players, big = false, me = null }: { view: GlimgoView; players: RoomPlayerView[]; big?: boolean; me?: string | null }) {
  const w = view.winner;
  if (!w) return null;
  const avatar = avatarOf(players, w.playerId);
  const mine = w.playerId === me;
  return (
    <div role="status" className={`flex items-center gap-4 rounded-[24px] border-2 border-ink bg-glim px-5 py-5 text-on-accent ${big ? 'gap-6' : ''}`} style={{ animation: 'pop-in 360ms var(--ease-spring)' }}>
      {avatar ? <Glim art={avatar.art} accessories={avatar.accessories} size={big ? 140 : 80} aura="legendary" bob /> : <Megaphone className={big ? 'size-24' : 'size-14'} aria-hidden />}
      <div className="min-w-0">
        <p className={`font-display font-extrabold ${big ? 'text-7xl' : 'text-5xl'}`}>Glimgo!</p>
        <p className={`truncate font-display font-bold ${big ? 'text-4xl' : 'text-2xl'}`}>{mine ? 'You win!' : `${w.name} wins`}</p>
      </div>
    </div>
  );
}

export function GlimgoPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<GlimgoView>) {
  const you = view.you;
  const [note, setNote] = useState<{ n: number; text: string } | null>(null);
  const locked = you?.lockedUntil ?? null;
  useNow(250, locked !== null && !paused);
  const lockLeft = locked !== null ? Math.max(0, Math.ceil((locked - gameNow()) / 1000)) : 0;
  const call = view.phase === 'call' ? view.call : null;
  const canMark = Boolean(call && you && !you.found && lockLeft === 0 && !paused);
  const mark = async (square: number) => {
    if (!call || !canMark) return;
    const ack = await act({ type: 'mark', iid: call.iid, square });
    setNote(ack.ok ? null : { n: call.n, text: ack.error.message });
  };
  const wrongNow = you?.last && call && you.last.n === call.n && !you.last.ok ? you.last.square : null;

  if (!you) return <p className="text-text-2">Watching the game.</p>;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-text-2">
        <span>
          {view.callCount ? `Call ${view.call?.n ?? view.callCount}` : 'Your card'} · {GOAL[view.win]}
        </span>
        <span className={`font-display text-base font-bold ${you.toGo === 1 ? 'text-lantern' : 'text-text'}`}>
          {you.marks} {you.marks === 1 ? 'mark' : 'marks'} · {toGoText(you.toGo)}
        </span>
      </div>

      <div className="flex min-h-[7.5rem] flex-col justify-center gap-3 rounded-[18px] border border-line bg-raised px-4 py-3" aria-live="polite">
        {view.phase === 'intro' ? (
          <div>
            <p className="font-display text-2xl font-bold">Study your card</p>
            <p className="text-text-2">
              Each call is a question. Tap the square that answers it. First call in <Countdown until={view.phaseEndsAt} gameNow={gameNow} />
            </p>
          </div>
        ) : view.phase === 'finale' ? (
          <Finale view={view} players={room.players} me={room.me.playerId} />
        ) : call ? (
          <>
            <TimerBar deadline={call.endsAt} start={call.startedAt} gameNow={gameNow} paused={paused} tone="violet" />
            <CallPrompt call={call} />
          </>
        ) : view.revealed ? (
          <div>
            <p className="text-sm font-semibold text-text-2">{view.revealed.prompt}</p>
            <p className="font-display text-2xl font-bold">
              It was: <span className="text-glim">{view.revealed.text}</span>
            </p>
          </div>
        ) : null}
      </div>

      {call ? (
        <p role="status" className={`min-h-6 font-semibold ${lockLeft ? 'text-ember' : you.found ? 'text-glim' : 'text-text-2'}`}>
          {lockLeft ? (
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-4" aria-hidden /> Not that one. Locked for {lockLeft} s.
            </span>
          ) : you.found ? (
            'Found it! Wait for the next call.'
          ) : note && note.n === call.n ? (
            note.text
          ) : (
            'Find the answer on your card.'
          )}
        </p>
      ) : null}

      <div className="relative">
        <Card squares={you.squares} size={view.size} onMark={(i) => void mark(i)} canMark={canMark} wrong={wrongNow} showLines={view.phase === 'finale' && view.winner?.playerId === room.me.playerId} label="Your Glimgo card" />
        {lockLeft ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-[16px] bg-[var(--scrim)]" aria-hidden>
            <span className="flex items-center gap-2 rounded-full bg-ember px-4 py-2 font-display text-2xl font-extrabold text-on-accent">
              <Lock className="size-6" /> {lockLeft}
            </span>
          </div>
        ) : null}
      </div>

      <RecentCalls recent={view.recent.slice(0, 3)} />
    </div>
  );
}

export function GlimgoHost({ view, gameNow, paused, room }: ModeScreenProps<GlimgoView>) {
  const call = view.phase === 'call' ? view.call : null;
  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-display text-2xl font-bold text-text-2">{view.callCount ? `Call ${view.call?.n ?? view.callCount}` : 'Glimgo'}</span>
          <span className="flex flex-wrap items-center gap-2 font-display text-lg font-bold">
            <span className="rounded-full bg-surface-3 px-3 py-1">{GOAL[view.win]}</span>
            {view.oneToGo ? <span className="rounded-full bg-lantern px-3 py-1 text-on-accent">{view.oneToGo} one away</span> : null}
          </span>
        </div>
        {view.phase === 'intro' ? (
          <div className="flex flex-col gap-3 py-6" style={{ animation: 'pop-in 300ms var(--ease-spring)' }}>
            <h2 className="font-display text-6xl font-extrabold">Glimgo</h2>
            <p className="text-2xl text-text-2">Everyone has their own card of answers. Each call is a question: find the answer on your card and tap it. A wrong tap locks you out for a moment.</p>
            <p className="text-xl font-semibold text-text-2">
              First call in <Countdown until={view.phaseEndsAt} gameNow={gameNow} />
            </p>
          </div>
        ) : view.phase === 'finale' ? (
          <div className="flex flex-col gap-5">
            <Finale view={view} players={room.players} big />
            {view.winner?.squares ? (
              <div className="max-w-xl">
                <Card squares={view.winner.squares} size={view.size} big showLines label={`${view.winner.name}'s card`} />
              </div>
            ) : null}
          </div>
        ) : call ? (
          <div className="flex flex-col gap-5">
            <TimerBar deadline={call.endsAt} start={call.startedAt} gameNow={gameNow} paused={paused} tone="violet" />
            <CallPrompt call={call} big />
            <p className="text-2xl font-semibold text-text-2" aria-live="polite">
              {call.found ? `${call.found} found it` : 'Find it on your card'}
            </p>
          </div>
        ) : view.revealed ? (
          <div className="flex flex-col gap-3" style={{ animation: 'pop-in 260ms var(--ease-spring)' }}>
            <p className="text-2xl text-text-2">{view.revealed.prompt}</p>
            <p className="font-display text-6xl font-extrabold">
              <span className="text-text-2">It was </span>
              <span className="text-glim">{view.revealed.text}</span>
            </p>
            <p className="text-xl font-semibold text-text-2">
              {view.revealed.found} {view.revealed.found === 1 ? 'player' : 'players'} found it.
            </p>
          </div>
        ) : null}
      </div>
      <aside className="flex min-w-0 flex-col gap-5">
        <Leaders view={view} big />
        <RecentCalls recent={view.recent} big />
      </aside>
    </div>
  );
}
