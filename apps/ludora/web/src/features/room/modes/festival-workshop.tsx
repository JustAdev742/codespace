import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowDownUp, ArrowRight, ArrowUp, CircleQuestionMark, Clover, Coffee, Coins, Flag, Flame, Hammer, Lock, RefreshCw, Rocket, Store, Timer, TimerOff, Zap, type LucideIcon } from 'lucide-react';
import type { Answer, GlimArt, LanternArt, RoomPlayerView } from '@ludora/shared';
import {
  EVENTS,
  EVENT_ORDER,
  FAVOURS,
  FAVOUR_EVERY,
  FAVOUR_ORDER,
  GOODS,
  GOODS_INFO,
  LUCKY_SPARK_CHANCE,
  MARKET,
  MAX_LEVEL,
  PRANK_MS,
  SECOND_LOCK_COINS,
  SHIFT_HINT_MS,
  STATIONS,
  STATION_ORDER,
  type EventKind,
  type FavourKind,
  type Goods,
  type StationKind,
} from '@ludora/engine/festival-workshop';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner, RevealAnswer, shortAnswer } from '../game/Reveal.tsx';
import { RankBadge, TeamScores } from '../game/Leaderboard.tsx';
import { Explanation, ModeTitle } from '../game/parts.tsx';
import { NIGHT, Pill, PlayerGlim, StagePanel, avatarOf, motionOK } from '../game/stage.tsx';
import { useAnnounce } from '../game/announce.tsx';
import { Lantern } from '../../../art/Lantern.tsx';
import { Glim } from '../../../art/glim/Glim.tsx';
import { Burst } from '../../../art/bursts.tsx';
import { Button, buttonClass } from '../../../ui/Button.tsx';
import { Dialog } from '../../../ui/primitives.tsx';
import { useNow } from '../../../lib/useNow.ts';
import { formatNumber, ordinal, plural } from '../../../lib/format.ts';
import { playSfx, useSfx, useSharedSounds, useSoundRole } from '../../../lib/sound/react.tsx';

/* Festival Workshop: right answers bring paydays, coins build stations, and one market the class shares sets the prices. */

type Heading = 'up' | 'down' | 'steady';
type PerGoods = Record<Goods, number>;

interface StationView {
  kind: StationKind;
  level: number;
  income: number;
  stoppedUntil: number | null;
  stoppedBy: string | null;
  upgrade: { cost: number; gain: number } | null;
  replace: Partial<Record<StationKind, number>> | null;
}

interface Row {
  playerId: string;
  name: string;
  teamId: string | null;
  takings: number;
  coins: number;
  rate: number;
  rank: number;
  lock: boolean;
}

interface Target {
  playerId: string;
  name: string;
  coins: number;
  rank: number;
  lock: boolean;
  best: { kind: StationKind; level: number } | null;
}

interface News {
  seq: number;
  at: number;
  kind: 'prank' | 'blocked' | 'lab' | 'max' | 'spark' | 'streak' | 'parade' | 'finale';
  who: string | null;
  other: string | null;
  station: StationKind | null;
  level: number;
  goods: Goods | null;
}

interface Market {
  demand: PerGoods;
  prev: PerGoods;
  shiftAt: number | null;
  lastShiftAt: number | null;
  shifts: number;
  wide: boolean;
  swingUntil: number | null;
  heading: Record<Goods, Heading>;
  shares: PerGoods;
}

interface FestivalEventView {
  kind: EventKind;
  startedAt: number;
  endsAt: number;
  goods: Goods | null;
  target: number;
  progress: number;
  seq: number;
}

interface ParadeView {
  goods: Goods;
  target: number;
  total: number;
  reached: boolean;
  top: { name: string; amount: number; bonus: number; isYou: boolean }[];
  boosted: number;
  at: number;
}

export interface FestivalWorkshopView {
  endsAt: number;
  finalStretch?: boolean;
  finale: { at: number | null; on: boolean; demand: number };
  slots: number;
  price: number;
  goal: number;
  favours: boolean;
  pranks: boolean;
  market: Market;
  event: FestivalEventView | null;
  nextEventAt: number | null;
  rush: boolean;
  parade: ParadeView | null;
  board: Row[];
  players: number;
  teams: { teamId: string; name: string; hue: number; members: number; average: number }[] | null;
  standing: Record<StationKind, number> | null;
  news: News[];
  winner: string | null;
  you: {
    coins: number;
    takings: number;
    rate: number;
    asOf: number;
    rank: number | null;
    stations: (StationView | null)[];
    shop: { kind: StationKind; cost: number; gain: number }[];
    full: boolean;
    lock: boolean;
    overtimeUntil: number | null;
    paradeUntil: number | null;
    streak: number;
    toFavour: number;
    contribution: number;
    question: QuestionView | null;
    last: FeedbackView | null;
    payday: { amount: number; at: number; notes: string[] } | null;
    offer: { cards: FavourKind[]; deck: FavourKind[]; until: number; prank: boolean; targets: Target[] } | null;
    favour: { kind: FavourKind; at: number; amount: number; target: string | null; station: StationKind | null; blocked: boolean; swapped: boolean; auto: boolean } | null;
    pranked: { by: string; station: StationKind; slot: number; until: number; blocked: boolean; at: number } | null;
    bonus: { amount: number; at: number; place: number } | null;
    from: { paydays: number; stations: number; orders: number; favours: number };
  } | null;
}

type You = NonNullable<FestivalWorkshopView['you']>;

/* ------------------------------- small helpers ------------------------------ */

const price = (p: number) => `×${p.toFixed(1)}`;
const rateText = (r: number) => (r < 10 ? (Math.round(r * 10) / 10).toLocaleString('en-GB') : formatNumber(r));
/** Incomes on the projector's board stay short, so the names beside them keep their room: 3,244 a second shows as 3.2k. */
const shortRate = (r: number) => (r >= 10_000 ? `${Math.round(r / 1000)}k` : r >= 1000 ? `${(Math.floor(r / 100) / 10).toFixed(1)}k` : rateText(r));
/** "a Kite Loom", "Glim Helpers". */
const aStation = (k: StationKind) => (k === 'helpers' ? STATIONS[k].name : `${/^[AEIOU]/.test(STATIONS[k].name) ? 'an' : 'a'} ${STATIONS[k].name}`);

function trendOf(m: Market, g: Goods): Heading {
  return m.demand[g] > m.prev[g] ? 'up' : m.demand[g] < m.prev[g] ? 'down' : 'steady';
}

function priceWords(g: Goods, p: number): string {
  const label = GOODS_INFO[g].label;
  if (p >= 1.3) return `${label} are in demand: ${price(p)}`;
  if (p <= 0.7) return `${label} sell cheap: ${price(p)}`;
  return `${label} sell at ${price(p)}`;
}

/** How likely each card is to be in an offer of two drawn by weight from `deck`. */
function offerChances(deck: readonly FavourKind[]): Record<string, number> {
  const total = deck.reduce((n, k) => n + FAVOURS[k].weight, 0);
  const out: Record<string, number> = {};
  for (const k of deck) {
    const first = FAVOURS[k].weight / total;
    const second = deck.filter((j) => j !== k).reduce((n, j) => n + (FAVOURS[j].weight / total) * (FAVOURS[k].weight / (total - FAVOURS[j].weight)), 0);
    out[k] = deck.length <= 2 ? 1 : first + second;
  }
  return out;
}

/** Coins and takings now, counted up from the view's snapshot on the game clock. */
function useLiveMoney(you: You | null | undefined, gameNow: () => number, intervalMs: number) {
  useNow(intervalMs, Boolean(you && you.rate > 0));
  if (!you) return { coins: 0, takings: 0 };
  const grown = (you.rate * Math.max(0, gameNow() - you.asOf)) / 1000;
  return { coins: you.coins + grown, takings: you.takings + grown };
}

/** A moment is fresh for `ms` after it happened, on the game clock. Re-renders once when it goes stale. */
function useFresh(at: number | null | undefined, gameNow: () => number, ms: number): boolean {
  const fresh = at !== null && at !== undefined && gameNow() - at < ms;
  useNow(1000, fresh);
  return fresh;
}

/** What a player can buy now, for the badge on the Workshop tab. */
function affordable(you: You, coins: number): number {
  let n = 0;
  const free = you.stations.some((s) => s === null);
  if (free) n += you.shop.filter((o) => o.cost <= coins && o.gain > 0).length ? 1 : 0;
  for (const st of you.stations) if (st?.upgrade && st.upgrade.cost <= coins) n++;
  return n;
}

/* ---------------------------------- icons ---------------------------------- */

const LANTERN: LanternArt = { hue: 14, accentHue: 40, pattern: 'flames' };
const HELPER: GlimArt = { kind: 'glim', body: 'bean', hue: 48, accentHue: 20, saturation: 85, eyes: 'happy', mouth: 'smile', pattern: 'none', topper: 'antenna', cheeks: true };

