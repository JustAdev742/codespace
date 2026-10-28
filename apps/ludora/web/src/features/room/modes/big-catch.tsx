import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Anchor, Coins, Fish, Sparkles, Star, Trophy, Waves, type LucideIcon } from 'lucide-react';
import type { Answer } from '@ludora/shared';
import {
  EVENT_INFO,
  LURES,
  PERFECT_MS,
  RARITY_INFO,
  REEL_WINDOW_MS,
  SET_BONUS,
  SET_SIZE,
  WATER_INFO,
  formatWeight,
  rarityPercents,
  speciesById,
  type EventId,
  type Rarity,
  type SpeciesId,
  type WaterId,
} from '@ludora/engine/big-catch';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner } from '../game/Reveal.tsx';
import { Leaderboard, TeamScores } from '../game/Leaderboard.tsx';
import { Explanation, ModeTitle } from '../game/parts.tsx';
import { useAnnounce } from '../game/announce.tsx';
import { Pill, StagePanel, fallbackArt } from '../game/stage.tsx';
import { Dialog } from '../../../ui/primitives.tsx';
import { Button } from '../../../ui/Button.tsx';
import { formatNumber } from '../../../lib/format.ts';
import { playSfx, useSfx, useSharedSounds } from '../../../lib/sound/react.tsx';
import { Stage3D } from '../../../three/index.ts';
import { BigCatchScene, JettyScene, LEAP_MS, MISS_MS, RESOLVE_MS, lookOf, type CatchState, type JettyAngler } from './big-catch-scene.ts';

/*
 * Big Catch screens. The jetty in 3D is the picture; everything you do is an
 * ordinary button beside it: Cast, Reel (or Space), Sell or Tank, Lures, and
 * the question, which stays open while your line is in the water. With 3D
 * off a plain picture of the water and your bobber stands in for the scene.
 */

/* ---------------------------------- types --------------------------------- */

interface FishView {
  id: number;
  species: SpeciesId;
  grams: number;
  perfect: boolean;
}

type LineView =
  | { phase: 'idle'; seq: number }
  | { phase: 'waiting'; seq: number; castAt: number; water: WaterId }
  | { phase: 'biting'; seq: number; castAt: number; water: WaterId; biteAt: number; perfectBy: number; reelBy: number }
  | { phase: 'landed'; seq: number; castAt: number; water: WaterId; fish: FishView & { cm: number; points: number }; decideBy: number; canTank: boolean };

interface Outcome {
  seq: number;
  at: number;
  kind: 'sold' | 'tanked' | 'spooked' | 'escaped';
  fish: (FishView & { at: number }) | null;
  escaped: SpeciesId | null;
  points: number;
  auto: boolean;
  trophy: boolean;
  set: Rarity | null;
  title: string;
  detail: string | null;
}

interface OddsRowView {
  species: SpeciesId;
  percent: number;
  minKg: number;
  maxKg: number;
}

interface You {
  score: number;
  rank: number | null;
  teamId: string | null;
  wallet: number;
  casts: number;
  streak: number;
  toBonus: number;
  line: LineView;
  outcome: Outcome | null;
  tank: { fish: FishView[]; points: number; bonus: number; value: number; sets: { rarity: Rarity; count: number; sets: number }[] };
  catches: { count: number; grams: number; top: FishView[] };
  lure: { level: number; name: string; next: { level: number; name: string; price: number } | null };
  odds: { water: WaterId; lure: number; event: EventId | null; rows: OddsRowView[]; biteMs: [number, number]; skew: number };
  stats: { casts: number; landed: number; perfect: number; escaped: number; spooked: number };
  question: QuestionView | null;
  feedback: (FeedbackView & { text?: string }) | null;
}

interface BoardRow {
  playerId: string;
  name: string;
  teamId: string | null;
  score: number;
  rank: number;
  isYou: boolean;
}

interface Highlight {
  playerId: string;
  name: string;
  species: SpeciesId;
  grams: number;
  at: number;
}

type HostLine = { playerId: string; name: string; teamId: string | null } & (
  | { phase: 'idle' }
  | { phase: 'waiting'; castAt: number }
  | { phase: 'biting'; castAt: number; biteAt: number }
  | { phase: 'landed'; castAt: number; species: SpeciesId; grams: number }
);

interface BigCatchView {
  endsAt: number;
  water: { id: WaterId; nextAt: number | null; next: WaterId | null };
  event: { id: EventId; endsAt: number } | null;
  nextEventAt: number | null;
  rules: { trophyHunt: boolean; frenzy: boolean; deepSea: boolean; tankSize: number };
  players: number;
  board: BoardRow[];
  teams: { teamId: string; name: string; hue: number; members: number; average: number }[] | null;
  you?: You | null;
  lines?: HostLine[];
  biggest?: Highlight[];
  records?: Highlight[];
  rareTank?: Highlight[];
  totals?: { casts: number; landed: number; grams: number; perfect: number; escaped: number; spooked: number };
}

