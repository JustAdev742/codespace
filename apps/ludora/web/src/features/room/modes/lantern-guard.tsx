import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { ArrowBigUp, ChevronLeft, ChevronRight, Coins, Crown, Hammer, Shield, ShieldAlert, Sparkles, Star, X } from 'lucide-react';
import type { Answer, RoomView } from '@ludora/shared';
import {
  FLARE_BURN,
  FLARE_BURN_BOSS,
  FLARE_CROWD,
  FLARE_GIFT,
  GLOOMLINGS,
  GLOOM_ORDER,
  MAPS,
  TOWERS,
  pathInReach,
  towerStats,
  upgradeCost,
  type GloomKind,
  type GuardMap,
  type MapId,
  type TowerKind,
} from '@ludora/engine/lantern-guard-maps';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner, RevealAnswer } from '../game/Reveal.tsx';
import { RankBadge } from '../game/Leaderboard.tsx';
import { Explanation } from '../game/parts.tsx';
import { useAnnounce } from '../game/announce.tsx';
import { NIGHT, Pill, PlayerGlim, SIGN, StagePanel, avatarOf } from '../game/stage.tsx';
import { Battlefield, FIELD_CSS, GloomShape, LightsRow, TowerShape, type GloomView, type Selection, type TowerView } from './lantern-guard-field.tsx';
import { Button } from '../../../ui/Button.tsx';
import { playSfx, useSfx, useSharedSounds } from '../../../lib/sound/react.tsx';
import { formatNumber, ordinal, plural } from '../../../lib/format.ts';

/* Lantern Guard: answer for gold, build and upgrade light towers together, and keep the Great Lantern burning. */

interface Row {
  playerId: string;
  name: string;
  points: number;
  isYou: boolean;
  rank: number;
}

type LogView =
  | { seq: number; at: number; kind: 'build'; name: string; tower: TowerKind }
  | { seq: number; at: number; kind: 'upgrade'; name: string; tower: TowerKind; level: number }
  | { seq: number; at: number; kind: 'feed'; name: string; gold: number }
  | { seq: number; at: number; kind: 'held'; wave: number; lost: number }
  | { seq: number; at: number; kind: 'lord'; name: string | null }
  | { seq: number; at: number; kind: 'flare'; burned: number }
  | { seq: number; at: number; kind: 'leak'; gloom: GloomKind; lights: number };

export interface LanternGuardView {
  map: MapId;
  tick: number;
  lights: number;
  maxLights: number;
  wave: number;
  waves: number | null;
  held: number;
  lordsDown: number;
  nextWaveAt: number | null;
  next: ({ wave: number } & Record<GloomKind, number>) | null;
  endsAt: number | null;
  result: 'win' | 'loss' | null;
  reason: 'waves' | 'lights' | 'time' | null;
  allowed: TowerKind[];
  towers: TowerView[];
  gloom: GloomView[];
  flare: { pot: number; cost: number; charged: boolean; count: number; at: number | null };
  guards: number;
  top: Row[];
  log: LogView[];
  you: {
    id: string;
    gold: number;
    points: number;
    rank: number | null;
    right: number;
    streak: number;
    defeats: number;
    built: number;
    upgraded: number;
    fed: number;
    question: QuestionView | null;
    last: FeedbackView | null;
  } | null;
}

/**
 * Shows each answer's result for a moment before the next question. Keyed by
 * question id, so frequent view updates (four a second in this mode) neither
 * restart nor cancel the timer, and the reveal is matched to the question answered.
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
    const t = setTimeout(() => setFeedback(null), feedback.correct ? 1200 : 2600);
    return () => clearTimeout(t);
  }, [feedback]);
  return { feedback, answered: feedback ? (asked.current.get(feedback.iid) ?? null) : null, dismiss: () => setFeedback(null) };
}

/* --------------------------------- small parts -------------------------------- */

function TowerIcon({ kind, size = 28 }: { kind: TowerKind; size?: number }) {
  return (
    <svg viewBox="-5.5 -5.5 11 11" width={size} height={size} aria-hidden focusable={false} className="shrink-0">
      <TowerShape kind={kind} level={0} />
    </svg>
  );
}

function GloomIcon({ kind, size = 22 }: { kind: GloomKind; size?: number }) {
  const r = kind === 'lord' ? 9 : kind === 'brute' ? 5.4 : 4.6;
  return (
    <svg viewBox={`${-r} ${-r} ${r * 2} ${r * 2}`} width={size} height={size} aria-hidden focusable={false} className="shrink-0">
      <GloomShape kind={kind} />
    </svg>
  );
}

const towerName = (kind: TowerKind) => `${TOWERS[kind].name} tower`;
const seconds = (ms: number) => `${Math.round(ms / 100) / 10} s`;
const pct = (share: number) => `${Math.round(share * 100)}%`;

function whoIs(room: RoomView, id: string, me: string | null) {
  if (id === me) return 'you';
  return room.players.find((p) => p.id === id)?.name ?? 'a guard who left';
}

