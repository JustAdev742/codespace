import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Blocks, Hand, Lamp, Layers, Star, Sunrise, TreePine, Wind, type LucideIcon } from 'lucide-react';
import type { Answer } from '@ludora/shared';
import type { GustChance, PieceEffect, PieceKind } from '@ludora/engine/tower-together';
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
import { Button } from '../../../ui/Button.tsx';
import { formatNumber } from '../../../lib/format.ts';
import { playSfx, useSfx } from '../../../lib/sound/react.tsx';
import { useNow } from '../../../lib/useNow.ts';
import { Stage3D, lookFor } from '../../../three/index.ts';
import { TowerHostScene, TowerScene, type SceneBuilder, type SceneState } from './tower-scene.ts';
import { SideView } from './tower-side.tsx';
import { floorsText } from './tower-layout.ts';

/*
 * Tower Together screens. The 3D tower is the picture; everything you do is
 * an ordinary button beside it: the three pieces and the question. The sway
 * gauge, the next gust and its odds are plain HTML too, so the game reads the
 * same with 3D off (a drawn tower stands in) and to a screen reader.
 */

/* ---------------------------------- types --------------------------------- */

interface GustResult {
  seq: number;
  at: number;
  strength: 'breeze' | 'gust' | 'gale';
  name: string;
  limit: number;
  sway: number;
  held: boolean;
  fell: number;
  from: number;
  to: number;
  kinds: string;
  saved: number;
  savedBy: string | null;
}

export interface TowerView {
  id: string;
  name: string;
  hue: number | null;
  crew: number;
  target: number;
  stars: number;
  steps: number[];
  height: number;
  peak: number;
  braceAt: number;
  braceGap: number;
  braceNeeds: number;
  sway: number;
  build: number;
  leverage: number;
  base: number;
  kinds: string;
  brace: number;
  falls: number;
  fallen: number;
  saved: number;
  holds: number;
  last: { seq: number; at: number; kind: PieceKind; by: string; height: number; sway: number } | null;
  gust: GustResult | null;
}

export interface BuilderView {
  playerId: string;
  name: string;
  tower: string;
  seq: number;
  kind: PieceKind | null;
  isYou: boolean;
}

interface BoardRow {
  playerId: string;
  name: string;
  teamId: string | null;
  points: number;
  pieces: number;
  rank: number;
  isYou: boolean;
}

interface Effect extends Omit<PieceEffect, 'next'> {
  ok: boolean;
  why: string | null;
}

interface You {
  tower: string;
  team: string | null;
  held: number;
  maxHold: number;
  effects: Effect[];
  placed: Record<PieceKind, number>;
  saved: number;
  standing: number;
  points: number;
  rank: number | null;
  seq: number;
  lastKind: PieceKind | null;
  steadyUntil: number | null;
  streak: number;
  question: QuestionView | null;
  last: (FeedbackView & { text?: string }) | null;
}

export interface TowerTogetherView {
  startedAt: number;
  endsAt: number;
  wind: 'normal' | 'storm' | 'calm';
  odds: GustChance[];
  warnSec: number;
  maxSway: number;
  gust: { landsAt: number; announced: boolean; strength: GustChance['strength'] | null; name: string | null; limit: number | null } | null;
  gustSeq: number;
  towers: TowerView[];
  twoTowers: boolean;
  players: number;
  board: BoardRow[];
  teams: { teamId: string; name: string; hue: number; members: number; score: number; height: number; target: number }[] | null;
  builders: BuilderView[];
  you?: You | null;
}

/* --------------------------------- helpers -------------------------------- */

const PIECE: Record<PieceKind, { name: string; icon: LucideIcon; tone: string }> = {
  timber: { name: 'Timber', icon: TreePine, tone: 'bg-[#b7743d] text-white' },
  stone: { name: 'Stone', icon: Blocks, tone: 'bg-[#7f8aa6] text-[#0b1020]' },
  lantern: { name: 'Lantern brace', icon: Lamp, tone: 'bg-lantern text-on-accent' },
};

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const signed = (d: number) => (d > 0 ? `+${num(d)}` : d < 0 ? `−${num(-d)}` : '±0');