/* --------------------------------- helpers -------------------------------- */

const pointsText = (n: number) => `${formatNumber(n)} ${n === 1 ? 'point' : 'points'}`;
const pct = (p: number) => (p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`);
const speciesName = (id: SpeciesId) => speciesById(id)?.name ?? 'A fish';
const rarityOf = (id: SpeciesId): Rarity => speciesById(id)?.rarity ?? 'common';
const isBig = (id: SpeciesId) => rarityOf(id) === 'rare' || rarityOf(id) === 'legend';
const seconds = (ms: number) => `${(ms / 1000).toFixed(ms % 1000 ? 1 : 0)}`;
/** A weight range, short enough for a phone: "0.5–5 kg", "20–40 kg". */
const range = (lo: number, hi: number) => `${String(+lo.toFixed(2))}–${String(+hi.toFixed(hi < 10 ? 1 : 0))} kg`;

/** A fish's name as it reads mid-sentence. */
function inSentence(id: SpeciesId): string {
  const name = speciesName(id);
  if (rarityOf(id) === 'legend' || /^(Australian|Murray)\b/.test(name)) return name.replace(/^The /, 'the ');
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function outcomeLine(o: Outcome, trophyHunt: boolean): string {
  const f = o.fish;
  const what = f ? `${speciesName(f.species)}, ${formatWeight(f.grams)}${f.perfect ? ', a perfect catch' : ''}.` : '';
  switch (o.kind) {
    case 'sold':
      if (trophyHunt) return `${what} Sold for ${pointsText(o.points)} to spend on lures.${o.trophy ? ' A new trophy!' : ''}`;
      return `${what} Sold for ${pointsText(o.points)}.${o.auto && o.detail ? ` ${o.detail}` : ''}`;
    case 'tanked':
      return `${what} In your tank, worth ${pointsText(o.points)}.${o.detail ? ` ${o.detail}` : ''}`;
    default:
      return `${o.title}${o.detail ? ` ${o.detail}` : ''}`;
  }
}

function landedSound(id: SpeciesId) {
  return isBig(id) ? ('jackpot' as const) : ('coin' as const);
}

function Stars({ rarity }: { rarity: Rarity }) {
  const n = RARITY_INFO[rarity].stars;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={RARITY_INFO[rarity].label}>
      {Array.from({ length: 4 }, (_, i) => (
        <Star key={i} className={`size-3.5 ${i < n ? 'fill-lantern text-lantern' : 'text-white/25'}`} aria-hidden />
      ))}
    </span>
  );
}

function Stat({ label, value, icon: Icon, tone = 'calm' }: { label: string; value: ReactNode; icon: LucideIcon; tone?: 'calm' | 'gold' }) {
  const colours = tone === 'gold' ? 'bg-lantern text-on-accent' : 'bg-black/45 text-white';
  return (
    <div className={`flex min-w-0 items-center gap-1.5 rounded-[var(--radius-m)] px-2.5 py-1.5 backdrop-blur-sm ${colours}`}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">{label}:</span>
      <span className="truncate font-display text-lg leading-none font-extrabold tabular">{value}</span>
    </div>
  );
}

/** A dark chip over the 3D picture: white text stays readable over sky, sand or water. */
const CHIP = 'inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1 font-bold whitespace-nowrap text-white tabular backdrop-blur-sm';

const WATER_BG: Record<WaterId, string> = {
  river: 'bg-[linear-gradient(180deg,#ffcf96_0,#7aa0d8_22%,#6f8f55_23%,#3e5a38_100%)]',
  estuary: 'bg-[linear-gradient(180deg,#d9f1ff_0,#7ec4ff_22%,#3fb8a6_23%,#1f6f78_100%)]',
  reef: 'bg-[linear-gradient(180deg,#c4efff_0,#4aa8ff_22%,#3fe0d6_23%,#178fc0_100%)]',
};

/** The plain picture that stands in for the 3D jetty: the water, and your bobber as a big icon and words. */
function WaterPicture({ water, line, revealed }: { water: WaterId; line: LineView; revealed: boolean }) {
  let icon: ReactNode;
  let words: string;
  if (line.phase === 'waiting') {
    icon = <Waves className="size-16 text-white" aria-hidden />;
    words = 'Watching the bobber…';
  } else if (line.phase === 'biting') {
    icon = <span className="font-display text-6xl font-extrabold text-ember drop-shadow">Bite!</span>;
    words = 'The bobber went under. Reel now!';
  } else if (line.phase === 'landed' && revealed) {
    icon = <Fish className="size-16 text-lantern" aria-hidden />;
    words = `You caught ${inSentence(line.fish.species).replace(/^(?!the )/, 'a ')}: ${formatWeight(line.fish.grams)}!`;
  } else if (line.phase === 'landed') {
    icon = <Fish className="size-16 text-white" aria-hidden />;
    words = 'Reeling it in…';
  } else {
    icon = <Anchor className="size-16 text-white" aria-hidden />;
    words = 'Line in. Cast when you are ready.';
  }
  return (
    <div className={`flex h-full flex-col items-center justify-center gap-3 rounded-[var(--radius-l)] p-4 text-center ${WATER_BG[water]}`} role="img" aria-label={`${WATER_INFO[water].label}. ${words}`}>
      {icon}
      <p className="rounded-full bg-black/45 px-4 py-1.5 text-lg font-bold text-white">{words}</p>
    </div>
  );
}

/* --------------------------------- dialogs -------------------------------- */

function OddsDialog({ open, onOpenChange, you, event, view }: { open: boolean; onOpenChange: (v: boolean) => void; you: You; event: EventId | null; view: BigCatchView }) {
  const [lo, hi] = you.odds.biteMs;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`What is biting in the ${WATER_INFO[you.odds.water].label.toLowerCase()}?`} description="The chance of each fish on your next cast, with your lure and any event worked in." size="lg">
      <table className="w-full text-left text-sm">
        <thead className="text-text-2">
          <tr>
            <th className="py-1 font-bold">Fish</th>
            <th className="py-1 text-right font-bold">Chance</th>
            <th className="py-1 text-right font-bold">Weight</th>
          </tr>
        </thead>
        <tbody>
          {you.odds.rows.map((r) => {
            const sp = speciesById(r.species);
            return (
              <tr key={r.species} className="border-t border-line">
                <td className="py-1.5 font-semibold">
                  <span className="flex flex-wrap items-center gap-x-2">
                    {sp?.name ?? r.species} <Stars rarity={rarityOf(r.species)} />
                  </span>
                  {sp ? <span className="block text-xs font-normal text-text-2">{sp.blurb}</span> : null}
                </td>
                <td className="py-1.5 pl-2 text-right font-display text-base font-bold tabular">{pct(r.percent)}</td>
                <td className="py-1.5 pl-3 text-right whitespace-nowrap tabular">{range(r.minKg, r.maxKg)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-sm text-text-2">
        A bite comes {seconds(lo)} to {seconds(hi)} seconds after you cast. Reel within {seconds(REEL_WINDOW_MS)} seconds to land it, or within {seconds(PERFECT_MS)} of a second for a perfect catch (10% heavier). Most fish come up near the light end of their range.
        {you.lure.level > 0 ? ` Your ${you.lure.name.toLowerCase()} is working: rarer and heavier fish are more likely.` : ''}
        {event ? ` ${EVENT_INFO[event].label} is on: ${EVENT_INFO[event].blurb.toLowerCase()}` : ''}
        {view.rules.deepSea ? ' Deep Sea: common fish are half as likely and fish run heavier.' : ''}
      </p>
    </Dialog>
  );
}

function LureDialog({ open, onOpenChange, you, view, onBuy, busy }: { open: boolean; onOpenChange: (v: boolean) => void; you: You; view: BigCatchView; onBuy: (level: number) => void; busy: boolean }) {
  const next = you.lure.next;
  const moment = { water: you.odds.water, event: you.odds.event, deepSea: view.rules.deepSea, frenzy: view.rules.frenzy };
  const rareNow = rarityPercents({ ...moment, lure: you.lure.level });
  const rareNext = next ? rarityPercents({ ...moment, lure: next.level }) : null;
  const short = next ? Math.max(0, next.price - you.wallet) : 0;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Lures"
      description={view.rules.trophyHunt ? `Bought with lure money from the fish you sell. You have ${pointsText(you.wallet)}. Spending it never touches your trophies.` : `Bought with points from your wallet, so a lure lowers your score until it pays for itself. You have ${pointsText(you.wallet)}.`}
    >
      <ol className="flex flex-col gap-2">
        {LURES.map((l) => {
          const owned = l.level <= you.lure.level;
          const isNext = next?.level === l.level;
          return (
            <li key={l.level} className={`flex items-center gap-3 rounded-[var(--radius-m)] p-3 ${isNext ? 'bg-lantern/15' : 'bg-white/[0.06]'}`}>
              <Sparkles className={`size-6 shrink-0 ${owned ? 'text-lantern' : 'text-white/40'}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {l.name} <span className="font-normal text-text-2">{owned ? (l.level === you.lure.level ? 'on your line' : 'had it') : l.price ? pointsText(l.price) : ''}</span>
                </p>
                {isNext && rareNext ? (
                  <p className="text-sm text-text-2">
                    Rare fish and legends here: {pct(rareNow.rare + rareNow.legend)} now, {pct(rareNext.rare + rareNext.legend)} with this. Uncommon: {pct(rareNow.uncommon)} to {pct(rareNext.uncommon)}. Heavier fish too.
                  </p>
                ) : null}
              </div>
              {isNext ? (
                <Button size="sm" variant="primary" disabled={busy || short > 0} onClick={() => onBuy(l.level)} aria-label={`Buy the ${l.name.toLowerCase()} for ${pointsText(l.price)}`}>
                  {short > 0 ? `${formatNumber(short)} more` : `Buy ${formatNumber(l.price)}`}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Dialog>
  );
}

/* ------------------------------- timing hooks ------------------------------ */

/**
 * The seq of the landed catch that may be named: straight away without 3D (or for a catch already
 * on the table when the screen opened), and once the fish is up in the air with it. A fresh catch
 * plays its sound as it is named.
 */
function useReveal(line: LineView | undefined, threeD: boolean): number | null {
  const [shown, setShown] = useState<number | null>(null);
  const mounted = useRef(false);
  const phase = line?.phase;
  const seq = line?.seq;
  const species = line?.phase === 'landed' ? line.fish.species : null;
  useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    if (phase !== 'landed' || seq === undefined || !species) return;
    if (first) {
      setShown(seq);
      return;
    }
    const t = setTimeout(
      () => {
        setShown(seq);
        playSfx(landedSound(species));
      },
      threeD ? LEAP_MS : 0,
    );
    return () => clearTimeout(t);
  }, [phase, seq, species, threeD]);
  return shown;
}

