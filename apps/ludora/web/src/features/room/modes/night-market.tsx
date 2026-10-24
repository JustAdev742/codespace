import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Bell,
  BellRing,
  CircleHelp,
  Clover,
  CloudRain,
  Coins,
  Dices,
  Eye,
  Flag,
  Flame,
  Gem,
  HandCoins,
  Moon,
  Shield,
  ShieldCheck,
  Store,
  Sun,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
  VenetianMask,
  Wand,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type { Answer, LanternArt, RoomPlayerView, RoomView } from '@ludora/shared';
import {
  EVENT_INFO,
  KIND_INFO,
  LEVEL_EVERY,
  contentHelp,
  contentLabel,
  contentWeights,
  fortuneMultiplier,
  kindPercents,
  wildGrowth,
  type ContentId,
  type LanternKind,
  type MarketEventId,
  type OddsMoment,
} from '@ludora/engine/night-market-odds';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner, RevealAnswer, shortAnswer } from '../game/Reveal.tsx';
import { RankBadge, TeamScores } from '../game/Leaderboard.tsx';
import { Explanation, ModeTitle } from '../game/parts.tsx';
import { useAnnounce } from '../game/announce.tsx';
import { NIGHT, Pill, PlayerGlim, StagePanel, avatarOf, motionOK } from '../game/stage.tsx';
import { Lantern } from '../../../art/Lantern.tsx';
import { Burst } from '../../../art/bursts.tsx';
import { Dialog } from '../../../ui/primitives.tsx';
import { useNow } from '../../../lib/useNow.ts';
import { formatNumber, ordinal, plural } from '../../../lib/format.ts';
import { playSfx, useSfx, useSharedSounds, useSoundRole } from '../../../lib/sound/react.tsx';
import type { SfxName } from '../../../lib/sound/sfx.ts';

/*
 * Night Market: every right answer picks one of three mystery lanterns.
 * Coins, a gamble, a trick on another player or a lucky charm. The player's
 * phone shows the stall, the pick and the tricks; the projector shows the
 * market: the event of the moment, the richest stalls and the big plays.
 *
 * The look (docs/DESIGN.md): the offer is the premium moment, three lantern
 * cases lit in their kind's colour with the kind's name plate along the
 * bottom; opening one is this screen's orchestrated reveal. Everything else
 * is calm smoked panels, solid chips and big condensed numbers.
 */

/* --------------------------------- the view -------------------------------- */

interface BoardRow {
  playerId: string;
  name: string;
  teamId: string | null;
  coins: number;
  shield: boolean;
  rank: number;
  isYou: boolean;
}

interface Opened {
  seq: number;
  at: number;
  kind: LanternKind;
  content: ContentId;
  delta: number;
  title: string;
  detail: string | null;
  waiting: boolean;
  blocked: boolean;
  big: boolean;
}

interface Note {
  id: number;
  at: number;
  text: string;
  tone: 'good' | 'bad' | 'info';
  icon: 'swipe' | 'swap' | 'shield' | 'toll' | 'level';
  mine: boolean;
}

interface Target {
  playerId: string;
  name: string;
  coins: number;
  shield: boolean;
  blocked: 'last' | 'guard' | null;
  guardUntil: number | null;
}

interface Choose {
  seq: number;
  trick: 'swipe' | 'swap';
  percent: number | null;
  deadline: number;
  relaxed: boolean;
  total: number;
  targets: Target[];
}

interface OfferLantern {
  kind: LanternKind | null;
  content: ContentId | null;
}

interface Offer {
  seq: number;
  bonus: boolean;
  sight: boolean;
  lanterns: OfferLantern[];
}

type NewsKind = 'jackpot' | 'double' | 'coins' | 'swipe' | 'swap' | 'block' | 'toll' | 'wildWin' | 'wildLoss' | 'goal';

interface News {
  id: number;
  at: number;
  kind: NewsKind;
  by: string;
  to: string | null;
  amount: number;
  trick: 'swipe' | 'swap' | null;
  name: string;
  target: string | null;
}

interface You {
  coins: number;
  rank: number | null;
  teamId: string | null;
  level: number;
  rights: number;
  toNext: number;
  shield: boolean;
  sight: boolean;
  lucky: number;
  tricksLive: boolean;
  extraPicks: number;
  question: QuestionView | null;
  last: FeedbackView | null;
  offer: Offer | null;
  choose: Choose | null;
  opened: Opened | null;
  notes: Note[];
}

export interface NightMarketView {
  endsAt: number;
  goal: number;
  fog: boolean;
  tricks: boolean;
  event: { id: MarketEventId; endsAt: number } | null;
  next: { at: number; lastCall: boolean } | null;
  players: number;
  board: BoardRow[];
  teams: { teamId: string; name: string; hue: number; members: number; average: number }[] | null;
  /* The big screen only. */
  tricksLive?: boolean;
  opened?: Record<LanternKind, number>;
  tricksPlayed?: number;
  coins?: number;
  news?: News[];
  /* A player only. */
  you?: You | null;
}

/* ------------------------------- looks and words ------------------------------ */

const KIND_ICON: Record<LanternKind, LucideIcon> = { fortune: Coins, wild: Dices, trick: VenetianMask, charm: Wand };

/** A lantern's paper, pattern and trim for its kind; fog draws a plain night-blue one. */
function artFor(kind: LanternKind | null): LanternArt {
  if (!kind) return { hue: 236, accentHue: 200, pattern: 'plain' };
  const k = KIND_INFO[kind];
  return { hue: k.hue, accentHue: k.accentHue, pattern: k.pattern };
}

/**
 * Each kind's colour as a solid fill, from the tokens: gold Fortune, red (coral) Wild,
 * violet Trick, teal Charm; a cool grey when fog hides the kind. Ink text passes AA on every one,
 * and the kind is always written and drawn as an icon too.
 */
const KIND_FILL: Record<LanternKind, string> = { fortune: 'var(--lantern)', wild: 'var(--ember)', trick: 'var(--dusk)', charm: 'var(--tile-f)' };
const fillOf = (kind: LanternKind | null) => (kind ? KIND_FILL[kind] : 'var(--r-common)');

/**
 * A lantern case on offer: midnight navy lit from behind the lantern in its kind's colour, with
 * the kind's name plate in the solid colour along the bottom (`--band` tall). The plate is part
 * of the background, so the piece's darker bottom edge falls across it. (A navy base keeps gold
 * a warm light; tinting the whole case gold turns it brown.)
 */
function caseBackground(kind: LanternKind | null): string {
  const fill = fillOf(kind);
  return [
    `linear-gradient(to top, ${fill} var(--band), transparent var(--band))`,
    `radial-gradient(70% 48% at 50% 36%, color-mix(in oklab, ${fill} 58%, transparent) 0%, transparent 74%)`,
    `linear-gradient(180deg, color-mix(in oklab, ${fill} 12%, var(--stage-1)) 0%, var(--stage-4) 100%)`,
  ].join(', ');
}