/** The next wave, in words: "8 Wisps, 4 Shades and a Gloom Lord". */
function rosterWords(next: NonNullable<LanternGuardView['next']>) {
  const parts = GLOOM_ORDER.filter((k) => next[k] > 0).map((k) => (k === 'lord' && next[k] === 1 ? 'a Gloom Lord' : `${next[k]} ${next[k] === 1 ? GLOOMLINGS[k].name : GLOOMLINGS[k].plural}`));
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '');
}

/** The free spot whose tower would see the most road, worked out once per map and reach. */
const reachCache = new Map<string, number>();
function reachOf(map: GuardMap, spot: number, range: number) {
  const key = `${map.id}:${spot}:${range}`;
  let v = reachCache.get(key);
  if (v === undefined) {
    v = pathInReach(map, map.spots[spot]!, range);
    reachCache.set(key, v);
  }
  return v;
}

function bestFreeSpot(map: GuardMap, towers: TowerView[], range: number): number | null {
  const taken = new Set(towers.map((t) => t.spot));
  let best: number | null = null;
  map.spots.forEach((_, i) => {
    if (taken.has(i)) return;
    if (best === null || reachOf(map, i, range) > reachOf(map, best, range)) best = i;
  });
  return best;
}

function battleLabel(view: LanternGuardView) {
  const lords = view.gloom.filter((g) => g.kind === 'lord').length;
  return `The battle on ${MAPS[view.map]?.name ?? 'the map'}: ${plural(view.gloom.length, 'gloomling')} on the road${lords ? `, including ${plural(lords, 'Gloom Lord')}` : ''}, ${plural(view.towers.length, 'tower')} built, ${view.lights} of ${view.maxLights} lights left.`;
}

/**
 * Says a room event once, when it happens: a wave setting off, a wave held, a
 * Gloom Lord arriving or falling, a flare, the lantern running low. Sounds play
 * on shared screens only. Only changes after the screen appears count, so
 * opening the big screen mid-game is not a burst of old news; the wave under
 * way is still said, so a screen reader user knows where the game is.
 */
function useRoomNews(view: LanternGuardView, shared: boolean) {
  const ready = useReady();
  const waveWords = view.wave > 0 ? `Wave ${view.wave}${view.waves ? ` of ${view.waves}` : ''} is marching.` : null;
  useAnnounce(waveWords, `wave${view.wave}`);
  useSfx('event', `wave${view.wave}`, ready && shared && view.wave > 0);
  const lord = newestLord(view.gloom);
  useAnnounce(ready && lord ? 'A Gloom Lord is on the road!' : null, lord?.id ?? null);
  useSfx('alarm', lord?.id ?? null, ready && shared && lord !== null);
  useAnnounce(ready && view.lordsDown ? 'The Gloom Lord is down!' : null, view.lordsDown);
  useSfx('jackpot', view.lordsDown, ready && shared && view.lordsDown > 0);
  useAnnounce(ready && view.held ? `Wave over: ${plural(view.held, 'wave')} held so far.` : null, view.held);
  useSfx('shield', view.held, ready && shared && view.held > 0);
  useAnnounce(ready && view.flare.at !== null ? 'The Great Lantern flared!' : null, view.flare.at);
  useSfx('powerUp', view.flare.at, ready && shared && view.flare.at !== null);
  // The lantern running low is said at each quarter and for each of the last three lights.
  const quarter = Math.ceil((view.lights / Math.max(1, view.maxLights)) * 4);
  useAnnounce(ready && view.lights < view.maxLights ? `${plural(view.lights, 'light')} left on the Great Lantern.` : null, quarter + (view.lights <= 3 ? view.lights * 10 : 0));
  const hurtKey = useThrottledKey(view.lights, 1500);
  useSfx('hurt', hurtKey, ready && shared && view.lights < view.maxLights);
}

/** False while a screen first draws, true from then on: news hooks skip what was already true when it appeared. */
function useReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

/** The Gloom Lord that set off last, while it is still on the road. */
function newestLord(gloom: GloomView[]) {
  return gloom.filter((g) => g.kind === 'lord').reduce<GloomView | null>((a, b) => (!a || b.id > a.id ? b : a), null);
}

/** A key that follows `value` but changes at most once every `ms`, so a burst of changes plays one sound. */
function useThrottledKey(value: unknown, ms: number) {
  const [key, setKey] = useState(0);
  const last = useRef({ value, at: 0 });
  useEffect(() => {
    if (Object.is(value, last.current.value)) return;
    last.current.value = value;
    const now = Date.now();
    if (now - last.current.at < ms) return;
    last.current.at = now;
    setKey((k) => k + 1);
  }, [value, ms]);
  return key;
}

/* ---------------------------------- the phone --------------------------------- */

