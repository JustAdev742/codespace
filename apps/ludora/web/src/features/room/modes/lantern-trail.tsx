import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowLeftRight,
  Castle,
  CircleQuestionMark,
  CloudRain,
  Coins,
  Crown,
  Dices,
  FerrisWheel,
  Flame,
  Footprints,
  HandCoins,
  HandGrab,
  Hourglass,
  Map as MapIcon,
  Megaphone,
  MoonStar,
  Sailboat,
  Signpost,
  Tag,
  Ticket,
  Wallet,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type { Answer, LanternArt, RoomPlayerView } from '@ludora/shared';
import {
  CHANCE_CARDS,
  CROSSROADS,
  FINALE,
  FINALE_EVENT,
  GATE,
  HOT_STREAK,
  LOOP,
  PAYOUTS,
  REJOIN,
  ROOM_EVENTS,
  SHORTCUT,
  SPACES,
  WIND_STEPS,
  placeName,
  type CardId,
  type EventId,
  type SpaceKind,
} from '@ludora/engine/lantern-trail-board';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner, RevealAnswer, shortAnswer } from '../game/Reveal.tsx';
import { RankBadge, TeamScores } from '../game/Leaderboard.tsx';
import { Explanation, ModeTitle, myAvatar } from '../game/parts.tsx';
import { NIGHT, Pill, PlayerGlim, StagePanel, avatarOf, motionOK } from '../game/stage.tsx';
import { useAnnounce } from '../game/announce.tsx';
import { Lantern } from '../../../art/Lantern.tsx';
import { Button, buttonClass } from '../../../ui/Button.tsx';
import { Dialog } from '../../../ui/primitives.tsx';
import { useNow } from '../../../lib/useNow.ts';
import { ordinal, plural } from '../../../lib/format.ts';
import { playSfx, useSharedSounds, useSoundRole } from '../../../lib/sound/react.tsx';
import type { SfxName } from '../../../lib/sound/sfx.ts';

/*
 * Lantern Trail: a festival board game round the town. Right answers roll the
 * dice and walk your Glim round the loop; catch the Golden Lantern stall with
 * enough coins to buy a lantern, and it moves on. The board is drawn from the
 * engine's own board data, on a 3:2 panel sized with container units so the
 * same drawing fills a projector or a phone's map.
 */

/* ---------------------------------- view ---------------------------------- */

type Trick = 'pickpocket' | 'trade';

type Note =
  | { k: 'gate'; i: number; coins: number }
  | { k: 'space'; i: number; kind: 'coins' | 'fair' | 'gloom'; coins: number }
  | { k: 'ferry'; i: number; to: number }
  | { k: 'route'; i: number; route: 'long' | 'short'; auto: boolean }
  | { k: 'card'; i: number; card: CardId; coins: number }
  | { k: 'rumour'; i: number; to: number; came: boolean }
  | { k: 'steal'; i: number; name: string; coins: number }
  | { k: 'trade'; i: number; name: string; to: number }
  | { k: 'fizzle'; i: number; card: Trick }
  | { k: 'short'; i: number; price: number }
  | { k: 'buy'; i: number; price: number; ticket: boolean; to: number; auto: boolean }
  | { k: 'pass'; i: number }
  | { k: 'missed'; i: number; why: 'moved' | 'coins' };

interface MoveView {
  seq: number;
  at: number;
  done: boolean;
  dice: number[];
  kept: number | null;
  hot: boolean;
  double: boolean;
  steps: number;
  path: number[];
  jumps: number[];
  notes: Note[];
}

interface Target {
  id: string;
  name: string;
  coins: number;
  lanterns: number;
  stallSteps: number | null;
}

type PendingView =
  | { kind: 'fork'; deadline: number }
  | { kind: 'buy'; deadline: number; price: number; ticket: boolean; stall: number }
  | { kind: 'target'; deadline: number; card: Trick; targets: Target[] };

interface WalkerView {
  id: string;
  pos: number;
  l: number;
  c: number;
  rank: number;
  seq: number;
  path?: number[];
  jumps?: number[];
}

interface StallView {
  id: number;
  pos: number;
  from: number | null;
  movedAt: number;
  why: 'start' | 'bought' | 'parade' | 'rumour';
  n: number;
}

interface PlayView {
  n: number;
  kind: 'buy' | 'steal' | 'trade' | 'shower' | 'rumour' | 'goal';
  playerId: string;
  text: string;
  at: number;
}

export interface LanternTrailView {
  endsAt: number;
  lastAt: number;
  finalStretch: boolean;
  price: number;
  basePrice: number;
  goal: number;
  stalls: StallView[];
  event: { kind: EventId; startsAt: number; endsAt: number } | null;
  nextEventAt: number | null;
  walkers: WalkerView[];
  plays: PlayView[];
  sold: number;
  odds: { card: CardId; pct: number }[];
  teams: { teamId: string; name: string; hue: number; members: number; lanterns: number; coins: number }[] | null;
  you: {
    pos: number;
    coins: number;
    lanterns: number;
    tickets: number;
    streak: number;
    rank: number;
    price: number;
    stallSteps: number | null;
    question: QuestionView | null;
    last: FeedbackView | null;
    move: MoveView | null;
    pending: PendingView | null;
    hit: { kind: Trick; name: string; coins: number; to: number; at: number; n: number } | null;
  } | null;
}

/* ------------------------------ the board art ------------------------------ */

const GOLD: LanternArt = { hue: 44, accentHue: 16, pattern: 'flames' };

/** Each kind of space: its own icon and colour (from the tokens), and ink icons on every one, so none relies on colour. */
const KIND: Record<SpaceKind, { label: string; icon: LucideIcon; bg: string }> = {
  gate: { label: 'Town Gate', icon: Castle, bg: 'var(--rose)' },
  coins: { label: 'Coin space', icon: Coins, bg: 'var(--lantern)' },
  fair: { label: 'Lucky fair', icon: FerrisWheel, bg: 'var(--glim)' },
  gloom: { label: 'Gloom puddle', icon: CloudRain, bg: 'var(--r-common)' },
  chance: { label: 'Chance', icon: CircleQuestionMark, bg: 'var(--dusk)' },
  ferry: { label: 'Ferry', icon: Sailboat, bg: 'var(--sky)' },
  fork: { label: 'Crossroads', icon: Signpost, bg: '#ffffff' },
};

const LEGEND: SpaceKind[] = ['coins', 'fair', 'gloom', 'chance', 'ferry', 'fork', 'gate'];

const CARD_ICON: Record<CardId, LucideIcon> = { wind: Wind, purse: Wallet, shower: HandCoins, rumour: Megaphone, ticket: Ticket, pickpocket: HandGrab, trade: ArrowLeftRight, gloom: CloudRain };
const EVENT_ICON: Record<EventId, LucideIcon> = { double: Dices, sale: Tag, rush: Coins, parade: Footprints, gloomy: MoonStar };

interface Rules {
  puddles: boolean;
  bumper: boolean;
  stalls: number;
}

const rulesOf = (room: ModeScreenProps['room'], stalls: number): Rules => ({ puddles: room.room.settings.puddles !== false, bumper: room.room.settings.bumper === true, stalls });

/** A space as it plays tonight: with puddles off, every puddle is a lucky fair. */
const kindOf = (id: number, puddles: boolean): SpaceKind => {
  const k = SPACES[id]!.kind;
  return k === 'gloom' && !puddles ? 'fair' : k;
};

function kindDetail(kind: SpaceKind, r: Rules): string {
  const x = r.bumper ? 2 : 1;
  switch (kind) {
    case 'coins':
      return `+${PAYOUTS.coins * x} coins`;
    case 'fair':
      return `+${PAYOUTS.fair * x} coins`;
    case 'gloom':
      return `−${PAYOUTS.gloom} coins`;
    case 'gate':
      return `+${PAYOUTS.gate} as you pass`;
    case 'chance':
      return 'Draw a card';
    case 'ferry':
      return 'Sail across';
    case 'fork':
      return 'Pick a way';
  }
}

const eventInfo = (kind: EventId, stalls: number) => {
  const e = ROOM_EVENTS.find((x) => x.id === kind)!;
  return { title: e.title, text: kind === 'parade' && stalls > 1 ? 'Both stalls hop 3 spaces forward every 10 seconds.' : e.text };
};

