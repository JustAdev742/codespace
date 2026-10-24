import { useState } from 'react';
import { Check, Lock, Megaphone } from 'lucide-react';
import type { Media, RoomPlayerView } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import { Countdown, TimerBar } from '../game/TimerBar.tsx';
import { QuestionImage } from '../game/QuestionCard.tsx';
import { BigCountdown, HudCount, LineUp } from '../game/parts.tsx';
import { NIGHT, Pill, PlayerGlim, StagePanel, avatarOf } from '../game/stage.tsx';
import { Burst } from '../../../art/bursts.tsx';
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

/** The rules in play, for the intro: the goal, then each rule a variant (or the host) changed. */
function rulesText(view: GlimgoView, room: ModeScreenProps['room']): string {
  const st = room.room.settings;
  const parts = [`${GOAL[view.win]} to win.`];
  const secs = Number(st.callSeconds ?? 0);
  if (secs > 0) parts.push(`Each call lasts ${secs} seconds.`);
  const finders = Number(st.finders ?? 0);
  if (finders > 0) parts.push(`Only the first ${finders === 1 ? 'player' : `${finders} players`} to find each call can mark it.`);
  const lockout = Number(st.lockoutSeconds ?? 0);
  if (lockout > 0) parts.push(`A wrong tap locks you out for ${lockout} seconds.`);
  if (st.luckyStars === true) parts.push('After every fifth call, whoever is furthest from Glimgo gets a free square.');
  return parts.join(' ');
}

function toGoText(n: number): string {
  if (n <= 0) return 'Glimgo!';
  if (n === 1) return 'One to go';
  return `${n} to go`;
}

/** Squares that sit on a completed row, column or diagonal. */
function completedSquares(squares: Square[], size: number): Set<number> {
  const idx = Array.from({ length: size }, (_, i) => i);
  const lines = [...idx.map((r) => idx.map((c) => r * size + c)), ...idx.map((c) => idx.map((r) => r * size + c)), idx.map((i) => i * size + i), idx.map((i) => i * size + (size - 1 - i))];
  const done = new Set<number>();
  for (const line of lines) if (line.every((i) => squares[i]?.free || squares[i]?.marked)) for (const i of line) done.add(i);
  return done;
}