function StatusRow({ view, gameNow }: { view: LanternGuardView; gameNow: () => number }) {
  const you = view.you!;
  return (
    <div className="flex items-center justify-between gap-1.5 text-sm min-[400px]:text-base">
      <Pill tone="lantern" className="px-2.5! py-0.5! text-base min-[400px]:text-lg">
        <Coins className="size-[1em]" aria-hidden /> {formatNumber(you.gold)}
        <span className="sr-only"> gold</span>
      </Pill>
      <span className="flex min-w-0 items-center gap-1 font-display font-bold tabular">
        <LanternGlyph />
        {view.lights}/{view.maxLights}
        <span className="sr-only"> lights left</span>
      </span>
      <WaveLine view={view} gameNow={gameNow} />
    </div>
  );
}

function LanternGlyph() {
  return (
    <svg viewBox="0 0 12 16" width={14} height={18} aria-hidden focusable={false} className="shrink-0">
      <rect x={1.6} y={3} width={8.8} height={10} rx={3.4} fill="#ffcf5c" stroke="var(--ink)" strokeWidth={1} />
      <path d="M3.5 1.5H8.5L9.2 3H2.8Z" fill="#5b2a1c" stroke="var(--ink)" strokeWidth={0.9} />
    </svg>
  );
}

function WaveLine({ view, gameNow }: { view: LanternGuardView; gameNow: () => number }) {
  const of = view.waves ? `/${view.waves}` : '';
  return (
    <span className="flex min-w-0 items-center gap-1.5 truncate font-display font-bold">
      {view.wave > 0 ? (
        <span className="tabular">
          Wave {view.wave}
          {of}
        </span>
      ) : null}
      {view.nextWaveAt !== null ? (
        <Pill className="px-2! py-0! text-sm">
          {view.wave > 0 ? 'Next' : 'Wave 1 in'} <Countdown until={view.nextWaveAt} gameNow={gameNow} label={view.wave > 0 ? 'Next wave in' : 'First wave in'} />
        </Pill>
      ) : view.wave > 0 ? (
        <Pill tone="ember" className="px-2! py-0! text-sm">
          Last wave
        </Pill>
      ) : null}
    </span>
  );
}

/** A chunky choice in the build sheet: the tower, its price, and what it does or why it cannot be built yet. */
function BuildChoice({ kind, gold, busy, onBuild, onPreview }: { kind: TowerKind; gold: number; busy: boolean; onBuild: () => void; onPreview: () => void }) {
  const t = TOWERS[kind];
  const short = t.cost - gold;
  return (
    <button
      type="button"
      onClick={onBuild}
      onFocus={onPreview}
      onPointerEnter={onPreview}
      disabled={busy || short > 0}
      aria-label={`${towerName(kind)}, ${t.cost} gold. ${short > 0 ? `You need ${short} more gold.` : t.blurb}`}
      className={`flex min-h-[3.5rem] min-w-0 items-center gap-2 rounded-[16px] border-[3px] px-2 py-1.5 text-left transition-[translate,box-shadow] ${short > 0 ? 'border-white/25 bg-[rgb(17_10_62/0.5)] text-text-2' : 'border-ink bg-raised text-text shadow-[0_3px_0_var(--ink)] active:translate-y-0.5 active:shadow-[0_1px_0_var(--ink)]'} disabled:cursor-not-allowed`}
    >
      <TowerIcon kind={kind} size={30} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-baseline justify-between gap-1 font-display font-extrabold">
          <span className="truncate">{t.name}</span>
          <span className="flex shrink-0 items-center gap-0.5 text-sm font-bold tabular">
            <Coins className="size-3.5" aria-hidden />
            {t.cost}
          </span>
        </span>
        <span className="block text-xs font-semibold">{short > 0 ? `Need ${short} more gold` : t.blurb}</span>
      </span>
    </button>
  );
}

function SheetHeader({ title, onPrev, onNext, onClose, headingRef }: { title: ReactNode; onPrev?: () => void; onNext?: () => void; onClose: () => void; headingRef: RefObject<HTMLHeadingElement | null> }) {
  return (
    <div className="flex items-center gap-1.5" data-lg-keep="">
      <h3 ref={headingRef} tabIndex={-1} className="min-w-0 flex-1 truncate font-display text-lg leading-tight font-extrabold outline-none">
        {title}
      </h3>
      {onPrev ? (
        <button type="button" onClick={onPrev} className="grid size-11 shrink-0 place-items-center rounded-[12px] hover:bg-white/10" aria-label="Previous spot">
          <ChevronLeft className="size-6" aria-hidden />
        </button>
      ) : null}
      {onNext ? (
        <button type="button" onClick={onNext} className="grid size-11 shrink-0 place-items-center rounded-[12px] hover:bg-white/10" aria-label="Next spot">
          <ChevronRight className="size-6" aria-hidden />
        </button>
      ) : null}
      <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-[12px] hover:bg-white/10" aria-label="Close">
        <X className="size-6" aria-hidden />
      </button>
    </div>
  );
}