/** The last outcome, once its animation has played, with its sound. */
function useOutcome(outcome: Outcome | null | undefined, threeD: boolean, heldSeq: number | null): Outcome | null {
  const [shown, setShown] = useState<Outcome | null>(null);
  const seen = useRef<string | null>(null);
  useEffect(() => {
    const key = outcome ? `${outcome.seq}|${outcome.at}|${outcome.kind}` : '';
    if (seen.current === null) {
      seen.current = key;
      return;
    }
    if (!outcome || key === seen.current) return;
    seen.current = key;
    const held = heldSeq === outcome.seq;
    const wait = !threeD ? 0 : outcome.kind === 'spooked' || outcome.kind === 'escaped' ? MISS_MS : held ? RESOLVE_MS : LEAP_MS + 500 + RESOLVE_MS;
    const t = setTimeout(() => {
      setShown(outcome);
      if (outcome.kind === 'spooked' || outcome.kind === 'escaped') playSfx('lose');
      else if (outcome.kind === 'tanked') playSfx(outcome.set ? 'levelUp' : 'build');
      else if (!held && outcome.fish) playSfx(landedSound(outcome.fish.species));
      else playSfx('purchase');
    }, wait);
    return () => clearTimeout(t);
  }, [outcome, threeD, heldSeq]);
  return shown;
}