/** Each kind of goods has its own shape, so none relies on colour. */
export function GoodsIcon({ goods, size = 28, className = '' }: { goods: Goods; size?: number; className?: string }) {
  // Never squeezed by a long label beside it.
  if (goods === 'lanterns') return <Lantern art={LANTERN} size={size} lit className={`shrink-0 ${className}`} />;
  const common = { width: size, height: size, viewBox: '0 0 32 32', className: `shrink-0 ${className}`, 'aria-hidden': true, focusable: false } as const;
  if (goods === 'kites') {
    return (
      <svg {...common}>
        <path d="M16 2L27 13L16 24L5 13Z" fill="var(--sky)" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
        <path d="M16 2V24M5 13H27" stroke="var(--ink)" strokeWidth="1.4" />
        <path d="M16 24C14 26 18 27 16 29C15 30 17 31 18 31" fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (goods === 'candles') {
    return (
      <svg {...common}>
        <path d="M16 3C19 7 19 10 16 12C13 10 13 7 16 3Z" fill="var(--lantern)" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" />
        <rect x="10.5" y="13" width="11" height="16" rx="2" fill="#fff4dc" stroke="var(--ink)" strokeWidth="2" />
        <path d="M13 17V24" stroke="var(--ink)" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <path key={a} d="M16 16L16 4" stroke={a % 90 ? 'var(--rose)' : 'var(--lantern)'} strokeWidth="2.6" strokeLinecap="round" transform={`rotate(${a} 16 16)`} />
      ))}
      <circle cx="16" cy="16" r="4.5" fill="var(--ember)" stroke="var(--ink)" strokeWidth="1.8" />
    </svg>
  );
}

function StationIcon({ kind, size = 28 }: { kind: StationKind; size?: number }) {
  const goods = STATIONS[kind].goods;
  if (goods) return <GoodsIcon goods={goods} size={size} />;
  return <Glim art={HELPER} size={size} />;
}

function Arrow({ heading, className = 'size-[1em]' }: { heading: Heading; className?: string }) {
  if (heading === 'up') return <ArrowUp className={className} strokeWidth={3} aria-hidden />;
  if (heading === 'down') return <ArrowDown className={className} strokeWidth={3} aria-hidden />;
  return <ArrowRight className={className} strokeWidth={3} aria-hidden />;
}

/** A station's level as five pips: solid for each level reached, hollow for the rest, so it reads without the colour. */
function LevelPips({ level, className = '' }: { level: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} role="img" aria-label={`Level ${level} of ${MAX_LEVEL}`}>
      {Array.from({ length: MAX_LEVEL }, (_, i) => (
        <span key={i} className={`size-2 rounded-full ${i < level ? 'bg-lantern' : 'ring-[1.5px] ring-white/35 ring-inset'}`} />
      ))}
    </span>
  );
}

/**
 * A moment for this player or the room, as a solid banner in the accent of its news: an icon disc,
 * a short title and what it means. `children` sit at the end (a gain plate, a countdown).
 */
function NewsBanner({ tone, icon: Icon, title, children, detail }: { tone: 'glim' | 'lantern' | 'ember' | 'sky' | 'dusk'; icon: LucideIcon; title: ReactNode; detail?: ReactNode; children?: ReactNode }) {
  const bg = { glim: 'bg-glim', lantern: 'bg-lantern', ember: 'bg-ember', sky: 'bg-sky', dusk: 'bg-dusk' }[tone];
  return (
    <div className={`lift flex items-center gap-3 rounded-[var(--radius-l)] px-4 py-3 text-on-accent ${bg}`} style={{ animation: 'pop-in 200ms var(--ease-out)' }}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink/85 text-white" aria-hidden>
        <Icon className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[1.75rem] leading-tight font-extrabold italic">{title}</p>
        {detail ? <p className="leading-snug font-semibold">{detail}</p> : null}
      </div>
      {children}
    </div>
  );
}

/* --------------------------------- answers --------------------------------- */

/**
 * Shows each answer's result for a moment before the next question. Keyed by
 * question id, so frequent view updates from other players neither restart
 * nor cancel the timer, and the reveal is matched to the question answered.
 */
function useAnswerFlow(last: FeedbackView | null | undefined, question: QuestionView | null | undefined) {
  const asked = useRef(new Map<string, QuestionView>());
  const lastRef = useRef(last);
  const seen = useRef<string | null>(last?.iid ?? null);
  const [feedback, setFeedback] = useState<FeedbackView | null>(null);
  const lastIid = last?.iid ?? null;
  useEffect(() => {
    lastRef.current = last;
  });
  useEffect(() => {
    if (!question) return;
    asked.current.set(question.iid, question);
    if (asked.current.size > 6) asked.current.delete(asked.current.keys().next().value!);
  }, [question]);
  useEffect(() => {
    if (!lastIid || lastIid === seen.current) return;
    seen.current = lastIid;
    setFeedback(lastRef.current ?? null);
  }, [lastIid]);
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), feedback.correct ? 1400 : 2600);
    return () => clearTimeout(t);
  }, [feedback]);
  return { feedback, answered: feedback ? (asked.current.get(feedback.iid) ?? null) : null, dismiss: () => setFeedback(null) };
}

/* ---------------------------------- market --------------------------------- */

/** "a", "a and b", "a, b and c". */
const listOf = (items: string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

function shiftHint(m: Market): string {
  const up = GOODS.filter((g) => m.heading[g] === 'up').map((g) => GOODS_INFO[g].many);
  const down = GOODS.filter((g) => m.heading[g] === 'down').map((g) => GOODS_INFO[g].many);
  const parts = [up.length ? `${listOf(up)} heading up` : null, down.length ? `${listOf(down)} heading down` : null].filter(Boolean);
  return parts.length ? parts.join(', ') : 'prices look steady';
}

/** How a price stands: in demand (mint), cheap (coral) or in between. The number and the words say it too. */
const priceTone = (p: number) => (p >= 1.3 ? 'text-glim' : p <= 0.7 ? 'text-ember' : 'text-text');
const priceWash = (p: number) => (p >= 1.3 ? 'bg-glim/[0.14]' : p <= 0.7 ? 'bg-ember/[0.14]' : 'bg-white/[0.07]');

/** The four prices in one line, for the phone's header. */
function MarketStrip({ market, gameNow }: { market: Market; gameNow: () => number }) {
  useNow(1000, market.shiftAt !== null);
  const soon = market.shiftAt !== null && market.shiftAt - gameNow() <= SHIFT_HINT_MS;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <ul className="grid min-w-0 flex-1 grid-cols-4 gap-1" aria-label="Market prices">
        {GOODS.map((g) => {
          const p = market.demand[g];
          const next = soon ? market.heading[g] : trendOf(market, g);
          return (
            <li key={g} className={`flex min-w-0 items-center justify-center gap-0.5 rounded-[var(--radius-m)] px-1 py-1 ${priceWash(p)} ${priceTone(p)}`}>
              <GoodsIcon goods={g} size={18} />
              <span className="font-display text-[0.95rem] leading-none font-extrabold tabular">{price(p)}</span>
              <Arrow heading={next} className={`size-3.5 shrink-0 ${soon ? 'opacity-70' : ''}`} />
              <span className="sr-only">
                {GOODS_INFO[g].label} {price(p)}, {soon ? `heading ${next}` : next === 'steady' ? 'steady' : `${next} since the last shift`}.
              </span>
            </li>
          );
        })}
      </ul>
      {market.shiftAt !== null ? (
        <span className={`shrink-0 text-xs font-bold ${soon ? 'text-lantern' : 'text-text-2'}`}>
          <RefreshCw className="mr-0.5 inline size-3" aria-hidden />
          <Countdown until={market.shiftAt} gameNow={gameNow} label="Market shifts in" />
        </span>
      ) : null}
    </div>
  );
}