export function LanternGuardPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<LanternGuardView>) {
  const you = view.you;
  const flow = useAnswerFlow(you?.last, you?.question);
  const [sel, setSel] = useState<Selection>(null);
  const [preview, setPreview] = useState<TowerKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [said, setSaid] = useState<{ text: string; n: number } | null>(null);
  // What you just did stays written under the map for a moment.
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (!said) return;
    setFresh(true);
    const t = setTimeout(() => setFresh(false), 3000);
    return () => clearTimeout(t);
  }, [said]);
  const heading = useRef<HTMLHeadingElement>(null);
  const hintButton = useRef<HTMLButtonElement>(null);
  const map = MAPS[view.map] ?? MAPS.river;
  useRoomNews(view, useSharedSounds());
  useAnnounce(said?.text, said?.n);
  const selKey = sel ? (sel.kind === 'spot' ? `s${sel.spot}` : 'lantern') : null;
  // Choosing something moves keyboard and screen reader focus to its sheet (unless it was chosen with the sheet's own Previous and Next);
  // closing the sheet puts focus back on the first shortcut.
  const opened = useRef(false);
  useEffect(() => {
    const active = document.activeElement;
    const keep = active instanceof Element && active.isConnected && active.closest('[data-lg-keep]') !== null;
    if (selKey && !keep) heading.current?.focus({ preventScroll: true });
    if (!selKey && opened.current && (!active || active === document.body)) hintButton.current?.focus({ preventScroll: true });
    opened.current = Boolean(selKey);
    setNote(null);
    setPreview(null);
  }, [selKey]);
  if (!you) return <p className="font-semibold text-text-2">Watching the battle.</p>;

  const allowed = view.allowed;
  const cheapest = allowed.reduce((a, b) => (TOWERS[b].cost < TOWERS[a].cost ? b : a));
  const best = bestFreeSpot(map, view.towers, towerStats(cheapest, 1).range);
  const tower = sel?.kind === 'spot' ? (view.towers.find((t) => t.spot === sel.spot) ?? null) : null;
  const reach = sel?.kind === 'spot' ? (tower ? towerStats(tower.kind, tower.level).range : towerStats(preview ?? cheapest, 1).range) : null;
  const step = (d: number) => {
    const n = map.spots.length;
    const from = sel?.kind === 'spot' ? sel.spot : (best ?? 0);
    setSel({ kind: 'spot', spot: (from + d + n) % n });
  };
  const send = async (action: object, done: () => void) => {
    setBusy(true);
    const ack = await act(action);
    setBusy(false);
    if (!ack.ok) return setNote(ack.error.message);
    setNote(null);
    done();
  };
  const build = (kind: TowerKind) => {
    if (sel?.kind !== 'spot') return;
    void send({ type: 'build', spot: sel.spot, tower: kind }, () => {
      playSfx('build');
      setSaid({ text: `You built a ${towerName(kind)}.`, n: Date.now() });
      setSel(null);
    });
  };
  const upgrade = (t: TowerView) =>
    void send({ type: 'upgrade', spot: t.spot, level: t.level + 1 }, () => {
      playSfx('upgrade');
      setSaid({ text: `You upgraded the ${towerName(t.kind)} to level ${t.level + 1}.`, n: Date.now() });
      setSel(null);
    });
  const feed = () =>
    void send({ type: 'feed' }, () => {
      playSfx('coin');
      setSaid({ text: 'You fed the Great Lantern.', n: Date.now() });
    });
  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };
  const off = paused || view.result !== null;

  let sheet: ReactNode;
  if (sel?.kind === 'spot' && !tower) {
    sheet = (
      <>
        <SheetHeader headingRef={heading} title={`Spot ${sel.spot + 1} is free`} onPrev={() => step(-1)} onNext={() => step(1)} onClose={() => setSel(null)} />
        <div className="grid grid-cols-2 gap-2">
          {allowed.map((k) => (
            <BuildChoice key={k} kind={k} gold={you.gold} busy={busy || off} onBuild={() => build(k)} onPreview={() => setPreview(k)} />
          ))}
        </div>
      </>
    );
  } else if (tower) {
    const st = towerStats(tower.kind, tower.level);
    const cost = upgradeCost(tower.kind, tower.level);
    const next = cost !== null ? towerStats(tower.kind, tower.level + 1) : null;
    const credit = tower.ups?.length ? `, upgraded by ${[...new Set(tower.ups.map((id) => whoIs(room, id, you.id)))].join(' and ')}` : '';
    sheet = (
      <>
        <SheetHeader headingRef={heading} title={`${towerName(tower.kind)}, level ${tower.level}`} onPrev={() => step(-1)} onNext={() => step(1)} onClose={() => setSel(null)} />
        <p className="text-sm leading-snug font-semibold text-text-2">
          Built by {whoIs(room, tower.by, you.id)}
          {credit}. Hits {st.damage} every {seconds(st.every)}, reach {Math.round(st.range)}
          {st.splash ? `, bursts over ${st.splash}` : ''}
          {st.slow ? `, slows by ${pct(st.slow.by)}` : ''}. {plural(tower.defeats, 'gloomling')} defeated.
        </p>
        {cost !== null && next ? (
          <Button variant="primary" size="lg" className="w-full max-sm:h-11" icon={<ArrowBigUp className="size-5" aria-hidden />} disabled={busy || off || you.gold < cost} onClick={() => upgrade(tower)}>
            {you.gold < cost ? `Level ${tower.level + 1}: need ${cost - you.gold} more gold` : `Upgrade to level ${tower.level + 1} for ${cost} gold`}
          </Button>
        ) : (
          <p className="font-display font-bold text-lantern">Top level. This tower is as strong as it gets.</p>
        )}
        {cost !== null && next ? <p className="text-xs font-semibold text-text-2">Level {tower.level + 1} hits {next.damage} with reach {Math.round(next.range)}.</p> : null}
      </>
    );
  } else if (sel?.kind === 'lantern') {
    const { pot, cost, charged } = view.flare;
    const gift = Math.min(FLARE_GIFT, you.gold, cost - pot);
    sheet = (
      <>
        <SheetHeader headingRef={heading} title={`The Great Lantern: ${view.lights} of ${view.maxLights} lights`} onClose={() => setSel(null)} />
        <FlareMeter flare={view.flare} />
        <p className="text-sm leading-snug font-semibold text-text-2">
          {charged
            ? `Full! It flares when ${FLARE_CROWD} gloomlings or a Gloom Lord are on the road.`
            : `Everyone can feed it. When it is full it flares, burning away ${pct(FLARE_BURN)} of every gloomling’s health (${pct(FLARE_BURN_BOSS)} of a Gloom Lord’s).`}
        </p>
        <Button variant="primary" size="lg" className="w-full max-sm:h-11" icon={<Coins className="size-5" aria-hidden />} disabled={busy || off || charged || gift <= 0} onClick={feed}>
          {charged ? 'The lantern is full' : gift <= 0 ? 'You need some gold' : `Give ${gift} gold`}
        </Button>
      </>
    );
  } else {
    sheet = (
      <>
        <p className={`text-sm leading-snug font-bold ${fresh ? 'text-glim' : 'text-text-2'}`}>{fresh && said ? said.text : 'Tap a spot on the map to build a tower or upgrade one.'}</p>
        <div className="grid grid-cols-2 gap-2">
          {best !== null ? (
            <Button ref={hintButton} size="md" variant="secondary" className="h-11 px-2" icon={<Star className="size-4 fill-lantern text-ink" aria-hidden />} onClick={() => setSel({ kind: 'spot', spot: best })}>
              Best spot
            </Button>
          ) : (
            <Button ref={hintButton} size="md" variant="secondary" className="h-11 px-2" icon={<ArrowBigUp className="size-4" aria-hidden />} onClick={() => step(0)}>
              Upgrade
            </Button>
          )}
          <Button size="md" variant="secondary" className="h-11 px-2" icon={<Sparkles className="size-4" aria-hidden />} onClick={() => setSel({ kind: 'lantern' })}>
            Lantern {Math.min(100, Math.round((view.flare.pot / Math.max(1, view.flare.cost)) * 100))}%
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 sm:gap-3">
      <style>{FIELD_CSS}</style>
      <StatusRow view={view} gameNow={gameNow} />
      <div className="overflow-hidden rounded-[16px] border-[3px] border-ink shadow-[0_3px_0_var(--ink)]">
        <Battlefield
          mapId={view.map}
          tick={view.tick}
          towers={view.towers}
          gloom={view.gloom}
          lights={view.lights}
          maxLights={view.maxLights}
          flareAt={view.flare.at}
          gameNow={gameNow}
          compact
          mine={you.id}
          selection={sel}
          reach={reach}
          hint={sel ? null : best}
          onPick={setSel}
          label={battleLabel(view)}
        />
      </div>
      <StagePanel as="section" className="flex flex-col gap-2 px-2.5 py-2" label="Build and upgrade">
        <div className="flex flex-col gap-2">{sheet}</div>
        {note ? (
          <p className="text-sm font-bold text-ember" role="alert">
            {note}
          </p>
        ) : null}
      </StagePanel>

      {flow.feedback ? (
        <div className="flex flex-col gap-3">
          <ResultBanner key={flow.feedback.iid} correct={flow.feedback.correct} partial={flow.feedback.partial} text={flow.feedback.text} />
          {!flow.feedback.correct && flow.answered ? <RevealAnswer q={flow.answered.q} reveal={flow.feedback.reveal} compact /> : null}
          {!flow.feedback.correct ? <Explanation text={flow.feedback.explanation} /> : null}
          <button type="button" onClick={flow.dismiss} className="self-center rounded-[12px] px-4 py-2 font-bold text-text-2 hover:bg-white/10">
            Next question
          </button>
        </div>
      ) : you.question ? (
        <div className="flex flex-col gap-3">
          <QuestionCard q={you.question.q} />
          <AnswerInput key={you.question.iid} q={you.question.q} onSubmit={submit} disabled={off} compact />
        </div>
      ) : null}
      <p className="text-center text-sm font-semibold text-text-2">
        {formatNumber(you.points)} guard points{you.rank && view.guards > 1 ? `, ${ordinal(you.rank)} of ${view.guards}` : ''}
        {you.streak >= 3 ? ` · streak ${you.streak}: +5 gold a right answer` : ''}
      </p>
    </div>
  );
}