/**
 * Space reels in while the line is out, unless focus is on something that takes Space itself.
 * The Reel button presses itself; on the Cast button (where focus stays after casting) Space reels.
 */
function useSpaceToReel(enabled: boolean, reel: () => void) {
  const latest = useRef(reel);
  latest.current = reel;
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('[data-bc="reel"]')) return;
      if (!t?.closest('[data-bc="cast"]') && t?.closest('input, textarea, select, button, a, [role="button"], [role="radio"], [role="checkbox"], [role="option"], [contenteditable="true"]')) return;
      e.preventDefault();
      latest.current();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [enabled]);
}

/* --------------------------------- player --------------------------------- */

export function BigCatchPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<BigCatchView>) {
  const you = view.you ?? null;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [oddsOpen, setOddsOpen] = useState(false);
  const [lureOpen, setLureOpen] = useState(false);
  const [threeD, setThreeD] = useState(false);
  const scene = useRef<BigCatchScene | null>(null);
  const me = room.players.find((p) => p.id === room.me.playerId);
  const look = useMemo(() => lookOf(me?.avatar, fallbackArt(room.me.playerId ?? 'me')), [me?.avatar, room.me.playerId]);
  const line = you?.line;
  // Remember which catches were seen held up, so a sell or tank plays from the fish in the air.
  const heldSeq = useRef<number | null>(null);
  if (line?.phase === 'landed') heldSeq.current = line.seq;
  const revealed = useReveal(line, threeD);
  const landedShown = line?.phase === 'landed' && revealed === line.seq;
  const shown = useOutcome(you?.outcome, threeD, heldSeq.current);
  const shared = useSharedSounds();

  const eventKey = view.event ? `${view.event.id}|${view.event.endsAt}` : null;
  useAnnounce(view.event ? `${EVENT_INFO[view.event.id].label}. ${EVENT_INFO[view.event.id].blurb}` : null, eventKey);
  useSfx('event', eventKey, shared && view.event !== null);
  useAnnounce(`You are fishing the ${WATER_INFO[view.water.id].label.toLowerCase()}.`, view.water.id);
  const biteKey = line?.phase === 'biting' ? `bite-${line.seq}` : null;
  useAnnounce(biteKey ? 'Bite! Reel now.' : null, biteKey);
  useSfx('alarm', biteKey, biteKey !== null);
  const landedKey = landedShown ? `landed-${line.seq}` : null;
  useAnnounce(
    landedShown && line?.phase === 'landed' ? `You caught ${inSentence(line.fish.species).replace(/^(?!the )/, 'a ')}, ${formatWeight(line.fish.grams)}${line.fish.perfect ? ', a perfect catch' : ''}. Sell it for ${pointsText(line.fish.points)}${line.canTank ? ' or put it in your tank' : ''}.` : null,
    landedKey,
  );
  useAnnounce(shown ? outcomeLine(shown, view.rules.trophyHunt) : null, shown ? `${shown.seq}|${shown.at}|${shown.kind}` : null);

  const state: CatchState | null = you
    ? {
        water: view.water.id,
        event: view.event?.id ?? null,
        phase: you.line.phase,
        seq: you.line.seq,
        fish: you.line.phase === 'landed' ? { id: you.line.fish.id, species: you.line.fish.species, grams: you.line.fish.grams, cm: you.line.fish.cm, perfect: you.line.fish.perfect } : null,
        outcome: you.outcome ? { seq: you.outcome.seq, at: you.outcome.at, kind: you.outcome.kind, fish: you.outcome.fish, points: you.outcome.points } : null,
        tank: you.tank.fish,
      }
    : null;
  useEffect(() => {
    if (state) scene.current?.setState(state);
  });
  const onWorld = useCallback(
    (w: BigCatchScene | null) => {
      scene.current = w;
      setThreeD(Boolean(w));
      if (w && state) w.setState(state);
    },
    // The scene reads the newest state through the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const send = async (a: unknown) => {
    setBusy(true);
    const ack = await act(a);
    setBusy(false);
    setNote(ack.ok ? null : ack.error.message);
    return ack.ok;
  };
  const lineOut = line?.phase === 'waiting' || line?.phase === 'biting';
  const reel = () => {
    if (!lineOut || paused) return;
    playSfx('tap');
    void send({ type: 'reel' });
  };
  useSpaceToReel(Boolean(lineOut) && !paused, reel);

  if (!you || !line) return <p className="font-semibold text-text-2">Watching from the jetty.</p>;

  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };
  const cast = () => {
    playSfx('select');
    void send({ type: 'cast' });
  };
  const decide = (type: 'sell' | 'tank') => {
    void send({ type, seq: line.seq });
  };
  const buy = async (level: number) => {
    if (await send({ type: 'lure', level })) playSfx('upgrade');
  };
  const tankName = view.rules.trophyHunt ? 'Your trophies' : 'Your tank';
  const biting = line.phase === 'biting';
  const nextLure = you.lure.next;

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
      <section className="flex min-w-0 flex-col gap-2" aria-label="Your jetty">
        <div className="relative">
          <Stage3D<BigCatchScene>
            label={`Your Glim fishing from the end of a jetty in the ${WATER_INFO[view.water.id].label.toLowerCase()}, with a glass tank of kept fish beside it.`}
            create={(env) => new BigCatchScene(env, look)}
            onWorld={onWorld}
            className="h-[34vh] min-h-[220px] rounded-[var(--radius-l)] sm:h-[42vh] lg:h-[58vh]"
            fallback={<WaterPicture water={view.water.id} line={line} revealed={landedShown} />}
          />
          <div className="pointer-events-none absolute top-2 left-2 flex max-w-[calc(100%-3.5rem)] flex-wrap gap-1.5">
            <Stat label="Score" value={formatNumber(you.score)} icon={Trophy} tone="gold" />
            <Stat label={view.rules.trophyHunt ? 'Lure money' : 'Wallet'} value={formatNumber(you.wallet)} icon={Coins} />
          </div>
          <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5">
            <span className={CHIP}>
              {WATER_INFO[view.water.id].label}
              {view.water.nextAt !== null && view.water.next ? (
                <span className="font-semibold text-white/80">
                  · {WATER_INFO[view.water.next].label} in <Countdown until={view.water.nextAt} gameNow={gameNow} />
                </span>
              ) : null}
            </span>
            {view.event ? (
              <Pill tone="lantern" className="px-3 py-1 text-sm">
                {EVENT_INFO[view.event.id].label} <Countdown until={view.event.endsAt} gameNow={gameNow} />
              </Pill>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button data-bc="cast" size="lg" variant="secondary" onClick={cast} disabled={busy || paused || you.casts <= 0 || line.phase !== 'idle'} aria-label={`Cast. You have ${you.casts} ${you.casts === 1 ? 'cast' : 'casts'}.`}>
            <Anchor className="size-5" aria-hidden /> Cast
            <span className="ml-1 rounded-full bg-black/20 px-2 font-display tabular">{you.casts}</span>
          </Button>
          <Button
            data-bc="reel"
            size="lg"
            variant={biting ? 'primary' : 'secondary'}
            onClick={reel}
            disabled={busy || paused || !lineOut}
            className={biting ? 'animate-pulse ring-4 ring-lantern/60' : ''}
            aria-label={biting ? 'Reel now! A fish is biting.' : line.phase === 'waiting' ? 'Reel. Wait for the bite first, or the fish swims off.' : 'Reel'}
          >
            <Fish className="size-5" aria-hidden /> {biting ? 'Reel now!' : 'Reel'}
            {biting ? (
              <span className="ml-1 rounded-full bg-black/20 px-2 font-display tabular">
                <Countdown until={line.reelBy} gameNow={gameNow} />
              </span>
            ) : null}
          </Button>
        </div>
        <p className="text-sm font-semibold text-text-2" aria-hidden>
          {line.phase === 'waiting'
            ? 'Wait for the bobber to dip, then reel (or press Space).'
            : biting
              ? 'Bite! Reel now (Space works too).'
              : line.phase === 'landed'
                ? landedShown
                  ? 'Sell it, or put it in your tank.'
                  : 'Reeling it in…'
                : you.casts > 0
                  ? 'Cast your line. You can answer questions while it is out.'
                  : 'Answer a question to earn a cast.'}
        </p>

        {line.phase === 'landed' && landedShown ? (
          <StagePanel className={`flex flex-col gap-3 p-4 ${isBig(line.fish.species) ? 'border-lantern/70' : ''}`} label="Your catch">
            <div className="flex items-start gap-3">
              <Fish className={`size-9 shrink-0 ${isBig(line.fish.species) ? 'text-lantern' : 'text-glim'}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 font-display text-xl font-extrabold">
                  {speciesName(line.fish.species)} <Stars rarity={rarityOf(line.fish.species)} />
                </p>
                <p className="font-bold">
                  {formatWeight(line.fish.grams)} · {pointsText(line.fish.points)}
                  {line.fish.perfect ? <span className="ml-2 rounded-full bg-lantern px-2 py-0.5 text-sm text-on-accent">Perfect: 10% heavier</span> : null}
                </p>
                <p className="text-sm text-text-2">{speciesById(line.fish.species)?.blurb}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="lg"
                variant="primary"
                disabled={busy || paused}
                onClick={() => {
                  playSfx('purchase');
                  decide('sell');
                }}
              >
                <Coins className="size-5" aria-hidden /> Sell {formatNumber(line.fish.points)}
              </Button>
              <Button size="lg" variant="secondary" disabled={busy || paused || !line.canTank} onClick={() => decide('tank')} aria-describedby={line.canTank ? undefined : 'bc-tank-full'}>
                <Fish className="size-5" aria-hidden /> Tank
              </Button>
            </div>
            <p className="text-sm text-text-2">
              {line.canTank ? `Tank fish keep their points, and every ${SET_SIZE} of one rarity earn a set bonus.` : <span id="bc-tank-full">Your tank is full ({you.tank.fish.length} of {view.rules.tankSize}), so this one can only be sold.</span>} Sold for you in{' '}
              <Countdown until={line.decideBy} gameNow={gameNow} />.
            </p>
          </StagePanel>
        ) : null}

        {shown && !(line.phase === 'landed' && landedShown) && !(line.seq > shown.seq && line.phase !== 'idle') ? (
          <StagePanel className={`flex items-center gap-3 px-4 py-3 ${shown.kind === 'spooked' || shown.kind === 'escaped' ? 'border-ember/60' : shown.fish && isBig(shown.fish.species) ? 'border-lantern/70' : ''}`}>
            {shown.kind === 'spooked' || shown.kind === 'escaped' ? <Waves className="size-7 shrink-0 text-ember" aria-hidden /> : shown.kind === 'tanked' ? <Fish className="size-7 shrink-0 text-glim" aria-hidden /> : <Coins className="size-7 shrink-0 text-lantern" aria-hidden />}
            <p className="font-bold">{outcomeLine(shown, view.rules.trophyHunt)}</p>
          </StagePanel>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" onClick={() => setOddsOpen(true)} className="min-h-9 rounded-full px-3 font-bold text-lantern underline-offset-2 hover:underline">
            All the chances
          </button>
          <button type="button" onClick={() => setLureOpen(true)} className="min-h-9 rounded-full px-3 font-bold text-lantern underline-offset-2 hover:underline">
            Lures: {you.lure.name}
            {nextLure ? ` (next ${formatNumber(nextLure.price)}${you.wallet >= nextLure.price ? ', you can buy' : ''})` : ''}
          </button>
          <span className="text-text-2">
            Casts {you.stats.casts} · landed {you.stats.landed} · perfect {you.stats.perfect}
          </span>
        </div>
        {note ? (
          <p className="text-sm font-bold text-ember" role="alert">
            {note}
          </p>
        ) : null}

        <StagePanel className="flex flex-col gap-2 p-3" label={tankName}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-lg font-extrabold">
              {tankName}{' '}
              <span className="font-sans text-sm font-semibold text-text-2">
                {you.tank.fish.length} of {view.rules.tankSize}
              </span>
            </h3>
            <span className="font-bold tabular">
              {pointsText(you.tank.value)}
              {you.tank.bonus ? <span className="text-lantern"> (incl. +{formatNumber(you.tank.bonus)} sets)</span> : null}
            </span>
          </div>
          {you.tank.fish.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {you.tank.fish.map((f) => (
                <li key={f.id} className={`rounded-full px-2.5 py-1 text-sm font-semibold ${isBig(f.species) ? 'bg-lantern/20' : 'bg-white/[0.08]'}`}>
                  {speciesName(f.species)} <span className="text-text-2 tabular">{formatWeight(f.grams)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-2">{view.rules.trophyHunt ? 'Your three heaviest fish will show here. They are your score.' : 'Empty. Tank a fish to start collecting sets.'}</p>
          )}
          {!view.rules.trophyHunt && you.tank.sets.length ? (
            <p className="text-sm text-text-2">
              Sets of {SET_SIZE}:{' '}
              {you.tank.sets.map((s, i) => (
                <span key={s.rarity}>
                  {i ? ', ' : ''}
                  {RARITY_INFO[s.rarity].label.toLowerCase()} {s.count % SET_SIZE === 0 && s.count ? `${s.sets} done` : `${s.count % SET_SIZE} of ${SET_SIZE}`} (+{SET_BONUS[s.rarity]})
                </span>
              ))}
            </p>
          ) : null}
        </StagePanel>
      </section>

      <section className="flex min-w-0 flex-col gap-3" aria-label="Questions">
        <p className="text-sm font-semibold text-text-2">
          Right answers give casts. {you.streak > 0 ? `${you.streak} in a row: ${you.toBonus === 3 ? 'bonus cast earned!' : `${you.toBonus} more for a bonus cast.`}` : 'Three in a row earns a bonus cast.'}
        </p>
        {you.feedback && !you.feedback.correct && you.question ? (
          <div className="flex flex-col gap-2">
            <ResultBanner key={you.feedback.iid} correct={false} partial={you.feedback.partial} text={you.feedback.text} />
            <Explanation text={you.feedback.explanation} />
          </div>
        ) : you.feedback?.correct ? (
          <ResultBanner key={you.feedback.iid} correct text={you.feedback.text} />
        ) : null}
        {you.question ? (
          <>
            <QuestionCard q={you.question.q} />
            <AnswerInput key={you.question.iid} q={you.question.q} onSubmit={submit} disabled={paused} compact />
          </>
        ) : null}
      </section>
      <OddsDialog open={oddsOpen} onOpenChange={setOddsOpen} you={you} event={view.event?.id ?? null} view={view} />
      <LureDialog open={lureOpen} onOpenChange={setLureOpen} you={you} view={view} busy={busy} onBuy={(l) => void buy(l)} />
    </div>
  );
}

/* ---------------------------------- host ---------------------------------- */

export function BigCatchHost({ view, gameNow, room }: ModeScreenProps<BigCatchView>) {
  const scene = useRef<JettyScene | null>(null);
  const anglers = useMemo<JettyAngler[]>(() => {
    const rank = new Map(view.board.map((r) => [r.playerId, r.rank]));
    const lines = [...(view.lines ?? [])].sort((a, b) => (rank.get(a.playerId) ?? 999) - (rank.get(b.playerId) ?? 999));
    return lines.map((l) => ({
      playerId: l.playerId,
      name: l.name,
      phase: l.phase,
      castAt: l.phase === 'idle' ? null : l.castAt,
      species: l.phase === 'landed' ? l.species : null,
      grams: l.phase === 'landed' ? l.grams : null,
      look: lookOf(room.players.find((p) => p.id === l.playerId)?.avatar, fallbackArt(l.playerId)),
    }));
  }, [view.lines, view.board, room.players]);
  useEffect(() => {
    scene.current?.setWater(view.water.id);
    scene.current?.setAnglers(anglers);
  }, [anglers, view.water.id]);
  const eventKey = view.event ? `${view.event.id}|${view.event.endsAt}` : null;
  useSfx('event', eventKey, view.event !== null);
  const newest = view.rareTank?.[0];
  useSfx(newest && rarityOf(newest.species) === 'legend' ? 'jackpot' : 'coin', newest ? `${newest.playerId}|${newest.at}` : null, Boolean(newest));
  const rows = view.board.map((r) => ({ playerId: r.playerId, name: r.name, score: r.score, rank: r.rank, teamId: r.teamId }));
  const biting = (view.lines ?? []).filter((l) => l.phase === 'biting').length;

  return (
    <div className="relative mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col items-start gap-1">
          <ModeTitle>Big Catch</ModeTitle>
          <p className="font-semibold text-text-2">{view.rules.trophyHunt ? 'Trophy Hunt: only your three heaviest fish count.' : 'Right answers give casts. Sell your fish, or tank them for sets.'}</p>
        </div>
        <div className="flex items-center gap-2 text-[clamp(1.1rem,1.8vw,2rem)]">
          <Pill className="px-5 py-1.5 text-[1.15em]">
            <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </Pill>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
        <div className="flex min-h-0 flex-col gap-3">
          <div className="relative min-h-[46vh] flex-1">
            <Stage3D<JettyScene>
              label={`The jetty: ${view.players} players fishing the ${WATER_INFO[view.water.id].label.toLowerCase()}.`}
              create={(env) => new JettyScene(env)}
              onWorld={(w) => {
                scene.current = w;
                w?.setWater(view.water.id);
                w?.setAnglers(anglers);
              }}
              className="absolute inset-0 rounded-[var(--radius-l)]"
              fallback={<HostPicture view={view} />}
            />
            <div className="pointer-events-none absolute top-3 left-3 flex max-w-[calc(100%-4rem)] flex-wrap gap-2 text-[clamp(1rem,1.5vw,1.5rem)]">
              <span className={`${CHIP} px-4 py-1.5`}>
                {WATER_INFO[view.water.id].label}
                {view.water.nextAt !== null && view.water.next ? (
                  <span className="font-semibold text-white/80">
                    · the boat moves to the {WATER_INFO[view.water.next].label.toLowerCase()} in <Countdown until={view.water.nextAt} gameNow={gameNow} />
                  </span>
                ) : null}
              </span>
              {view.event ? (
                <Pill tone="lantern" className="px-4 py-1.5">
                  {EVENT_INFO[view.event.id].label}: {EVENT_INFO[view.event.id].blurb} <Countdown until={view.event.endsAt} gameNow={gameNow} />
                </Pill>
              ) : null}
              {biting ? <Pill tone="ember" className="px-4 py-1.5">{biting === 1 ? 'A bite!' : `${biting} bites!`}</Pill> : null}
            </div>
            {view.rareTank?.length ? (
              <section aria-label="Rare fish tank" className="absolute right-3 bottom-3 left-3 flex flex-col gap-1.5">
                <h3 className="w-fit rounded-full bg-black/65 px-3 py-0.5 font-display text-lg font-extrabold text-white">Rare fish tank</h3>
                <ul className="flex gap-2 overflow-hidden">
                  {view.rareTank.slice(0, 6).map((h) => (
                    <li key={`${h.playerId}|${h.at}`} className={`flex min-w-[9.5rem] shrink-0 flex-col gap-0.5 rounded-[var(--radius-m)] border px-3 py-2 text-white backdrop-blur-sm ${rarityOf(h.species) === 'legend' ? 'border-lantern bg-black/70' : 'border-white/15 bg-black/60'}`}>
                      <Stars rarity={rarityOf(h.species)} />
                      <span className="font-display text-[clamp(1rem,1.3vw,1.4rem)] leading-tight font-extrabold">{speciesName(h.species)}</span>
                      <span className="font-bold tabular">
                        {formatWeight(h.grams)} <span className="font-semibold text-white/75">· {h.name}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
        <StagePanel className="flex flex-col gap-3 p-3" as="aside" label="Leaderboard">
          <h3 className="font-display text-xl font-extrabold">Top anglers</h3>
          {view.teams ? <TeamScores teams={view.teams.map((t) => ({ teamId: t.teamId, name: t.name, hue: t.hue, score: t.average, members: t.members }))} /> : null}
          <Leaderboard rows={rows} players={room.players} teams={room.room.teams} big dense label={(r) => pointsText(r.score)} />
          {view.biggest?.length ? (
            <div className="flex flex-col gap-1">
              <h3 className="font-display text-lg font-extrabold">Biggest catches</h3>
              <ol className="flex flex-col gap-1 text-[clamp(0.95rem,1.2vw,1.2rem)]">
                {view.biggest.map((h, i) => (
                  <li key={`${h.playerId}|${h.at}`} className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <span className="font-display font-extrabold tabular">{i + 1}.</span> {speciesName(h.species)} <span className="text-text-2">· {h.name}</span>
                    </span>
                    <span className="font-bold tabular">{formatWeight(h.grams)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </StagePanel>
      </div>
    </div>
  );
}

/** The big screen without 3D: who is waiting, who has a bite, and who is holding a fish up. */
function HostPicture({ view }: { view: BigCatchView }) {
  const lines = (view.lines ?? []).slice(0, 24);
  return (
    <div className={`flex h-full flex-wrap content-start gap-2 overflow-hidden rounded-[var(--radius-l)] p-4 pt-16 ${WATER_BG[view.water.id]}`}>
      {lines.map((l) => (
        <span key={l.playerId} className={`rounded-full px-3 py-1 font-bold ${l.phase === 'biting' ? 'bg-ember text-on-accent' : l.phase === 'landed' ? 'bg-lantern text-on-accent' : 'bg-black/45 text-white'}`}>
          {l.name}: {l.phase === 'idle' ? 'ready' : l.phase === 'waiting' ? 'waiting' : l.phase === 'biting' ? 'Bite!' : `${speciesName(l.species)}, ${formatWeight(l.grams)}`}
        </span>
      ))}
    </div>
  );
}