const EVENT_LOOK: Record<MarketEventId, { icon: LucideIcon; bg: string; short: string }> = {
  golden: { icon: Sun, bg: 'bg-lantern', short: 'Fortune pays double' },
  trickster: { icon: VenetianMask, bg: 'bg-dusk', short: 'Twice the tricks' },
  rain: { icon: CloudRain, bg: 'bg-sky', short: 'Two picks per right answer' },
  calm: { icon: Moon, bg: 'bg-glim', short: 'No tricks, shields hold' },
  winds: { icon: Wind, bg: 'bg-ember', short: 'More Wild, bigger wins' },
  lastCall: { icon: BellRing, bg: 'bg-lantern', short: 'Fortune pays double' },
};

const NOTE_ICON: Record<Note['icon'], LucideIcon> = { swipe: HandCoins, swap: ArrowLeftRight, shield: ShieldCheck, toll: Bell, level: TrendingUp };

const NEWS_LOOK: Record<NewsKind, { icon: LucideIcon; tint: string }> = {
  jackpot: { icon: Gem, tint: 'bg-lantern' },
  double: { icon: TrendingUp, tint: 'bg-lantern' },
  coins: { icon: Coins, tint: 'bg-lantern' },
  swipe: { icon: HandCoins, tint: 'bg-dusk' },
  swap: { icon: ArrowLeftRight, tint: 'bg-dusk' },
  block: { icon: ShieldCheck, tint: 'bg-glim' },
  toll: { icon: Bell, tint: 'bg-dusk' },
  wildWin: { icon: Flame, tint: 'bg-ember' },
  wildLoss: { icon: TrendingDown, tint: 'bg-ember' },
  goal: { icon: Trophy, tint: 'bg-lantern' },
};

const signed = (n: number) => (n < 0 ? `−${formatNumber(-n)}` : `+${formatNumber(n)}`);

function newsLine(n: News): { text: string; amount: string | null } {
  switch (n.kind) {
    case 'jackpot':
      return { text: `${n.name} found a jackpot`, amount: signed(n.amount) };
    case 'double':
      return { text: `${n.name}’s coins doubled`, amount: signed(n.amount) };
    case 'coins':
      return { text: `${n.name} opened a rich lantern`, amount: signed(n.amount) };
    case 'swipe':
      return { text: `${n.name} swiped from ${n.target}`, amount: signed(n.amount) };
    case 'swap':
      return { text: `${n.name} swapped with ${n.target}`, amount: signed(n.amount) };
    case 'block':
      return { text: `${n.target}’s shield blocked ${n.name}’s ${n.trick ?? 'trick'}`, amount: null };
    case 'toll':
      return { text: `${n.name} rang the toll bell`, amount: signed(n.amount) };
    case 'wildWin':
      return { text: `${n.name}’s wild lantern paid off`, amount: signed(n.amount) };
    case 'wildLoss':
      return { text: `${n.name}’s wild lantern went wrong`, amount: signed(n.amount) };
    case 'goal':
      return { text: `${n.name} reached the goal`, amount: formatNumber(n.amount) };
  }
}

/** The big moments that take over the big screen for a few seconds. */
const SPECTACLE: Partial<Record<NewsKind, { headline: string; sound: SfxName }>> = {
  jackpot: { headline: 'Jackpot', sound: 'jackpot' },
  double: { headline: 'Double', sound: 'jackpot' },
  swap: { headline: 'Swap', sound: 'swap' },
  goal: { headline: 'Winner', sound: 'win' },
};
/** A swap only takes over the big screen when it moves this many coins: in a big class small swaps are frequent. */
const BIG_SWAP = 500;
const SPECTACLE_MS = 3000;
const isSpectacle = (n: News) => Boolean(SPECTACLE[n.kind]) && (n.kind !== 'swap' || Math.abs(n.amount) >= BIG_SWAP);

const NEWS_SOUND: Partial<Record<NewsKind, SfxName>> = { swipe: 'steal', block: 'shield', toll: 'coin', wildWin: 'win', wildLoss: 'bust', coins: 'coin' };

/** Percent for the odds table: whole numbers, one decimal when it matters. */
function percentText(p: number): string {
  const r = Math.round(p * 10) / 10;
  return `${Number.isInteger(r) ? String(r) : r.toFixed(1)}%`;
}

function moment(view: NightMarketView, room: RoomView, you: Pick<You, 'tricksLive' | 'level' | 'lucky'>): OddsMoment {
  const st = room.room.settings;
  return {
    settings: { greed: String(st.greed ?? 'normal'), trickOdds: String(st.trickOdds ?? 'normal'), wildness: String(st.wildness ?? 'normal') },
    event: view.event?.id ?? null,
    tricksLive: you.tricksLive,
    level: you.level,
    lucky: you.lucky,
  };
}

/*
 * The opening: the one orchestrated moment of the offer. The picked lantern rattles and swells,
 * its cap lifts off and its light flares while the other two step back; then the result card
 * pops in. Nothing moves while the offer waits. Only runs when motion is allowed (the opening is
 * skipped outright otherwise), and the global reduced-motion rules cut it to a single frame.
 */
const MOTION_CSS = `
@keyframes nm-open{0%{transform:scale(1)}30%{transform:scale(1.08) rotate(-4deg)}60%{transform:scale(1.14) rotate(3deg)}100%{transform:scale(1.2);filter:brightness(1.35)}}
@keyframes nm-cap{to{transform:translateY(-22px) rotate(-18deg);opacity:0}}
@keyframes nm-glow{to{transform:scale(2.4);opacity:.15}}
@keyframes nm-dim{to{opacity:.35;transform:scale(.94)}}
.nm-open{animation:nm-open 650ms var(--ease-out) forwards}
.nm-cap{animation:nm-cap 480ms 140ms var(--ease-out) forwards}
.nm-glow{animation:nm-glow 650ms ease-out forwards}
.nm-dim{animation:nm-dim 220ms var(--ease-out) forwards}
`;

function MotionStyle() {
  return <style>{MOTION_CSS}</style>;
}

/** A number that counts up (or down) to its new value; instant when less motion is asked for. */
function useCountUp(value: number, ms = 700) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    if (!motionOK()) {
      shownRef.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const v = Math.round(from + (value - from) * (1 - (1 - k) ** 3));
      shownRef.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/** Coins as a counting number, read out once as a plain number. */
function CoinCount({ value, className = '' }: { value: number; className?: string }) {
  const shown = useCountUp(value);
  return (
    <span className={`tabular ${className}`}>
      <span aria-hidden>{formatNumber(shown)}</span>
      <span className="sr-only">{plural(value, 'coin')}</span>
    </span>
  );
}

/* --------------------------------- player --------------------------------- */

/**
 * Holds a wrong answer's feedback (the right answer, the explanation) on screen for a moment
 * before the next question. Keyed by question id, so other players' updates never restart it.
 */
function useMissFlow(last: FeedbackView | null | undefined, question: QuestionView | null | undefined) {
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
    // A right answer opens an offer instead, which says so itself.
    if (lastRef.current && !lastRef.current.correct) setFeedback(lastRef.current);
  }, [lastIid]);
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 2600);
    return () => clearTimeout(t);
  }, [feedback]);
  return { feedback, answered: feedback ? (asked.current.get(feedback.iid) ?? null) : null, dismiss: () => setFeedback(null) };
}