/* Steps between spaces, moving forward, for the strip and the stall's distance. */
const STEPS: number[][] = SPACES.map((from) => {
  const d = SPACES.map(() => Infinity);
  d[from.id] = 0;
  const queue = [from.id];
  while (queue.length) {
    const a = queue.shift()!;
    for (const b of SPACES[a]!.next) {
      if (d[b] !== Infinity) continue;
      d[b] = d[a]! + 1;
      queue.push(b);
    }
  }
  return d;
});

/** The direction away from the middle of the board: Glims stand on the outside of the trail, stalls on the inside. */
const OUT: [number, number][] = SPACES.map((s) => {
  if (s.id >= LOOP) return [1, 0];
  const dx = (s.x - 50) * 1.5;
  const dy = s.y - 53;
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
});

/** Board units (a 150 by 100 drawing) for a space. */
const unit = (id: number) => [SPACES[id]!.x * 1.5, SPACES[id]!.y] as const;
const LOOP_PATH = `M${Array.from({ length: LOOP }, (_, i) => unit(i).join(' ')).join('L')}Z`;
const SHORTCUT_PATH = `M${[CROSSROADS, ...SHORTCUT, REJOIN].map((i) => unit(i).join(' ')).join('L')}`;
const RIVER = 'M-6 51C18 47 34 52 46 57S62 61 75 55S110 47 156 54';

/**
 * The town under the spaces: the river the ferry crosses, the Old Bridge, and the trail itself as one
 * crisp track round the loop with a narrower one for the shortcut. In Last lanterns the loop turns gold.
 */
