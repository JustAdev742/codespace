import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Coins, Gem, Hammer, Landmark, Map as MapIcon, Pickaxe, ShieldCheck, Sparkles, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { Answer } from '@ludora/shared';
import { EVENT_INFO, FIND_INFO, type FindKind, type GearId, type GoldEventId, type OddsRow } from '@ludora/engine/gold-rush';
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
import { GoldFieldScene, GoldRushScene, lookOf, type FieldMiner, type ShaftFind } from './gold-rush-scene.ts';

/*
 * Gold Rush screens. The 3D mine is the picture; everything you do is an
 * ordinary button beside it: Dig, Bank, Gear, and the question. With 3D off
 * a plain depth gauge stands in for the mine.
 */

/* ---------------------------------- types --------------------------------- */

interface Find {
  seq: number;
  at: number;
  kind: FindKind;
  level: number;
  gold: number;
  doubled: boolean;
  from: string | null;
  big: boolean;
}

interface GearRow {
  id: GearId;
  label: string;
  level: number;
  max: number;
  cost: number | null;
  effect: string | null;
  canBuy: boolean;
}

interface BoardRow {
  playerId: string;
  name: string;
  teamId: string | null;
  banked: number;
  cart: number;
  depth: number;
  rank: number;
  isYou: boolean;
}

interface You {
  banked: number;
  cart: number;
  depth: number;
  digs: number;
  maxDigs: number;
  vein: boolean;
  rank: number | null;
  streak: number;
  bonusEvery: number;
  next: { level: number; caveIn: number; odds: OddsRow[]; average: number };
  gear: GearRow[];
  panBonus: number;
  lastFind: Find | null;
  bankedAt: number;
  lastBank: number;
  notes: { id: number; at: number; text: string; tone: 'good' | 'bad' | 'info' }[];
  question: QuestionView | null;
  last: (FeedbackView & { text?: string }) | null;
}

interface News {
  id: number;
  at: number;
  kind: 'bonanza' | 'nugget' | 'cavein' | 'jump' | 'bank' | 'goal';
  name: string;
  target: string | null;
  gold: number;
  level: number;
}

interface GoldRushView {
  endsAt: number;
  goal: number;
  levels: number;
  claimJumping: boolean;
  event: { id: GoldEventId; endsAt: number } | null;
  nextEventAt: number | null;
  players: number;
  board: BoardRow[];
  teams: { teamId: string; name: string; hue: number; members: number; average: number }[] | null;
  you?: You | null;
  field?: Omit<FieldMiner, 'look'>[];
  news?: News[];
  banked?: number;
  biggest?: { name: string; gold: number; kind: FindKind } | null;
}

/* --------------------------------- helpers -------------------------------- */

const pct = (p: number) => (p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`);
const gold = (n: number) => `${formatNumber(n)} gold`;

const FIND_ICON: Record<FindKind, LucideIcon> = { dust: Sparkles, nugget: Coins, bonanza: Gem, vein: Gem, relic: Sparkles, map: MapIcon, water: Sparkles, cavein: TriangleAlert };

function findLine(f: Find): string {
  switch (f.kind) {
    case 'cavein':
      return f.gold < 0 ? `Cave-in at level ${f.level}! You lost ${gold(-f.gold)} and climbed back to the top.` : `Cave-in at level ${f.level}! Back to the top.`;
    case 'water':
      return `Water at level ${f.level}. Nothing but mud.`;
    case 'map':
      return f.from ? `A map! You jumped ${f.from}'s claim and took ${gold(f.gold)}.` : `A map, but nobody had gold in their cart. ${gold(f.gold)} for your trouble.`;
    case 'vein':
      return `A quartz vein: ${gold(f.gold)}, and your next find is doubled.`;
    case 'relic':
      return `A lucky relic: ${gold(f.gold)} and a free dig.`;
    default:
      return `${FIND_INFO[f.kind].label}${f.doubled ? ' (doubled)' : ''}: ${gold(f.gold)} at level ${f.level}.`;
  }
}

function findSound(f: Find) {
  if (f.kind === 'cavein') return 'bust' as const;
  if (f.kind === 'bonanza' || f.big) return 'jackpot' as const;
  if (f.kind === 'map' && f.from) return 'steal' as const;
  if (f.gold > 0) return 'coin' as const;
  return 'tap' as const;
}