/* --------------------------------- the projector ------------------------------- */

function FlareMeter({ flare, big = false }: { flare: LanternGuardView['flare']; big?: boolean }) {
  const pctFull = Math.max(0, Math.min(100, (flare.pot / Math.max(1, flare.cost)) * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-baseline justify-between gap-2 font-display font-extrabold ${big ? 'text-[clamp(1rem,min(1.5vw,2.6vh),1.6rem)]' : 'text-sm'}`}>
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-[1em]" aria-hidden /> {flare.charged ? 'Flare ready!' : 'Flare'}
        </span>
        <span className="tabular">
          {formatNumber(flare.pot)} / {formatNumber(flare.cost)} gold
        </span>
      </div>
      <div
        className={`relative overflow-hidden rounded-full border-ink bg-[rgb(17_10_62/0.7)] ${big ? 'h-[clamp(0.9rem,1.8vh,1.25rem)] border-[3px]' : 'h-3 border-2'}`}
        role="meter"
        aria-label="Gold in the Great Lantern"
        aria-valuenow={flare.pot}
        aria-valuemin={0}
        aria-valuemax={flare.cost}
      >
        <div className={`absolute inset-0 rounded-full transition-transform duration-300 ${flare.charged ? 'bg-glim' : 'bg-lantern'}`} style={{ transform: `translateX(${pctFull - 100}%)` }} />
      </div>
    </div>
  );
}

function logLine(e: LogView): { icon: ReactNode; text: string; tone: 'calm' | 'good' | 'bad' } {
  switch (e.kind) {
    case 'build':
      return { icon: <TowerIcon kind={e.tower} size={26} />, text: `${e.name} built a ${TOWERS[e.tower].name}`, tone: 'calm' };
    case 'upgrade':
      return { icon: <ArrowBigUp className="size-[1.2em] shrink-0 text-glim" aria-hidden />, text: `${e.name} made a ${TOWERS[e.tower].name} level ${e.level}`, tone: 'calm' };
    case 'feed':
      return { icon: <Coins className="size-[1.2em] shrink-0 text-lantern" aria-hidden />, text: `${e.name} fed the lantern ${e.gold} gold`, tone: 'calm' };
    case 'held':
      return e.lost
        ? { icon: <Shield className="size-[1.2em] shrink-0 text-text-2" aria-hidden />, text: `Wave ${e.wave} is over: ${plural(e.lost, 'light')} lost`, tone: 'calm' }
        : { icon: <Shield className="size-[1.2em] shrink-0 text-glim" aria-hidden />, text: `Wave ${e.wave} held without a scratch!`, tone: 'good' };
    case 'lord':
      return { icon: <Crown className="size-[1.2em] shrink-0 text-lantern" aria-hidden />, text: e.name ? `${e.name}’s tower brought down the Gloom Lord!` : 'The Gloom Lord is down!', tone: 'good' };
    case 'flare':
      return { icon: <Sparkles className="size-[1.2em] shrink-0 text-lantern" aria-hidden />, text: `The Great Lantern flared!${e.burned ? ` ${plural(e.burned, 'gloomling')} burned away.` : ''}`, tone: 'good' };
    case 'leak':
      return { icon: <ShieldAlert className="size-[1.2em] shrink-0 text-ember" aria-hidden />, text: `A ${GLOOMLINGS[e.gloom].name} got through: ${plural(e.lights, 'light')} out`, tone: 'bad' };
  }
}

/** "Wave 3 of 10", what comes next and when, and a warning when a Gloom Lord is on the way. */
function WavePanel({ view, gameNow }: { view: LanternGuardView; gameNow: () => number }) {
  const small = 'text-[clamp(0.95rem,min(1.3vw,2.3vh),1.4rem)]';
  const lordNext = view.next && view.next.lord > 0;
  return (
    <StagePanel className="flex flex-col gap-[clamp(0.2rem,0.6vh,0.5rem)] px-4 py-[clamp(0.5rem,1.2vh,0.9rem)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-display text-[clamp(1.6rem,min(2.6vw,4.6vh),3rem)] leading-none font-extrabold whitespace-nowrap">{view.wave > 0 ? `Wave ${view.wave}${view.waves ? ` of ${view.waves}` : ''}` : 'Get ready'}</span>
        {view.held ? <span className={`font-bold whitespace-nowrap text-text-2 ${small}`}>{plural(view.held, 'wave')} held</span> : null}
      </div>
      {view.nextWaveAt !== null && view.next ? (
        <>
          <div className={`flex flex-wrap items-center gap-x-2 font-semibold ${small}`}>
            <span>
              {view.wave > 0 ? 'Next wave in' : 'Wave 1 in'} <Countdown until={view.nextWaveAt} gameNow={gameNow} label={view.wave > 0 ? 'Next wave in' : 'First wave in'} />
            </span>
            <span className="sr-only">Coming: {rosterWords(view.next)}.</span>
            <span className="flex items-center gap-1" aria-hidden>
              {GLOOM_ORDER.filter((k) => view.next![k] > 0).map((k) => (
                <span key={k} className="flex items-center gap-0.5 font-display font-bold tabular">
                  <GloomIcon kind={k} size={k === 'lord' ? 28 : 22} />
                  {view.next![k]}
                </span>
              ))}
            </span>
          </div>
          {lordNext ? (
            <Pill tone="ember" className={`self-start ${small}`}>
              <Crown className="size-[1em]" aria-hidden /> Gloom Lord incoming!
            </Pill>
          ) : null}
        </>
      ) : (
        <span className={`font-semibold text-text-2 ${small}`}>{view.wave > 0 ? 'The last wave is on the road. Hold on!' : ''}</span>
      )}
      <div className="mt-[clamp(0.2rem,0.6vh,0.5rem)] border-t border-white/12 pt-[clamp(0.3rem,0.8vh,0.6rem)]">
        <FlareMeter flare={view.flare} big />
      </div>
    </StagePanel>
  );
}

/** A big health bar for every Gloom Lord on the road. */
function BossBars({ gloom }: { gloom: GloomView[] }) {
  const lords = gloom.filter((g) => g.kind === 'lord').slice(0, 2);
  if (!lords.length) return null;
  return (
    <div className="pointer-events-none absolute inset-x-[8%] top-[3%] flex flex-col gap-1.5">
      {lords.map((g) => (
        <div key={g.id} className={`flex items-center gap-3 rounded-[16px] border-2 border-ember px-3 py-1 ${NIGHT}`}>
          <Crown className="size-[clamp(1.2rem,2.4vh,2rem)] shrink-0 text-lantern" aria-hidden />
          <span className="shrink-0 font-display text-[clamp(1rem,min(1.6vw,2.8vh),1.7rem)] font-extrabold">Gloom Lord</span>
          <div className="relative h-[clamp(0.9rem,2vh,1.4rem)] flex-1 overflow-hidden rounded-full border-2 border-ink bg-[rgb(17_10_62/0.8)]" role="meter" aria-label="Gloom Lord health" aria-valuenow={g.hp} aria-valuemin={0} aria-valuemax={g.max}>
            <div className="absolute inset-0 rounded-full bg-ember transition-transform duration-200" style={{ transform: `translateX(${(g.hp / Math.max(1, g.max)) * 100 - 100}%)` }} />
          </div>
          <span className="shrink-0 font-display text-[clamp(1rem,min(1.6vw,2.8vh),1.7rem)] font-extrabold tabular">
            {formatNumber(g.hp)} / {formatNumber(g.max)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** "Wave 4" across the battle as each wave sets off, and a warning as each Gloom Lord appears. */
function Banners({ view }: { view: LanternGuardView }) {
  const lord = newestLord(view.gloom);
  const fresh = lord && lord.p < 0.12 ? lord : null;
  const last = view.waves !== null && view.wave === view.waves;
  return (
    <>
      {view.wave > 0 ? (
        <div key={`w${view.wave}`} className="pointer-events-none absolute inset-0 grid place-items-center" style={{ animation: 'lg-banner 2600ms ease-out forwards' }} aria-hidden>
          <div className="flex flex-col items-center">
            <span className={`font-display text-[clamp(2.5rem,min(6vw,10vh),6rem)] leading-none font-extrabold ${SIGN}`}>Wave {view.wave}</span>
            {last ? <span className={`font-display text-[clamp(1.4rem,min(3vw,5vh),3rem)] font-extrabold ${SIGN}`}>The last wave!</span> : null}
          </div>
        </div>
      ) : null}
      {fresh ? (
        <div key={`l${fresh.id}`} className="pointer-events-none absolute inset-0 grid place-items-center" style={{ animation: 'lg-banner 2600ms ease-out forwards' }} aria-hidden>
          <span className={`flex items-center gap-3 font-display text-[clamp(2rem,min(5vw,8vh),5rem)] leading-none font-extrabold text-ember ${SIGN}`}>
            <Crown className="size-[1em] text-lantern" /> Gloom Lord!
          </span>
        </div>
      ) : null}
    </>
  );
}

const HOST_GLIM = 'size-[clamp(1.75rem,3.8vh,3rem)]';

export function LanternGuardHost({ view, gameNow, room }: ModeScreenProps<LanternGuardView>) {
  useRoomNews(view, useSharedSounds());
  const text = 'text-[clamp(1rem,min(1.5vw,2.6vh),1.6rem)]';
  const heading = `mb-[clamp(0.2rem,0.8vh,0.5rem)] font-display text-[clamp(1.2rem,min(1.9vw,3.4vh),2.2rem)] leading-tight font-extrabold ${SIGN}`;
  const lightSize = view.maxLights > 24 ? 16 : 24;
  return (
    <div className="mx-auto flex w-full max-w-[120rem] flex-1 flex-col gap-[clamp(0.5rem,1.4vh,1rem)]">
      <style>{FIELD_CSS + BANNER_CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className={`font-display text-[clamp(2rem,min(3.4vw,6vh),4.25rem)] leading-none font-extrabold ${SIGN}`}>Lantern Guard</h2>
        <div className={`flex min-w-0 items-center gap-3 rounded-full border border-white/12 px-4 py-1.5 ${NIGHT}`}>
          <span className="font-display text-[clamp(1rem,min(1.5vw,2.6vh),1.6rem)] font-extrabold whitespace-nowrap">Great Lantern</span>
          <span className="max-lg:hidden">
            <LightsRow lights={view.lights} max={view.maxLights} size={lightSize} />
          </span>
          <span className={`font-display text-[clamp(1.2rem,min(2vw,3.4vh),2.2rem)] font-extrabold whitespace-nowrap tabular ${view.lights <= Math.ceil(view.maxLights / 4) ? 'text-ember' : ''}`}>
            {view.lights} / {view.maxLights}
            <span className="sr-only"> lights</span>
          </span>
        </div>
        {view.endsAt !== null ? (
          <Pill className="px-5 py-1.5 text-[clamp(1.1rem,1.8vw,2rem)]">
            <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </Pill>
        ) : null}
      </div>
      <div className="grid grid-cols-1 items-start gap-[clamp(0.75rem,1.4vw,1.5rem)] lg:grid-cols-[minmax(0,1fr)_clamp(17rem,26vw,30rem)]">
        <section aria-label="The battle" className="min-w-0">
          <div className="relative mx-auto overflow-hidden rounded-[22px] border-[3px] border-ink shadow-[0_5px_0_var(--ink)]" style={{ width: 'min(100%, calc((100dvh - 11.5rem) * 16 / 9))' } as CSSProperties}>
            <Battlefield mapId={view.map} tick={view.tick} towers={view.towers} gloom={view.gloom} lights={view.lights} maxLights={view.maxLights} flareAt={view.flare.at} gameNow={gameNow} label={battleLabel(view)} />
            <BossBars gloom={view.gloom} />
            <Banners view={view} />
          </div>
        </section>
        <aside className="flex min-w-0 flex-col gap-[clamp(0.5rem,1.3vh,1rem)]" aria-label="The guard">
          <WavePanel view={view} gameNow={gameNow} />
          <section aria-labelledby="lg-top">
            <h3 id="lg-top" className={heading}>
              Top guards
            </h3>
            {view.top.some((r) => r.points > 0) ? (
              <ol className={`flex flex-col gap-1 leading-tight ${text}`} style={{ '--lb-rank': 'clamp(1.75rem, 3.8vh, 3rem)' } as CSSProperties}>
                {view.top.slice(0, 5).map((r, i) => (
                  <li key={r.playerId} className={`flex items-center gap-2.5 rounded-[16px] border border-white/12 px-2.5 py-0.5 ${NIGHT} ${i === 4 ? '[@media(max-height:860px)]:hidden' : ''}`}>
                    <RankBadge rank={r.rank} big />
                    <PlayerGlim avatar={avatarOf(room.players, r.playerId)} seed={r.playerId} size={48} className={`${HOST_GLIM} shrink-0`} />
                    <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
                    <span className="font-display text-[1.2em] font-extrabold tabular">{formatNumber(r.points)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={`font-semibold text-text-2 ${text}`}>Answer questions to earn gold, then build towers beside the road.</p>
            )}
          </section>
          <section aria-labelledby="lg-log">
            <h3 id="lg-log" className={heading}>
              On the road
            </h3>
            {view.log.length ? (
              <ul className="flex flex-col gap-1 text-[clamp(0.95rem,min(1.35vw,2.4vh),1.5rem)] leading-tight">
                {view.log.slice(0, 4).map((e, i) => {
                  const line = logLine(e);
                  return (
                    <li key={e.seq} className={`flex min-h-[clamp(2rem,4.4vh,3.25rem)] items-center gap-2.5 rounded-[16px] border px-2.5 py-0.5 ${NIGHT} ${line.tone === 'bad' ? 'border-ember' : line.tone === 'good' ? 'border-glim' : 'border-white/12'} ${i === 3 ? '[@media(max-height:960px)]:hidden' : ''}`} style={{ animation: 'rise-fade 300ms var(--ease-out) both' }}>
                      {line.icon}
                      <span className="line-clamp-2 min-w-0 flex-1 font-semibold">{line.text}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={`font-semibold text-text-2 ${text}`}>
                <Hammer className="mr-1 inline size-[1em]" aria-hidden />
                The first wave is on its way. Build towers to meet it.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

const BANNER_CSS = `
@keyframes lg-banner { 0% { opacity: 0; transform: scale(0.8) } 12% { opacity: 1; transform: scale(1.04) } 20% { transform: scale(1) } 75% { opacity: 1 } 100% { opacity: 0 } }
`;