function whose(view: TowerTogetherView, t: TowerView) {
  return view.twoTowers ? `${t.name}'s tower` : 'The tower';
}

function gustLine(view: TowerTogetherView, t: TowerView, g: GustResult): string {
  if (g.held) return `${g.name}! ${whose(view, t)} held: it was swaying ${Math.round(g.sway)}, and a ${g.name.toLowerCase()} can stand ${g.limit}.`;
  return `${g.name}! ${whose(view, t)} was swaying ${Math.round(g.sway)}, more than ${g.limit}: ${floorsText(g.fell)} fell${g.saved > 0 ? `, and ${g.savedBy ?? 'a'}'s brace saved ${floorsText(g.saved)}` : ''}.`;
}

function warnLine(view: TowerTogetherView): string | null {
  const g = view.gust;
  if (!g || !g.announced || !g.name) return null;
  return `${g.name} coming in ${view.warnSec} seconds! The tower holds if it is swaying ${g.limit} or less.`;
}

function useLooks(room: ModeScreenProps['room']) {
  return useCallback((id: string) => lookFor(room.players.find((p) => p.id === id)?.avatar, fallbackArt(id)), [room.players]);
}

function sceneState(view: TowerTogetherView, looks: (id: string) => SceneBuilder['look']): SceneState {
  const g = view.gust;
  const strength = g?.strength === 'gale' ? 1 : g?.strength === 'gust' ? 0.6 : g?.strength === 'breeze' ? 0.25 : 0;
  return {
    towers: view.towers.map((t) => ({ id: t.id, height: t.height, base: t.base, kinds: t.kinds, brace: t.brace, target: t.target, sway: t.sway, hue: t.hue, last: t.last ? { seq: t.last.seq, kind: t.last.kind } : null, gust: t.gust ? { seq: t.gust.seq, held: t.gust.held, from: t.gust.from, to: t.gust.to, kinds: t.gust.kinds } : null })),
    builders: view.builders.map((b) => ({ playerId: b.playerId, name: b.name, tower: b.tower, seq: b.seq, kind: b.kind, isYou: b.isYou, look: looks(b.playerId) })),
    wind: g ? { strength, announced: g.announced, landsAt: g.landsAt } : null,
    startedAt: view.startedAt,
    endsAt: view.endsAt,
  };
}

/** The words that stand for the picture, for screen readers. */
function describe(view: TowerTogetherView, t: TowerView, you: You | null): string {
  const own = you ? (view.twoTowers ? `Your team's tower` : 'The class tower') : view.twoTowers ? `${t.name}'s tower` : 'The class tower';
  const stars = t.stars ? ` ${t.stars} ${t.stars === 1 ? 'star' : 'stars'} so far.` : ` ${floorsText(Math.max(0, t.target - t.height))} to the target.`;
  const brace = t.braceAt > 0 ? ` The highest lantern brace is at floor ${t.braceAt}: nothing below it can fall.` : ' There is no lantern brace yet, so a fall would take the whole tower.';
  const g = view.gust;
  const gust = !g ? '' : g.announced && g.name ? ` A ${g.name.toLowerCase()} is coming: it knocks the top off if the tower sways more than ${g.limit}.` : ' The next gust is on its way; its strength is not known yet.';
  const last = t.last ? ` Last piece: ${t.last.by === (you ? 'You' : '') ? 'yours' : t.last.by}, ${PIECE[t.last.kind].name.toLowerCase()}.` : '';
  return `${own} is ${floorsText(t.height)} tall; the target is ${floorsText(t.target)}.${stars} Sway ${Math.round(t.sway)} of 100.${brace}${gust}${last}`;
}