/** Shows a freshly opened lantern's result for a moment. `hold` keeps it up (while the opening plays). */
function useOpenedFlow(opened: Opened | null | undefined, hold: boolean) {
  const key = opened ? `${opened.seq}|${String(opened.waiting)}|${opened.title}` : null;
  const seen = useRef<string | null>(key);
  const latest = useRef(opened);
  const [shown, setShown] = useState<Opened | null>(null);
  useEffect(() => {
    latest.current = opened;
  });
  useEffect(() => {
    if (!key || key === seen.current) return;
    seen.current = key;
    setShown(latest.current ?? null);
  }, [key]);
  useEffect(() => {
    if (!shown || shown.waiting || hold) return;
    const t = setTimeout(() => setShown(null), shown.big ? 2800 : 2000);
    return () => clearTimeout(t);
  }, [shown, hold]);
  return { shown, dismiss: () => setShown(null) };
}

/** A stall chip: smoked for calm facts, solid colour with ink text for what you hold. No outline. */
function Chip({ icon: Icon, children, tone = 'calm', said }: { icon?: LucideIcon; children: ReactNode; tone?: 'calm' | 'glim' | 'lantern' | 'dusk'; said?: string }) {
  const t = { calm: 'bg-white/[0.09] text-text', glim: 'bg-glim text-on-accent', lantern: 'bg-lantern text-on-accent', dusk: 'bg-dusk text-on-accent' }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap sm:text-sm ${t}`}>
      {Icon ? <Icon className="size-[1.1em] shrink-0" aria-hidden /> : null}
      {said ? (
        <>
          <span className="sr-only">{said}</span>
          <span className="inline-flex items-center gap-1" aria-hidden>
            {children}
          </span>
        </>
      ) : (
        children
      )}
    </span>
  );
}

/** The event of the moment as a strip across the stall: what it does, and how long it lasts. */
function EventStrip({ view, gameNow }: { view: NightMarketView; gameNow: () => number }) {
  useNow(1000, view.next !== null && !view.event);
  const e = view.event;
  if (!e) {
    const soon = view.next && view.next.at - gameNow() <= 15_000;
    if (!soon) return null;
    return (
      <p className="flex items-center gap-1.5 text-xs font-bold text-text-2 sm:text-sm">
        {view.next!.lastCall ? <BellRing className="size-4 shrink-0" aria-hidden /> : <Timer className="size-4 shrink-0" aria-hidden />}
        {view.next!.lastCall ? 'Last Call in ' : 'A market event in '}
        <Countdown until={view.next!.at} gameNow={gameNow} label={view.next!.lastCall ? 'Last Call in' : 'Next market event in'} />
      </p>
    );
  }
  const look = EVENT_LOOK[e.id];
  const Icon = look.icon;
  return (
    <div key={e.id} className={`flex items-center gap-2 rounded-[var(--radius-m)] px-2.5 py-1.5 text-sm font-bold text-on-accent ${look.bg}`} style={{ animation: 'pop-in 200ms var(--ease-out)' }}>
      <Icon className="size-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="font-display text-[1.1rem] font-extrabold">{EVENT_INFO[e.id].label}</span>
        <span className="max-[359px]:hidden">: {look.short}</span>
      </span>
      <span className="shrink-0 text-base tabular">
        <Countdown until={e.endsAt} gameNow={gameNow} label={`${EVENT_INFO[e.id].label} ends in`} />
      </span>
    </div>
  );
}

function StallHeader({ view, you, gameNow, onOdds }: { view: NightMarketView; you: You; gameNow: () => number; onOdds: () => void }) {
  const rank = you.rank && view.players > 1 ? you.rank : null;
  return (
    <StagePanel as="section" className="flex flex-col gap-1.5 px-2.5 py-2 sm:gap-2.5 sm:p-4" label="Your stall">
      <EventStrip view={view} gameNow={gameNow} />
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-lantern text-on-accent sm:size-11" aria-hidden>
            <Coins className="size-5 sm:size-6" />
          </span>
          <div className="min-w-0 leading-none">
            <CoinCount value={you.coins} className="font-display text-[2rem] font-extrabold sm:text-[2.5rem]" />
            <span className="ml-1 text-sm font-bold text-text-2" aria-hidden>
              coins
            </span>
          </div>
          {rank ? (
            <span className="shrink-0 font-display text-xl font-extrabold text-text-2 tabular sm:text-2xl">
              <span className="sr-only">You are </span>
              {ordinal(rank)}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Pill className="px-2.5! py-0.5! text-sm sm:text-base">
            <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </Pill>
          <button type="button" onClick={onOdds} className="grid size-11 place-items-center rounded-full bg-white/[0.09] text-text hover:bg-white/[0.16]" aria-label="What’s inside? The odds right now" title="What’s inside?">
            <CircleHelp className="size-6" aria-hidden />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip icon={Store} said={`Stall level ${you.level}. ${plural(you.toNext, 'more right answer')} to level ${you.level + 1}.`}>
          Level {you.level}
          <span className="font-semibold text-text-2">· {you.toNext} to go</span>
        </Chip>
        {you.shield ? (
          <Chip icon={Shield} tone="glim">
            Shield
          </Chip>
        ) : null}
        {you.sight ? (
          <Chip icon={Eye} tone="glim">
            Sight
          </Chip>
        ) : null}
        {you.lucky > 0 ? (
          <Chip icon={Clover} tone="lantern" said={`Lucky Streak: your next ${plural(you.lucky, 'Fortune lantern')} pay double.`}>
            Lucky ×{you.lucky}
          </Chip>
        ) : null}
        {view.goal ? (
          <Chip icon={Flag} said={`First to ${formatNumber(view.goal)} coins wins.`}>
            Goal {formatNumber(view.goal)}
          </Chip>
        ) : null}
      </div>
    </StagePanel>
  );
}

/**
 * What the moment does to a kind, as a badge on its lanterns: Golden Hour, Last Call and a
 * Lucky Streak double Fortune coins (×4 together); Wild Winds makes a Wild win bigger.
 */
function boostOf(kind: LanternKind | null, odds: OddsMoment): { badge: string; words: string } | null {
  if (kind === 'fortune') {
    const mult = fortuneMultiplier(odds.event, odds.lucky);
    return mult > 1 ? { badge: `×${mult}`, words: `Coins pay ${mult === 2 ? 'double' : `${mult} times over`} right now.` } : null;
  }
  if (kind === 'wild' && odds.event === 'winds') return { badge: `×${wildGrowth(odds.settings.wildness, 'winds')}`, words: 'Wild Winds: a win grows bigger right now.' };
  return null;
}

/**
 * One of the three lanterns on offer, as a collectible case: the lantern lit in its kind's colour,
 * what is inside on a price tag when Lantern Sight shows it, and the kind's name plate along the
 * bottom. Its kind is a word, an icon and a paper pattern, never colour alone. A piece, so it keeps
 * its colour while the offer is busy; the picked one is held down while it opens.
 */
function LanternButton({ lantern, index, count, onPick, disabled, state, odds }: { lantern: OfferLantern; index: number; count: number; onPick: () => void; disabled: boolean; state: 'idle' | 'opening' | 'dimmed'; odds: OddsMoment }) {
  const kind = lantern.kind;
  const Icon = kind ? KIND_ICON[kind] : CircleHelp;
  const word = kind ? KIND_INFO[kind].label : 'Mystery';
  const inside = lantern.content ? contentLabel(lantern.content, odds) : null;
  const boost = boostOf(kind, odds);
  const descId = useId();
  // The button is named by what it shows, in reading order (so the name always contains the visible words);
  // the order classes put the lantern on top, what is inside under it and the name plate at the bottom.
  return (
    <div className="flex min-w-0">
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        aria-describedby={descId}
        data-pressed={state === 'opening' || undefined}
        className={`piece relative flex min-h-[10rem] min-w-0 flex-1 flex-col items-center justify-end overflow-hidden rounded-[var(--radius-l)] text-on-accent [--band:2.25rem] [--press:5px] disabled:cursor-default sm:min-h-[12.5rem] sm:[--band:2.5rem] ${state === 'dimmed' ? 'nm-dim' : ''}`}
        style={{ background: caseBackground(kind) }}
      >
        <span className="sr-only">
          Lantern {index + 1} of {count}:{' '}
        </span>
        <span className="order-3 flex h-[var(--band)] w-full items-center justify-center gap-1 px-1 pb-[5px] text-sm leading-tight font-extrabold sm:text-base">
          <Icon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{word}</span>
        </span>
        <span className="sr-only">{kind ? `, ${KIND_INFO[kind].colour}.` : ', hidden by fog.'} </span>
        {inside ? (
          <span className="order-2 paper mx-1 mb-1.5 max-w-[calc(100%-0.5rem)] rounded-[var(--radius-s)] px-1.5 py-0.5 text-center text-[0.72rem] leading-tight font-bold sm:text-sm">
            <span className="sr-only">Inside: </span>
            {inside}
          </span>
        ) : null}
        {boost ? (
          <span className="plate plate-gold absolute top-1.5 right-1.5 z-10 px-[0.5em] text-base tabular">
            <span>
              <span className="sr-only">, pays </span>
              {boost.badge}
            </span>
          </span>
        ) : null}
        <span className={`relative order-1 mb-1.5 block ${state === 'opening' ? 'nm-open' : ''}`}>
          <Lantern art={artFor(kind)} size={84} lit capClassName={state === 'opening' ? 'nm-cap' : undefined} glowClassName={state === 'opening' ? 'nm-glow' : undefined} className="max-[379px]:w-[68px] sm:w-[104px]" />
          {!kind && !inside ? (
            // Over the lantern's glass.
            <span className="pointer-events-none absolute inset-x-0 top-[30%] grid h-[47%] place-items-center font-display text-3xl font-extrabold text-on-accent" aria-hidden>
              ?
            </span>
          ) : null}
        </span>
      </button>
      <span id={descId} className="sr-only">
        {kind ? KIND_INFO[kind].blurb : 'Fog hides what kind it is.'}
        {boost ? ` ${boost.words}` : ''}
      </span>
    </div>
  );
}

function OfferPicker({ offer, last, odds, onPick, busy, paused, opening, onOdds }: { offer: Offer; last: FeedbackView | null; odds: OddsMoment; onPick: (i: number) => void; busy: boolean; paused: boolean; opening: number | null; onOdds: () => void }) {
  const title = offer.bonus ? 'Pick your second lantern' : 'Pick a lantern';
  useAnnounce(offer.sight ? `${title}. Lantern Sight shows what is inside.` : `${title}.`, offer.seq);
  // The heading under the banner already says "Pick a lantern"; the banner keeps any news beyond it (a level, Lantern Rain).
  const news = last?.text && !/^Pick a lantern\.?$/.test(last.text) ? last.text : undefined;
  return (
    <section aria-labelledby="nm-offer" className="flex flex-col gap-2.5">
      {last && last.correct && !offer.bonus ? <ResultBanner key={last.iid} correct partial={last.partial} text={news} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="nm-offer" className="font-display text-[1.75rem] leading-tight font-extrabold">
          {title}
        </h3>
        {offer.bonus ? <Chip icon={CloudRain}>Lantern Rain</Chip> : null}
        {offer.sight ? (
          <Chip icon={Eye} tone="glim">
            Lantern Sight
          </Chip>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3" role="group" aria-label="Lanterns">
        {offer.lanterns.map((l, i) => (
          <LanternButton key={i} lantern={l} index={i} count={offer.lanterns.length} odds={odds} onPick={() => onPick(i)} disabled={busy || paused || opening !== null} state={opening === null ? 'idle' : opening === i ? 'opening' : 'dimmed'} />
        ))}
      </div>
      <button type="button" onClick={onOdds} className="inline-flex min-h-11 items-center gap-1.5 self-center rounded-[var(--radius-m)] px-3 font-bold text-text-2 hover:bg-white/10 hover:text-text">
        <CircleHelp className="size-5" aria-hidden /> What’s inside?
      </button>
    </section>
  );
}

function openedSound(o: Opened): SfxName {
  if (o.blocked) return 'bust';
  switch (o.kind) {
    case 'fortune':
      return o.big ? 'jackpot' : 'coin';
    case 'wild':
      return o.delta > 0 ? 'win' : 'bust';
    case 'trick':
      if (o.waiting) return 'powerUp';
      if (o.content === 'toll') return 'capture';
      return o.content === 'swap' ? 'swap' : 'steal';
    case 'charm':
      return o.content === 'shield' && o.delta === 0 ? 'shield' : o.delta > 0 ? 'coin' : 'powerUp';
  }
}

/** What came out of the lantern just opened: a banner in the kind's colour, the outcome as the hero line. */
function OpenedCard({ opened, onNext }: { opened: Opened; onNext: (() => void) | null }) {
  const Icon = KIND_ICON[opened.kind];
  useAnnounce(`${KIND_INFO[opened.kind].label} lantern: ${opened.title}.${opened.detail ? ` ${opened.detail}` : ''}`, `${opened.seq}|${String(opened.waiting)}|${opened.title}`);
  // The player's own outcome, on their own device.
  const role = useSoundRole();
  useSfx(openedSound(opened), `${opened.seq}|${String(opened.waiting)}|${opened.title}`, role !== 'host');
  return (
    <div className="flex flex-col gap-2">
      <div className="lift relative isolate flex items-center gap-3 rounded-[var(--radius-l)] px-4 py-3 text-on-accent" style={{ background: fillOf(opened.kind), animation: 'pop-in 200ms var(--ease-out)' }}>
        {opened.big ? <Burst style="festival" hue={KIND_INFO[opened.kind].hue} size={320} /> : null}
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-ink/85" aria-hidden>
          <Lantern art={artFor(opened.kind)} size={36} lit />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Icon className="size-4 shrink-0" aria-hidden /> {KIND_INFO[opened.kind].label} lantern
          </p>
          <p className="font-display text-[2rem] leading-[1.05] font-extrabold break-words italic">{opened.title}</p>
          {opened.detail && !opened.waiting ? <p className="mt-0.5 text-sm leading-snug font-bold">{opened.detail}</p> : null}
        </div>
      </div>
      {onNext ? (
        <button type="button" onClick={onNext} className="min-h-11 self-center rounded-[var(--radius-m)] px-4 py-2 font-bold text-text-2 hover:bg-white/10">
          Next question
        </button>
      ) : null}
    </div>
  );
}

/** Who to trick: big buttons, richest first, with shields and the reason a player cannot be chosen. */
function TargetPicker({ choose, you, players, onPick, busy, paused, gameNow }: { choose: Choose; you: You; players: RoomPlayerView[]; onPick: (id: string) => void; busy: boolean; paused: boolean; gameNow: () => number }) {
  const anyGuard = choose.targets.some((t) => t.blocked === 'guard');
  useNow(500, anyGuard);
  const now = gameNow();
  const swap = choose.trick === 'swap';
  const heading = swap ? 'Choose who to swap coins with' : `Choose who to swipe ${choose.percent}% from`;
  return (
    <section aria-labelledby="nm-targets" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="nm-targets" className="font-display text-2xl leading-tight font-extrabold sm:text-[1.75rem]">
          {heading}
        </h3>
        <Pill className="px-2.5! py-0.5! text-sm">
          Auto in <Countdown until={choose.deadline} gameNow={gameNow} label="Chosen for you in" />
        </Pill>
      </div>
      {choose.relaxed ? <p className="text-sm font-semibold text-text-2">Nobody else can be tricked right now, so the usual limits are off.</p> : null}
      <ul className="flex flex-col gap-2">
        {choose.targets.map((t) => {
          const guarded = t.blocked === 'guard' && t.guardUntil !== null && t.guardUntil > now;
          const blocked = t.blocked === 'last' || guarded;
          const gain = swap ? t.coins - you.coins : Math.max(Math.min(5, t.coins), Math.round((t.coins * (choose.percent ?? 0)) / 100));
          const hint = blocked
            ? t.blocked === 'last'
              ? 'You tricked them last time'
              : null
            : t.shield
              ? `Their shield will block your ${choose.trick}`
              : swap
                ? gain >= 0
                  ? `You would gain ${plural(gain, 'coin')}`
                  : `You would lose ${plural(-gain, 'coin')}`
                : t.coins > 0
                  ? `About ${plural(gain, 'coin')}`
                  : 'Nothing to take yet';
          return (
            <li key={t.playerId}>
              {/* A quiet pressable row; a player who cannot be chosen is out of play (flat), with the reason written under the name. */}
              <button
                type="button"
                disabled={busy || paused || blocked}
                onClick={() => onPick(t.playerId)}
                className={`flex min-h-14 w-full items-center gap-2.5 rounded-[var(--radius-m)] px-2.5 py-1.5 text-left text-text transition-colors disabled:cursor-not-allowed sm:gap-3 sm:px-3 ${blocked ? 'piece-off opacity-70' : 'press-soft bg-white/[0.07] hover:bg-white/[0.13] disabled:opacity-60'}`}
              >
                <PlayerGlim avatar={avatarOf(players, t.playerId)} seed={t.playerId} size={40} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{t.name}</span>
                  <span className={`block text-sm font-semibold ${!blocked && swap && gain < 0 ? 'text-ember' : 'text-text-2'}`}>
                    {guarded ? (
                      <>
                        Just tricked: safe for <Countdown until={t.guardUntil} gameNow={gameNow} label="Safe for" />
                      </>
                    ) : (
                      hint
                    )}
                  </span>
                </span>
                {t.shield ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-glim px-2 py-0.5 text-xs font-bold text-on-accent">
                    <Shield className="size-3.5" aria-hidden /> Shield
                  </span>
                ) : null}
                <span className="shrink-0 text-right font-display text-xl font-extrabold tabular">
                  {formatNumber(t.coins)}
                  <span className="sr-only"> coins</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {choose.total > choose.targets.length ? <p className="text-sm font-semibold text-text-2">Showing the {choose.targets.length} richest of {choose.total} players.</p> : null}
    </section>
  );
}

/** The last few things that happened to this player's stall. */
function MyNews({ notes }: { notes: Note[] }) {
  const newest = notes[0];
  // Things other players did to you are read out once; your own picks were already announced.
  useAnnounce(newest && !newest.mine ? newest.text : null, newest?.id);
  const role = useSoundRole();
  const sound: SfxName | null = newest && !newest.mine ? (newest.icon === 'shield' ? 'shield' : newest.icon === 'swipe' || (newest.icon === 'swap' && newest.tone === 'bad') ? 'stolen' : newest.icon === 'swap' ? 'swap' : null) : null;
  useSfx(sound ?? 'coin', newest?.id, Boolean(sound) && role !== 'host');
  if (!notes.length) return null;
  return (
    <StagePanel as="section" className="px-3 py-2.5" label="Your market news">
      <h3 className="mb-1 text-sm font-bold text-text-2">Your market news</h3>
      <ul className="flex flex-col gap-1">
        {notes.slice(0, 3).map((n) => {
          const Icon = NOTE_ICON[n.icon];
          return (
            <li key={n.id} className="flex items-start gap-2 text-sm leading-snug font-semibold" style={{ animation: 'rise-fade 200ms var(--ease-out) both' }}>
              <Icon className={`mt-0.5 size-4 shrink-0 ${n.tone === 'bad' ? 'text-ember' : n.tone === 'good' ? 'text-glim' : 'text-text-2'}`} aria-hidden />
              <span>{n.text}</span>
            </li>
          );
        })}
      </ul>
    </StagePanel>
  );
}

/** "What's inside?": the odds of every kind and every content right now, with the event and your stall applied. */
function OddsDialog({ open, onOpenChange, odds, fog, tricksOn }: { open: boolean; onOpenChange: (v: boolean) => void; odds: OddsMoment; fog: boolean; tricksOn: boolean }) {
  const kinds = kindPercents(odds);
  const event = odds.event ? EVENT_INFO[odds.event] : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="What’s inside?" description="The odds right now. Each of your 3 lanterns is drawn on its own." size="md">
      <div className="flex flex-col gap-5 text-sm">
        {event ? (
          <p className="rounded-[var(--radius-m)] border border-line bg-surface-2 px-3 py-2 font-bold">
            {event.label}: {event.blurb}
          </p>
        ) : null}
        {fog ? <p className="font-semibold text-text-2">Lantern fog hides each lantern’s kind, but these odds still hold.</p> : null}
        <section aria-labelledby="nm-odds-kinds">
          <h4 id="nm-odds-kinds" className="mb-1 font-display text-lg font-bold">
            Lantern kinds
          </h4>
          <table className="w-full">
            <tbody>
              {kinds.map((k) => {
                const Icon = KIND_ICON[k.kind];
                return (
                  <tr key={k.kind} className="border-t border-line">
                    <th scope="row" className="py-1.5 text-left font-semibold">
                      <span className="inline-flex items-center gap-1.5">
                        <Icon className="size-4 shrink-0" aria-hidden />
                        {KIND_INFO[k.kind].label} ({KIND_INFO[k.kind].colour})
                      </span>
                    </th>
                    <td className="py-1.5 text-right font-bold tabular">{percentText(k.percent)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!odds.tricksLive ? (
            <p className="mt-1 text-text-2">{tricksOn ? 'Nobody you could trick is here, so there are no Trick lanterns and no shields.' : 'Tricks are off in this game, so there are no Trick lanterns and no shields.'}</p>
          ) : null}
        </section>
        {kinds.map((k) => {
          const rows = contentWeights(k.kind, odds);
          const total = rows.reduce((n, r) => n + r.weight, 0);
          return (
            <section key={k.kind} aria-labelledby={`nm-odds-${k.kind}`}>
              <h4 id={`nm-odds-${k.kind}`} className="mb-1 font-display text-lg font-bold">
                Inside a {KIND_INFO[k.kind].label} lantern
              </h4>
              <table className="w-full">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-line align-top">
                      <th scope="row" className="py-1.5 pr-2 text-left font-semibold">
                        {contentLabel(r.id, odds)}
                        <span className="block text-xs font-normal text-text-2">{contentHelp(r.id, odds)}</span>
                      </th>
                      <td className="py-1.5 text-right font-bold tabular">{percentText((r.weight / total) * 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
        <p className="text-text-2">
          Every {LEVEL_EVERY} right answers your stall levels up and flat coin amounts grow by a quarter. Golden Hour, Last Call and a Lucky Streak double flat coin amounts; shares of your coins are never doubled.
        </p>
      </div>
    </Dialog>
  );
}

export function NightMarketPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<NightMarketView>) {
  const you = view.you ?? null;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [oddsOpen, setOddsOpen] = useState(false);
  const [opening, setOpening] = useState<{ index: number; offer: Offer } | null>(null);
  const miss = useMissFlow(you?.last, you?.question);
  const result = useOpenedFlow(you?.opened, opening !== null);
  const shared = useSharedSounds();
  const eventKey = view.event ? `${view.event.id}|${view.event.endsAt}` : null;
  useAnnounce(view.event ? `${EVENT_INFO[view.event.id].label}. ${EVENT_INFO[view.event.id].blurb}` : null, eventKey);
  // Room events sound on shared screens only (a solo game's screen is one).
  useSfx('event', eventKey, shared && view.event !== null);
  useEffect(() => {
    if (!opening) return;
    const t = setTimeout(() => setOpening(null), 650);
    return () => clearTimeout(t);
  }, [opening]);
  if (!you) return <p className="font-semibold text-text-2">Watching the market.</p>;

  const odds = moment(view, room, you);
  const send = async (a: unknown) => {
    setBusy(true);
    const ack = await act(a);
    setBusy(false);
    setNote(ack.ok ? null : ack.error.message);
    return ack.ok;
  };
  const pickLantern = async (index: number) => {
    const offer = you.offer;
    if (!offer) return;
    playSfx('tap');
    if (motionOK()) setOpening({ index, offer });
    if (!(await send({ type: 'pick', offer: offer.seq, index }))) setOpening(null);
  };
  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };

  let main: ReactNode;
  if (opening) {
    main = <OfferPicker offer={opening.offer} last={you.last} odds={odds} onPick={() => {}} busy paused={paused} opening={opening.index} onOdds={() => setOddsOpen(true)} />;
  } else if (you.choose) {
    main = (
      <div className="flex flex-col gap-3">
        {result.shown ? <OpenedCard opened={result.shown} onNext={null} /> : null}
        <TargetPicker choose={you.choose} you={you} players={room.players} onPick={(id) => void send({ type: 'target', playerId: id })} busy={busy} paused={paused} gameNow={gameNow} />
      </div>
    );
  } else if (result.shown && !result.shown.waiting) {
    main = (
      <div className="flex flex-col gap-3">
        <OpenedCard opened={result.shown} onNext={you.offer ? null : result.dismiss} />
        {you.offer ? <OfferPicker offer={you.offer} last={null} odds={odds} onPick={(i) => void pickLantern(i)} busy={busy} paused={paused} opening={null} onOdds={() => setOddsOpen(true)} /> : null}
      </div>
    );
  } else if (you.offer) {
    main = <OfferPicker offer={you.offer} last={you.last} odds={odds} onPick={(i) => void pickLantern(i)} busy={busy} paused={paused} opening={null} onOdds={() => setOddsOpen(true)} />;
  } else if (miss.feedback) {
    main = (
      <div className="flex flex-col gap-3">
        <ResultBanner key={miss.feedback.iid} correct={false} partial={miss.feedback.partial} text={miss.feedback.text} answer={miss.answered ? shortAnswer(miss.answered.q, miss.feedback.reveal) : null} />
        {miss.answered ? <RevealAnswer q={miss.answered.q} reveal={miss.feedback.reveal} compact /> : null}
        <Explanation text={miss.feedback.explanation} />
        <button type="button" onClick={miss.dismiss} className="min-h-11 self-center rounded-[var(--radius-m)] px-4 py-2 font-bold text-text-2 hover:bg-white/10">
          Next question
        </button>
      </div>
    );
  } else if (you.question) {
    main = (
      <div className="flex flex-col gap-4">
        <QuestionCard q={you.question.q} />
        <AnswerInput key={you.question.iid} q={you.question.q} onSubmit={submit} disabled={paused} compact />
      </div>
    );
  } else main = null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-4">
      <MotionStyle />
      <StallHeader view={view} you={you} gameNow={gameNow} onOdds={() => setOddsOpen(true)} />
      {note ? (
        <p className="text-sm font-bold text-ember" role="alert">
          {note}
        </p>
      ) : null}
      {main}
      <MyNews notes={you.notes} />
      <OddsDialog open={oddsOpen} onOpenChange={setOddsOpen} odds={odds} fog={view.fog} tricksOn={view.tricks} />
    </div>
  );
}

/* ---------------------------------- host ---------------------------------- */

/** The event of the moment, the one coming, and the kind odds right now: the market's weather. */
function EventBanner({ view, room, gameNow }: { view: NightMarketView; room: RoomView; gameNow: () => number }) {
  const odds = moment(view, room, { tricksLive: view.tricksLive ?? false, level: 1, lucky: 0 });
  const kinds = kindPercents(odds);
  const small = 'text-[clamp(1rem,min(1.45vw,2.5vh),1.6rem)]';
  const e = view.event;
  // The odds stay on show: what each lantern is likely to be, with the event applied.
  const oddsLine = (
    <p className={`flex flex-wrap items-baseline gap-x-5 gap-y-1 font-bold ${small}`}>
      {kinds.map((k) => {
        const Icon = KIND_ICON[k.kind];
        return (
          <span key={k.kind} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <Icon className="size-[1.1em] self-center" aria-hidden />
            {KIND_INFO[k.kind].label} <span className="font-display text-[1.2em] font-extrabold tabular">{percentText(k.percent)}</span>
          </span>
        );
      })}
    </p>
  );
  if (e) {
    const look = EVENT_LOOK[e.id];
    const Icon = look.icon;
    return (
      <section
        key={`${e.id}${e.endsAt}`}
        aria-label="Market event"
        className={`lift flex flex-wrap items-center gap-x-[clamp(1rem,2vw,2rem)] gap-y-2 rounded-[var(--radius-l)] px-[clamp(1rem,2vw,2rem)] py-[clamp(0.5rem,1.4vh,1rem)] text-on-accent ${look.bg}`}
        style={{ animation: 'pop-in 200ms var(--ease-out)' }}
      >
        <span className="grid size-[clamp(3.25rem,7.5vh,5.25rem)] shrink-0 place-items-center rounded-full bg-ink/85 text-white">
          <Icon className="size-[56%]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[clamp(2.1rem,min(3.8vw,6.6vh),4.75rem)] leading-none font-extrabold italic">{EVENT_INFO[e.id].label}</p>
          <p className="text-[clamp(1.05rem,min(1.7vw,3vh),1.9rem)] font-bold">{EVENT_INFO[e.id].blurb}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-[clamp(2rem,min(3.6vw,6.4vh),4.5rem)] leading-none font-extrabold">
            <Countdown until={e.endsAt} gameNow={gameNow} label={`${EVENT_INFO[e.id].label} ends in`} />
          </p>
          <p className={`font-bold ${small}`}>{e.id === 'lastCall' ? 'until the market closes' : 'left'}</p>
        </div>
        <div className="basis-full border-t border-black/15 pt-1.5">{oddsLine}</div>
      </section>
    );
  }
  return (
    <section aria-label="Market event" className={`flex flex-wrap items-center gap-x-[clamp(1rem,2vw,2rem)] gap-y-2 rounded-[var(--radius-l)] border border-white/10 px-[clamp(1rem,2vw,2rem)] py-[clamp(0.5rem,1.4vh,1rem)] ${NIGHT}`}>
      <span className="grid size-[clamp(3rem,7vh,4.75rem)] shrink-0 place-items-center rounded-full bg-white/[0.09] text-lantern">
        {view.next?.lastCall ? <Bell className="size-[55%]" aria-hidden /> : <Timer className="size-[55%]" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[clamp(1.6rem,min(2.8vw,5vh),3.4rem)] leading-tight font-extrabold">
          {view.next ? (
            <>
              {view.next.lastCall ? 'Last Call in ' : 'Next market event in '}
              <Countdown until={view.next.at} gameNow={gameNow} label={view.next.lastCall ? 'Last Call in' : 'Next market event in'} />
            </>
          ) : (
            'No market events tonight'
          )}
        </p>
        <p className={`font-semibold text-text-2 ${small}`}>{view.next ? (view.next.lastCall ? 'Fortune lanterns pay double at the end of the night.' : 'Nobody knows what it will be until it starts.') : 'The odds hold steady to the end.'}</p>
      </div>
      <div className="basis-full border-t border-white/10 pt-1.5 text-text">{oddsLine}</div>
    </section>
  );
}

/** Rank changes since the board last moved, shown as arrows for a few seconds. */
function useRankMoves(rows: BoardRow[]) {
  const last = useRef<Map<string, number> | null>(null);
  const [moves, setMoves] = useState<Record<string, { by: number; at: number }>>({});
  const sig = rows.map((r) => `${r.playerId}:${r.rank}`).join('|');
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useEffect(() => {
    const prev = last.current;
    const current = rowsRef.current;
    last.current = new Map(current.map((r) => [r.playerId, r.rank]));
    if (!prev) return;
    const at = Date.now();
    const changed: Record<string, { by: number; at: number }> = {};
    for (const r of current) {
      const p = prev.get(r.playerId);
      if (p !== undefined && p !== r.rank) changed[r.playerId] = { by: p - r.rank, at };
    }
    if (Object.keys(changed).length) setMoves((m) => ({ ...m, ...changed }));
  }, [sig]);
  const now = useNow(1000, Object.keys(moves).length > 0);
  return (id: string) => {
    const m = moves[id];
    return m && now - m.at < 5000 ? m.by : 0;
  };
}

const ROW_GLIM = 'size-[clamp(2rem,4.2vh,3.5rem)]';

function BoardCoins({ value }: { value: number }) {
  return <CoinCount value={value} className="min-w-[3ch] shrink-0 text-right font-display text-[1.3em] font-extrabold" />;
}

/**
 * The ten richest stalls; past five they sit in two columns, so they fit on a 768-pixel projector.
 * A stall that just climbed shows its arrow and a quiet mint tint (in a big class many climb at once).
 */
function MarketBoard({ rows, players, teams }: { rows: BoardRow[]; players: RoomPlayerView[]; teams: RoomView['room']['teams'] }) {
  const moved = useRankMoves(rows);
  const two = rows.length > 5;
  return (
    <ol
      className={`grid gap-x-[clamp(0.75rem,1.4vw,1.25rem)] gap-y-1.5 text-[clamp(1.05rem,min(1.6vw,2.8vh),1.75rem)] leading-tight ${two ? 'grid-flow-col grid-cols-2' : 'grid-cols-1'}`}
      aria-label="Richest stalls"
      style={{ '--lb-rank': 'clamp(2rem, 4.2vh, 3.5rem)', gridTemplateRows: two ? `repeat(${Math.ceil(rows.length / 2)}, auto)` : undefined } as CSSProperties}
    >
      {rows.map((r) => {
        const by = moved(r.playerId);
        const team = teams.find((t) => t.id === r.teamId);
        return (
          <li key={r.playerId} className={`flex min-w-0 items-center gap-[clamp(0.5rem,1vw,0.75rem)] rounded-[var(--radius-m)] px-3 py-1 ${by > 0 ? 'bg-glim/[0.14]' : NIGHT}`}>
            <RankBadge rank={r.rank} big />
            <PlayerGlim avatar={avatarOf(players, r.playerId)} seed={r.playerId} size={56} className={`${ROW_GLIM} shrink-0`} pose={r.rank === 1 ? 'cheer' : 'idle'} />
            <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
            {team ? (
              <span className="shrink-0" title={team.name}>
                <span className="block size-[0.8em] rounded-full" style={{ background: `hsl(${team.hue} 80% 60%)` }} aria-hidden />
                <span className="sr-only">{team.name}</span>
              </span>
            ) : null}
            {by !== 0 ? (
              <span className={`inline-flex shrink-0 items-center font-display font-extrabold tabular ${by > 0 ? 'text-glim' : 'text-ember'}`} style={{ animation: 'pop-in 200ms var(--ease-out)' }}>
                {by > 0 ? <ArrowUp className="size-[1em]" aria-hidden /> : <ArrowDown className="size-[1em]" aria-hidden />}
                {Math.abs(by)}
                <span className="sr-only">{by > 0 ? ' places up' : ' places down'}</span>
              </span>
            ) : null}
            {r.shield ? (
              <span className="shrink-0 text-glim" title="Holds a shield">
                <Shield className="size-[1.1em]" aria-hidden />
                <span className="sr-only">holds a shield</span>
              </span>
            ) : null}
            <BoardCoins value={r.coins} />
          </li>
        );
      })}
    </ol>
  );
}

/** A big moment takes the middle of the big screen for a few seconds: a jackpot, a double, a big swap, a winner. The coins it moved land on a plate. */
function Spectacle({ news, gameNow }: { news: News[]; gameNow: () => number }) {
  const top = news.find(isSpectacle);
  const fresh = top && gameNow() - top.at < SPECTACLE_MS ? top : null;
  useNow(500, Boolean(fresh));
  const live = fresh && gameNow() - fresh.at < SPECTACLE_MS ? fresh : null;
  useAnnounce(live ? `${SPECTACLE[live.kind]!.headline}. ${newsLine(live).text}${newsLine(live).amount ? `, ${newsLine(live).amount} coins` : ''}.` : null, live?.id);
  if (!live) return null;
  const look = SPECTACLE[live.kind]!;
  const line = newsLine(live);
  const Icon = NEWS_LOOK[live.kind].icon;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center" key={live.id}>
      <div className="paper stage-card relative isolate flex items-center gap-[clamp(0.75rem,1.6vw,1.5rem)] px-[clamp(1.25rem,3vw,3rem)] py-[clamp(0.6rem,1.8vh,1.4rem)]" style={{ animation: 'pop-in 220ms var(--ease-out)' }}>
        <Burst style="festival" hue={44} size={520} />
        <span className={`grid size-[clamp(3.5rem,9vh,6rem)] shrink-0 place-items-center rounded-full text-on-accent ${NEWS_LOOK[live.kind].tint}`}>
          <Icon className="size-[58%]" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[clamp(2.4rem,min(5vw,8vh),5.5rem)] leading-none font-extrabold italic">{look.headline}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[clamp(1.2rem,min(2vw,3.4vh),2.2rem)] font-bold">
            {line.text}
            {line.amount && live.kind !== 'goal' ? (
              <span className={`plate text-on-accent tabular ${live.amount < 0 ? 'bg-ember' : 'bg-glim'}`}>
                <span>{line.amount}</span>
              </span>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}

function NewsList({ news, limit }: { news: News[]; limit: number }) {
  const text = 'text-[clamp(1rem,min(1.45vw,2.7vh),1.7rem)]';
  const items = news.slice(0, limit);
  if (!items.length) return <p className={`font-semibold text-text-2 ${text}`}>No big plays yet. Jackpots, swipes and swaps show here.</p>;
  return (
    <ul className={`flex flex-col gap-1.5 leading-tight ${text}`} aria-live="off">
      {items.map((n) => {
        const look = NEWS_LOOK[n.kind];
        const Icon = look.icon;
        const line = newsLine(n);
        return (
          <li key={n.id} className={`flex min-h-[clamp(2.5rem,5.2vh,4.25rem)] items-center gap-3 rounded-[var(--radius-m)] px-3 py-1 ${NIGHT}`} style={{ animation: 'rise-fade 200ms var(--ease-out) both' }}>
            <span className={`grid size-[1.7em] shrink-0 place-items-center rounded-full text-on-accent ${look.tint}`}>
              <Icon className="size-[60%]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate font-bold">{line.text}</span>
            {line.amount && n.kind !== 'goal' ? <span className={`shrink-0 font-display text-[1.15em] font-extrabold tabular ${n.amount < 0 ? 'text-ember' : 'text-glim'}`}>{line.amount}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** One sound for the newest big play on the big screen, never a stream. */
function useNewsSounds(news: News[]) {
  const shared = useSharedSounds();
  const newest = news[0];
  const lastAt = useRef(0);
  const seen = useRef<number | null>(newest?.id ?? null);
  useEffect(() => {
    if (!newest || newest.id === seen.current) return;
    seen.current = newest.id;
    if (!shared) return;
    const now = Date.now();
    if (now - lastAt.current < 1200) return;
    const sound = isSpectacle(newest) ? SPECTACLE[newest.kind]!.sound : newest.kind === 'swap' ? 'swap' : NEWS_SOUND[newest.kind];
    if (!sound || (newest.kind === 'swipe' && newest.amount < 100)) return;
    lastAt.current = now;
    playSfx(sound);
  }, [newest, shared]);
}

/** A count in the market's summary line: the number bold, its word plain. */
function Stat({ n, one }: { n: number; one: string }) {
  const words = plural(n, one);
  return (
    <>
      <span className="font-display text-[1.2em] font-extrabold text-text tabular">{formatNumber(n)}</span>
      {words.slice(words.indexOf(' '))}
    </>
  );
}

export function NightMarketHost({ view, gameNow, room }: ModeScreenProps<NightMarketView>) {
  const news = view.news ?? [];
  const heading = 'mb-[clamp(0.25rem,1vh,0.5rem)] font-display text-[clamp(1.6rem,min(2.5vw,4.3vh),2.75rem)] leading-tight font-bold';
  const small = 'text-[clamp(1rem,min(1.45vw,2.5vh),1.6rem)]';
  const opened = view.opened ? Object.values(view.opened).reduce((n, x) => n + x, 0) : 0;
  const eventKey = view.event ? `${view.event.id}|${view.event.endsAt}` : null;
  useAnnounce(view.event ? `${EVENT_INFO[view.event.id].label}. ${EVENT_INFO[view.event.id].blurb}` : null, eventKey);
  useSfx(view.event?.id === 'lastCall' ? 'alarm' : 'event', eventKey, useSharedSounds() && view.event !== null);
  useNewsSounds(news);
  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-[clamp(0.6rem,1.6vh,1.25rem)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col items-start gap-[clamp(0.25rem,0.8vh,0.5rem)]">
          <ModeTitle>Night Market</ModeTitle>
          <p className={`font-semibold text-text-2 ${small}`}>
            <Stat n={view.players} one="stall" /> · <Stat n={opened} one="lantern" /> opened{view.tricks ? <> · <Stat n={view.tricksPlayed ?? 0} one="trick" /></> : null} · <Stat n={view.coins ?? 0} one="coin" /> in the market
          </p>
        </div>
        <div className="flex items-center gap-2 text-[clamp(1.1rem,1.8vw,2rem)]">
          {view.goal ? (
            <Pill tone="lantern" className="px-5 py-1.5">
              <Flag className="size-[1em]" aria-hidden /> First to {formatNumber(view.goal)}
            </Pill>
          ) : null}
          <Pill className="px-5 py-1.5 text-[1.15em]">
            <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </Pill>
        </div>
      </div>
      <div className="relative">
        <EventBanner view={view} room={room} gameNow={gameNow} />
        <Spectacle news={news} gameNow={gameNow} />
      </div>
      <div className="grid grid-cols-1 gap-[clamp(1rem,2vw,2rem)] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section aria-labelledby="nm-board">
          <h3 id="nm-board" className={heading}>
            Richest stalls
          </h3>
          {view.board.length ? <MarketBoard rows={view.board} players={room.players} teams={room.room.teams} /> : <p className={`font-semibold text-text-2 ${small}`}>No stalls yet.</p>}
        </section>
        <div className="flex flex-col gap-[clamp(0.75rem,2vh,1.25rem)]">
          <section aria-labelledby="nm-news">
            <h3 id="nm-news" className={heading}>
              Market news
            </h3>
            <NewsList news={news} limit={view.teams ? 3 : 5} />
          </section>
          {view.teams ? (
            <StagePanel className="flex flex-col gap-3 p-[clamp(0.75rem,1.6vh,1.25rem)]">
              <h3 className="font-display text-[clamp(1.6rem,min(2.5vw,4.3vh),2.75rem)] font-bold">Teams (average coins)</h3>
              <TeamScores teams={view.teams.map((t) => ({ teamId: t.teamId, name: t.name, hue: t.hue, score: t.average }))} big />
            </StagePanel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