function CallPrompt({ call, big = false }: { call: CallInfo; big?: boolean }) {
  const long = call.prompt.length > 110;
  if (big) {
    return (
      <div className="paper stage-card flex items-center gap-[clamp(1rem,2vw,2.5rem)] px-[clamp(1.25rem,2.6vw,3.25rem)] py-[clamp(1rem,2.6vh,2.25rem)]">
        <h2 className={`min-w-0 flex-1 font-sans leading-[1.12] font-bold tracking-[-0.01em] text-pretty text-text ${long ? 'text-[clamp(1.6rem,2.5vw,3rem)]' : 'text-[clamp(2.25rem,3.8vw,4.5rem)]'}`}>{call.prompt}</h2>
        {call.media ? <QuestionImage media={call.media} size="host" className="max-w-[42%]" /> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <h2 className={`font-sans leading-snug font-bold text-pretty text-text ${long ? 'text-lg sm:text-xl' : 'text-[1.4rem] sm:text-[1.6rem]'}`}>{call.prompt}</h2>
      {call.media ? <QuestionImage media={call.media} size="phone" className="self-start" /> : null}
    </div>
  );
}

/** A card of squares. With `onMark`, unmarked squares are buttons. */
function Card({ squares, size, onMark, canMark = false, wrong = null, big = false, showLines = false, label }: { squares: Square[]; size: number; onMark?: (i: number) => void; canMark?: boolean; wrong?: number | null; big?: boolean; showLines?: boolean; label: string }) {
  // Squares grow with long answers (flashcard backs can be a sentence) rather than clipping them.
  // On the projector the squares share the screen's height with the winner's banner, so the whole card shows on a 768-pixel screen.
  const text = size >= 4 ? (big ? 'min-h-[clamp(4rem,10.5vh,8rem)] text-[clamp(1rem,min(1.4vw,2.5vh),1.5rem)]' : 'min-h-[4.5rem] text-[11px] min-[380px]:text-xs sm:min-h-24 sm:text-sm') : big ? 'min-h-[clamp(5rem,14vh,10rem)] text-[clamp(1.2rem,min(1.8vw,3.2vh),2rem)]' : 'min-h-24 text-sm sm:min-h-28 sm:text-base';
  const winning = showLines ? completedSquares(squares, size) : null;
  return (
    <div role="group" aria-label={label} className={`grid gap-2 ${size >= 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
      {squares.map((sq, i) => {
        const done = sq.free || sq.marked;
        // A square on a completed line gets a gold ring, so the line reads without colour.
        const ring = winning?.has(i) ? 'ring-4 ring-lantern ring-offset-2 ring-offset-[color:var(--stage-3)]' : '';
        const base = `relative flex items-center justify-center rounded-[var(--radius-m)] p-1.5 text-center font-bold leading-tight break-words hyphens-auto ${text} ${ring}`;
        if (sq.free) {
          return (
            <div key={i} className={`${base} bg-lantern text-on-accent`} role="img" aria-label="Free square">
              <span className="font-display text-[1.35em] font-extrabold italic" aria-hidden>
                Free
              </span>
            </div>
          );
        }
        const body = (
          <>
            <span className="min-w-0">{sq.text}</span>
            {sq.marked ? <Check className="absolute top-1 right-1 size-5 rounded-full bg-ink p-0.5 text-white" strokeWidth={3} aria-hidden /> : null}
          </>
        );
        if (!onMark || done) {
          return (
            <div key={i} className={`${base} ${sq.marked ? 'bg-glim text-on-accent' : 'paper'}`} aria-label={`${sq.text}${sq.marked ? ', marked' : ''}`} role="img">
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
            className={`paper piece ${base} [--press:4px] disabled:cursor-default ${wrong === i ? 'ring-4 ring-ember ring-offset-2 ring-offset-[color:var(--stage-3)]' : ''}`}
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
      <h3 className={`mb-2 font-display font-bold ${big ? 'text-[clamp(1.6rem,min(2.5vw,4.3vh),2.75rem)] leading-tight' : 'text-xl'}`}>Recent calls</h3>
      <ol className={`flex flex-col gap-1.5 ${big ? 'text-[clamp(1rem,min(1.3vw,2.4vh),1.4rem)]' : 'text-sm'}`}>
        {recent.map((c) => (
          <li key={c.n} className={`flex items-baseline gap-3 rounded-[var(--radius-m)] px-3 ${big ? 'py-[clamp(0.25rem,0.9vh,0.5rem)]' : 'py-2'} ${NIGHT}`}>
            <span className="shrink-0 font-display font-extrabold text-text-2 tabular">{c.n}</span>
            <span className="min-w-0 flex-1 truncate text-text-2">{c.prompt}</span>
            <span className="max-w-[45%] shrink-0 truncate font-bold">{c.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Leaders that fit the projector's side panel above the recent calls; the rest are counted. */
const LEADERS_SHOWN = 7;

function Leaders({ view, players, big = false }: { view: GlimgoView; players: RoomPlayerView[]; big?: boolean }) {
  if (!view.leaders.length) return null;
  const shown = big ? view.leaders.slice(0, LEADERS_SHOWN) : view.leaders;
  // The server sends the closest twelve; count everyone else in the room.
  const more = big ? Math.max(0, players.length - shown.length) : 0;
  return (
    <div>
      <h3 className={`mb-2 font-display font-bold ${big ? 'text-[clamp(1.6rem,min(2.5vw,4.3vh),2.75rem)] leading-tight' : 'text-xl'}`}>Closest to Glimgo</h3>
      <ol className={`flex flex-col gap-1.5 ${big ? 'text-[clamp(1rem,min(1.35vw,2.4vh),1.5rem)]' : 'text-sm'}`} aria-label="Players closest to Glimgo">
        {shown.map((p) => (
          <li key={p.playerId} className={`flex items-center gap-3 rounded-[var(--radius-m)] px-2.5 ${big ? 'py-1' : 'py-1.5'} ${p.toGo === 1 ? 'bg-lantern/[0.14] ring-2 ring-lantern ring-inset' : NIGHT}`}>
            <PlayerGlim avatar={avatarOf(players, p.playerId)} seed={p.playerId} size={40} className={big ? 'size-[clamp(2rem,4.2vh,3.25rem)] shrink-0' : 'size-9 shrink-0'} />
            <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
            <span className="font-semibold text-text-2 tabular">
              {p.marks} {p.marks === 1 ? 'mark' : 'marks'}
            </span>
            <span className={`text-right font-display font-extrabold whitespace-nowrap ${p.toGo === 1 ? 'text-lantern' : ''}`}>{toGoText(p.toGo)}</span>
          </li>
        ))}
      </ol>
      {more > 0 ? <p className="mt-1.5 text-[clamp(1rem,min(1.3vw,2.4vh),1.4rem)] font-semibold text-text-2">And {more} more.</p> : null}
    </div>
  );
}

function Finale({ view, players, big = false, me = null }: { view: GlimgoView; players: RoomPlayerView[]; big?: boolean; me?: string | null }) {
  const w = view.winner;
  if (!w) return null;
  const avatar = avatarOf(players, w.playerId);
  const mine = w.playerId === me;
  return (
    <div role="status" className={`lift relative isolate flex items-center rounded-[var(--radius-l)] bg-glim px-5 py-4 text-on-accent ${big ? 'gap-6' : 'gap-4'}`} style={{ animation: 'pop-in 220ms var(--ease-out)' }}>
      <span className="relative shrink-0">
        {avatar ? <PlayerGlim avatar={avatar} seed={w.playerId} size={big ? 140 : 80} aura="legendary" pose="cheer" className={big ? 'size-[clamp(5rem,14vh,9rem)]' : ''} /> : <Megaphone className={big ? 'size-24' : 'size-14'} aria-hidden />}
        <Burst style={avatar?.victory?.style ?? 'festival'} hue={avatar?.victory?.hue ?? 42} size={big ? 360 : 240} rise />
      </span>
      <div className="min-w-0">
        <p className={`font-display leading-none font-extrabold italic ${big ? 'text-[clamp(3.25rem,6.5vw,7.5rem)]' : 'text-[3.25rem]'}`}>Glimgo!</p>
        <p className={`truncate font-display font-extrabold ${big ? 'text-[clamp(1.9rem,3.2vw,3.75rem)]' : 'text-[1.75rem]'}`}>{mine ? 'You win' : `${w.name} wins`}</p>
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

  if (!you) return <p className="font-semibold text-text-2">Watching the game.</p>;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="plate plate-blue text-xl tabular">
          <span>{view.callCount ? `Call ${view.call?.n ?? view.callCount}` : 'Your card'}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <HudCount value={you.marks} label={you.marks === 1 ? 'mark' : 'marks'} />
          <Pill tone={you.toGo === 1 ? 'lantern' : 'calm'}>{toGoText(you.toGo)}</Pill>
        </div>
      </div>

      <StagePanel className="flex min-h-[7.5rem] flex-col justify-center gap-3 px-4 py-3">
        <div aria-live="polite" className="flex flex-col gap-3">
          {view.phase === 'intro' ? (
            <div>
              <p className="font-display text-[1.75rem] leading-tight font-extrabold">Study your card</p>
              <p className="font-semibold text-text-2">
                Each call is a question: tap the square that answers it. {rulesText(view, room)} First call in <Countdown until={view.phaseEndsAt} gameNow={gameNow} />
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
              <p className="font-semibold text-text-2">{view.revealed.prompt}</p>
              <p className="font-display text-[1.75rem] leading-tight font-extrabold">
                It was: <span className="text-glim">{view.revealed.text}</span>
              </p>
            </div>
          ) : null}
        </div>
      </StagePanel>

      {call ? (
        <p role="status" className={`min-h-6 font-bold ${lockLeft ? 'text-ember' : you.found ? 'text-glim' : 'text-text-2'}`}>
          {lockLeft ? (
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-4" aria-hidden /> Wrong square. Locked for {lockLeft} s.
            </span>
          ) : you.found ? (
            'Found it. Wait for the next call.'
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
          <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-[var(--radius-l)] bg-[rgb(5_8_24/0.62)]" aria-hidden>
            <span className="flex items-center gap-2 rounded-full bg-ember px-4 py-2 font-display text-[1.75rem] font-extrabold text-on-accent tabular">
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
    <div className="mx-auto grid w-full max-w-[110rem] flex-1 grid-cols-1 gap-[clamp(1rem,2vw,2rem)] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-[clamp(0.75rem,2vh,1.25rem)]">
        <div className="flex flex-wrap items-center justify-between gap-3 text-[clamp(1.1rem,1.8vw,2rem)]">
          <p className="plate plate-blue text-[clamp(1.4rem,2.1vw,2.4rem)] tabular">
            <span>{view.callCount ? `Call ${view.call?.n ?? view.callCount}` : 'Glimgo'}</span>
          </p>
          <span className="flex flex-wrap items-center gap-2">
            <Pill className="px-5 py-1.5">{GOAL[view.win]}</Pill>
            {view.oneToGo ? (
              <Pill tone="lantern" className="px-5 py-1.5">
                {view.oneToGo} one away
              </Pill>
            ) : null}
          </span>
        </div>
        {view.phase === 'intro' ? (
          <div className="flex flex-col items-center gap-[clamp(1rem,3vh,2rem)] py-4 text-center" style={{ animation: 'rise-fade 220ms var(--ease-out)' }}>
            <p className="plate plate-gold text-[clamp(1.5rem,2.6vw,3rem)]">
              <span>Get ready</span>
            </p>
            <h2 className="font-display text-[clamp(3.75rem,min(8vw,13.5vh),9.5rem)] leading-[0.95] font-extrabold">{room.room.title}</h2>
            <p className="max-w-[48ch] text-[clamp(1.1rem,min(1.7vw,3vh),2.2rem)] font-semibold text-text-2">Everyone has their own card of answers. Each call is a question: find the answer on your card and tap it. {rulesText(view, room)}</p>
            <BigCountdown until={view.phaseEndsAt} gameNow={gameNow} big label="First call in" />
            <LineUp players={room.players} big />
          </div>
        ) : view.phase === 'finale' ? (
          <div className="flex flex-col gap-5">
            <Finale view={view} players={room.players} big />
            {view.winner?.squares ? (
              <div className="max-w-2xl">
                <Card squares={view.winner.squares} size={view.size} big showLines label={`${view.winner.name}'s card`} />
              </div>
            ) : null}
          </div>
        ) : call ? (
          <div className="flex flex-col gap-[clamp(0.75rem,2vh,1.25rem)]">
            <TimerBar deadline={call.endsAt} start={call.startedAt} gameNow={gameNow} paused={paused} tone="violet" size="lg" />
            <CallPrompt call={call} big />
            <p className="text-[clamp(1.3rem,2.2vw,2.5rem)] font-bold text-text-2" aria-live="polite">
              {call.found ? `${call.found} found it` : 'Find it on your card'}
            </p>
          </div>
        ) : view.revealed ? (
          <div className="flex flex-col gap-3" style={{ animation: 'pop-in 200ms var(--ease-out)' }}>
            <p className="text-[clamp(1.3rem,2.2vw,2.5rem)] font-semibold text-text-2">{view.revealed.prompt}</p>
            <p className="font-display text-[clamp(3rem,5.8vw,7rem)] leading-tight font-extrabold">
              <span className="text-text-2">It was </span>
              <span className="text-glim">{view.revealed.text}</span>
            </p>
            <p className="text-[clamp(1.1rem,1.8vw,2rem)] font-bold text-text-2">
              {view.revealed.found} {view.revealed.found === 1 ? 'player' : 'players'} found it.
            </p>
          </div>
        ) : null}
      </div>
      <aside className="flex min-w-0 flex-col gap-[clamp(0.75rem,2vh,1.25rem)]">
        <Leaders view={view} players={room.players} big />
        <RecentCalls recent={view.recent.slice(0, 3)} big />
      </aside>
    </div>
  );
}