/** A value that changes at most once every `ms`, keeping the latest. */
function useSteady<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value);
  const last = useRef(0);
  useEffect(() => {
    const t = setTimeout(
      () => {
        last.current = Date.now();
        setShown(value);
      },
      Math.max(0, last.current + ms - Date.now()),
    );
    return () => clearTimeout(t);
  }, [value, ms]);
  return shown;
}

/**
 * Run something after a delay, kept even when the screen re-renders (views
 * arrive many times a second); cleared only when the screen goes.
 */
function useLater() {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return useCallback((fn: () => void, ms: number) => {
    timers.current = [...timers.current.slice(-8), setTimeout(fn, ms)];
  }, []);
}

/** The latest gust result on a tower, shown once the picture has played it. */
function useGustNews(t: TowerView | undefined, threeD: boolean) {
  const [shown, setShown] = useState<GustResult | null>(null);
  const seen = useRef<number>(t?.gust?.seq ?? 0);
  const g = t?.gust ?? null;
  const later = useLater();
  useEffect(() => {
    if (!g || g.seq === seen.current) return;
    seen.current = g.seq;
    later(
      () => {
        setShown(g);
        playSfx(g.held ? 'shield' : 'bust');
      },
      threeD && !g.held ? 1400 : 300,
    );
  }, [g, threeD, later]);
  return shown;
}

function dawnShare(view: TowerTogetherView, now: number) {
  return (now - view.startedAt) / Math.max(1, view.endsAt - view.startedAt);
}

/* ---------------------------------- parts --------------------------------- */

function Stat({ label, value, icon: Icon, tone = 'calm' }: { label: string; value: ReactNode; icon: LucideIcon; tone?: 'calm' | 'gold' }) {
  const colours = tone === 'gold' ? 'bg-lantern text-on-accent' : 'bg-black/55 text-white';
  return (
    <div className={`flex min-w-0 items-center gap-1.5 rounded-[var(--radius-m)] px-2.5 py-1.5 backdrop-blur-sm ${colours}`}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">{label}:</span>
      <span className="truncate font-display text-lg leading-none font-extrabold tabular">{value}</span>
    </div>
  );
}

/**
 * The sway gauge: the needle, the line each gust strength can stand, and the
 * announced gust's line picked out. The words under it say the same.
 */
export function SwayGauge({ tower, view, big = false, title }: { tower: TowerView; view: TowerTogetherView; big?: boolean; title?: string }) {
  const sway = Math.round(tower.sway);
  const g = view.gust?.announced ? view.gust : null;
  const lines = view.odds;
  const danger = g && g.limit !== null ? tower.sway > g.limit : false;
  const text = g && g.limit !== null ? `Sway ${sway} of 100. The ${g.name?.toLowerCase()} can stand ${g.limit}: ${danger ? 'too much, steady it or brace it now' : 'safe for now'}.` : `Sway ${sway} of 100.`;
  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-baseline justify-between gap-2 ${big ? 'text-[clamp(1rem,1.4vw,1.5rem)]' : 'text-sm'}`}>
        <span className="font-bold">{title ?? 'Sway'}</span>
        <span className={`font-display font-extrabold tabular ${big ? 'text-[1.6em]' : 'text-xl'} ${danger ? 'text-ember' : ''}`}>{sway}</span>
      </div>
      <div role="meter" aria-label={title ?? 'Sway'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={sway} aria-valuetext={text} className={`relative w-full overflow-visible rounded-full bg-white/[0.12] ${big ? 'h-6' : 'h-4'}`}>
        <div className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-[var(--ease-out)] ${danger ? 'bg-ember' : tower.sway > 45 ? 'bg-lantern' : 'bg-glim'}`} style={{ width: `${Math.min(100, tower.sway)}%` }} />
        {lines.map((l) => {
          const picked = g?.strength === l.strength;
          return <span key={l.strength} aria-hidden className={`absolute -inset-y-1 w-0.5 ${picked ? 'bg-white' : 'bg-white/45'}`} style={{ left: `${l.limit}%` }} />;
        })}
      </div>
      {lines.length ? (
        <div className={`relative w-full ${big ? 'h-6 text-sm' : 'h-5 text-xs'} font-semibold text-text-2`} aria-hidden>
          {lines.map((l) => (
            <span key={l.strength} className={`absolute -translate-x-1/2 whitespace-nowrap ${g?.strength === l.strength ? 'font-extrabold text-text' : ''}`} style={{ left: `${l.limit}%` }}>
              {l.name === 'Strong gust' ? 'Gust' : l.name} {l.limit}
            </span>
          ))}
        </div>
      ) : null}
      <p className={`${big ? 'text-base' : 'sr-only'} ${danger ? 'font-bold text-ember' : 'text-text-2'}`}>{text}</p>
    </div>
  );
}