/** The market on the Workshop tab: every price in words, its arrow, and the class's share of goods. */
function MarketPanel({ market, finale, gameNow }: { market: Market; finale: FestivalWorkshopView['finale']; gameNow: () => number }) {
  useNow(1000, market.shiftAt !== null);
  const left = market.shiftAt === null ? null : market.shiftAt - gameNow();
  const soon = left !== null && left <= SHIFT_HINT_MS;
  return (
    <StagePanel as="section" className="flex flex-col gap-2 p-3" label="Market">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="flex items-center gap-1.5 font-display text-xl font-extrabold">
          <Store className="size-5" aria-hidden /> Class market
        </h3>
        <span className={`text-sm font-bold ${soon ? 'text-lantern' : 'text-text-2'}`}>
          {left === null ? 'No more shifts' : soon ? `Market shifts in ${Math.max(1, Math.ceil(left / 1000))} s` : <>Shifts in <Countdown until={market.shiftAt} gameNow={gameNow} label="Market shifts in" /></>}
        </span>
      </div>
      {soon ? <p className="text-sm font-bold text-text">Coming up: {shiftHint(market)}.</p> : null}
      <ul className="grid grid-cols-2 gap-2">
        {GOODS.map((g) => {
          const p = market.demand[g];
          const t = trendOf(market, g);
          const fixed = finale.on && g === 'fireworks';
          return (
            <li key={g} className={`flex items-center gap-2 rounded-[var(--radius-m)] px-2 py-1.5 ${NIGHT}`}>
              <GoodsIcon goods={g} size={30} />
              <div className="min-w-0">
                <div className={`flex items-center gap-1 font-display text-xl leading-tight font-extrabold tabular ${priceTone(p)}`}>
                  {price(p)} <Arrow heading={soon ? market.heading[g] : t} className="size-4" />
                </div>
                <div className="text-xs leading-snug font-semibold text-text-2">
                  {fixed ? 'Finale price' : priceWords(g, p).split(':')[0]}. {formatNumber(market.shares[g])}% of the class’s goods
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs leading-snug font-semibold text-text-2">
        Goods many people make go cheap; goods few people make pay more.{' '}
        {market.wide
          ? `Every shift sets prices between ${price(MARKET.wide.min)} and ${price(MARKET.wide.max)}.`
          : `Every shift sets prices between ${price(MARKET.normal.min)} and ${price(MARKET.normal.max)} (${price(MARKET.wide.min)} and ${price(MARKET.wide.max)} in a market swing).`}
      </p>
    </StagePanel>
  );
}

/* --------------------------------- events ---------------------------------- */

function eventTitle(ev: FestivalEventView): string {
  if (ev.kind === 'parade' && ev.goods) return `The parade needs ${GOODS_INFO[ev.goods].many}`;
  return EVENTS[ev.kind].title;
}

function eventText(ev: FestivalEventView): string {
  if (ev.kind === 'parade' && ev.goods) return `Make ${formatNumber(ev.target)} coins’ worth of ${GOODS_INFO[ev.goods].many} together before time runs out.`;
  return EVENTS[ev.kind].text;
}

const EVENT_ICON: Record<EventKind, LucideIcon> = { parade: Flag, rush: Zap, sparks: Clover, swing: ArrowDownUp, tea: Coffee };
/** Each event's banner colour on the big screen; ink text passes AA on every one. */
const EVENT_TONE: Record<EventKind, 'glim' | 'lantern' | 'sky' | 'dusk'> = { parade: 'glim', rush: 'lantern', sparks: 'lantern', swing: 'sky', tea: 'dusk' };

function EventIcon({ kind, className = 'size-[1.1em]' }: { kind: EventKind; className?: string }) {
  const Icon = EVENT_ICON[kind];
  return <Icon className={className} aria-hidden />;
}

/** The event now (or the next one, or the finale) as one chip for the phone's header. */
function EventChip({ view, gameNow }: { view: FestivalWorkshopView; gameNow: () => number }) {
  const ev = view.event;
  if (view.finale.on) {
    return (
      <Pill tone="lantern" className="max-w-full px-2! py-0.5! text-xs">
        <Rocket className="size-3.5" aria-hidden /> Finale: fireworks {price(view.finale.demand)}
      </Pill>
    );
  }
  if (ev) {
    const pct = ev.kind === 'parade' && ev.target > 0 ? Math.min(100, Math.floor((ev.progress / ev.target) * 100)) : null;
    return (
      <Pill tone="glim" className="max-w-full min-w-0 px-2! py-0.5! text-xs">
        <EventIcon kind={ev.kind} className="size-3.5 shrink-0" />
        <span className="truncate">{ev.kind === 'parade' && ev.goods ? `Parade: ${GOODS_INFO[ev.goods].many} ${pct}%` : EVENTS[ev.kind].title}</span>
        <Countdown until={ev.endsAt} gameNow={gameNow} label="Event ends in" />
      </Pill>
    );
  }
  if (view.nextEventAt !== null) {
    return (
      <span className="text-xs font-bold text-text-2">
        Next event <Countdown until={view.nextEventAt} gameNow={gameNow} label="Next festival event in" />
      </span>
    );
  }
  return null;
}

/* -------------------------------- workshop --------------------------------- */

function StationCard({ st, slot, coins, gameNow, busy, paused, full, onUpgrade, onReplace, market, finale }: { st: StationView; slot: number; coins: number; gameNow: () => number; busy: boolean; paused: boolean; full: boolean; onUpgrade: () => void; onReplace: () => void; market: Market; finale: FestivalWorkshopView['finale'] }) {
  const info = STATIONS[st.kind];
  const stopped = st.stoppedUntil !== null && st.stoppedUntil > gameNow();
  useNow(1000, stopped);
  const goods = info.goods;
  const p = goods ? (finale.on && goods === 'fireworks' ? finale.demand : market.demand[goods]) : null;
  const up = st.upgrade;
  const short = up ? Math.ceil(up.cost - coins) : 0;
  return (
    // A tangled station gets a coral edge and says so in words, with its countdown.
    <li className={`flex min-w-0 flex-col gap-1.5 rounded-[var(--radius-l)] p-2.5 ${stopped ? 'bg-ember/[0.1] ring-2 ring-ember ring-inset' : NIGHT}`} aria-label={`Slot ${slot + 1}: ${info.name}, level ${st.level}`}>
      <div className="flex items-center gap-2">
        <span className={stopped ? 'opacity-50 grayscale' : ''}>
          <StationIcon kind={st.kind} size={32} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg leading-tight font-bold">{info.name}</div>
          <LevelPips level={st.level} />
        </div>
      </div>
      {stopped ? (
        <p className="text-sm leading-snug font-bold text-text">
          <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-ember px-2 py-0.5 align-[1px] text-xs text-on-accent">
            <TimerOff className="size-3.5" aria-hidden /> Tangled
          </span>
          {st.stoppedBy ? `by ${st.stoppedBy}` : ''}: back in <Countdown until={st.stoppedUntil} gameNow={gameNow} label="Back in" />
        </p>
      ) : (
        <p className="text-sm leading-snug font-semibold text-text-2">
          {goods ? (
            <>
              <span className="font-bold text-text">{rateText(st.income)}</span> coins/s · {GOODS_INFO[goods].many} {price(p!)} <Arrow heading={trendOf(market, goods)} className="inline size-3.5 align-[-2px]" />
              <span className="sr-only">{trendOf(market, goods) === 'steady' ? ', steady' : `, ${trendOf(market, goods)}`}</span>
            </>
          ) : (
            <>
              Adds <span className="font-bold text-text">{rateText(st.income)}</span> coins/s to the rest
            </>
          )}
        </p>
      )}
      <div className="mt-auto flex flex-col gap-1.5">
        {/* The visible words start each button's name, and the rest is read after them. */}
        {up ? (
          <Button variant="primary" size="sm" className="h-11 w-full px-2" icon={<ArrowUp className="size-4" aria-hidden />} disabled={busy || paused || short > 0} onClick={onUpgrade}>
            Upgrade {formatNumber(up.cost)}
            <span className="sr-only">
              {' '}
              coins: {info.name} to level {st.level + 1}, {up.gain > 0 ? `plus ${rateText(up.gain)} coins a second` : 'no extra coins now'}
              {short > 0 ? `. You need ${formatNumber(short)} more coins` : ''}
            </span>
          </Button>
        ) : (
          <span className="flex h-11 items-center justify-center rounded-[var(--radius-m)] bg-white/[0.06] text-sm font-bold text-text-2">Top level</span>
        )}
        {full ? (
          <Button variant="secondary" size="sm" className="h-11 w-full px-2" icon={<RefreshCw className="size-4" aria-hidden />} disabled={busy || paused} onClick={onReplace}>
            Replace<span className="sr-only"> your {info.name}</span>
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function EmptySlot({ slot, cheapest, coins, onBuild, disabled }: { slot: number; cheapest: number; coins: number; onBuild: () => void; disabled: boolean }) {
  return (
    // An empty slot is hollow: the same shape as a station, with nothing in it.
    <li className="flex min-h-[8.5rem] flex-col items-center justify-center gap-2 rounded-[var(--radius-l)] p-2.5 text-center ring-2 ring-white/15 ring-inset">
      <span className="text-sm font-bold text-text-2">Slot {slot + 1} is free</span>
      <Button variant={coins >= cheapest ? 'success' : 'secondary'} size="sm" className="h-11 px-4" icon={<Hammer className="size-4" aria-hidden />} disabled={disabled} onClick={onBuild} aria-label={`Build in slot ${slot + 1}`}>
        Build
      </Button>
    </li>
  );
}

/** The shop for a free slot, or for replacing a station once every slot is full. */
function BuildSheet({ you, slot, replace, coins, market, finale, onClose, onBuild, busy }: { you: You; slot: number; replace: boolean; coins: number; market: Market; finale: FestivalWorkshopView['finale']; onClose: () => void; onBuild: (kind: StationKind) => void; busy: boolean }) {
  const current = you.stations[slot];
  const title = replace && current ? `Replace your ${STATIONS[current.kind].name} (level ${current.level})` : `Build in slot ${slot + 1}`;
  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={title}
      description={replace ? 'The old station goes, with no coins back. Each choice shows what it would add to your income now.' : `You have ${formatNumber(Math.floor(coins))} coins. Each station shows what it would add to your income now.`}
    >
      <ul className="flex flex-col gap-2">
        {STATION_ORDER.filter((k) => !(replace && current?.kind === k)).map((k) => {
          const info = STATIONS[k];
          const cost = you.shop.find((o) => o.kind === k)?.cost ?? info.cost;
          const gain = replace ? (current?.replace?.[k] ?? 0) : (you.shop.find((o) => o.kind === k)?.gain ?? 0);
          const short = Math.ceil(cost - coins);
          const worse = replace && gain <= 0;
          const goods = info.goods;
          const p = goods ? (finale.on && goods === 'fireworks' ? finale.demand : market.demand[goods]) : null;
          return (
            <li key={k} className="flex items-center gap-3 rounded-[var(--radius-m)] border border-line px-3 py-2">
              <StationIcon kind={k} size={34} />
              <div className="min-w-0 flex-1">
                <div className="font-display text-lg leading-tight font-bold">{info.name}</div>
                <div className="text-sm leading-snug text-text-2">
                  {goods ? (
                    <>
                      Makes {GOODS_INFO[goods].many}, selling at {price(p!)}
                    </>
                  ) : (
                    'Boosts every other station by 20%'
                  )}
                  {' · '}
                  <span className="font-bold text-text">{gain > 0 ? `+${rateText(gain)}` : rateText(gain)} coins/s now</span>
                </div>
              </div>
              <Button variant={!worse && short <= 0 ? 'primary' : 'secondary'} size="sm" className="h-11 shrink-0 px-3" disabled={busy || worse || short > 0} onClick={() => onBuild(k)}>
                {worse ? 'Earns less' : `${replace ? 'Swap' : 'Build'} ${formatNumber(cost)}`}
                <span className="sr-only">
                  {worse
                    ? `: ${aStation(k)} would earn less than your ${current ? STATIONS[current.kind].name : 'station'} now`
                    : ` coins: ${replace ? 'replace it with' : ''} ${aStation(k)}${short > 0 ? `. You need ${formatNumber(short)} more coins` : ''}`}
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

/** How the festival works: the odds of every event and favour, and the market rule. */
function OddsInfo({ view }: { view: FestivalWorkshopView }) {
  const deck = FAVOUR_ORDER.filter((k) => view.pranks || (k !== 'prank' && k !== 'lock'));
  const chances = offerChances(deck);
  return (
    <details className={`rounded-[var(--radius-l)] border border-white/10 px-3 py-1 ${NIGHT}`}>
      <summary className="min-h-11 cursor-pointer content-center py-2 font-bold">How the festival works, with the odds</summary>
      <div className="flex flex-col gap-2 pb-1 text-sm leading-snug font-semibold text-text-2">
        <p>
          <span className="font-bold text-text">Paydays:</span> a right answer pays 8 seconds of your income (at least 10 coins), up to 50% more on a streak.
        </p>
        <p>
          <span className="font-bold text-text">Market:</span> every shift, each goods’ price follows its share of what the class makes, then moves by a random −0.1, 0 or +0.1 (each 1 in 3).
        </p>
        <p>
          <span className="font-bold text-text">Festival events</span> {view.rush ? 'are all parade orders, one every 45 seconds.' : 'are equally likely (1 in 5), never the same twice in a row; a tea break only comes when someone has Glim Helpers.'} Lucky sparks upgrade a station on {Math.round(LUCKY_SPARK_CHANCE * 100)}% of right answers.
        </p>
        <ul className="flex flex-col gap-0.5">
          {EVENT_ORDER.map((k) => (
            <li key={k}>
              <span className="font-bold text-text">{EVENTS[k].title}:</span> {EVENTS[k].text}
            </li>
          ))}
        </ul>
        {view.favours ? (
          <>
            <p>
              <span className="font-bold text-text">Festival Favours:</span> every 5th right answer offers two different cards, drawn by weight. The chance each card is offered:
            </p>
            <ul className="flex flex-col gap-0.5">
              {deck.map((k) => (
                <li key={k}>
                  <span className="font-bold text-text">{FAVOURS[k].title}</span> (weight {FAVOURS[k].weight}): {Math.round(chances[k]! * 100)}%. {FAVOURS[k].text}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </details>
  );
}

/* --------------------------------- favours --------------------------------- */

const FAVOUR_ICON: Record<FavourKind, LucideIcon> = { overtime: Timer, tipJar: Coins, prank: TimerOff, lock: Lock };

/** How far to the next Festival Favour: a pip for each right answer it takes, solid once answered, and the count in words. */
function FavourProgress({ toGo }: { toGo: number }) {
  const done = Math.max(0, FAVOUR_EVERY - toGo);
  return (
    <p className="flex items-center justify-center gap-2 text-sm font-semibold text-text-2">
      <span className="inline-flex shrink-0 gap-1" aria-hidden>
        {Array.from({ length: FAVOUR_EVERY }, (_, i) => (
          <span key={i} className={`size-2.5 rounded-full ${i < done ? 'bg-lantern' : 'ring-[1.5px] ring-white/35 ring-inset'}`} />
        ))}
      </span>
      <span>{toGo === 1 ? 'Your next right answer earns a Festival Favour.' : `${toGo} more right answers to a Festival Favour.`}</span>
    </p>
  );
}

function FavourIcon({ kind, className = 'size-6' }: { kind: FavourKind; className?: string }) {
  const Icon = FAVOUR_ICON[kind];
  return <Icon className={className} aria-hidden />;
}

function FavourOffer({ offer, gameNow, busy, onPick }: { offer: NonNullable<You['offer']>; gameNow: () => number; busy: boolean; onPick: (card: FavourKind, target?: string) => void }) {
  const [choosing, setChoosing] = useState(offer.prank);
  const chances = offerChances(offer.deck);
  const other = offer.cards.find((c) => c !== 'prank');
  useAnnounce(`Festival Favour. Pick ${offer.cards.map((c) => FAVOURS[c].title).join(' or ')}.`, offer.until);
  if (choosing) {
    return (
      <StagePanel as="section" className="flex flex-col gap-2.5 p-3" label="Prank: pick a player">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="flex items-center gap-2 font-display text-2xl font-extrabold">
            <TimerOff className="size-6 text-ember" aria-hidden /> Who gets the prank?
          </h3>
          <span className="text-sm font-bold text-text-2">
            Closes in <Countdown until={offer.until} gameNow={gameNow} label="Closes in" />
          </span>
        </div>
        <p className="text-sm font-semibold text-text-2">Their best station stops for {PRANK_MS / 1000} seconds. A lock blocks it. If you do not pick, it goes to the biggest takings.</p>
        <ul className="flex max-h-[45dvh] flex-col gap-1.5 overflow-y-auto p-0.5">
          {offer.targets.map((t) => (
            <li key={t.playerId}>
              <button type="button" disabled={busy} onClick={() => onPick('prank', t.playerId)} className={buttonClass('secondary', 'lg', 'h-auto! min-h-12 w-full justify-start! gap-2! px-3! py-1.5! text-left')}>
                <span className="w-9 shrink-0 font-display text-lg font-extrabold tabular">{ordinal(t.rank)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{t.name}</span>
                  <span className="block truncate text-xs font-semibold text-text-2">
                    {formatNumber(t.coins)} coins{t.best ? ` · best: ${STATIONS[t.best.kind].name}, level ${t.best.level}` : ''}
                  </span>
                </span>
                {t.lock ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-bold">
                    <Lock className="size-4" aria-hidden /> Lock
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        {other ? (
          <Button variant="secondary" size="md" className="self-start" disabled={busy} onClick={() => onPick(other)}>
            Take {FAVOURS[other].title} instead
          </Button>
        ) : null}
      </StagePanel>
    );
  }
  return (
    <StagePanel as="section" className="flex flex-col gap-2.5 p-3" label="Festival Favour">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* The reward of this screen, on the gold plate. */}
        <h3 className="plate plate-gold text-2xl">
          <span>Festival Favour</span>
        </h3>
        <span className="text-sm font-bold text-text-2">
          Pick one · <Countdown until={offer.until} gameNow={gameNow} label="Closes in" />
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {offer.cards.map((card) => (
          <button
            key={card}
            type="button"
            disabled={busy}
            onClick={() => {
              if (card === 'prank') {
                setChoosing(true);
                onPick('prank');
              } else onPick(card);
            }}
            // A favour is a card you press: white, with the pieces' bottom edge.
            className="paper piece flex min-h-[9.5rem] flex-col items-start gap-1.5 rounded-[var(--radius-l)] p-3 text-left [--press:5px] disabled:opacity-60"
            style={{ animation: 'pop-in 200ms var(--ease-out) both' }}
          >
            <span className="flex items-center gap-1.5 font-display text-[1.4rem] leading-tight font-extrabold">
              <FavourIcon kind={card} className="size-5" /> {FAVOURS[card].title}
            </span>
            <span className="text-sm leading-snug font-semibold">{FAVOURS[card].text}</span>
            <span className="mt-auto text-xs font-bold text-text-2">Offered {Math.round(chances[card]! * 100)}% of the time</span>
          </button>
        ))}
      </div>
      <p className="text-xs font-semibold text-text-2">If you wait, the first card is taken for you.</p>
    </StagePanel>
  );
}

/** What just happened to you: a favour, a prank, a parade bonus. Each says so once, and plays its sound once. */
function Notices({ you, gameNow, view }: { you: You; gameNow: () => number; view: FestivalWorkshopView }) {
  const role = useSoundRole();
  const mine = role !== 'host';
  const f = you.favour;
  const freshFavour = useFresh(f?.at, gameNow, 5000);
  const pr = you.pranked;
  const stopped = Boolean(pr && !pr.blocked && pr.until > gameNow());
  const freshBlock = useFresh(pr?.blocked ? pr.at : null, gameNow, 6000);
  useNow(1000, stopped);
  const b = you.bonus;
  const freshBonus = useFresh(b?.at, gameNow, 6000);

  // Each notice is a title, what it means and any coins it brought; screen readers hear them as one sentence.
  type Notice = { title: string; detail: string; gain: number };
  let favour: Notice | null = null;
  if (f && freshFavour) {
    if (f.kind === 'overtime') favour = { title: 'Overtime', detail: 'Your income is ×1.5 for 30 seconds.', gain: 0 };
    else if (f.kind === 'tipJar') favour = { title: 'Tip jar', detail: f.swapped ? 'Nobody could be pranked, so you got a tip jar instead.' : 'A quarter of your coins on top, at least 30.', gain: f.amount };
    else if (f.kind === 'lock') favour = f.swapped ? { title: 'Second lock', detail: 'You already had a lock, so you get coins instead.', gain: SECOND_LOCK_COINS } : { title: 'Lock ready', detail: 'It blocks the next prank on you.', gain: 0 };
    else if (f.blocked) favour = { title: 'Prank blocked', detail: `${f.target}'s lock stopped your prank.`, gain: 0 };
    else favour = { title: 'Prank landed', detail: `Your prank tangled ${f.target}'s ${f.station ? STATIONS[f.station].name : 'station'} for ${PRANK_MS / 1000} seconds.`, gain: 0 };
  }
  const prank: Notice | null = pr && stopped ? { title: 'Tangled', detail: `${pr.by} tangled your ${STATIONS[pr.station].name}.`, gain: 0 } : pr && freshBlock ? { title: 'Lock held', detail: `Your lock stopped ${pr.by}'s prank.`, gain: 0 } : null;
  const goods = view.parade ? GOODS_INFO[view.parade.goods].many : 'goods';
  const bonus: Notice | null = b && freshBonus ? { title: 'Parade bonus', detail: b.place === 1 ? `You made the most ${goods}.` : `You made the ${ordinal(b.place)} most ${goods}.`, gain: b.amount } : null;
  const said = (n: Notice | null) => (n ? `${n.title}${n.gain ? `: +${formatNumber(n.gain)} coins` : ''}. ${n.detail}` : null);

  useAnnounce(said(favour), f?.at ?? null);
  useAnnounce(said(prank), pr?.at ?? null);
  useAnnounce(said(bonus), b?.at ?? null);
  const favourSound = f ? (f.kind === 'overtime' ? 'powerUp' : f.kind === 'tipJar' ? 'coin' : f.kind === 'lock' ? 'shield' : f.blocked ? 'bust' : 'steal') : 'coin';
  useSfx(favourSound, f?.at ?? null, mine && Boolean(favour));
  useSfx(pr?.blocked ? 'shield' : 'stolen', pr?.at ?? null, mine && Boolean(prank));
  useSfx('jackpot', b?.at ?? null, mine && Boolean(bonus));

  if (!favour && !prank && !bonus) return null;
  // Coins gained sit on a plain plate at the end of the banner: the number is the hero.
  const gain = (n: number) =>
    n > 0 ? (
      <span className="plate shrink-0 text-[1.6rem] tabular">
        <span>
          +{formatNumber(n)}
          <span className="sr-only"> coins</span>
        </span>
      </span>
    ) : null;
  return (
    <div className="flex flex-col gap-2">
      {prank ? (
        <NewsBanner
          tone={pr?.blocked ? 'glim' : 'ember'}
          icon={pr?.blocked ? Lock : TimerOff}
          title={prank.title}
          detail={
            <>
              {prank.detail}
              {stopped && pr ? (
                <>
                  {' '}
                  Back in <Countdown until={pr.until} gameNow={gameNow} label="Back in" />
                </>
              ) : null}
            </>
          }
        />
      ) : null}
      {favour && f ? (
        <NewsBanner tone={f.kind === 'prank' && f.blocked ? 'sky' : 'lantern'} icon={FAVOUR_ICON[f.kind]} title={favour.title} detail={favour.detail}>
          {gain(favour.gain)}
        </NewsBanner>
      ) : null}
      {bonus ? (
        <NewsBanner tone="glim" icon={Flag} title={bonus.title} detail={bonus.detail}>
          {gain(bonus.gain)}
        </NewsBanner>
      ) : null}
    </div>
  );
}

/**
 * The room's moments, said once each and heard on the shared screen only: the projector, or the player's own
 * screen in a solo game. A moment only sounds while it is fresh, so switching screens does not replay it.
 */
function useRoomMoments(view: FestivalWorkshopView, gameNow: () => number) {
  const shared = useSharedSounds();
  const ev = view.event;
  const m = view.market;
  const p = view.parade;
  const best = [...GOODS].sort((a, b) => m.demand[b] - m.demand[a])[0]!;
  const fresh = (at: number | null | undefined) => at !== null && at !== undefined && gameNow() - at < 3000;
  useAnnounce(ev ? `${eventTitle(ev)}. ${eventText(ev)}` : null, ev?.seq ?? null);
  useAnnounce(m.shifts > 0 ? `The market shifted. ${priceWords(best, m.demand[best])}.` : null, m.shifts);
  useAnnounce(p ? (p.reached ? `The parade got its ${GOODS_INFO[p.goods].many}.` : 'The parade fell short this time.') : null, p?.at ?? null);
  useAnnounce(view.finale.on ? `Grand finale. Fireworks sell at ${price(view.finale.demand)} and paydays are 50% bigger.` : null, view.finale.on);
  useSfx('event', ev?.seq ?? null, shared && fresh(ev?.startedAt));
  useSfx('swap', m.shifts, shared && m.shifts > 0 && fresh(m.lastShiftAt));
  useSfx('win', p?.at ?? null, shared && Boolean(p?.reached) && fresh(p?.at));
  useSfx('event', view.finale.on, shared && view.finale.on && fresh(view.finale.at));
}

function RoomNews({ view, gameNow }: { view: FestivalWorkshopView; gameNow: () => number }) {
  useRoomMoments(view, gameNow);
  return null;
}

/* ------------------------------- player screen ------------------------------ */

export function FestivalWorkshopPlayer({ view, act, gameNow, paused }: ModeScreenProps<FestivalWorkshopView>) {
  const you = view.you;
  const [tab, setTab] = useState<'questions' | 'workshop'>('questions');
  const [sheet, setSheet] = useState<{ slot: number; replace: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const flow = useAnswerFlow(you?.last, you?.question);
  const money = useLiveMoney(you, gameNow, tab === 'workshop' || sheet ? 500 : 1000);
  const freshPay = useFresh(you?.payday?.at, gameNow, 2400);
  const ids = useId();
  // A favour offer needs the Questions tab, where it replaces the question.
  const offerUntil = you?.offer?.until ?? null;
  useEffect(() => {
    if (offerUntil !== null) setTab('questions');
  }, [offerUntil]);
  useAnnounce(said, said);
  if (!you) return <p className="font-semibold text-text-2">Watching the festival.</p>;

  const send = async (action: Record<string, unknown>, success?: { sound: 'build' | 'upgrade'; text: string }) => {
    setBusy(true);
    const ack = await act(action);
    setBusy(false);
    if (ack.ok) {
      setNote(null);
      if (success) {
        playSfx(success.sound);
        setSaid(success.text);
      }
      return true;
    }
    setNote(ack.error.message);
    return false;
  };
  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };
  const canBuy = affordable(you, money.coins);
  const cheapest = Math.min(...you.shop.map((o) => o.cost));
  const overtime = you.overtimeUntil !== null && you.overtimeUntil > gameNow();
  const boosted = you.paradeUntil !== null && you.paradeUntil > gameNow();
  const tabs = [
    { id: 'questions' as const, label: 'Questions' },
    { id: 'workshop' as const, label: 'Workshop' },
  ];
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = tab === 'questions' ? 'workshop' : 'questions';
      setTab(next);
      document.getElementById(`${ids}-tab-${next}`)?.focus();
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5 sm:gap-3.5">
      <RoomNews view={view} gameNow={gameNow} />
      {/* Takings, coins, income, rank, the event and the market in one compact panel, so the question stays above the fold. */}
      <StagePanel as="section" className="flex flex-col gap-1.5 px-2.5 py-2 sm:gap-2 sm:p-3.5" label="Your workshop">
        <div className="flex items-center justify-between gap-2">
          <div className="relative flex min-w-0 items-baseline gap-1.5 leading-none">
            <span className="font-display text-[1.75rem] font-extrabold tabular sm:text-[2rem]">{formatNumber(Math.floor(money.takings))}</span>
            <span className="text-sm font-bold text-text-2">taken</span>
            {you.rank && view.players > 1 ? <span className="ml-1 font-bold text-text-2 tabular">{ordinal(you.rank)}</span> : null}
            {freshPay && you.payday ? (
              // A payday lands on a mint plate: the moment of this screen.
              <span key={you.payday.at} className="plate pointer-events-none absolute -top-2 left-0 bg-glim text-lg whitespace-nowrap text-on-accent" style={{ animation: 'reaction-float 1.8s var(--ease-out) forwards' }} aria-hidden>
                <span>+{formatNumber(you.payday.amount)}</span>
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {you.lock ? (
              <Pill className="px-2! py-0.5! text-xs" tone="dusk">
                <Lock className="size-3.5" aria-hidden /> Lock
              </Pill>
            ) : null}
            <Pill className="px-2.5! py-0.5! text-sm">
              <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
            </Pill>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1 text-sm font-bold">
            <Coins className="size-4 text-lantern" aria-hidden />
            <span className="tabular">{formatNumber(Math.floor(money.coins))}</span> to spend
          </span>
          <span className="text-sm font-bold">
            +<span className="tabular">{rateText(you.rate)}</span>/s<span className="sr-only"> income</span>
          </span>
          {overtime ? (
            <span className="text-xs font-bold text-lantern">
              Overtime ×1.5 <Countdown until={you.overtimeUntil} gameNow={gameNow} label="Overtime ends in" />
            </span>
          ) : null}
          {boosted ? (
            <span className="text-xs font-bold text-glim">
              Parade boost <Countdown until={you.paradeUntil} gameNow={gameNow} label="Parade boost ends in" />
            </span>
          ) : null}
          <span className="ml-auto min-w-0">
            <EventChip view={view} gameNow={gameNow} />
          </span>
        </div>
        <MarketStrip market={view.market} gameNow={gameNow} />
      </StagePanel>

      {/* Two tabs in a groove; the open one is lifted out of it in white, not only coloured. */}
      <div role="tablist" aria-label="Your screen" className={`grid grid-cols-2 gap-1 rounded-[var(--radius-l)] p-1 ${NIGHT}`}>
        {tabs.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              id={`${ids}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`${ids}-panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onKeyDown={onTabKey}
              onClick={() => setTab(t.id)}
              className={`relative flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-m)] font-bold transition-colors ${on ? 'chip-on shadow-[0_2px_6px_rgb(2_5_20/0.35)]' : 'text-text-2 hover:bg-white/[0.06] hover:text-text'}`}
            >
              {t.id === 'questions' ? <CircleQuestionMark className="size-4" aria-hidden /> : <Hammer className="size-4" aria-hidden />}
              {t.label}
              {t.id === 'workshop' && canBuy > 0 && !on ? (
                <span className="rounded-full bg-glim px-1.5 font-display text-sm leading-tight font-extrabold text-on-accent tabular">
                  {canBuy}
                  <span className="sr-only"> {canBuy === 1 ? 'thing' : 'things'} you can buy</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {note ? (
        <p className="text-sm font-bold text-ember" role="alert">
          {note}
        </p>
      ) : null}

      <Notices you={you} gameNow={gameNow} view={view} />

      <div id={`${ids}-panel-questions`} role="tabpanel" aria-labelledby={`${ids}-tab-questions`} hidden={tab !== 'questions'} className="flex flex-col gap-3">
        {you.offer ? (
          <FavourOffer key={you.offer.until} offer={you.offer} gameNow={gameNow} busy={busy || paused} onPick={(card, target) => void send({ type: 'favour', card, ...(target ? { target } : {}) })} />
        ) : flow.feedback ? (
          <div className="flex flex-col gap-3">
            <ResultBanner key={flow.feedback.iid} correct={flow.feedback.correct} partial={flow.feedback.partial} text={flow.feedback.text} answer={flow.answered ? shortAnswer(flow.answered.q, flow.feedback.reveal) : null} />
            {!flow.feedback.correct && flow.answered ? <RevealAnswer q={flow.answered.q} reveal={flow.feedback.reveal} compact /> : null}
            {!flow.feedback.correct ? <Explanation text={flow.feedback.explanation} /> : null}
            <button type="button" onClick={flow.dismiss} className="min-h-11 self-center rounded-[var(--radius-m)] px-4 py-2 font-bold text-text-2 hover:bg-white/10">
              Next question
            </button>
          </div>
        ) : you.question ? (
          <div className="flex flex-col gap-3">
            <QuestionCard q={you.question.q} />
            <AnswerInput key={you.question.iid} q={you.question.q} onSubmit={submit} disabled={paused} compact />
            {view.favours ? <FavourProgress toGo={you.toFavour} /> : null}
          </div>
        ) : null}
      </div>

      <div id={`${ids}-panel-workshop`} role="tabpanel" aria-labelledby={`${ids}-tab-workshop`} hidden={tab !== 'workshop'} className="flex flex-col gap-3">
        <section aria-labelledby={`${ids}-stations`} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id={`${ids}-stations`} className="font-display text-xl font-extrabold">
              Your stations
            </h3>
            <span className="text-sm font-semibold text-text-2">{you.full ? 'Every slot is full: replace a station to change what you make.' : `${plural(you.stations.filter((s) => s === null).length, 'free slot')}`}</span>
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {you.stations.map((st, i) =>
              st ? (
                <StationCard
                  key={i}
                  st={st}
                  slot={i}
                  coins={money.coins}
                  gameNow={gameNow}
                  busy={busy}
                  paused={paused}
                  full={you.full}
                  market={view.market}
                  finale={view.finale}
                  onUpgrade={() => void send({ type: 'upgrade', slot: i }, { sound: 'upgrade', text: `${STATIONS[st.kind].name} upgraded to level ${st.level + 1}.` })}
                  onReplace={() => setSheet({ slot: i, replace: true })}
                />
              ) : (
                <EmptySlot key={i} slot={i} cheapest={cheapest} coins={money.coins} disabled={busy || paused} onBuild={() => setSheet({ slot: i, replace: false })} />
              ),
            )}
          </ul>
        </section>
        <MarketPanel market={view.market} finale={view.finale} gameNow={gameNow} />
        <p className="text-sm font-semibold text-text-2">
          Takings so far: {formatNumber(you.from.paydays)} from paydays, {formatNumber(you.from.stations)} from stations
          {you.from.orders ? `, ${formatNumber(you.from.orders)} from parades` : ''}
          {you.from.favours ? `, ${formatNumber(you.from.favours)} from favours` : ''}.
        </p>
        <OddsInfo view={view} />
      </div>

      {sheet ? (
        <BuildSheet
          you={you}
          slot={sheet.slot}
          replace={sheet.replace}
          coins={money.coins}
          market={view.market}
          finale={view.finale}
          busy={busy || paused}
          onClose={() => setSheet(null)}
          onBuild={(kind) => {
            const slot = sheet.slot;
            void send({ type: 'build', slot, station: kind }, { sound: 'build', text: `Built ${aStation(kind)} in slot ${slot + 1}.` }).then((ok) => {
              if (ok) setSheet(null);
            });
          }}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------- host screen ------------------------------- */

/** Where a price sits on the board's meter: ×0.3 at the left to ×2 at the right. */
const meterAt = (p: number) => Math.max(4, Math.min(100, ((p - 0.3) / 1.7) * 100));
/** "+0.2", "−0.3", "0.0": a price's move since the last shift. */
const moveText = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(1)}`;

/**
 * The market on the projector, as a live trading board: one row a goods, with its price as the hero
 * number, its move since the last shift on a chip (arrow, sign and colour), where the price sits
 * between cheap and in demand, and what the class makes of it. Rows keep their order, so a price can
 * be found in the same place all game.
 */
function MarketBoard({ market, finale, gameNow }: { market: Market; finale: FestivalWorkshopView['finale']; gameNow: () => number }) {
  useNow(1000, market.shiftAt !== null);
  const left = market.shiftAt === null ? null : market.shiftAt - gameNow();
  const soon = left !== null && left <= SHIFT_HINT_MS;
  const text = 'text-[clamp(1rem,min(1.45vw,2.5vh),1.6rem)]';
  const small = 'text-[clamp(0.85rem,min(1.1vw,2vh),1.3rem)]';
  return (
    <section aria-labelledby="fw-market" className={`flex min-h-0 flex-col gap-[clamp(0.3rem,0.9vh,0.7rem)] rounded-[var(--radius-l)] border border-white/10 p-[clamp(0.7rem,1.5vh,1.25rem)] ${NIGHT}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 id="fw-market" className="flex items-center gap-2 font-display text-[clamp(1.4rem,min(2.2vw,3.9vh),2.5rem)] leading-tight font-extrabold">
          <Store className="size-[0.85em]" aria-hidden /> Class market
        </h3>
        {/* One line, so the takings below still fit a 768-pixel projector. */}
        <span className={`font-bold ${text} ${soon ? 'text-lantern' : 'text-text-2'}`}>
          {left === null ? 'No more shifts' : soon ? `Shifts in ${Math.max(1, Math.ceil(left / 1000))} s` : <>Shifts in <Countdown until={market.shiftAt} gameNow={gameNow} label="Market shifts in" /></>}
        </span>
      </div>
      <ul className="flex flex-col gap-[clamp(0.25rem,0.7vh,0.5rem)]" aria-label="Market prices">
        {GOODS.map((g) => {
          const p = market.demand[g];
          const d = Math.round((market.demand[g] - market.prev[g]) * 10) / 10;
          const moved = trendOf(market, g);
          const next = market.heading[g];
          const fixed = finale.on && g === 'fireworks';
          const status = fixed ? 'Finale price' : soon ? (next === 'steady' ? 'Steady next' : `Heading ${next}`) : p >= 1.3 ? 'In demand' : p <= 0.7 ? 'Cheap' : 'Steady';
          const chip = moved === 'up' ? 'bg-glim text-on-accent' : moved === 'down' ? 'bg-ember text-on-accent' : 'bg-white/[0.1] text-text';
          const fill = p >= 1.3 ? 'bg-glim' : p <= 0.7 ? 'bg-ember' : 'bg-sky';
          return (
            <li key={g} className="grid min-h-[clamp(2.4rem,5.4vh,4.25rem)] grid-cols-[minmax(0,1.25fr)_auto_minmax(4.4em,auto)_minmax(0,1fr)] items-center gap-x-[clamp(0.6rem,1.1vw,1.25rem)] rounded-[var(--radius-m)] bg-white/[0.05] px-[clamp(0.5rem,0.9vw,1rem)] py-1">
              <span className="flex min-w-0 items-center gap-[0.5em]">
                <GoodsIcon goods={g} size={34} className="size-[clamp(1.5rem,3.6vh,2.5rem)]" />
                <span className="min-w-0 leading-tight">
                  <span className={`block truncate font-bold ${text}`}>{GOODS_INFO[g].label}</span>
                  <span className={`block truncate font-semibold text-text-2 ${small}`}>
                    {status} · {formatNumber(market.shares[g])}% made
                  </span>
                </span>
              </span>
              <span className={`font-display text-[clamp(1.6rem,min(2.7vw,4.6vh),3.1rem)] leading-none font-extrabold tabular ${priceTone(p)}`}>{price(p)}</span>
              <span className={`inline-flex items-center justify-center gap-[0.2em] justify-self-start rounded-full px-[0.55em] py-[0.15em] font-display font-extrabold tabular ${text} ${chip}`} aria-hidden>
                <Arrow heading={moved} className="size-[0.85em]" />
                {moveText(d)}
              </span>
              {/* Where the price sits from cheap to in demand; the tick is the even price, ×1. */}
              <span className="relative h-[clamp(0.6rem,1.4vh,1rem)] rounded-full bg-white/[0.12]" aria-hidden>
                <span className={`absolute inset-y-0 left-0 rounded-full ${fill} transition-[width] duration-500 ease-[var(--ease-out)]`} style={{ width: `${meterAt(p)}%` }} />
                <span className="absolute -inset-y-1 w-0.5 rounded-full bg-white/70" style={{ left: `${meterAt(1)}%` }} />
              </span>
              <span className="sr-only">
                {priceWords(g, p)}, {moved === 'steady' ? 'no change since the last shift' : `${moved} ${Math.abs(d).toFixed(1)} since the last shift`}
                {soon ? `, heading ${next} at the next shift` : ''}.
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EventPanel({ view, gameNow }: { view: FestivalWorkshopView; gameNow: () => number }) {
  const ev = view.event;
  useNow(500, Boolean(ev));
  // Sized by the screen's height as much as its width, so the panel fills a 1080-pixel projector and still fits a 768-pixel one.
  const big = 'font-display text-[clamp(1.75rem,min(3.4vw,6vh),4.5rem)] leading-[1.05] font-extrabold';
  const text = 'text-[clamp(1rem,min(1.6vw,2.8vh),2rem)] leading-snug font-semibold';
  // A live moment is a solid banner in its accent; between moments the panel is calm.
  const banner = (tone: string) => `lift flex min-h-0 flex-col justify-center gap-[clamp(0.3rem,1.2vh,1rem)] rounded-[var(--radius-l)] p-[clamp(0.75rem,1.8vh,1.75rem)] text-on-accent ${tone}`;
  const calm = `flex min-h-0 flex-col justify-center gap-[clamp(0.25rem,1vh,0.75rem)] rounded-[var(--radius-l)] border border-white/10 p-[clamp(0.75rem,1.8vh,1.75rem)] ${NIGHT}`;
  const disc = 'grid size-[clamp(2.5rem,6.4vh,5.5rem)] shrink-0 place-items-center rounded-full bg-ink/85 text-white';
  const p = view.parade;
  const freshParade = p && gameNow() - p.at < 12_000;
  if (ev) {
    const leftPct = Math.max(0, Math.min(100, ((ev.endsAt - gameNow()) / (ev.endsAt - ev.startedAt)) * 100));
    const parade = ev.kind === 'parade' && ev.target > 0;
    const pct = parade ? Math.min(100, (ev.progress / ev.target) * 100) : 0;
    const Icon = EVENT_ICON[ev.kind];
    return (
      <section aria-labelledby="fw-event" key={ev.seq} className={banner({ glim: 'bg-glim', lantern: 'bg-lantern', sky: 'bg-sky', dusk: 'bg-dusk' }[EVENT_TONE[ev.kind]])} style={{ animation: 'pop-in 200ms var(--ease-out)' }}>
        <div className="flex items-center gap-[clamp(0.6rem,1vw,1rem)]">
          <span className={disc} aria-hidden>
            <Icon className="size-[56%]" />
          </span>
          <h3 id="fw-event" className={`min-w-0 flex-1 italic ${big}`}>
            {eventTitle(ev)}
          </h3>
          {/* Inside a coloured banner the clock sits on the plain plate. */}
          <span className="plate shrink-0 text-[clamp(1.3rem,min(2.4vw,4.2vh),3.2rem)] tabular">
            <span>
              <Countdown until={ev.endsAt} gameNow={gameNow} label="Event ends in" />
            </span>
          </span>
        </div>
        <p className={text}>{eventText(ev)}</p>
        {parade ? (
          <>
            <div className="relative h-[clamp(1.25rem,3.6vh,3rem)] overflow-hidden rounded-full bg-ink/[0.18]" role="meter" aria-label={`Parade order: ${GOODS_INFO[ev.goods!].many}`} aria-valuenow={Math.floor(ev.progress)} aria-valuemin={0} aria-valuemax={ev.target}>
              <div className="absolute inset-0 rounded-full bg-ink/80 transition-transform duration-500 ease-[var(--ease-out)]" style={{ transform: `translateX(${pct - 100}%)` }} />
            </div>
            <p className="font-display text-[clamp(1.2rem,min(2.2vw,3.8vh),2.75rem)] leading-tight font-extrabold tabular">
              {formatNumber(ev.progress)} of {formatNumber(ev.target)} coins’ worth · {Math.floor(pct)}%
            </p>
          </>
        ) : (
          // The time this event has left.
          <div className="h-[clamp(0.5rem,1.3vh,1rem)] overflow-hidden rounded-full bg-ink/[0.18]" aria-hidden>
            <div className="h-full rounded-full bg-ink/80" style={{ width: `${leftPct}%` }} />
          </div>
        )}
      </section>
    );
  }
  if (freshParade && p?.reached) {
    return (
      <section aria-labelledby="fw-event" key={p.at} className={banner('bg-glim')} style={{ animation: 'pop-in 200ms var(--ease-out)' }}>
        <div className="flex items-center gap-[clamp(0.6rem,1vw,1rem)]">
          <span className={disc} aria-hidden>
            <Flag className="size-[56%]" />
          </span>
          <h3 id="fw-event" className={`min-w-0 flex-1 italic ${big}`}>
            The parade got its {GOODS_INFO[p.goods].many}
          </h3>
        </div>
        <p className={text}>
          {formatNumber(p.total)} of {formatNumber(p.target)} coins’ worth. {plural(p.boosted, 'maker')} earn ×1.25 for 30 seconds.
          {p.top.length ? ` Top makers: ${p.top.map((t) => t.name).join(', ')}.` : ''}
        </p>
      </section>
    );
  }
  if (view.finale.on && !freshParade) {
    return (
      <section aria-labelledby="fw-event" className={banner('bg-lantern')}>
        <div className="flex items-center gap-[clamp(0.6rem,1vw,1rem)]">
          <span className={disc} aria-hidden>
            <Rocket className="size-[56%]" />
          </span>
          <h3 id="fw-event" className={`min-w-0 flex-1 italic ${big}`}>
            Grand finale
          </h3>
        </div>
        <p className={text}>Fireworks sell at {price(view.finale.demand)} and paydays are 50% bigger until the end.</p>
      </section>
    );
  }
  return (
    <section aria-labelledby="fw-event" className={calm}>
      {freshParade && p ? (
        <>
          <h3 id="fw-event" className={big}>
            The parade fell short
          </h3>
          <p className={`${text} text-text-2`}>
            {formatNumber(p.total)} of {formatNumber(p.target)} coins’ worth.
            {p.top.length ? ` Top makers: ${p.top.map((t) => t.name).join(', ')}.` : ''}
          </p>
        </>
      ) : (
        <>
          <h3 id="fw-event" className={big}>
            {view.nextEventAt !== null ? 'Next festival event' : view.finale.at !== null ? 'Grand finale coming' : 'Festival events'}
          </h3>
          <p className={`${text} text-text-2`}>
            {view.nextEventAt !== null ? (
              <>
                In <Countdown until={view.nextEventAt} gameNow={gameNow} label="Next festival event in" />.{' '}
                {view.rush ? 'Every event is a parade order.' : 'Parade order, rush hour, lucky sparks, market swing or tea break: each equally likely, never twice in a row.'}
              </>
            ) : view.finale.at !== null ? (
              <>
                In <Countdown until={view.finale.at} gameNow={gameNow} label="Grand finale in" />: fireworks will sell at {price(view.finale.demand)}.
              </>
            ) : (
              'No more events this game.'
            )}
          </p>
        </>
      )}
    </section>
  );
}

/** Rows move up and down the board: each change shows an arrow for a few seconds. */
function useRankMoves(rows: Row[]) {
  const last = useRef(new Map<string, number>());
  const moves = useRef(new Map<string, { by: number; at: number }>());
  const now = Date.now();
  for (const r of rows) {
    const before = last.current.get(r.playerId);
    if (before !== undefined && before !== r.rank) moves.current.set(r.playerId, { by: before - r.rank, at: now });
  }
  useEffect(() => {
    last.current = new Map(rows.map((r) => [r.playerId, r.rank]));
  });
  useNow(1000, moves.current.size > 0);
  return (id: string) => {
    const m = moves.current.get(id);
    if (!m) return 0;
    if (Date.now() - m.at > 8000) {
      moves.current.delete(id);
      return 0;
    }
    return m.by;
  };
}

const ROW_GLIM = 'size-[clamp(1.9rem,4vh,3.25rem)]';

function HostBoard({ rows, players, gameNow }: { rows: Row[]; players: RoomPlayerView[]; gameNow: () => number }) {
  const move = useRankMoves(rows);
  const two = rows.length > 5;
  useNow(500, rows.some((r) => r.rate > 0));
  const viewAt = useRef({ at: gameNow(), rows });
  if (viewAt.current.rows !== rows) viewAt.current = { at: gameNow(), rows };
  const grown = (gameNow() - viewAt.current.at) / 1000;
  return (
    <ol
      className={`grid gap-x-[clamp(0.75rem,1.4vw,1.25rem)] gap-y-1.5 text-[clamp(1rem,min(1.5vw,2.6vh),1.65rem)] leading-tight ${two ? 'grid-flow-col grid-cols-2' : 'grid-cols-1'}`}
      aria-label="Biggest takings"
      style={{ '--lb-rank': 'clamp(1.9rem, 4vh, 3.25rem)', gridTemplateRows: two ? `repeat(${Math.ceil(rows.length / 2)}, auto)` : undefined } as CSSProperties}
    >
      {rows.map((r) => {
        const by = move(r.playerId);
        return (
          <li key={r.playerId} className={`flex min-w-0 items-center gap-[clamp(0.4rem,0.8vw,0.75rem)] rounded-[var(--radius-m)] px-2.5 py-1 ${NIGHT}`}>
            <RankBadge rank={r.rank} big />
            <PlayerGlim avatar={avatarOf(players, r.playerId)} seed={r.playerId} size={56} className={`${ROW_GLIM} shrink-0`} />
            <span className="min-w-0 flex-1 truncate font-bold">
              {r.name}
              {r.lock ? <Lock className="ml-1 inline size-[0.8em] align-[-1px]" aria-label="Holds a lock" /> : null}
            </span>
            {by ? (
              <span className={`flex shrink-0 items-center font-display font-extrabold ${by > 0 ? 'text-glim' : 'text-ember'}`}>
                {by > 0 ? <ArrowUp className="size-[0.9em]" strokeWidth={3} aria-hidden /> : <ArrowDown className="size-[0.9em]" strokeWidth={3} aria-hidden />}
                {Math.abs(by)}
                <span className="sr-only">{by > 0 ? ` up ${Math.abs(by)}` : ` down ${Math.abs(by)}`}</span>
              </span>
            ) : null}
            <span className="shrink-0 text-[0.8em] font-semibold text-text-2 tabular">
              +{shortRate(r.rate)}/s<span className="sr-only"> ({formatNumber(r.rate)} coins a second)</span>
            </span>
            <span className="min-w-[4ch] shrink-0 text-right font-display text-[1.25em] font-extrabold tabular">{formatNumber(Math.floor(r.takings + r.rate * grown))}</span>
          </li>
        );
      })}
    </ol>
  );
}

const NEWS_ICON: Record<News['kind'], { icon: LucideIcon; tone: string }> = {
  prank: { icon: TimerOff, tone: 'text-ember' },
  blocked: { icon: Lock, tone: 'text-glim' },
  lab: { icon: Hammer, tone: 'text-lantern' },
  max: { icon: ArrowUp, tone: 'text-glim' },
  spark: { icon: Clover, tone: 'text-lantern' },
  streak: { icon: Flame, tone: 'text-lantern' },
  parade: { icon: Flag, tone: 'text-glim' },
  finale: { icon: Rocket, tone: 'text-lantern' },
};

function newsLine(n: News): { icon: ReactNode; text: string } {
  const station = n.station ? STATIONS[n.station].name : 'station';
  const { icon: Icon, tone } = NEWS_ICON[n.kind];
  const icon = <Icon className={`size-[1.1em] shrink-0 ${tone}`} aria-hidden />;
  switch (n.kind) {
    case 'prank':
      return { icon, text: `${n.who} tangled ${n.other}'s ${station}` };
    case 'blocked':
      return { icon, text: `${n.who}'s lock stopped ${n.other}'s prank` };
    case 'lab':
      return { icon, text: `${n.who} opened a Firework Lab` };
    case 'max':
      return { icon, text: `${n.who}'s ${station} reached level ${n.level}` };
    case 'spark':
      return { icon, text: `Lucky spark: ${n.who}'s ${station} went up to level ${n.level}` };
    case 'streak':
      return { icon, text: `${n.who} is on a streak of ${n.level}: paydays +50%` };
    case 'parade':
      return { icon, text: `${n.who} made the most ${n.goods ? GOODS_INFO[n.goods].many : 'goods'} for the parade` };
    default:
      return { icon, text: 'The grand finale began' };
  }
}

/** Fireworks over the projector as the finale starts: one burst for the moment, and none when motion is reduced. */
function FinaleSky({ at, gameNow }: { at: number | null; gameNow: () => number }) {
  const fresh = at !== null && gameNow() - at < 2500;
  useNow(1000, fresh);
  if (!fresh || !motionOK()) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {[
        [24, 22, 30],
        [72, 16, 200],
      ].map(([x, y, hue]) => (
        <div key={`${at}-${x}`} className="absolute" style={{ left: `${x}%`, top: `${y}%`, width: 1, height: 1 }}>
          <Burst style="fireworks" hue={hue!} size={300} />
        </div>
      ))}
    </div>
  );
}

export function FestivalWorkshopHost({ view, gameNow, room }: ModeScreenProps<FestivalWorkshopView>) {
  const heading = 'mb-[clamp(0.25rem,1vh,0.5rem)] font-display text-[clamp(1.4rem,min(2.2vw,3.9vh),2.5rem)] leading-tight font-extrabold';
  const text = 'text-[clamp(1rem,min(1.5vw,2.6vh),1.65rem)]';
  const m = view.market;
  // The room hears each event, each shift and the finale once; a parade that made it gets a cheer.
  useRoomMoments(view, gameNow);
  const standing = view.standing;
  const favourite = standing ? [...STATION_ORDER].sort((a, b) => standing[b] - standing[a])[0]! : null;
  return (
    <div className="relative mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-[clamp(0.6rem,1.6vh,1.25rem)]">
      <FinaleSky at={view.finale.on ? view.finale.at : null} gameNow={gameNow} />
      {/* The title on its plate at the top left, the clocks at the top right, as a broadcast lays them out. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ModeTitle>Festival Workshop</ModeTitle>
        <div className="flex items-center gap-2 text-[clamp(1.1rem,1.8vw,2rem)]">
          {view.finale.on ? (
            <Pill tone="lantern" className="px-4 py-1.5">
              <Rocket className="size-[0.9em]" aria-hidden /> Grand finale
            </Pill>
          ) : null}
          <Pill className="px-5 py-1.5">
            <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </Pill>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-[clamp(0.6rem,1.4vw,1.5rem)] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <MarketBoard market={m} finale={view.finale} gameNow={gameNow} />
        <EventPanel view={view} gameNow={gameNow} />
      </div>
      <div className="grid grid-cols-1 gap-[clamp(0.75rem,1.6vw,1.75rem)] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="fw-board">
          <h3 id="fw-board" className={heading}>
            Biggest takings
          </h3>
          {view.board.length ? <HostBoard rows={view.board} players={room.players} gameNow={gameNow} /> : <p className={`font-semibold text-text-2 ${text}`}>Waiting for the first workshop to open.</p>}
        </section>
        <div className="flex flex-col gap-[clamp(0.5rem,1.4vh,1rem)]">
          <section aria-labelledby="fw-news">
            <h3 id="fw-news" className={heading}>
              Workshop news
            </h3>
            {view.news.length ? (
              <ul className={`flex flex-col gap-1.5 leading-tight ${text}`} aria-live="off">
                {view.news.slice(0, view.teams ? 3 : 5).map((n, i) => {
                  const line = newsLine(n);
                  // A line can take two rows, so the projector's height sets how many show: the newest two on a 768-pixel
                  // screen and four on a 1080-pixel one (one and two beside the team scores), so the column ends with the board.
                  const extra = view.teams ? (i >= 2 ? '[@media(max-height:1100px)]:hidden' : i >= 1 ? '[@media(max-height:820px)]:hidden' : '') : i >= 4 ? '[@media(max-height:1100px)]:hidden' : i >= 2 ? '[@media(max-height:820px)]:hidden' : '';
                  return (
                    <li key={n.seq} className={`flex min-h-[clamp(2.25rem,4.8vh,3.75rem)] items-center gap-2.5 rounded-[var(--radius-m)] px-3 py-1 ${NIGHT} ${extra}`} style={{ animation: 'rise-fade 200ms var(--ease-out) both' }}>
                      {line.icon}
                      <span className="line-clamp-2 min-w-0 flex-1 font-semibold">{line.text}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={`font-semibold text-text-2 ${text}`}>Big builds, pranks and lucky sparks will show up here.</p>
            )}
            {favourite && standing && standing[favourite] > 0 ? (
              <p className={`mt-1.5 flex items-center gap-2 font-semibold text-text-2 ${text} ${view.teams ? '[@media(max-height:1100px)]:hidden' : ''}`}>
                <StationIcon kind={favourite} size={26} /> Class favourite: {STATIONS[favourite].many} ({standing[favourite]})
              </p>
            ) : null}
          </section>
          {view.teams ? (
            <StagePanel className="flex flex-col gap-2 p-[clamp(0.6rem,1.4vh,1rem)]">
              <h3 className="font-display text-[clamp(1.3rem,min(2vw,3.6vh),2.2rem)] font-extrabold">Teams (average takings)</h3>
              <TeamScores teams={view.teams.map((t) => ({ teamId: t.teamId, name: t.name, hue: t.hue, score: t.average }))} big />
            </StagePanel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