/* ---------------------------------- parts --------------------------------- */

function Stat({ label, value, icon: Icon, tone = 'calm' }: { label: string; value: ReactNode; icon: LucideIcon; tone?: 'calm' | 'gold' | 'warn' }) {
  const colours = tone === 'gold' ? 'bg-lantern text-on-accent' : tone === 'warn' ? 'bg-ember text-on-accent' : 'bg-black/45 text-white';
  return (
    <div className={`flex min-w-0 items-center gap-1.5 rounded-[var(--radius-m)] px-2.5 py-1.5 backdrop-blur-sm ${colours}`}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">{label}:</span>
      <span className="truncate font-display text-lg leading-none font-extrabold tabular">{value}</span>
    </div>
  );
}

/** The depth gauge that stands in for the 3D mine. */
function DepthGauge({ depth, levels, caveIn }: { depth: number; levels: number; caveIn: number }) {
  return (
    <div className="flex h-full flex-col justify-center gap-1 rounded-[var(--radius-l)] bg-[linear-gradient(180deg,#7fae55_0,#7fae55_8%,#8a5a34_8%,#3a2a40_100%)] p-3" aria-label={`Your shaft is ${depth} of ${levels} levels deep. Next dig: ${pct(caveIn)} chance of a cave-in.`} role="img">
      <div className="grid gap-0.5" style={{ gridTemplateRows: `repeat(${levels}, minmax(0, 1fr))` }}>
        {Array.from({ length: levels }, (_, i) => (
          <div key={i} className={`flex items-center justify-between rounded px-2 text-xs font-bold ${i < depth ? 'bg-black/45 text-white' : 'bg-white/10 text-white/50'}`}>
            <span>Level {i + 1}</span>
            {i + 1 === depth ? <Pickaxe className="size-3.5 text-lantern" aria-hidden /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function OddsDialog({ open, onOpenChange, you, event }: { open: boolean; onOpenChange: (v: boolean) => void; you: You; event: GoldEventId | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`What's at level ${you.next.level}?`} description="The chances for your next dig, with your gear and any event worked in. They change as you go deeper.">
      <table className="w-full text-left text-sm">
        <thead className="text-text-2">
          <tr>
            <th className="py-1 font-bold">Find</th>
            <th className="py-1 text-right font-bold">Chance</th>
            <th className="py-1 text-right font-bold">Gold</th>
          </tr>
        </thead>
        <tbody>
          {you.next.odds.map((r) => (
            <tr key={r.kind} className="border-t border-line">
              <td className="py-1.5 font-semibold">
                {FIND_INFO[r.kind].label}
                <span className="block text-xs font-normal text-text-2">{FIND_INFO[r.kind].blurb}</span>
              </td>
              <td className="py-1.5 text-right font-display text-base font-bold tabular">{pct(r.percent)}</td>
              <td className="py-1.5 text-right tabular">{r.kind === 'cavein' ? `−${formatNumber(you.cart)}` : r.gold ? `${formatNumber(r.gold[0])} to ${formatNumber(r.gold[1])}` : r.kind === 'map' ? 'a quarter of a cart' : '0'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm text-text-2">
        An average dig here finds about {gold(you.next.average)}.{you.vein ? ' Your quartz vein doubles the next find (already counted above).' : ''}
        {event ? ` ${EVENT_INFO[event].label} is on: ${EVENT_INFO[event].blurb.toLowerCase()}` : ''}
      </p>
    </Dialog>
  );
}

function GearDialog({ open, onOpenChange, you, onBuy, busy }: { open: boolean; onOpenChange: (v: boolean) => void; you: You; onBuy: (g: GearId) => void; busy: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Gear" description={`Paid for with banked gold. You have ${gold(you.banked)} banked.`}>
      <ul className="flex flex-col gap-2">
        {you.gear.map((g) => (
          <li key={g.id} className="flex items-center gap-3 rounded-[var(--radius-m)] bg-white/[0.06] p-3">
            {g.id === 'props' ? <ShieldCheck className="size-6 shrink-0 text-glim" aria-hidden /> : g.id === 'pick' ? <Hammer className="size-6 shrink-0 text-lantern" aria-hidden /> : <Coins className="size-6 shrink-0 text-lantern" aria-hidden />}
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {g.label} <span className="font-normal text-text-2">{g.max > 1 ? `level ${g.level} of ${g.max}` : g.level ? 'owned' : ''}</span>
              </p>
              <p className="text-sm text-text-2">{g.effect ?? 'You have the best there is.'}</p>
            </div>
            {g.cost !== null ? (
              <Button size="sm" disabled={!g.canBuy || busy} onClick={() => onBuy(g.id)} aria-label={`Buy ${g.label} for ${g.cost} gold`}>
                {formatNumber(g.cost)}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function useFindFlow(find: Find | null | undefined, depthDelay: boolean) {
  // The result line waits for the 3D dig to land, so the words never give the picture away early.
  const [shown, setShown] = useState<Find | null>(null);
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!find || find.seq === seen.current) return;
    const first = seen.current === null;
    seen.current = find.seq;
    if (first) return;
    const t = setTimeout(() => {
      setShown(find);
      playSfx(findSound(find));
    }, depthDelay ? (find.kind === 'cavein' ? 700 : 1350) : 0);
    return () => clearTimeout(t);
  }, [find, depthDelay]);
  return shown;
}

/* --------------------------------- player --------------------------------- */

export function GoldRushPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<GoldRushView>) {
  const you = view.you ?? null;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [oddsOpen, setOddsOpen] = useState(false);
  const [gearOpen, setGearOpen] = useState(false);
  const [threeD, setThreeD] = useState(true);
  const scene = useRef<GoldRushScene | null>(null);
  const me = room.players.find((p) => p.id === room.me.playerId);
  const look = useMemo(() => lookOf(me?.avatar, fallbackArt(room.me.playerId ?? 'me')), [me?.avatar, room.me.playerId]);
  const shown = useFindFlow(you?.lastFind, threeD);
  const shared = useSharedSounds();
  const eventKey = view.event ? `${view.event.id}|${view.event.endsAt}` : null;
  useAnnounce(view.event ? `${EVENT_INFO[view.event.id].label}. ${EVENT_INFO[view.event.id].blurb}` : null, eventKey);
  useSfx('event', eventKey, shared && view.event !== null);
  useAnnounce(shown ? findLine(shown) : null, shown?.seq);

  const state = you ? { depth: you.depth, cart: you.cart, find: you.lastFind as ShaftFind | null, bankedAt: you.bankedAt, lastBank: you.lastBank, event: view.event?.id ?? null } : null;
  useEffect(() => {
    if (state) scene.current?.setState(state);
  });
  const onWorld = useCallback(
    (w: GoldRushScene | null) => {
      scene.current = w;
      setThreeD(Boolean(w));
      if (w && state) w.setState(state);
    },
    // The scene reads the newest state through the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (!you) return <p className="font-semibold text-text-2">Watching the goldfield.</p>;

  const send = async (a: unknown) => {
    setBusy(true);
    const ack = await act(a);
    setBusy(false);
    setNote(ack.ok ? null : ack.error.message);
    return ack.ok;
  };
  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };
  const dig = () => {
    playSfx('hit');
    void send({ type: 'dig' });
  };
  const bank = () => {
    playSfx('purchase');
    void send({ type: 'bank' });
  };
  const left = view.endsAt - gameNow();
  const risky = you.next.caveIn >= 20;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
      <section className="flex flex-col gap-2" aria-label="Your mine">
        <div className="relative">
          <Stage3D<GoldRushScene>
            label={`Your mine: your Glim is ${you.depth === 0 ? 'at the top of the shaft' : `digging at level ${you.depth}`}, with ${gold(you.cart)} in the cart.`}
            create={(env) => new GoldRushScene(env, look, view.levels)}
            onWorld={onWorld}
            className="h-[36vh] min-h-[220px] rounded-[var(--radius-l)] sm:h-[42vh] lg:h-[60vh]"
            fallback={<DepthGauge depth={you.depth} levels={view.levels} caveIn={you.next.caveIn} />}
          />
          <div className="pointer-events-none absolute top-2 left-2 flex max-w-[calc(100%-3.5rem)] flex-wrap gap-1.5">
            <Stat label="Banked" value={formatNumber(you.banked)} icon={Landmark} tone="gold" />
            <Stat label="In your cart" value={formatNumber(you.cart)} icon={Coins} />
            <Stat label="Level" value={`${you.depth}/${view.levels}`} icon={Pickaxe} />
          </div>
          {view.event ? (
            <div className="pointer-events-none absolute bottom-2 left-2">
              <Pill tone="lantern" className="px-3 py-1 text-sm">
                {EVENT_INFO[view.event.id].label} <Countdown until={view.event.endsAt} gameNow={gameNow} />
              </Pill>
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" variant="primary" onClick={dig} disabled={busy || paused || you.digs <= 0} aria-label={`Dig to level ${you.next.level}. You have ${you.digs} digs.`}>
            <Pickaxe className="size-5" aria-hidden /> Dig
            <span className="ml-1 rounded-full bg-black/20 px-2 font-display tabular">{you.digs}</span>
          </Button>
          <Button size="lg" variant="secondary" onClick={bank} disabled={busy || paused || you.cart <= 0} aria-label={`Bank your cart: ${gold(you.cart)}${you.panBonus ? ' plus 10 percent' : ''}`}>
            <Landmark className="size-5" aria-hidden /> Bank {you.cart > 0 ? formatNumber(you.cart) : ''}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-bold ${risky ? 'bg-ember/20 text-ember' : 'bg-white/[0.08] text-text'}`}>
            <TriangleAlert className="size-4" aria-hidden /> Level {you.next.level}: {pct(you.next.caveIn)} cave-in
          </span>
          <button type="button" onClick={() => setOddsOpen(true)} className="min-h-9 rounded-full px-3 font-bold text-lantern underline-offset-2 hover:underline">
            All the chances
          </button>
          <button type="button" onClick={() => setGearOpen(true)} className="min-h-9 rounded-full px-3 font-bold text-lantern underline-offset-2 hover:underline">
            Gear{you.gear.some((g) => g.canBuy) ? ' (you can buy)' : ''}
          </button>
          {left < 30_000 && you.cart > 0 ? <span className="font-bold text-ember">Bank now: carts do not count at the whistle.</span> : null}
        </div>
        {shown ? (
          <StagePanel className={`flex items-center gap-3 px-4 py-3 ${shown.kind === 'cavein' ? 'border-ember/60' : shown.big ? 'border-lantern/70' : ''}`}>
            {(() => {
              const Icon = FIND_ICON[shown.kind];
              return <Icon className={`size-7 shrink-0 ${shown.kind === 'cavein' ? 'text-ember' : 'text-lantern'}`} aria-hidden />;
            })()}
            <p className="font-bold">{findLine(shown)}</p>
          </StagePanel>
        ) : null}
        {note ? (
          <p className="text-sm font-bold text-ember" role="alert">
            {note}
          </p>
        ) : null}
      </section>
      <section className="flex flex-col gap-3" aria-label="Questions">
        <p className="text-sm font-semibold text-text-2">
          Right answers give digs. {you.streak > 0 ? `${you.streak} in a row: a bonus dig every ${you.bonusEvery}.` : `${you.bonusEvery} in a row earns a bonus dig.`}
        </p>
        {you.last && !you.last.correct && you.question ? (
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
        ) : null}
        {you.notes.length ? (
          <ul className="flex flex-col gap-1 text-sm">
            {you.notes.map((n) => (
              <li key={n.id} className={n.tone === 'bad' ? 'font-bold text-ember' : 'text-text-2'}>
                {n.text}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <OddsDialog open={oddsOpen} onOpenChange={setOddsOpen} you={you} event={view.event?.id ?? null} />
      <GearDialog
        open={gearOpen}
        onOpenChange={setGearOpen}
        you={you}
        busy={busy}
        onBuy={(g) => {
          playSfx('upgrade');
          void send({ type: 'buy', gear: g });
        }}
      />
    </div>
  );
}

/* ---------------------------------- host ---------------------------------- */

function newsLine(n: News): string {
  switch (n.kind) {
    case 'bonanza':
      return `${n.name} hit a Bonanza at level ${n.level}: ${gold(n.gold)}!`;
    case 'nugget':
      return `${n.name} found ${gold(n.gold)} at level ${n.level}.`;
    case 'cavein':
      return `Cave-in! ${n.name} lost ${gold(n.gold)} at level ${n.level}.`;
    case 'jump':
      return `${n.name} jumped ${n.target ?? 'a'} claim for ${gold(n.gold)}.`;
    case 'bank':
      return `${n.name} banked ${gold(n.gold)}.`;
    case 'goal':
      return `${n.name} reached the goal with ${gold(n.gold)}!`;
  }
}

export function GoldRushHost({ view, gameNow, room }: ModeScreenProps<GoldRushView>) {
  const scene = useRef<GoldFieldScene | null>(null);
  const field = useMemo(
    () => (view.field ?? []).map((m) => ({ ...m, look: lookOf(room.players.find((p) => p.id === m.playerId)?.avatar, fallbackArt(m.playerId)) })),
    [view.field, room.players],
  );
  useEffect(() => {
    scene.current?.setMiners(field);
  }, [field]);
  const eventKey = view.event ? `${view.event.id}|${view.event.endsAt}` : null;
  useSfx('event', eventKey, view.event !== null);
  const topNews = view.news?.[0];
  useSfx(topNews?.kind === 'cavein' ? 'bust' : topNews?.kind === 'bonanza' ? 'jackpot' : 'coin', topNews?.id ?? null, Boolean(topNews));
  const rows = view.board.map((r) => ({ playerId: r.playerId, name: r.name, score: r.banked, rank: r.rank, teamId: r.teamId }));

  return (
    <div className="relative mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col items-start gap-1">
          <ModeTitle>Gold Rush</ModeTitle>
          <p className="font-semibold text-text-2">Right answers give digs. Only banked gold counts at the whistle.</p>
        </div>
        <div className="flex items-center gap-2 text-[clamp(1.1rem,1.8vw,2rem)]">
          {view.goal ? <Pill tone="lantern" className="px-5 py-1.5">First to {formatNumber(view.goal)}</Pill> : null}
          <Pill className="px-5 py-1.5 text-[1.15em]">
            <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </Pill>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
        <div className="relative min-h-[50vh]">
          <Stage3D<GoldFieldScene>
            label={`The goldfield: ${view.players} miners digging.`}
            create={(env) => new GoldFieldScene(env, view.levels)}
            onWorld={(w) => {
              scene.current = w;
              w?.setMiners(field);
            }}
            className="absolute inset-0 rounded-[var(--radius-l)]"
            fallback={null}
          />
          {view.event ? (
            <div className="absolute top-3 left-3">
              <Pill tone="lantern" className="px-4 py-1.5 text-[clamp(1rem,1.6vw,1.6rem)]">
                {EVENT_INFO[view.event.id].label}: {EVENT_INFO[view.event.id].blurb} <Countdown until={view.event.endsAt} gameNow={gameNow} />
              </Pill>
            </div>
          ) : null}
          {view.news?.length ? (
            <ul className="absolute bottom-3 left-3 flex max-w-[min(32rem,70%)] flex-col gap-1.5" aria-label="Goldfield news">
              {view.news.slice(0, 3).map((n) => (
                <li key={n.id} className={`rounded-[var(--radius-m)] px-3 py-1.5 font-bold backdrop-blur-sm ${n.kind === 'cavein' ? 'bg-ember/85 text-white' : 'bg-black/55 text-white'}`}>
                  {newsLine(n)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <StagePanel className="flex flex-col gap-3 p-3" as="aside" label="Most gold banked">
          <h3 className="font-display text-xl font-extrabold">Most gold banked</h3>
          {view.teams ? <TeamScores teams={view.teams.map((t) => ({ teamId: t.teamId, name: t.name, hue: t.hue, score: t.average, members: t.members }))} /> : null}
          <Leaderboard rows={rows} players={room.players} teams={room.room.teams} big dense label={(r) => gold(r.score)} />
          {view.biggest ? <p className="text-sm font-semibold text-text-2">Biggest find: {gold(view.biggest.gold)} by {view.biggest.name}.</p> : null}
        </StagePanel>
      </div>
    </div>
  );
}