/** The next gust: when, how strong (once announced), and the odds of each strength. */
function GustCard({ view, gameNow, big = false }: { view: TowerTogetherView; gameNow: () => number; big?: boolean }) {
  const g = view.gust;
  if (view.wind === 'calm') {
    return (
      <StagePanel className={`flex items-center gap-2 ${big ? 'p-3 text-lg' : 'px-3 py-2 text-sm'}`}>
        <Wind className="size-5 shrink-0 text-text-2" aria-hidden />
        <p className="font-semibold">Calm night: no gusts, and nothing falls.</p>
      </StagePanel>
    );
  }
  return (
    <StagePanel className={`flex flex-col gap-1.5 ${big ? 'p-3' : 'px-3 py-2'} ${g?.announced ? 'border-ember/70' : ''}`} as="section" label="Next gust">
      <p className={`flex items-center gap-x-2 font-bold ${big ? 'text-[clamp(1.05rem,1.5vw,1.6rem)]' : ''}`}>
        <Wind className={`${big ? 'size-6' : 'size-5'} shrink-0 ${g?.announced ? 'text-ember' : 'text-text-2'}`} aria-hidden />
        {!g ? (
          <span>No more gusts before dawn.</span>
        ) : g.announced ? (
          <span>
            {g.name} in <Countdown until={g.landsAt} gameNow={gameNow} />: holds at sway {g.limit} or less
          </span>
        ) : (
          <span>
            Next gust in <Countdown until={g.landsAt} gameNow={gameNow} />
          </span>
        )}
      </p>
      {g && !g.announced ? (
        <ul className={`flex flex-wrap gap-x-3 gap-y-0.5 ${big ? 'text-base' : 'text-sm'} text-text-2`} aria-label="Chance of each strength">
          {view.odds.map((o) => (
            <li key={o.strength}>
              <span className="font-bold text-text">{o.name}</span> {o.chance}%<span className="text-text-2"> (holds at {o.limit})</span>
            </li>
          ))}
        </ul>
      ) : null}
    </StagePanel>
  );
}