function TownArt({ last }: { last: boolean }) {
  return (
    <svg viewBox="0 0 150 100" className="absolute inset-0 size-full" aria-hidden focusable={false}>
      <path d={RIVER} fill="none" stroke="var(--sky)" strokeOpacity={0.3} strokeWidth={7} strokeLinecap="round" />
      {/* The Old Bridge carries the shortcut over the water. */}
      <path d="M51.5 52.5Q57 49.5 62.5 52.5M51.5 63Q57 66 62.5 63" fill="none" stroke="rgb(255 255 255 / 0.5)" strokeWidth={1.2} strokeLinecap="round" />
      <path d={SHORTCUT_PATH} fill="none" stroke="rgb(255 255 255 / 0.16)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <path d={LOOP_PATH} fill="none" stroke={last ? 'var(--lantern)' : 'rgb(255 255 255 / 0.2)'} strokeOpacity={last ? 0.55 : 1} strokeWidth={2.2} strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A space as a solid token: its colour, an ink icon, and a darker band at the bottom like the game's
 * pieces. A space with a Golden Lantern stall wears a gold ring. Sized in ems from `size`, so the
 * ring keeps its proportions at every size.
 */
function SpaceDot({ kind, size, ring = false }: { kind: SpaceKind; size: string; ring?: boolean }) {
  const k = KIND[kind];
  const Icon = k.icon;
  // The white Crossroads token keeps a faint edge, so it still shows in the map dialog's light theme.
  const edge = `inset 0 -0.08em 0 rgb(0 0 0 / 0.22)${kind === 'fork' ? ', inset 0 0 0 0.05em rgb(11 16 32 / 0.25)' : ''}`;
  return (
    <span
      className="grid place-items-center rounded-full text-on-accent"
      style={{
        fontSize: size,
        width: '1em',
        height: '1em',
        background: k.bg,
        boxShadow: ring ? `${edge}, 0 0 0 0.09em var(--stage-2), 0 0 0 0.21em var(--lantern)` : edge,
      }}
    >
      <Icon style={{ width: '58%', height: '58%' }} strokeWidth={2.4} aria-hidden />
    </span>
  );
}

/* --------------------------- walking Glims around -------------------------- */

const STEP_MS = 190;
/** The dice tumble before the first step. */
const DICE_MS = 700;

interface Track {
  seq: number;
  path: number[];
  idx: number;
  pos: number;
  jumps: number[];
}

/**
 * Where each Glim stands on the board right now. A new move walks the Glim
 * along its path a step at a time (all at once with reduced motion); a Glim
 * moved by someone else (Trade places) glides straight to its new space.
 */
function useShownPositions(walkers: WalkerView[], animate: boolean) {
  const motion = animate && motionOK();
  const tracks = useRef(new Map<string, Track>());
  const [, tick] = useState(0);
  let moving = false;
  for (const w of walkers) {
    const path = w.path && w.path[w.path.length - 1] === w.pos ? w.path : null;
    const t = tracks.current.get(w.id);
    if (!t) tracks.current.set(w.id, { seq: w.seq, path: path ?? [w.pos], idx: (path ?? [w.pos]).length - 1, pos: w.pos, jumps: w.jumps ?? [] });
    else if (path && w.seq !== t.seq) Object.assign(t, { seq: w.seq, path, idx: 0, pos: w.pos, jumps: w.jumps ?? [] });
    else if (path && path.length > t.path.length) Object.assign(t, { path, pos: w.pos, jumps: w.jumps ?? [] });
    else if (w.pos !== t.pos) Object.assign(t, { seq: w.seq, path: [w.pos], idx: 0, pos: w.pos, jumps: [] });
    const tr = tracks.current.get(w.id)!;
    if (!motion) tr.idx = tr.path.length - 1;
    if (tr.idx < tr.path.length - 1) moving = true;
  }
  useEffect(() => {
    if (!moving) return;
    const id = setInterval(() => {
      for (const t of tracks.current.values()) if (t.idx < t.path.length - 1) t.idx++;
      tick((n) => n + 1);
    }, STEP_MS);
    return () => clearInterval(id);
  }, [moving]);
  const out = new Map<string, { node: number; jump: boolean }>();
  for (const w of walkers) {
    const t = tracks.current.get(w.id)!;
    out.set(w.id, { node: t.path[t.idx]!, jump: t.idx === 0 ? t.path.length === 1 : t.jumps.includes(t.idx) });
  }
  return out;
}

/** The golden stall, glowing on its space; it flies to its new space when someone buys from it. */
function StallMarker({ stall, size }: { stall: StallView; size: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(stall.n);
  useEffect(() => {
    if (stall.n === seen.current) return;
    seen.current = stall.n;
    const el = ref.current;
    const board = el?.closest('[data-board]');
    if (!el || !board || stall.from === null || !motionOK()) return;
    const { width, height } = board.getBoundingClientRect();
    const a = SPACES[stall.from]!;
    const b = SPACES[stall.pos]!;
    const inset = (id: number, axis: 0 | 1) => -OUT[id]![axis] * size * 0.8 * (width / 100);
    const dx = ((a.x - b.x) / 100) * width + inset(stall.from, 0) - inset(stall.pos, 0);
    const dy = ((a.y - b.y) / 100) * height + inset(stall.from, 1) - inset(stall.pos, 1);
    const far = stall.why === 'bought';
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(1)` },
        { transform: `translate(${dx / 2}px, ${dy / 2 - height * (far ? 0.16 : 0.05)}px) scale(${far ? 1.8 : 1.2})`, offset: 0.5 },
        { transform: 'translate(0, 0) scale(1)' },
      ],
      { duration: far ? 1300 : stall.why === 'rumour' ? 800 : 520, delay: far ? 900 : 0, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'backwards' },
    );
  }, [stall.n, stall.from, stall.pos, stall.why, size]);
  const s = SPACES[stall.pos]!;
  const [ox, oy] = OUT[stall.pos]!;
  return (
    <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left: `calc(${s.x}% - ${ox * size * 0.8}cqw)`, top: `calc(${s.y}% - ${oy * size * 0.8}cqw)` }}>
      <div ref={ref} style={{ width: `${size}cqw` }}>
        {/* The objective of the game: the one thing on the board with a light round it. */}
        <Lantern art={GOLD} size={64} lit className="h-auto w-full drop-shadow-[0_0_0.45em_var(--lantern)]" />
      </div>
    </div>
  );
}

/**
 * The whole trail. `big` is the projector's board (with Glims walking step by
 * step); otherwise it is the phone's map. `children` sit inside the loop.
 */
function Board({ view, players, rules, big, youId = null, children }: { view: LanternTrailView; players: RoomPlayerView[]; rules: Rules; big: boolean; youId?: string | null; children?: ReactNode }) {
  const shown = useShownPositions(view.walkers, big);
  const stallSpaces = new Set(view.stalls.map((s) => s.pos));
  const dot = big ? 4.3 : 5.2;
  const glim = big ? 3.9 : 4.6;
  // Glims on the same space share it: up to three stand side by side, and a count says how many more.
  const groups = new Map<number, string[]>();
  for (const w of view.walkers) {
    const node = shown.get(w.id)!.node;
    const list = groups.get(node) ?? [];
    if (w.id === youId) list.unshift(w.id);
    else list.push(w.id);
    groups.set(node, list);
  }
  return (
    // A dark map well in the stage's own navy (opaque, so it reads the same in the map dialog in either theme).
    <div data-board className="on-stage @container relative aspect-[3/2] w-full overflow-hidden rounded-[var(--radius-l)] bg-[var(--stage-2)] ring-1 ring-white/10 ring-inset">
      <div className="absolute inset-0" aria-hidden>
        <TownArt last={view.finalStretch} />
        {SPACES.map((s) => (
          <div key={s.id} className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
            <SpaceDot kind={kindOf(s.id, rules.puddles)} size={`${s.id === GATE ? dot * 1.25 : dot}cqw`} ring={stallSpaces.has(s.id)} />
          </div>
        ))}
        {view.stalls.map((st) => (
          <StallMarker key={st.id} stall={st} size={big ? 4.6 : 5.6} />
        ))}
        {view.walkers.map((w) => {
          const { node, jump } = shown.get(w.id)!;
          const group = groups.get(node)!;
          const k = group.indexOf(w.id);
          if (k >= 3) return null;
          const m = Math.min(3, group.length);
          const [ox, oy] = OUT[node]!;
          const spread = (k - (m - 1) / 2) * glim * 0.62;
          const x = ox * glim * 1.15 - oy * spread;
          const y = oy * glim * 1.15 + ox * spread;
          const s = SPACES[node]!;
          return (
            <div
              key={w.id}
              className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `calc(${s.x}% + ${x}cqw)`, top: `calc(${s.y}% + ${y}cqw)`, width: `${glim}cqw`, height: `${glim}cqw`, transition: `left ${jump ? 700 : 170}ms ease-in-out, top ${jump ? 700 : 170}ms ease-in-out` }}
            >
              <PlayerGlim avatar={avatarOf(players, w.id)} seed={w.id} size={48} className="size-full" />
              {w.id === youId ? (
                // Your Glim carries a gold "You" tag, so it is found by its words as well as its place.
                <span className="absolute -top-[1em] left-1/2 -translate-x-1/2 rounded-[var(--radius-s)] bg-lantern px-[0.45em] leading-tight font-bold text-on-accent shadow-[0_4px_10px_-4px_rgb(2_5_20/0.8)]" style={{ fontSize: `${glim * 0.32}cqw` }}>
                  You
                </span>
              ) : null}
            </div>
          );
        })}
        {[...groups].map(([node, ids]) =>
          ids.length > 3 ? (
            <span
              key={`more-${node}`}
              className="absolute z-30 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-[0.4em] font-display leading-tight font-extrabold text-on-accent tabular shadow-[0_4px_10px_-4px_rgb(2_5_20/0.8)]"
              style={{ left: `calc(${SPACES[node]!.x}% + ${OUT[node]![0] * glim * 2.15}cqw)`, top: `calc(${SPACES[node]!.y}% + ${OUT[node]![1] * glim * 2.15}cqw)`, fontSize: `${glim * 0.36}cqw` }}
            >
              +{ids.length - 3}
            </span>
          ) : null,
        )}
      </div>
      {children}
    </div>
  );
}

/** What each kind of space does, as icon, name and payout: shapes and words, never colour alone. */
function Legend({ rules, className = '', style }: { rules: Rules; className?: string; style?: CSSProperties }) {
  const kinds = LEGEND.filter((k) => k !== 'gloom' || rules.puddles);
  return (
    <ul className={`grid grid-cols-2 ${className}`} style={style} aria-label="What the spaces do">
      {kinds.map((k) => (
        <li key={k} className="flex min-w-0 items-center gap-[0.45em]">
          <span className="shrink-0">
            <SpaceDot kind={k} size="1.65em" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-bold">{KIND[k].label}</span>
            <span className="block truncate text-text-2">{kindDetail(k, rules)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The chance cards and the odds of each, as this player would draw them now. */
function OddsList({ odds, big = false }: { odds: LanternTrailView['odds']; big?: boolean }) {
  return (
    <ul className={`flex flex-col ${big ? 'gap-1' : 'gap-1.5'}`} aria-label="Chance cards and their odds">
      {odds.map((o) => {
        const card = CHANCE_CARDS.find((c) => c.id === o.card)!;
        const Icon = CARD_ICON[o.card];
        return (
          <li key={o.card} className="flex items-center gap-2">
            <Icon className="size-[1.2em] shrink-0 text-lantern" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="font-bold">{card.title}</span> <span className="text-text-2">{card.text}</span>
            </span>
            <span className="shrink-0 font-display font-extrabold tabular">{o.pct}%</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------ move wording ------------------------------ */

const at = (path: number[], i: number) => SPACES[path[i] ?? GATE]!.name;

function noteText(n: Note, path: number[]): string {
  switch (n.k) {
    case 'gate':
      return `Past the Town Gate: +${n.coins} coins.`;
    case 'space':
      if (n.kind === 'coins') return `${at(path, n.i)}: +${n.coins} coins.`;
      if (n.kind === 'fair') return `${at(path, n.i)}, a lucky fair: +${n.coins} coins.`;
      return n.coins < 0 ? `${at(path, n.i)}, a gloom puddle: −${-n.coins} coins.` : `${at(path, n.i)}, a gloom puddle. No coins to lose.`;
    case 'ferry':
      return `The ferry carried you to ${placeName(n.to)}.`;
    case 'route':
      if (n.auto) return 'No choice in time, so the long way round.';
      return n.route === 'short' ? 'You took the shortcut.' : 'You took the long way round.';
    case 'card': {
      const title = CHANCE_CARDS.find((c) => c.id === n.card)!.title;
      if (n.card === 'purse') return `Chance card: ${title}. +${n.coins} coins.`;
      if (n.card === 'shower') return `Chance card: ${title}. Everyone gets coins, and you get ${n.coins}.`;
      if (n.card === 'wind') return `Chance card: ${title}. 3 more steps.`;
      if (n.card === 'ticket') return `Chance card: ${title}. Your next Golden Lantern costs 10 less.`;
      if (n.card === 'gloom') return n.coins < 0 ? `Chance card: ${title}. −${-n.coins} coins.` : `Chance card: ${title}. No coins to lose.`;
      return `Chance card: ${title}.`;
    }
    case 'rumour':
      return n.came ? 'The stall came right to you.' : `The stall moved to ${placeName(n.to)}.`;
    case 'steal':
      return n.coins ? `You took ${plural(n.coins, 'coin')} from ${n.name}.` : `${n.name}’s purse was empty.`;
    case 'trade':
      return `You swapped places with ${n.name}. You are at ${placeName(n.to)}.`;
    case 'fizzle':
      return 'Nobody to pick right now, so nothing happened.';
    case 'short':
      return `The Golden Lantern stall. You need ${n.price} coins to buy one.`;
    case 'buy':
      return `You bought a Golden Lantern for ${n.price} coins. The stall moved to ${placeName(n.to)}.`;
    case 'pass':
      return 'You kept walking.';
    case 'missed':
      return n.why === 'moved' ? 'The stall moved on before you chose.' : 'Not enough coins any more.';
  }
}

function noteIcon(n: Note): LucideIcon {
  switch (n.k) {
    case 'gate':
      return Castle;
    case 'space':
      return KIND[n.kind].icon;
    case 'ferry':
      return Sailboat;
    case 'route':
      return Signpost;
    case 'card':
      return CARD_ICON[n.card];
    case 'rumour':
      return Megaphone;
    case 'steal':
      return HandGrab;
    case 'trade':
      return ArrowLeftRight;
    case 'buy':
      return Crown;
    default:
      return Footprints;
  }
}

/** The one sound a note makes on its player's device, if any. */
function noteSound(n: Note): SfxName | null {
  if (n.k === 'buy') return 'purchase';
  if (n.k === 'steal') return 'steal';
  if (n.k === 'trade') return 'swap';
  if (n.k === 'ferry') return 'go';
  if ((n.k === 'space' || n.k === 'card') && n.coins < 0) return 'bust';
  if (n.k === 'gate' || (n.k === 'space' && n.coins > 0) || (n.k === 'card' && n.coins > 0)) return 'coin';
  return null;
}

const SOUND_RANK: SfxName[] = ['purchase', 'steal', 'swap', 'bust', 'go', 'coin'];

/* ------------------------------ the player's walk ------------------------------ */

const HOLD_MS = 1500;
const HOLD_REDUCED_MS = 2200;

interface WalkState {
  seq: number;
  idx: number;
  closed: boolean;
}

/**
 * Walks the player's own Glim along their latest move, a step at a time, then
 * holds the result for a moment before the next question. A move that was
 * already over when the screen opened is not replayed.
 */
function useWalk(move: MoveView | null, motion: boolean) {
  const seq = move?.seq ?? 0;
  const len = move?.path.length ?? 1;
  const done = move?.done ?? true;
  const [w, setW] = useState<WalkState>(() => ({ seq, idx: len - 1, closed: true }));
  const fresh = w.seq !== seq;
  const idx = fresh ? 0 : Math.min(w.idx, len - 1);
  const closed = fresh ? false : w.closed;
  useEffect(() => {
    if (fresh) {
      setW({ seq, idx: motion ? 0 : len - 1, closed: false });
      return;
    }
    if (w.idx >= len - 1) return;
    if (!motion) {
      setW((x) => ({ ...x, idx: len - 1 }));
      return;
    }
    const t = setTimeout(() => setW((x) => (x.seq === seq ? { ...x, idx: x.idx + 1 } : x)), w.idx === 0 ? DICE_MS : STEP_MS);
    return () => clearTimeout(t);
  }, [fresh, seq, len, w.idx, motion]);
  useEffect(() => {
    if (fresh || w.closed || !done || w.idx < len - 1) return;
    const t = setTimeout(() => setW((x) => (x.seq === seq ? { ...x, closed: true } : x)), motion ? HOLD_MS : HOLD_REDUCED_MS);
    return () => clearTimeout(t);
  }, [fresh, w.closed, w.idx, len, done, seq, motion]);
  return { idx, caughtUp: idx >= len - 1, closed, close: () => setW((x) => ({ ...x, idx: len - 1, closed: true })) };
}

/** Shows a wrong answer's result (the right answer and why) for a moment before the next question. */
function useMissFlow(last: FeedbackView | null | undefined, question: QuestionView | null | undefined) {
  const asked = useRef(new Map<string, QuestionView>());
  const seen = useRef<string | null>(last?.iid ?? null);
  const [miss, setMiss] = useState<FeedbackView | null>(null);
  const lastIid = last?.iid ?? null;
  const latest = useRef(last);
  latest.current = last;
  useEffect(() => {
    if (!question) return;
    asked.current.set(question.iid, question);
    if (asked.current.size > 6) asked.current.delete(asked.current.keys().next().value!);
  }, [question]);
  useEffect(() => {
    if (!lastIid || lastIid === seen.current) return;
    seen.current = lastIid;
    const l = latest.current;
    if (l && !l.correct) setMiss(l);
  }, [lastIid]);
  useEffect(() => {
    if (!miss) return;
    const t = setTimeout(() => setMiss(null), 2600);
    return () => clearTimeout(t);
  }, [miss]);
  return { miss, answered: miss ? (asked.current.get(miss.iid) ?? null) : null, dismiss: () => setMiss(null) };
}

const PIPS: Record<number, [number, number][]> = {
  1: [[24, 24]],
  2: [
    [15, 15],
    [33, 33],
  ],
  3: [
    [14, 14],
    [24, 24],
    [34, 34],
  ],
  4: [
    [15, 15],
    [33, 15],
    [15, 33],
    [33, 33],
  ],
  5: [
    [14, 14],
    [34, 14],
    [24, 24],
    [14, 34],
    [34, 34],
  ],
  6: [
    [15, 13],
    [33, 13],
    [15, 24],
    [33, 24],
    [15, 35],
    [33, 35],
  ],
};

function Die({ value, faded = false, tumble }: { value: number; faded?: boolean; tumble: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!motionOK() || !ref.current) return;
    ref.current.animate(
      [
        { transform: 'rotate(-220deg) scale(0.35)', opacity: 0 },
        { transform: 'rotate(18deg) scale(1.12)', opacity: 1, offset: 0.7 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 620, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    );
  }, [tumble]);
  return (
    // A white die with ink pips and a darker band along its bottom edge, like the game's pieces.
    <svg ref={ref} viewBox="0 0 48 48" className={`size-14 shrink-0 sm:size-16 ${faded ? 'opacity-40' : ''}`} aria-hidden focusable={false}>
      <rect x="2" y="2" width="44" height="44" rx="9" fill="#d9deec" />
      <rect x="2" y="2" width="44" height="40" rx="9" fill="#ffffff" />
      {PIPS[value]!.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy - 2} r="4.4" fill="var(--on-accent)" />
      ))}
    </svg>
  );
}

/** The roll and the walk: big dice, the steps counting up, and what each space did. */
function RollPanel({ move, idx, compact }: { move: MoveView; idx: number; compact: boolean }) {
  const walked = move.path.slice(1, idx + 1).filter((_, k) => !move.jumps.includes(k + 1)).length;
  const notes = move.notes.filter((n) => n.i <= idx);
  // Wind at your back adds its steps to the walk.
  const total = move.steps + notes.filter((n) => n.k === 'card' && n.card === 'wind').length * WIND_STEPS;
  return (
    <StagePanel className="flex flex-col gap-2 px-3 py-3 sm:px-4" label="Your roll">
      <div className="flex items-center gap-3">
        <div className="flex gap-2">
          {move.dice.map((d, i) => (
            <Die key={i} value={d} faded={move.kept !== null && move.kept !== i} tumble={`${move.seq}:${i}`} />
          ))}
        </div>
        <div className="min-w-0">
          {move.hot ? (
            <Pill tone="ember" className="mb-1 px-2.5! py-0.5! text-sm">
              <Flame className="size-4" aria-hidden /> Hot streak
            </Pill>
          ) : move.double ? (
            <Pill tone="glim" className="mb-1 px-2.5! py-0.5! text-sm">
              <Dices className="size-4" aria-hidden /> Double dice
            </Pill>
          ) : null}
          <p className="font-display text-2xl leading-tight font-extrabold tabular" aria-hidden>
            {walked} of {total} {total === 1 ? 'step' : 'steps'}
          </p>
          <p className="truncate text-sm font-bold text-text-2">{SPACES[move.path[idx]!]!.name}</p>
        </div>
      </div>
      {notes.length && !compact ? (
        <ul className="flex flex-col gap-1">
          {notes.map((n, i) => {
            const Icon = noteIcon(n);
            return (
              <li key={i} className="flex items-start gap-2 text-sm leading-snug font-bold sm:text-base" style={{ animation: 'rise-fade 200ms var(--ease-out) both' }}>
                <Icon className="mt-0.5 size-4 shrink-0 text-lantern" aria-hidden />
                <span>{noteText(n, move.path)}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </StagePanel>
  );
}

/* --------------------------------- prompts --------------------------------- */

/** A way to go as a big solid button: its name in the display face, what it means underneath in the body face. */
const choiceButton = (variant: 'primary' | 'success' | 'secondary') => buttonClass(variant, 'lg', 'h-auto! min-h-16 w-full flex-col items-start! gap-0.5! whitespace-normal! px-4! py-3! text-left [--press:5px]');

function Deadline({ until, gameNow, text }: { until: number; gameNow: () => number; text: string }) {
  return (
    <p className="text-sm font-semibold text-text-2">
      {text} in <Countdown until={until} gameNow={gameNow} label={text} />.
    </p>
  );
}

function ForkPrompt({ view, gameNow, choose, busy }: { view: LanternTrailView; gameNow: () => number; choose: (route: 'long' | 'short') => void; busy: boolean }) {
  const pending = view.you!.pending as Extract<PendingView, { kind: 'fork' }>;
  const onShortcut = view.stalls.some((s) => SHORTCUT.includes(s.pos));
  const onLong = view.stalls.some((s) => s.pos > CROSSROADS && s.pos < REJOIN);
  useAnnounce(`You reached the Crossroads. Take the long way round, or the shortcut?${onShortcut ? ' A Golden Lantern stall is on the shortcut.' : onLong ? ' A Golden Lantern stall is on the long way round.' : ''}`, `fork:${pending.deadline}`);
  return (
    <StagePanel as="section" className="flex flex-col gap-3 p-3 sm:p-4" label="Choose your way">
      <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold">
        <Signpost className="size-6 text-lantern" aria-hidden /> Which way?
      </h2>
      {onShortcut || onLong ? (
        <p className="flex items-center gap-2 font-bold">
          <Lantern art={GOLD} size={22} lit /> A Golden Lantern stall is on the {onShortcut ? 'shortcut' : 'long way round'}.
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className={choiceButton('primary')} disabled={busy} onClick={() => choose('long')}>
          <span className="font-display text-[1.5rem] leading-tight font-extrabold">Long way round</span>
          <span className="text-sm font-semibold">11 steps to the Clock Tower, past a lucky fair, the West Pier ferry and 2 chance spaces.</span>
        </button>
        <button type="button" className={choiceButton('success')} disabled={busy} onClick={() => choose('short')}>
          <span className="font-display text-[1.5rem] leading-tight font-extrabold">Shortcut</span>
          <span className="text-sm font-semibold">5 steps to the Clock Tower, over the Old Bridge. 2 of its 4 spaces are gloom puddles.</span>
        </button>
      </div>
      <Deadline until={pending.deadline} gameNow={gameNow} text="The long way" />
    </StagePanel>
  );
}

function BuyPrompt({ view, gameNow, decide, busy }: { view: LanternTrailView; gameNow: () => number; decide: (buy: boolean) => void; busy: boolean }) {
  const you = view.you!;
  const pending = you.pending as Extract<PendingView, { kind: 'buy' }>;
  useAnnounce(`The Golden Lantern stall. Buy a Golden Lantern for ${pending.price} coins? You have ${you.coins}.`, `buy:${pending.deadline}`);
  return (
    // The moment the trail is about: the stall's name on the gold plate, the price on the button.
    <StagePanel as="section" className="flex flex-col gap-3 p-3 ring-2 ring-lantern ring-inset sm:p-4" label="Golden Lantern stall">
      <div className="flex items-center gap-3">
        <Lantern art={GOLD} size={54} lit className="shrink-0" />
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <h2 className="plate plate-gold text-2xl">
            <span>Golden Lantern stall</span>
          </h2>
          <p className="font-bold text-text-2">
            You have {plural(you.coins, 'coin')}.{pending.ticket ? ' Your Golden ticket takes 10 off.' : ''}
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
        <Button variant="primary" size="xl" className="w-full" icon={<Crown className="size-6" aria-hidden />} disabled={busy} onClick={() => decide(true)}>
          Buy for {pending.price} coins
        </Button>
        <Button size="xl" className="w-full" icon={<Footprints className="size-5" aria-hidden />} disabled={busy} onClick={() => decide(false)}>
          Keep walking
        </Button>
      </div>
      <Deadline until={pending.deadline} gameNow={gameNow} text="Buying for you" />
    </StagePanel>
  );
}

function TargetPrompt({ view, gameNow, players, pick, busy }: { view: LanternTrailView; gameNow: () => number; players: RoomPlayerView[]; pick: (id: string) => void; busy: boolean }) {
  const pending = view.you!.pending as Extract<PendingView, { kind: 'target' }>;
  const steal = pending.card === 'pickpocket';
  const title = steal ? 'Pickpocket Glim' : 'Trade places';
  const ask = steal ? 'Pick a player to take 5 coins from.' : 'Pick a player to swap places with.';
  useAnnounce(`${title}. ${ask}`, `target:${pending.deadline}`);
  return (
    <StagePanel as="section" className="flex flex-col gap-3 p-3 sm:p-4" label={title}>
      <div>
        <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold">
          {steal ? <HandGrab className="size-6 text-lantern" aria-hidden /> : <ArrowLeftRight className="size-6 text-lantern" aria-hidden />} {title}
        </h2>
        <p className="font-bold text-text-2">{ask}</p>
      </div>
      <ul className="flex max-h-[42dvh] flex-col gap-2 overflow-y-auto" aria-label="Players you can pick">
        {pending.targets.map((t) => (
          <li key={t.id}>
            <button type="button" disabled={busy} onClick={() => pick(t.id)} className={`${buttonClass('secondary', 'lg', 'h-auto! min-h-14 w-full justify-start! gap-3! px-3! py-2! text-left')}`}>
              <PlayerGlim avatar={avatarOf(players, t.id)} seed={t.id} size={40} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{t.name}</span>
                <span className="block text-sm font-semibold text-text-2">
                  {plural(t.coins, 'coin')}, {plural(t.lanterns, 'lantern')}
                  {t.stallSteps !== null ? `, ${plural(t.stallSteps, 'step')} from a stall` : ''}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Deadline until={pending.deadline} gameNow={gameNow} text="The leader is picked" />
    </StagePanel>
  );
}

/* ------------------------------ the phone screen ----------------------------- */

/** The route ahead of a space: the move's own path where there is one, then the way the trail runs (the long way at the Crossroads). */
function routeFrom(path: number[], from: number, count: number): number[] {
  const out = path.slice(from, from + count);
  while (out.length < count) out.push(SPACES[out[out.length - 1]!]!.next[0]!);
  return out;
}

/** Your stretch of the trail: your space and the next 8, your Glim, and the nearest stall. */
function TrailStrip({ route, glimAt, stalls, rules, avatar, seed }: { route: number[]; glimAt: number; stalls: StallView[]; rules: Rules; avatar: RoomPlayerView['avatar'] | undefined; seed: string }) {
  const stallSpaces = new Set(stalls.map((s) => s.pos));
  return (
    // Nine spaces across, each a little narrower than its column (9 columns and 8 gaps of 3px share the strip's width).
    <ol className="@container grid grid-cols-9 items-end gap-[3px] pt-5" aria-hidden>
      {route.map((id, i) => (
        <li key={`${i}-${id}`} className={`relative flex justify-center ${stallSpaces.has(id) ? 'z-[1]' : ''}`}>
          {i === glimAt ? (
            <span className="absolute bottom-[78%] left-1/2 z-10 w-[118%] -translate-x-1/2" style={{ transition: 'left 170ms ease-in-out' }}>
              <PlayerGlim avatar={avatar} seed={seed} size={40} className="h-auto w-full" />
            </span>
          ) : stallSpaces.has(id) ? (
            <span className="absolute bottom-[80%] left-1/2 w-[86%] -translate-x-1/2">
              <Lantern art={GOLD} size={32} lit className="h-auto w-full" />
            </span>
          ) : null}
          <SpaceDot kind={kindOf(id, rules.puddles)} size="calc(10.2cqw - 2.5px)" ring={stallSpaces.has(id)} />
        </li>
      ))}
    </ol>
  );
}

/** The whole loop in miniature, with your Glim and the stalls as dots: the button that opens the full map. */
function MiniMap({ you, stalls }: { you: number; stalls: StallView[] }) {
  const [x, y] = unit(you);
  return (
    <svg viewBox="0 0 150 100" className="h-full w-auto" aria-hidden focusable={false}>
      <path d={RIVER} fill="none" stroke="var(--sky)" strokeOpacity={0.45} strokeWidth={8} />
      <path d={LOOP_PATH} fill="none" stroke="rgb(255 255 255 / 0.55)" strokeWidth={5} strokeLinejoin="round" />
      <path d={SHORTCUT_PATH} fill="none" stroke="rgb(255 255 255 / 0.35)" strokeWidth={3.5} strokeLinejoin="round" />
      {stalls.map((st) => {
        const [sx, sy] = unit(st.pos);
        return <circle key={st.id} cx={sx} cy={sy} r={10} fill="var(--lantern)" stroke="var(--stage-3)" strokeWidth={3.5} />;
      })}
      <circle cx={x} cy={y} r={9} fill="#ffffff" stroke="var(--stage-3)" strokeWidth={4} />
    </svg>
  );
}

function EventPill({ view, gameNow, rules }: { view: LanternTrailView; gameNow: () => number; rules: Rules }) {
  if (view.finalStretch)
    return (
      <Pill tone="lantern" className="px-2.5! py-0.5! text-sm">
        <Flame className="size-4" aria-hidden /> Last lanterns <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
      </Pill>
    );
  if (view.event) {
    const Icon = EVENT_ICON[view.event.kind];
    return (
      <Pill tone="glim" className="px-2.5! py-0.5! text-sm">
        <Icon className="size-4" aria-hidden /> {eventInfo(view.event.kind, rules.stalls).title} <Countdown until={view.event.endsAt} gameNow={gameNow} label="Event ends in" />
      </Pill>
    );
  }
  return (
    <Pill className="px-2.5! py-0.5! text-sm">
      <Hourglass className="size-4" aria-hidden /> {view.nextEventAt !== null ? 'Event in' : 'Last lanterns in'} <Countdown until={view.nextEventAt ?? view.lastAt} gameNow={gameNow} label={view.nextEventAt !== null ? 'Next room event in' : 'Last lanterns in'} />
    </Pill>
  );
}

/** Says a room event (and Last lanterns) once as it starts. On the shared screen it also plays the event sound. */
function useEventNews(view: LanternTrailView, rules: Rules, sound: boolean) {
  const key = view.finalStretch ? 'last' : view.event ? `event:${view.event.startsAt}` : null;
  const first = useRef(key);
  const text = view.finalStretch ? `${FINALE_EVENT.title}: ${FINALE_EVENT.text}` : view.event ? `Room event for 30 seconds: ${eventInfo(view.event.kind, rules.stalls).title}. ${eventInfo(view.event.kind, rules.stalls).text}` : null;
  useAnnounce(key && key !== first.current ? text : null, key);
  useEffect(() => {
    if (key && key !== first.current && sound) playSfx('event');
    first.current = null;
  }, [key, sound]);
}

/** Another player's trick on you, for a few seconds, with its sound on your device. */
function HitNews({ hit, gameNow, own }: { hit: NonNullable<LanternTrailView['you']>['hit']; gameNow: () => number; own: boolean }) {
  useNow(1000, Boolean(hit) && gameNow() - hit!.at < 6500);
  const seen = useRef(hit?.n ?? 0);
  const fresh = hit && hit.n !== seen.current;
  useEffect(() => {
    if (!hit || hit.n === seen.current) return;
    seen.current = hit.n;
    if (own) playSfx(hit.kind === 'pickpocket' ? 'stolen' : 'swap');
  }, [hit, own]);
  const title = hit?.kind === 'pickpocket' ? 'Pickpocket Glim' : 'Trade places';
  const detail = !hit ? null : hit.kind === 'pickpocket' ? (hit.coins ? `${hit.name}’s Pickpocket Glim took ${plural(hit.coins, 'coin')} from you.` : `${hit.name}’s Pickpocket Glim found your purse empty.`) : `${hit.name} traded places with you. You are at ${placeName(hit.to)}.`;
  useAnnounce(fresh ? detail : null, hit?.n ?? 0);
  if (!hit || gameNow() - hit.at > 6000) return null;
  // A trick played on you: coral for coins taken, blue for a swap, each with its own icon and words.
  return (
    <div role="status" className={`lift flex items-center gap-3 rounded-[var(--radius-l)] px-4 py-3 text-on-accent ${hit.kind === 'pickpocket' ? 'bg-ember' : 'bg-sky'}`} style={{ animation: 'pop-in 200ms var(--ease-out)' }}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink/85 text-white" aria-hidden>
        {hit.kind === 'pickpocket' ? <HandGrab className="size-6" /> : <ArrowLeftRight className="size-6" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[1.75rem] leading-tight font-extrabold italic">{title}</p>
        <p className="leading-snug font-semibold">{detail}</p>
      </div>
      {hit.kind === 'pickpocket' && hit.coins ? (
        <span className="plate shrink-0 text-[1.6rem] tabular">
          <span>
            −{hit.coins}
            <span className="sr-only"> coins</span>
          </span>
        </span>
      ) : null}
    </div>
  );
}

function MapDialog({ open, onOpenChange, view, room, rules }: { open: boolean; onOpenChange: (v: boolean) => void; view: LanternTrailView; room: ModeScreenProps['room']; rules: Rules }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="The trail" description="Every space, everyone’s Glim and the Golden Lantern stall. You walk clockwise from the Town Gate.">
      <div className="flex flex-col gap-4">
        <Board view={view} players={room.players} rules={rules} big={false} youId={room.me.playerId} />
        <Legend rules={rules} className="gap-x-3 gap-y-2 text-sm" />
        <section aria-labelledby="lt-odds">
          <h3 id="lt-odds" className="mb-1.5 font-display text-lg font-extrabold">
            Chance cards
          </h3>
          <OddsList odds={view.odds} />
          <p className="mt-1.5 text-sm text-text-2">Cards that need another player to pick only turn up when there is someone to pick.</p>
        </section>
      </div>
    </Dialog>
  );
}

export function LanternTrailPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<LanternTrailView>) {
  const you = view.you;
  const motion = motionOK();
  const role = useSoundRole();
  const own = role !== 'host';
  const shared = useSharedSounds();
  const rules = rulesOf(room, view.stalls.length);
  const walk = useWalk(you?.move ?? null, motion);
  const miss = useMissFlow(you?.last, you?.question);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  useEventNews(view, rules, shared);
  useMoveSounds(you?.move ?? null, walk.idx, own, you?.streak ?? 0, motion);
  useJackpot(view.plays, shared, room.me.playerId);

  const move = you?.move ?? null;
  const pending = you?.pending ?? null;
  const showRoll = Boolean(move && !walk.closed);
  const summary = move && walk.caughtUp ? move.notes.map((n) => noteText(n, move.path)).join(' ') : '';
  useAnnounce(showRoll && walk.caughtUp && summary ? summary : null, `${move?.seq}:${move?.path.length}:${move?.notes.length}:${walk.caughtUp}`);

  if (!you) return <p className="font-semibold text-text-2">Watching the trail.</p>;

  const send = async (a: unknown) => {
    setBusy(true);
    const ack = await act(a);
    setBusy(false);
    setError(ack.ok ? null : ack.error.message);
  };
  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };

  // The stretch of trail on the phone: from where the walk started, a page of 8 steps at a time.
  const walking = showRoll && move;
  const page = walking ? Math.floor(walk.idx / 8) * 8 : 0;
  const route = walking ? routeFrom(move.path, page, 9) : routeFrom([you.pos], 0, 9);
  const glimAt = walking ? walk.idx - page : 0;
  const here = route[glimAt]!;
  const nearest = Math.min(...view.stalls.map((s) => STEPS[here]![s.pos]!));
  const longWay = (() => {
    let n = here;
    for (let k = 0; k < 40; k++) {
      if (view.stalls.some((s) => s.pos === n)) return k;
      n = SPACES[n]!.next[0]!;
    }
    return Infinity;
  })();
  const players = view.walkers.length;
  const prompt = walk.caughtUp ? pending : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-4">
      <StagePanel as="section" className="flex flex-col gap-1 px-2.5 pt-2 pb-2 sm:px-4 sm:pt-3" label="Your trail">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex items-center gap-3 font-display text-xl font-extrabold tabular sm:text-2xl">
            <span className="flex items-center gap-1">
              <Lantern art={GOLD} size={24} lit />
              {you.lanterns}
              <span className="sr-only"> Golden {you.lanterns === 1 ? 'Lantern' : 'Lanterns'},</span>
            </span>
            <span className="flex items-center gap-1">
              <Coins className="size-5 text-lantern" aria-hidden />
              {you.coins}
              <span className="sr-only"> coins</span>
            </span>
            {you.tickets ? (
              <span className="flex items-center gap-1 text-base" title="Golden ticket">
                <Ticket className="size-4 text-lantern" aria-hidden />×{you.tickets}
                <span className="sr-only"> Golden {you.tickets === 1 ? 'ticket' : 'tickets'}</span>
              </span>
            ) : null}
            {players > 1 ? <span className="text-base text-text-2 sm:text-lg">{ordinal(you.rank)}</span> : null}
          </div>
          <div className="flex items-center gap-1.5">
            {you.streak >= HOT_STREAK ? (
              <Pill tone="ember" className="px-2! py-0.5! text-sm">
                <Flame className="size-4" aria-hidden /> <span className="max-[379px]:sr-only">Hot streak</span>
              </Pill>
            ) : null}
            <EventPill view={view} gameNow={gameNow} rules={rules} />
          </div>
        </div>
        <TrailStrip route={route} glimAt={glimAt} stalls={view.stalls} rules={rules} avatar={myAvatar(room)} seed={room.me.playerId ?? 'you'} />
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-sm leading-snug font-bold">
            <span className="text-text-2">{SPACES[here]!.name}. </span>
            {Number.isFinite(nearest) ? (
              nearest === 0 ? (
                'A Golden Lantern stall is right here.'
              ) : (
                <>
                  Stall {plural(nearest, 'step')} away{longWay > nearest && Number.isFinite(longWay) ? ' by the shortcut' : ''}, {you.price} coins.
                </>
              )
            ) : null}
          </p>
          <button type="button" onClick={() => setMapOpen(true)} className="press-soft flex h-12 shrink-0 items-center gap-1 rounded-[var(--radius-m)] bg-raised py-1 pr-2 pl-1 font-bold hover:bg-surface-2" aria-label="Map of the whole trail">
            <MiniMap you={here} stalls={view.stalls} />
            <MapIcon className="size-4 shrink-0" aria-hidden />
          </button>
        </div>
      </StagePanel>
      <MapDialog open={mapOpen} onOpenChange={setMapOpen} view={view} room={room} rules={rules} />

      <HitNews hit={you.hit} gameNow={gameNow} own={own} />
      {error ? (
        <p className="text-sm font-bold text-ember" role="alert">
          {error}
        </p>
      ) : null}

      {miss.miss ? (
        <div className="flex flex-col gap-3">
          <ResultBanner key={miss.miss.iid} correct={false} partial={miss.miss.partial} text={miss.miss.text} answer={miss.answered ? shortAnswer(miss.answered.q, miss.miss.reveal) : null} />
          {miss.answered ? <RevealAnswer q={miss.answered.q} reveal={miss.miss.reveal} compact /> : null}
          <Explanation text={miss.miss.explanation} />
          <button type="button" onClick={miss.dismiss} className="min-h-11 self-center rounded-[var(--radius-m)] px-4 py-2 font-bold text-text-2 hover:bg-white/10">
            Next question
          </button>
        </div>
      ) : showRoll && move ? (
        <div className="flex flex-col gap-3">
          {!prompt && you.last?.correct ? <ResultBanner key={`roll-${move.seq}`} correct partial={1} text={you.last.text} /> : null}
          <RollPanel move={move} idx={walk.idx} compact={Boolean(prompt)} />
          {prompt?.kind === 'fork' ? <ForkPrompt view={view} gameNow={gameNow} busy={busy || paused} choose={(route) => void send({ type: 'fork', route })} /> : null}
          {prompt?.kind === 'buy' ? <BuyPrompt view={view} gameNow={gameNow} busy={busy || paused} decide={(buy) => void send({ type: 'buy', buy })} /> : null}
          {prompt?.kind === 'target' ? <TargetPrompt view={view} gameNow={gameNow} players={room.players} busy={busy || paused} pick={(playerId) => void send({ type: 'target', playerId })} /> : null}
          {!pending ? (
            <button type="button" onClick={walk.close} className="min-h-11 self-center rounded-[var(--radius-m)] px-4 py-2 font-bold text-text-2 hover:bg-white/10">
              Next question
            </button>
          ) : null}
        </div>
      ) : pending ? (
        <div className="flex flex-col gap-3">
          {pending.kind === 'fork' ? <ForkPrompt view={view} gameNow={gameNow} busy={busy || paused} choose={(route) => void send({ type: 'fork', route })} /> : null}
          {pending.kind === 'buy' ? <BuyPrompt view={view} gameNow={gameNow} busy={busy || paused} decide={(buy) => void send({ type: 'buy', buy })} /> : null}
          {pending.kind === 'target' ? <TargetPrompt view={view} gameNow={gameNow} players={room.players} busy={busy || paused} pick={(playerId) => void send({ type: 'target', playerId })} /> : null}
        </div>
      ) : you.question ? (
        <div className="flex flex-col gap-4">
          <QuestionCard q={you.question.q} />
          <AnswerInput key={you.question.iid} q={you.question.q} onSubmit={submit} disabled={paused} compact />
        </div>
      ) : null}
    </div>
  );
}

/** The player's own sounds as their Glim walks: the dice, a rising step for each space, and what the spaces did. */
function useMoveSounds(move: MoveView | null, idx: number, own: boolean, streak: number, motion: boolean) {
  const heard = useRef<{ seq: number; idx: number }>({ seq: move?.seq ?? 0, idx: move ? move.path.length - 1 : 0 });
  useEffect(() => {
    if (!move || !own) return;
    const h = heard.current;
    if (move.seq !== h.seq) {
      heard.current = { seq: move.seq, idx: 0 };
      playSfx('dice');
      // The roll that starts a hot streak gets its own moment.
      if (move.hot && streak === HOT_STREAK) setTimeout(() => playSfx('powerUp'), 380);
      return;
    }
    if (idx <= h.idx) return;
    const from = h.idx + 1;
    heard.current = { seq: move.seq, idx };
    const notes = move.notes.filter((n) => n.i >= from && n.i <= idx);
    const sounds = notes.map(noteSound).filter((s): s is SfxName => s !== null);
    if (motion && idx - from < 2) {
      if (!move.jumps.includes(idx)) playSfx('step', { n: idx });
      if (sounds.length) playSfx(sounds[0]!);
      return;
    }
    // Several steps at once (reduced motion, or a screen catching up): the one sound that matters most.
    const best = SOUND_RANK.find((s) => sounds.includes(s));
    if (best) playSfx(best);
  }, [move, idx, own, streak, motion]);
}

/** On a shared screen, a jingle for every Golden Lantern bought (your own plays its purchase sound instead). */
function useJackpot(plays: PlayView[], shared: boolean, me: string | null) {
  const seen = useRef(plays[0]?.n ?? 0);
  useEffect(() => {
    const fresh = plays.filter((p) => p.n > seen.current);
    if (!fresh.length) return;
    seen.current = fresh[0]!.n;
    if (shared && fresh.some((p) => p.kind === 'buy' && p.playerId !== me)) playSfx('jackpot');
  }, [plays, shared, me]);
}

/* ------------------------------ the big screen ----------------------------- */

const PLAY_ICON: Record<PlayView['kind'], LucideIcon> = { buy: Crown, steal: HandGrab, trade: ArrowLeftRight, shower: HandCoins, rumour: Megaphone, goal: Crown };

/** The room event (or Last lanterns), big, with its countdown; between events, when the next one comes. */
function EventBanner({ view, gameNow, rules }: { view: LanternTrailView; gameNow: () => number; rules: Rules }) {
  const small = 'text-[clamp(0.95rem,min(1.3vw,2.3vh),1.4rem)]';
  if (view.finalStretch || view.event) {
    const info = view.finalStretch ? FINALE_EVENT : eventInfo(view.event!.kind, rules.stalls);
    const Icon = view.finalStretch ? Flame : EVENT_ICON[view.event!.kind];
    // A room event is a moment: a solid banner with its icon on a disc, its name, and the clock on the plain plate.
    return (
      // No taller than the title plate beside it, so the board below keeps its height on a 768-pixel projector.
      <div className={`lift flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-l)] px-3 py-1 text-on-accent ${view.finalStretch ? 'bg-lantern' : 'bg-glim'}`} style={{ animation: 'pop-in 200ms var(--ease-out)' }} key={view.finalStretch ? 'last' : view.event!.startsAt}>
        <span className="grid size-[clamp(2rem,4.4vh,3.25rem)] shrink-0 place-items-center rounded-full bg-ink/85 text-white" aria-hidden>
          <Icon className="size-[56%]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[clamp(1.3rem,min(2.1vw,3.7vh),2.4rem)] leading-[1.05] font-extrabold italic">{info.title}</p>
          <p className={`truncate leading-tight font-bold ${small}`}>{info.text}</p>
        </div>
        <span className="plate shrink-0 text-[clamp(1.2rem,min(2vw,3.6vh),2.2rem)] tabular">
          <span>
            <Countdown until={view.finalStretch ? view.endsAt : view.event!.endsAt} gameNow={gameNow} label={view.finalStretch ? 'Time left' : 'Event ends in'} />
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-l)] px-4 py-2 ${NIGHT}`}>
      <Hourglass className="size-[clamp(1.5rem,3.4vh,2.25rem)] shrink-0 text-lantern" aria-hidden />
      <p className={`min-w-0 flex-1 font-bold ${small}`}>
        {view.nextEventAt !== null ? 'Next room event in ' : 'Last lanterns in '}
        <span className="font-display font-extrabold tabular">
          <Countdown until={view.nextEventAt ?? view.lastAt} gameNow={gameNow} label={view.nextEventAt !== null ? 'Next room event in' : 'Last lanterns in'} />
        </span>
        {view.nextEventAt !== null ? '. Nobody knows which.' : `: Golden Lanterns for ${Math.min(view.basePrice, FINALE.price)} coins.`}
      </p>
    </div>
  );
}

/** The latest Golden Lantern bought, across the middle of the board, while the stall flies off. */
function BigMoment({ view, players, gameNow }: { view: LanternTrailView; players: RoomPlayerView[]; gameNow: () => number }) {
  useNow(500, view.plays.length > 0);
  const play = view.plays.find((p) => p.kind === 'buy' || p.kind === 'goal');
  if (!play || gameNow() - play.at > 2600) return null;
  return (
    <div className="absolute inset-y-[28%] right-[11%] left-[38%] z-40 flex items-center justify-center" key={play.n}>
      <div className="paper stage-card flex max-w-full items-center gap-[1.2cqw] px-[1.8cqw] py-[1.2cqw]" style={{ animation: 'pop-in 200ms var(--ease-out)' }}>
        <PlayerGlim avatar={avatarOf(players, play.playerId)} seed={play.playerId} size={64} pose="cheer" className="shrink-0" />
        <div className="min-w-0">
          <p className="font-display leading-tight font-extrabold" style={{ fontSize: '2.6cqw' }}>
            {play.text}
          </p>
          <p className="flex items-center gap-[0.4em] font-bold text-text-2" style={{ fontSize: '1.6cqw' }}>
            <Lantern art={GOLD} size={22} lit /> {plural(view.sold, 'Golden Lantern')} bought tonight
          </p>
        </div>
      </div>
    </div>
  );
}

/** Inside the loop: what a lantern costs now and where the stalls stand. */
function StallCard({ view }: { view: LanternTrailView }) {
  const sale = view.price < view.basePrice;
  const places = view.stalls.map((s) => placeName(s.pos));
  return (
    <div className="absolute top-[28.5%] right-[17%] left-[45%] flex items-center gap-[1cqw] rounded-[var(--radius-m)] bg-white/[0.07] px-[1.4cqw] py-[0.9cqw] ring-1 ring-white/10 ring-inset" style={{ fontSize: '1.7cqw' }}>
      <Lantern art={GOLD} size={56} lit className="h-auto w-[5.5cqw] shrink-0" />
      <div className="min-w-0">
        <p className="font-bold text-text-2">Golden Lantern</p>
        <p className="font-display leading-none font-extrabold" style={{ fontSize: '3.4cqw' }}>
          {view.price} coins {sale ? <s className="text-[0.55em] text-text-2">{view.basePrice}</s> : null}
        </p>
        <p className="mt-[0.2em] leading-tight font-bold">
          {places.length > 1 ? 'Stalls' : 'Stall'} at {places.join(' and ')}
        </p>
      </div>
    </div>
  );
}

const ROW = 'min-h-[clamp(2.25rem,4.6vh,3.5rem)]';

export function LanternTrailHost({ view, gameNow, room }: ModeScreenProps<LanternTrailView>) {
  const rules = rulesOf(room, view.stalls.length);
  const shared = useSharedSounds();
  useEventNews(view, rules, shared);
  useJackpot(view.plays, shared, null);
  const text = 'text-[clamp(0.95rem,min(1.4vw,2.5vh),1.6rem)]';
  const heading = 'mb-[clamp(0.25rem,0.8vh,0.5rem)] font-display text-[clamp(1.25rem,min(2vw,3.6vh),2.25rem)] leading-tight font-extrabold';
  const rows = [...view.walkers].sort((a, b) => a.rank - b.rank || b.l - a.l || b.c - a.c).slice(0, view.teams ? 5 : 8);
  const plays = view.plays.slice(0, view.teams ? 2 : 3);
  const name = (id: string) => room.players.find((p) => p.id === id)?.name ?? 'Player';
  const leaders = rows.filter((r) => r.rank === 1 && r.l > 0);
  return (
    <div className="mx-auto flex w-full max-w-[120rem] flex-1 flex-col gap-[clamp(0.5rem,1.6vh,1.25rem)]">
      {/* The title on its plate at the top left, the room event beside it and the clock at the top right. */}
      <div className="flex flex-wrap items-center gap-3">
        <ModeTitle className="shrink-0">Lantern Trail</ModeTitle>
        <EventBanner view={view} gameNow={gameNow} rules={rules} />
        <Pill className="px-5 py-1.5 text-[clamp(1.25rem,2.2vw,2.5rem)]">
          <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
        </Pill>
      </div>
      <div className="grid grid-cols-1 items-start gap-[clamp(0.75rem,1.6vw,1.75rem)] lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <section aria-labelledby="lt-board" className="mx-auto w-full max-w-[calc((100dvh-16rem)*1.5)]">
          <h3 id="lt-board" className="sr-only">
            The trail
          </h3>
          <Board view={view} players={room.players} rules={rules} big>
            <StallCard view={view} />
            {/* Clear of the loop's lower right, where a stall stands on the inside of the trail. */}
            <Legend rules={rules} className="absolute top-[61.5%] right-[18.5%] left-[42%] grid-cols-3! gap-x-[0.9cqw] gap-y-[0.6cqw]" style={{ fontSize: '1.35cqw' }} />
            <BigMoment view={view} players={room.players} gameNow={gameNow} />
          </Board>
          <p className="sr-only">
            {view.stalls.map((s) => `A Golden Lantern stall is at ${placeName(s.pos)}.`).join(' ')} Golden Lanterns cost {view.price} coins.
            {leaders.length ? ` In the lead: ${leaders.map((r) => `${name(r.id)} at ${placeName(r.pos)}`).join(', ')}.` : ''}
          </p>
        </section>
        <div className="flex flex-col gap-[clamp(0.5rem,1.6vh,1rem)]">
          <section aria-labelledby="lt-standings">
            <h3 id="lt-standings" className={heading}>
              Golden Lanterns
            </h3>
            <ol className={`flex flex-col gap-1.5 ${text}`} style={{ '--lb-rank': 'clamp(2rem, 4.2vh, 3.2rem)' } as CSSProperties}>
              {rows.map((r, i) => (
                // A short projector shows six rows, so the big plays stay on screen too.
                <li key={r.id} className={`flex items-center gap-[clamp(0.4rem,0.8vw,0.75rem)] rounded-[var(--radius-m)] px-2.5 py-0.5 ${ROW} ${NIGHT} ${i >= 6 ? '[@media(max-height:820px)]:hidden' : ''}`}>
                  <RankBadge rank={r.rank} big />
                  <PlayerGlim avatar={avatarOf(room.players, r.id)} seed={r.id} size={48} className="size-[clamp(1.9rem,4.2vh,3.2rem)] shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-bold">{name(r.id)}</span>
                  <span className="flex shrink-0 items-center gap-1 font-display text-[1.2em] font-extrabold tabular">
                    <Lantern art={GOLD} size={22} lit className="h-auto w-[0.95em]" />
                    {r.l}
                    <span className="sr-only">{r.l === 1 ? ' Golden Lantern,' : ' Golden Lanterns,'}</span>
                  </span>
                  <span className="flex min-w-[3.2em] shrink-0 items-center justify-end gap-1 font-bold text-text-2 tabular">
                    <Coins className="size-[0.9em] text-lantern" aria-hidden />
                    {r.c}
                    <span className="sr-only"> coins</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="lt-plays">
            <h3 id="lt-plays" className={heading}>
              Big plays
            </h3>
            {plays.length ? (
              <ul className={`flex flex-col gap-1.5 leading-tight ${text}`}>
                {plays.map((p) => {
                  const Icon = PLAY_ICON[p.kind];
                  return (
                    // One line each, so a long play cannot push the bottom of the column off a 768-pixel projector.
                    <li key={p.n} className={`flex items-center gap-2.5 rounded-[var(--radius-m)] px-3 py-1 ${ROW} ${NIGHT}`} style={{ animation: 'rise-fade 200ms var(--ease-out) both' }}>
                      <Icon className="size-[1.15em] shrink-0 text-lantern" aria-hidden />
                      <span className="min-w-0 flex-1 truncate font-bold">{p.text}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={`font-semibold text-text-2 ${text}`}>No Golden Lanterns yet. The stall is waiting.</p>
            )}
          </section>
          {view.teams ? (
            <StagePanel className="flex flex-col gap-2 p-[clamp(0.6rem,1.4vh,1rem)]">
              <h3 className="font-display text-[clamp(1.2rem,min(1.9vw,3.4vh),2.1rem)] font-extrabold">Teams (average lanterns)</h3>
              <TeamScores teams={view.teams.map((t) => ({ teamId: t.teamId, name: t.name, hue: t.hue, score: t.lanterns }))} format={(n) => (Math.round(n * 10) / 10).toString()} big />
            </StagePanel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