/** Height against the target, with the star steps. */
function HeightBar({ tower, big = false, title }: { tower: TowerView; big?: boolean; title?: string }) {
  const top = Math.max(tower.steps[2] ?? tower.target, tower.height) * 1.06;
  const pct = (n: number) => `${Math.min(100, (n / Math.max(1, top)) * 100)}%`;
  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-baseline justify-between gap-2 ${big ? 'text-[clamp(1rem,1.4vw,1.5rem)]' : 'text-sm'}`}>
        <span className="min-w-0 truncate font-bold">{title ?? 'Height'}</span>
        <span className="shrink-0 font-display font-extrabold tabular">
          <span className={big ? 'text-[1.6em]' : 'text-xl'}>{formatNumber(tower.height)}</span> / {formatNumber(tower.target)}
        </span>
      </div>
      <div role="meter" aria-label={title ?? 'Height'} aria-valuemin={0} aria-valuemax={tower.target} aria-valuenow={Math.min(tower.height, tower.target)} aria-valuetext={`${floorsText(tower.height)} of a ${formatNumber(tower.target)}-floor target. ${tower.stars} ${tower.stars === 1 ? 'star' : 'stars'}.`} className={`relative w-full rounded-full bg-white/[0.12] ${big ? 'h-6' : 'h-4'}`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-lantern transition-[width] duration-300 ease-[var(--ease-out)]" style={{ width: pct(tower.height) }} />
        {tower.steps.map((s, i) => (
          <span key={i} aria-hidden className="absolute -top-1.5 -translate-x-1/2" style={{ left: pct(s) }}>
            <Star className={`${big ? 'size-5' : 'size-4'} ${tower.stars > i ? 'fill-lantern text-lantern' : 'text-white/60'}`} />
          </span>
        ))}
      </div>
    </div>
  );
}

function HoldPips({ held, max }: { held: number; max: number }) {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`inline-block size-3 rounded-[3px] ${i < held ? 'bg-lantern' : 'bg-white/20'}`} />
      ))}
    </span>
  );
}

function PieceButton({ effect, onPlace, disabled }: { effect: Effect; onPlace: () => void; disabled: boolean }) {
  const p = PIECE[effect.kind];
  const Icon = p.icon;
  // The name is the visible words with a few more for screen readers, so it reads as a sentence:
  // "Place Timber: +2 floors, sway +18 to 41."
  return (
    <Button size="lg" variant="secondary" className="h-auto min-h-[5rem] min-w-0 flex-col !items-start !justify-start gap-0.5 px-2.5 py-2 text-left" onClick={onPlace} disabled={disabled}>
      <span className="flex min-w-0 items-center gap-1.5 text-base leading-tight font-bold">
        <span className={`grid size-5 shrink-0 place-items-center rounded-[4px] ${p.tone}`} aria-hidden>
          <Icon className="size-3.5" />
        </span>
        <span className="sr-only">Place </span>
        {effect.kind === 'lantern' ? 'Brace' : p.name}
        <span className="sr-only">: </span>
      </span>
      <span className="text-sm font-semibold tabular">
        {effect.floors ? `+${effect.floors} ${effect.floors === 1 ? 'floor' : 'floors'}` : 'locks below'}
        <span className="sr-only">{effect.floors ? ', ' : ', nothing below it can fall, '}</span>
      </span>
      <span className={`text-sm font-bold tabular ${effect.sway > 0 ? 'text-ember' : effect.sway < 0 ? 'text-glim' : 'text-text-2'}`}>
        sway {signed(effect.sway)}
        <span className="sr-only">
          {' '}
          to {num(effect.after)}.{effect.why ? ` ${effect.why}` : ''}
        </span>
      </span>
    </Button>
  );
}

/* --------------------------------- player --------------------------------- */

export function TowerTogetherPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<TowerTogetherView>) {
  const you = view.you ?? null;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [threeD, setThreeD] = useState(true);
  const scene = useRef<TowerScene | null>(null);
  const looks = useLooks(room);
  const me = room.me.playerId ?? 'me';
  const tower = view.towers.find((t) => t.id === you?.tower) ?? view.towers[0]!;
  const news = useGustNews(tower, threeD);
  const warn = warnLine(view);
  useAnnounce(warn, view.gust?.announced ? view.gust.landsAt : null);
  useSfx('alarm', view.gust?.announced ? view.gust.landsAt : null, Boolean(view.gust?.announced));
  useAnnounce(news ? gustLine(view, tower, news) : null, news?.seq);
  const starKey = `${tower.id}|${tower.stars}`;
  useSfx('rankUp', starKey, tower.stars > 0);
  useAnnounce(tower.stars > 0 ? `${whose(view, tower)} reached ${tower.stars === 1 ? 'the target: one star' : `${tower.stars} stars`}!` : null, starKey);
  useNow(1000, true);

  const state = useMemo(() => sceneState(view, looks), [view, looks]);
  useEffect(() => {
    scene.current?.setState(state);
  }, [state]);
  const onWorld = useCallback(
    (w: TowerScene | null) => {
      scene.current = w;
      setThreeD(Boolean(w));
      if (w) w.setState(state);
    },
    // The scene reads the newest state through the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // Your own piece, said once it has gone on.
  const [placed, setPlaced] = useState<string | null>(null);
  const placedSeq = useRef(you?.seq ?? 0);
  const later = useLater();
  useEffect(() => {
    if (!you || you.seq === placedSeq.current || !you.lastKind) return;
    placedSeq.current = you.seq;
    const line = `You placed ${you.lastKind === 'lantern' ? 'a lantern brace' : you.lastKind}. The tower is ${floorsText(tower.height)} tall and sways ${Math.round(tower.sway)}.`;
    later(() => setPlaced(line), threeD ? 450 : 0);
  }, [you, tower.height, tower.sway, threeD, later]);
  useAnnounce(placed, placed);

  if (!you) return <p className="font-semibold text-text-2">Watching the tower go up.</p>;

  const place = async (kind: PieceKind) => {
    setBusy(true);
    playSfx(kind === 'lantern' ? 'powerUp' : 'build');
    const ack = await act({ type: 'place', kind });
    setBusy(false);
    setNote(ack.ok ? null : ack.error.message);
  };
  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };
  const left = view.endsAt - gameNow();
  const label = describe(view, tower, you);
  const dawn = dawnShare(view, gameNow());
  const why = you.held > 0 ? you.effects.find((e) => e.why)?.why : null;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
      <section className="flex min-w-0 flex-col gap-2" aria-label="The tower">
        <div className="relative">
          <Stage3D<TowerScene>
            label={label}
            create={(env) => new TowerScene(env, { me, tower: tower.id, towers: view.towers.map((t) => t.id), gameNow })}
            onWorld={onWorld}
            className="h-[34vh] min-h-[220px] rounded-[var(--radius-l)] sm:h-[40vh] lg:h-[52vh]"
            fallback={<SideView view={view} label={label} dawn={dawn} />}
          />
          <div className="pointer-events-none absolute top-2 left-2 flex max-w-[calc(100%-3.5rem)] flex-wrap gap-1.5">
            <Stat label="Height" value={`${formatNumber(tower.height)}/${formatNumber(tower.target)}`} icon={Layers} tone="gold" />
            <Stat label="Pieces in hand" value={`${you.held}/${you.maxHold}`} icon={Hand} />
            <Stat label="Dawn in" value={<Countdown until={view.endsAt} gameNow={gameNow} />} icon={Sunrise} />
          </div>
        </div>
        <StagePanel className="flex flex-col gap-2 px-3 py-2">
          <SwayGauge tower={tower} view={view} />
          <HeightBar tower={tower} title={view.twoTowers ? `${tower.name}: height` : 'Height'} />
        </StagePanel>
        <GustCard view={view} gameNow={gameNow} />
        <div className="flex items-center justify-between gap-2 text-sm font-semibold">
          <span className="inline-flex items-center gap-2">
            <HoldPips held={you.held} max={you.maxHold} /> {you.held === 0 ? 'No pieces: answer to earn one' : `${you.held} ${you.held === 1 ? 'piece' : 'pieces'} to place`}
          </span>
          {left < 30_000 ? <span className="font-bold text-ember">Last 30 seconds!</span> : null}
        </div>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Place a piece">
          {you.effects.map((e) => (
            <PieceButton key={e.kind} effect={e} onPlace={() => void place(e.kind)} disabled={busy || paused || !e.ok} />
          ))}
        </div>
        {why ? <p className="text-sm text-text-2">{why}</p> : null}
        {news ? (
          <StagePanel className={`flex items-center gap-3 px-4 py-3 ${news.held ? 'border-glim/60' : 'border-ember/60'}`}>
            <Wind className={`size-7 shrink-0 ${news.held ? 'text-glim' : 'text-ember'}`} aria-hidden />
            <p className="font-bold">{gustLine(view, tower, news)}</p>
          </StagePanel>
        ) : null}
        {note ? (
          <p className="text-sm font-bold text-ember" role="alert">
            {note}
          </p>
        ) : null}
      </section>
      <section className="flex min-w-0 flex-col gap-3" aria-label="Questions">
        <p className="text-sm font-semibold text-text-2">
          {you.team ? `You build for ${you.team}. ` : ''}Every right answer earns a piece. You have placed {you.placed.timber + you.placed.stone + you.placed.lantern} and score {formatNumber(you.points)}.
        </p>
        {you.last && !you.last.correct ? (
          <div className="flex flex-col gap-2">
            <ResultBanner key={you.last.iid} correct={false} partial={you.last.partial} text={you.last.text} />
            <Explanation text={you.last.explanation} />
          </div>
        ) : you.last?.correct ? (
          <ResultBanner key={you.last.iid} correct text={you.last.text} />
        ) : null}
        {you.question ? (
          <>
            <QuestionCard q={you.question.q} />
            <AnswerInput key={you.question.iid} q={you.question.q} onSubmit={submit} disabled={paused} compact />
          </>
        ) : you.steadyUntil ? (
          <StagePanel className="px-4 py-3">
            <p className="font-bold">The next question comes in a moment.</p>
          </StagePanel>
        ) : null}
      </section>
    </div>
  );
}

/* ---------------------------------- host ---------------------------------- */

export function TowerTogetherHost({ view, gameNow, room }: ModeScreenProps<TowerTogetherView>) {
  const scene = useRef<TowerHostScene | null>(null);
  const looks = useLooks(room);
  const state = useMemo(() => sceneState(view, looks), [view, looks]);
  const [threeD, setThreeD] = useState(true);
  useEffect(() => {
    scene.current?.setState(state);
  }, [state]);
  useNow(1000, true);
  useSfx('alarm', view.gust?.announced ? view.gust.landsAt : null, Boolean(view.gust?.announced));
  const first = view.towers[0]!;
  const news = useGustNews(first, threeD);
  const steadyBoard = useSteady(view.board, 2500);
  const rows = steadyBoard.slice(0, view.twoTowers ? 4 : 5).map((r) => ({ playerId: r.playerId, name: r.name, score: r.points, rank: r.rank, teamId: r.teamId }));
  const label = view.towers.map((t) => describe(view, t, null)).join(' ');
  const dawn = dawnShare(view, gameNow());
  const warn = warnLine(view);
  const lines = news ? view.towers.map((t) => (t.gust && t.gust.seq === news.seq ? gustLine(view, t, t.gust) : null)).filter((l): l is string => Boolean(l)) : [];

  return (
    <div className="relative mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col items-start gap-1">
          <ModeTitle>Tower Together</ModeTitle>
          <p className="font-semibold text-text-2">{view.twoTowers ? 'Two teams, two towers, the same wind.' : 'One tower for the whole class.'} Right answers earn pieces: timber builds, stone steadies, lantern braces lock.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[clamp(1.1rem,1.8vw,2rem)]">
          {view.towers.length === 1 ? (
            <Pill tone="lantern" className="px-5 py-1.5">
              <Star className="size-[1em]" aria-hidden /> {first.stars} of 3 stars
            </Pill>
          ) : null}
          <Pill className="px-5 py-1.5 text-[1.15em]">
            <Sunrise className="size-[1em]" aria-hidden /> <span className="sr-only">Dawn in</span>
            <Countdown until={view.endsAt} gameNow={gameNow} label="Dawn in" />
          </Pill>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,27rem)]">
        <div className="relative min-h-[52vh]">
          <Stage3D<TowerHostScene>
            label={label}
            create={(env) => new TowerHostScene(env, { towers: view.towers.map((t) => t.id), gameNow })}
            onWorld={(w) => {
              scene.current = w;
              setThreeD(Boolean(w));
              w?.setState(state);
            }}
            className="absolute inset-0 rounded-[var(--radius-l)]"
            fallback={<SideView view={view} label={label} dawn={dawn} host />}
          />
          <div className="absolute top-3 left-3 max-w-[calc(100%-5rem)]" role="status">
            {warn && view.gust ? (
              <Pill tone="ember" className="px-4 py-1.5 text-[clamp(1rem,1.5vw,1.5rem)] whitespace-normal">
                <Wind className="size-6 shrink-0" aria-hidden />
                <span>
                  {view.gust.name} in <Countdown until={view.gust.landsAt} gameNow={gameNow} />: holds at sway {view.gust.limit} or less
                </span>
              </Pill>
            ) : null}
          </div>
          <ul className="pointer-events-none absolute bottom-3 left-3 flex max-w-[45%] flex-col items-start gap-1.5" aria-hidden>
            {view.towers.map((t) => (
              <li key={t.id} className={`rounded-[var(--radius-m)] px-3 py-1.5 text-[clamp(0.95rem,1.3vw,1.35rem)] font-bold backdrop-blur-sm ${t.height >= t.target ? 'bg-lantern text-on-accent' : 'bg-black/60 text-white'}`}>
                {view.twoTowers ? `${t.name}: ` : ''}
                {t.height >= t.target ? `Past the target: ${t.stars} ${t.stars === 1 ? 'star' : 'stars'}` : `Target ${formatNumber(t.target)}: ${floorsText(t.target - t.height)} to go`}
              </li>
            ))}
          </ul>
          {lines.length ? (
            <ul className="absolute right-3 bottom-3 flex max-w-[min(32rem,70%)] flex-col items-end gap-1.5" aria-label="What the wind did">
              {lines.map((l) => (
                <li key={l} className={`rounded-[var(--radius-m)] px-3 py-1.5 font-bold backdrop-blur-sm ${l.includes('fell') ? 'bg-ember text-on-accent' : 'bg-black/60 text-white'}`}>
                  {l}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          {view.towers.map((t) => (
            <StagePanel key={t.id} className="flex flex-col gap-2 p-3" as="section" label={view.twoTowers ? `${t.name}'s tower` : 'The tower'}>
              {view.twoTowers ? (
                <h3 className="flex min-w-0 items-center gap-2 font-display text-xl font-extrabold">
                  <span className="size-3.5 shrink-0 rounded-full ring-2 ring-white/50" style={{ background: `hsl(${t.hue ?? 44} 80% 62%)` }} aria-hidden />
                  <span className="truncate">{t.name}</span>
                  <span className="ml-auto shrink-0 text-base font-bold text-text-2">{Math.floor((t.height / Math.max(1, t.target)) * 100)}%</span>
                </h3>
              ) : null}
              <HeightBar tower={t} big={!view.twoTowers} title="Height" />
              <SwayGauge tower={t} view={view} big={!view.twoTowers} />
              <p className="text-sm text-text-2">
                {t.braceAt > 0 ? `Braced to floor ${formatNumber(t.braceAt)}.` : 'No brace yet.'} {t.braceNeeds > 0 ? `Next brace in ${floorsText(t.braceNeeds)}.` : 'A brace fits now.'}
                {t.falls ? ` ${t.falls} ${t.falls === 1 ? 'fall' : 'falls'}, ${floorsText(t.fallen)} lost${t.saved ? `, ${floorsText(t.saved)} saved` : ''}.` : ''}
              </p>
            </StagePanel>
          ))}
          <GustCard view={view} gameNow={gameNow} big={!view.twoTowers} />
          <StagePanel className="flex flex-col gap-3 p-3" as="aside" label="Top builders">
            <h3 className="font-display text-xl font-extrabold">Top builders</h3>
            {view.teams && !view.twoTowers ? <TeamScores teams={view.teams.map((t) => ({ teamId: t.teamId, name: t.name, hue: t.hue, score: t.score, members: t.members }))} /> : null}
            <Leaderboard rows={rows} players={room.players} teams={room.room.teams} big dense />
          </StagePanel>
        </div>
      </div>
    </div>
  );
}
