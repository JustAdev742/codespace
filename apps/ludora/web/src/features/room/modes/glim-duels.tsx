import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Check, Crown, HeartPulse, Shield, Swords, Zap } from 'lucide-react';
import type { Answer, AnswerReveal, AvatarLite, GlimArt, PublicQuestion, RoomView } from '@ludora/shared';
import type { ModeScreenProps } from './registry.ts';
import type { QuestionView } from '../game/types.ts';
import { AnswerInput, ChoiceTile } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { TimerBar } from '../game/TimerBar.tsx';
import { ChoicesDisplay, ResultBanner, RevealAnswer, answerWords, shortAnswer } from '../game/Reveal.tsx';
import { Leaderboard, TeamScores, type LeaderRow } from '../game/Leaderboard.tsx';
import { Explanation, HudCount, HudScore, IntroScreen, LockedIn, myAvatar } from '../game/parts.tsx';
import { NIGHT, Pill, PlayerGlim, StagePanel, avatarOf, motionOK } from '../game/stage.tsx';
import { useAnnounce } from '../game/announce.tsx';
import { playSfx, useSfx, useSharedSounds, useSoundRole } from '../../../lib/sound/react.tsx';
import type { SfxName } from '../../../lib/sound/sfx.ts';
import { ordinal, plural } from '../../../lib/format.ts';

/*
 * Glim Duels: everyone duels a classmate on the same questions. Right answers
 * hit the rival's Glim at the reveal; hits build charge for a shield, a power
 * strike or a mend. The phone shows your duel; the projector shows every duel.
 *
 * The look (docs/DESIGN.md): the reveal is the orchestrated moment. A beat after
 * the answer shows, each hit lands on a coral plate over the Glim it struck
 * (a shield's block on a blue one), the health grooves drain and a knockout
 * stamps KO on its plate. Powers are solid pieces; the round sits on the blue plate.
 */

type Power = 'shield' | 'strike' | 'mend';
const POWERS: readonly Power[] = ['shield', 'strike', 'mend'];

interface SyncView {
  phase: 'intro' | 'question' | 'reveal' | 'leaderboard' | 'done';
  round: number;
  total: number;
  phaseEndsAt: number | null;
  question: QuestionView | null;
  reveal: AnswerReveal | null;
  explanation: string | null;
  answered: number;
  eligible: number;
  distribution: Record<string, number> | null;
  you: { eligible: boolean; answered: boolean; joinedLate?: boolean; correct: boolean | null; points: number | null; partial: number | null; streak: number } | null;
}

/** One side of a duel. id null is the Shadow Glim; `name` is sent only for a player who has left. */
interface SideView {
  id: string | null;
  health: number;
  charge?: number;
  shield?: true;
  strike?: true;
  answered?: true;
  name?: string;
}

interface HitView {
  dmg: number;
  blocked?: true;
  strike?: true;
  partial?: true;
}

interface Rules {
  health: number;
  big: boolean;
  powers: boolean;
  cost: Record<Power, number>;
  cap: number;
  mend: number;
  /** Smallest and biggest hit. */
  hit: [number, number];
  shadow: { accuracy: number; from: number; to: number };
  clash: boolean;
}

interface StandingRow {
  playerId: string;
  name: string;
  teamId: string | null;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  dealt: number;
  rank: number;
}

interface TeamRow {
  teamId: string;
  name: string;
  hue: number;
  score: number;
  members: number;
}

type Result = 'win' | 'loss' | 'draw';
type How = 'ko' | 'time' | 'forfeit';

interface Base {
  sync: SyncView;
  round: number;
  rounds: number;
  q: number;
  duelLength: number;
  roundOver: boolean;
  rules: Rules;
  teams: TeamRow[] | null;
  kos: number;
}

interface PlayerDuel {
  id: string;
  me: SideView;
  rival: SideView;
  result: Result | null;
  how: How | null;
  hits: { mine: HitView | null; theirs: HitView | null } | null;
  endedNow: boolean;
}

export interface GlimDuelsView extends Base {
  board: { rows: StandingRow[]; you: StandingRow | null };
  duel: PlayerDuel | null;
  next: { rival: { id: string; name: string } | null; shadow: boolean } | null;
  you: { charge: number; points: number; wins: number; draws: number; losses: number; dealt: number; right: number; rank: number | null; used: Power | null } | null;
}

interface HostDuel {
  id: string;
  sides: [SideView, SideView];
  winner?: 0 | 1 | 'draw';
  how?: How;
  hits?: [HitView | null, HitView | null];
  endedNow?: true;
}

export interface GlimDuelsHostView extends Base {
  board: StandingRow[];
  duels: HostDuel[];
  next: [string, string | null][] | null;
  waiting: number;
}

/* ------------------------------- pieces ------------------------------- */

const SHADOW_NAME = 'Shadow Glim';
/** The Shadow Glim: a grey-violet ghost with a sly look, the same everywhere it turns up. */
const SHADOW_ART: GlimArt = { kind: 'glim', body: 'ghost', hue: 258, accentHue: 290, saturation: 22, eyes: 'half', mouth: 'smirk', pattern: 'none', topper: 'none', cheeks: false, brows: 'smug' };
const SHADOW: AvatarLite = { art: SHADOW_ART };

const POWER_NAME: Record<Power, string> = { shield: 'Shield', strike: 'Power strike', mend: 'Mend' };
const POWER_BUTTON: Record<Power, string> = { shield: 'Shield', strike: 'Strike', mend: 'Mend' };
const POWER_ICON: Record<Power, typeof Shield> = { shield: Shield, strike: Swords, mend: HeartPulse };
const POWER_TONE: Record<Power, string> = { shield: 'bg-sky', strike: 'bg-ember', mend: 'bg-glim' };

const charges = (n: number) => `${n} ${n === 1 ? 'charge' : 'charges'}`;

function nameOf(side: SideView, room: RoomView): string {
  if (side.id === null) return SHADOW_NAME;
  return room.players.find((p) => p.id === side.id)?.name ?? side.name ?? 'A player';
}

/** "the Shadow Glim" in the middle of a sentence; a player's own name otherwise. */
function called(side: SideView, room: RoomView): string {
  return side.id === null ? `the ${SHADOW_NAME}` : nameOf(side, room);
}

const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function SideGlim({ side, room, className, pose = 'idle', down = false }: { side: SideView; room: RoomView; className?: string; pose?: 'idle' | 'cheer'; down?: boolean }) {
  return (
    <PlayerGlim
      avatar={side.id === null ? SHADOW : avatarOf(room.players, side.id)}
      seed={side.id ?? 'shadow-glim'}
      size={64}
      pose={pose}
      className={`shrink-0 transition-[filter,opacity] duration-500 ${down ? 'opacity-60 grayscale' : ''} ${className ?? ''}`}
    />
  );
}

/** Health as a bar and, beside it, the number: the colour is never the only cue. */
function HealthBar({ health, max, mirror = false, big = false, label, delay = 0 }: { health: number; max: number; mirror?: boolean; big?: boolean; label: string; delay?: number }) {
  const pct = Math.max(0, Math.min(100, (health / max) * 100));
  const tone = pct > 50 ? 'bg-glim' : pct > 25 ? 'bg-lantern' : 'bg-ember';
  return (
    <div
      className={`relative w-full overflow-hidden rounded-full bg-white/[0.12] ${big ? 'h-[clamp(0.65rem,1.3vh,1rem)]' : 'h-3'}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={health}
    >
      {/* Slides rather than resizes; at a reveal it waits for the hit to land. */}
      <div
        className={`absolute inset-0 rounded-full transition-transform duration-700 ease-[var(--ease-out)] ${tone}`}
        style={{ transform: `translateX(${mirror ? 100 - pct : pct - 100}%)`, transitionDelay: `${delay}ms` }}
      />
    </div>
  );
}

/** Charge as bolts: solid ones are held, hollow ones (the same bolt in outline) are not, so the count never depends on colour. */
function ChargeBolts({ charge, cap, big = false }: { charge: number; cap: number; big?: boolean }) {
  return (
    <span className="inline-flex items-center gap-px" role="img" aria-label={`${charge} of ${cap} charge`}>
      {Array.from({ length: cap }, (_, i) => (
        <Zap key={i} aria-hidden strokeWidth={2.4} className={`${big ? 'size-[clamp(0.85rem,1.6vh,1.25rem)]' : 'size-4'} ${i < charge ? 'fill-lantern text-lantern' : 'text-white/40'}`} />
      ))}
    </span>
  );
}

/** A shield or a ready strike, drawn the same as on the power buttons, and named for screen readers. */
function Ready({ side, big = false }: { side: SideView; big?: boolean }) {
  const icon = big ? 'size-[clamp(1rem,1.9vh,1.5rem)]' : 'size-4';
  const chip = `inline-grid place-items-center rounded-full text-on-accent ${big ? 'p-[3px]' : 'p-0.5'}`;
  return (
    <>
      {side.shield ? (
        <span className={`${chip} bg-sky`} title="Shield up">
          <Shield className={icon} strokeWidth={2.6} aria-hidden />
          <span className="sr-only">Shield up</span>
        </span>
      ) : null}
      {side.strike ? (
        <span className={`${chip} bg-ember`} title="Power strike ready">
          <Swords className={icon} strokeWidth={2.6} aria-hidden />
          <span className="sr-only">Power strike ready</span>
        </span>
      ) : null}
    </>
  );
}

/**
 * The damage a hit did, landing on a coral plate over the Glim it struck; a shield's block on a blue
 * one. The plate pops in on a wrapper, so the animation never takes the plate's slant with it.
 */
function HitMark({ hit, big = false, delay = 0 }: { hit: HitView; big?: boolean; delay?: number }) {
  // On a phone the plate fits across the Glim: a block shows as its shield (the sentence under the result says it in words).
  const text = big ? (hit.blocked ? 'text-[clamp(0.95rem,1.9vh,1.5rem)]' : 'text-[clamp(1.05rem,2.1vh,1.7rem)]') : 'text-base';
  const style: CSSProperties | undefined = motionOK() ? { animation: `pop-in 200ms var(--ease-out) ${delay}ms both` } : undefined;
  return (
    <span className="inline-block" style={style}>
      {hit.blocked ? (
        <span className={`plate lift bg-sky px-[0.5em] whitespace-nowrap text-on-accent ${text}`}>
          <span className="flex items-center gap-1">
            <Shield className="size-[0.95em]" strokeWidth={2.8} aria-hidden />
            <span className={big ? '' : 'sr-only'}>Blocked</span>
          </span>
        </span>
      ) : (
        <span className={`plate lift bg-ember px-[0.5em] whitespace-nowrap text-on-accent tabular ${text}`}>
          <span className="flex items-center gap-0.5">
            {hit.strike ? <Swords className="size-[0.9em]" strokeWidth={2.8} aria-hidden /> : null}
            <span aria-hidden>−</span>
            {hit.dmg}
          </span>
        </span>
      )}
    </span>
  );
}

/** The knockout: KO on a coral plate across the Glim. */
function KoStamp({ big = false, delay = 0 }: { big?: boolean; delay?: number }) {
  return (
    <span className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
      <span className="block" style={motionOK() ? { animation: `pop-in 200ms var(--ease-out) ${delay}ms both` } : undefined}>
        <span className={`plate lift bg-ember text-on-accent ${big ? 'text-[clamp(1.3rem,2.8vh,2.2rem)]' : 'text-2xl'}`}>
          <span>KO</span>
        </span>
      </span>
    </span>
  );
}

/** Plays `name` once, `delay` ms after `key` changes: hits land a beat after the answer is shown. */
function useLaterSfx(name: SfxName | null, key: string, enabled: boolean, delay = 650) {
  const latest = useRef(name);
  latest.current = name;
  useEffect(() => {
    if (!enabled || !latest.current) return;
    const t = window.setTimeout(() => latest.current && playSfx(latest.current), delay);
    return () => window.clearTimeout(t);
  }, [key, enabled, delay]);
}

function healthLabel(name: string, side: SideView, max: number) {
  return `${name}: ${side.health} of ${max} health`;
}

/** What happened in the player's own duel at this reveal, as sentences for the screen and for screen readers. */
function duelLines(d: PlayerDuel, room: RoomView, answered: boolean): { mine: string; theirs: string } {
  const rival = called(d.rival, room);
  const mine = d.hits?.mine;
  const theirs = d.hits?.theirs;
  const mineText = mine
    ? mine.blocked
      ? `${upper(rival)}'s shield blocked your hit.`
      : `You hit ${rival} for ${mine.dmg}${mine.strike ? ' with a power strike' : ''}.`
    : answered
      ? `No hit on ${rival}.`
      : 'No answer, so no hit.';
  const theirText = theirs ? (theirs.blocked ? `Your shield blocked ${rival}'s hit.` : `${upper(rival)} hit you for ${theirs.dmg}${theirs.strike ? ' with a power strike' : ''}.`) : `${upper(rival)} missed.`;
  return { mine: mineText, theirs: theirText };
}

function outcomeText(result: Result, how: How | null, d: { me: SideView; rival: SideView }, room: RoomView): { title: string; line: string } {
  const rival = called(d.rival, room);
  if (how === 'forfeit') return { title: 'Duel won', line: `${upper(rival)} left, so you win the duel.` };
  if (how === 'ko') {
    if (result === 'win') return { title: 'Knockout', line: d.me.health <= 0 ? `You both went down, but you were faster. You win the duel.` : `You knocked out ${rival}. You win the duel.` };
    if (result === 'loss') return { title: 'Knocked out', line: d.rival.health <= 0 ? `You both went down, and ${rival} was faster.` : `${upper(rival)} knocked you out this time.` };
    return { title: 'Double knockout', line: 'You knocked each other out at the same moment: it is a draw.' };
  }
  const level = d.me.health === d.rival.health;
  if (result === 'win') return { title: 'Duel won', line: level ? 'Level on health, but you dealt more damage.' : 'You had more health left at the end.' };
  if (result === 'loss') return { title: 'Duel lost', line: level ? `Level on health, but ${rival} dealt more damage.` : `${upper(rival)} had more health left at the end.` };
  return { title: 'A draw', line: 'Level on health and on damage dealt.' };
}

/* ------------------------------ the phone ------------------------------ */

/** The HUD row: "Round 2 of 4" on the blue plate and "Question 3 of 5" beside it, announced as each question opens; anything else on the right. */
function DuelProgress({ view, children }: { view: Base; children?: ReactNode }) {
  const live = view.sync.phase === 'question' || view.sync.phase === 'reveal';
  useAnnounce(live && view.round >= 0 ? `Round ${view.round + 1} of ${view.rounds}, question ${view.q + 1} of ${view.duelLength}.` : null, `${view.round}|${view.q}`);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <p className="plate plate-blue text-xl tabular">
          <span>
            Round {view.round + 1} of {view.rounds}
          </span>
        </p>
        {live ? (
          <span className="text-sm font-bold text-text-2 tabular min-[400px]:text-base">
            Question {view.q + 1} of {view.duelLength}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** One side of the phone's duel header. The rival's side is the mirror image. */
function Fighter({ side, label, room, rules, mirror = false, hit, ko, phase, cheer }: { side: SideView; label: string; room: RoomView; rules: Rules; mirror?: boolean; hit: HitView | null; ko: boolean; phase: SyncView['phase']; cheer: boolean }) {
  const glim = useRef<HTMLDivElement>(null);
  const revealed = phase === 'reveal';
  const landed = Boolean(hit && !hit.blocked && revealed);
  // The Glim that is hit gives a little shudder as the hit lands.
  useEffect(() => {
    if (!landed || !motionOK()) return;
    const a = glim.current?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 360, delay: 420, easing: 'ease-out' });
    return () => a?.cancel();
  }, [landed]);
  const align = mirror ? 'items-end text-right' : 'items-start text-left';
  const row = mirror ? 'flex-row-reverse' : '';
  return (
    <div className={`relative flex min-w-0 items-center gap-1.5 min-[400px]:gap-2 ${row}`}>
      <div ref={glim} className="relative shrink-0">
        <SideGlim side={side} room={room} className="size-11 min-[400px]:size-14" pose={cheer ? 'cheer' : 'idle'} down={ko} />
        {hit && revealed ? (
          // Across the Glim's feet, no wider than the Glim, so the name, health and charge beside it stay readable.
          <span className="absolute bottom-0 left-1/2 z-10 -translate-x-1/2 translate-y-1/3">
            <HitMark hit={hit} delay={420} />
          </span>
        ) : null}
        {ko ? <KoStamp delay={revealed ? 760 : 0} /> : null}
      </div>
      <div className={`flex min-w-0 flex-1 flex-col gap-0.5 ${align}`}>
        <span className="w-full min-w-0 truncate leading-tight font-bold">{label}</span>
        {/* The number sits by the Glim and the bars meet in the middle, at the "vs". */}
        <div className={`flex w-full min-w-0 items-center gap-1.5 ${row}`}>
          <span className="min-w-[2ch] font-display text-lg leading-none font-extrabold tabular" aria-hidden>
            {side.health}
          </span>
          <HealthBar health={side.health} max={rules.health} mirror={mirror} label={healthLabel(label, side, rules.health)} delay={revealed && hit && !hit.blocked ? 420 : 0} />
        </div>
        <div className={`flex min-h-5 flex-wrap items-center gap-1 ${row}`}>
          {rules.powers && side.charge !== undefined ? <ChargeBolts charge={side.charge} cap={rules.cap} /> : null}
          <Ready side={side} />
          {mirror && side.answered && phase === 'question' ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-glim px-1.5 text-xs font-bold text-on-accent">
              <Check className="size-3.5" strokeWidth={3} aria-hidden /> Answered
            </span>
          ) : null}
          {side.id === null ? <span className="text-xs font-bold text-text-2">{rules.shadow.accuracy}% right</span> : null}
        </div>
      </div>
    </div>
  );
}

function DuelHeader({ view, room }: { view: GlimDuelsView; room: RoomView }) {
  const d = view.duel!;
  const phase = view.sync.phase;
  const meKo = d.how === 'ko' && d.result !== 'win';
  const rivalKo = d.how === 'ko' && d.result !== 'loss';
  return (
    <StagePanel as="section" label="Your duel" className="px-2.5 py-2.5 sm:px-4 sm:py-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-3">
        <Fighter side={d.me} label="You" room={room} rules={view.rules} hit={d.hits?.theirs ?? null} ko={meKo} phase={phase} cheer={d.result === 'win'} />
        <span className="px-0.5 font-display text-xl font-extrabold text-text-2 italic min-[400px]:px-1.5">vs</span>
        <Fighter side={d.rival} label={nameOf(d.rival, room)} room={room} rules={view.rules} mirror hit={d.hits?.mine ?? null} ko={rivalKo} phase={phase} cheer={d.result === 'loss'} />
      </div>
    </StagePanel>
  );
}

/** The three powers: big, named, with their cost, and saying why when one cannot be used. */
function PowerBar({ view, act, paused }: { view: GlimDuelsView; act: ModeScreenProps['act']; paused: boolean }) {
  const d = view.duel!;
  const you = view.you!;
  const r = view.rules;
  const q = view.sync.question!;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  useAnnounce(said, said);
  const reason = (p: Power): string | null => {
    if (you.used) return you.used === p ? 'Used' : 'One per question';
    if (you.charge < r.cost[p]) return `Needs ${charges(r.cost[p])}`;
    if (p === 'shield' && d.me.shield) return 'Already up';
    if (p === 'strike' && d.me.strike) return 'Ready';
    if (p === 'mend' && d.me.health >= r.health) return 'Full health';
    return null;
  };
  const use = async (p: Power) => {
    setBusy(true);
    const ack = await act({ type: 'power', iid: q.iid, power: p });
    setBusy(false);
    if (!ack.ok) {
      setNote(ack.error.message);
      return;
    }
    setNote(null);
    playSfx(p === 'shield' ? 'shield' : 'powerUp');
    setSaid(p === 'shield' ? 'Shield up: it blocks the next hit on you.' : p === 'strike' ? 'Power strike ready: your next hit does double damage.' : `Mended: ${Math.min(r.health, d.me.health + r.mend)} health.`);
  };
  return (
    <section aria-label="Powers" className="flex flex-col gap-1">
      <div className="grid grid-cols-3 gap-2">
        {POWERS.map((p) => {
          const why = reason(p);
          const Icon = POWER_ICON[p];
          const on = you.used === p;
          return (
            // A solid piece in the power's colour; the one used this question is held down and checked; one that cannot be used is out of play, saying why.
            <button
              key={p}
              type="button"
              onClick={() => void use(p)}
              disabled={paused || busy || why !== null}
              title={POWER_NAME[p]}
              aria-pressed={on}
              data-pressed={on || undefined}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center rounded-[var(--radius-m)] px-1 py-1 [--press:5px] disabled:cursor-not-allowed ${on || !why ? `piece text-on-accent ${POWER_TONE[p]}` : 'piece-off'}`}
            >
              <span className="flex items-center gap-1 text-base leading-tight font-extrabold min-[400px]:text-lg">
                {on ? (
                  <span className="grid size-[1.15em] shrink-0 place-items-center rounded-full bg-ink text-white" aria-hidden>
                    <Check className="size-[0.75em]" strokeWidth={3.4} />
                  </span>
                ) : (
                  <Icon className="size-[1.05em] shrink-0" strokeWidth={2.6} aria-hidden />
                )}
                {POWER_BUTTON[p]}
              </span>
              <span className={`text-xs leading-tight font-bold ${why && !on ? 'text-text-2' : ''}`}>{why ?? charges(r.cost[p])}</span>
            </button>
          );
        })}
      </div>
      {note ? (
        <p className="text-sm font-bold text-ember" role="alert">
          {note}
        </p>
      ) : (
        <p className="text-xs font-semibold text-text-2 max-[389px]:hidden">Use one before you answer. Shield blocks the next hit, Strike doubles your next hit, Mend gives back {r.mend} health.</p>
      )}
    </section>
  );
}

/** A banner for the end of a duel: the winner cheers, the sound plays once. */
function DuelOutcome({ d, room, rules, last }: { d: PlayerDuel; room: RoomView; rules: Rules; last: boolean }) {
  const { title, line } = outcomeText(d.result!, d.how, d, room);
  const tone = d.result === 'win' ? 'bg-glim' : d.result === 'loss' ? 'bg-ember' : 'bg-lantern';
  const role = useSoundRole();
  useLaterSfx(d.result === 'win' ? 'win' : d.result === 'loss' ? 'lose' : 'event', `${d.id}|end`, role !== 'host' && d.endedNow);
  useAnnounce(d.endedNow ? `${title} ${line}` : null, `${d.id}|end`);
  const after = last ? 'That was your last duel.' : rules.powers ? 'Keep answering to charge up for the next round.' : 'Keep answering to warm up for the next round.';
  return (
    <div
      role="status"
      className={`lift relative isolate flex items-center gap-3 rounded-[var(--radius-l)] px-4 py-3 text-on-accent ${tone}`}
      style={d.endedNow && motionOK() ? { animation: 'pop-in 200ms var(--ease-out) 650ms both' } : undefined}
    >
      <SideGlim side={d.me} room={room} className="size-14" pose={d.result === 'win' ? 'cheer' : 'idle'} />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-display text-[2.1rem] leading-none font-extrabold italic">
          {d.result === 'win' ? <Crown className="size-7 shrink-0" strokeWidth={2.6} aria-hidden /> : null}
          {title}
        </p>
        <p className="mt-1 font-bold">{line}</p>
        <p className="text-sm font-semibold">{after}</p>
      </div>
    </div>
  );
}

function WaitingPanel({ view, room }: { view: GlimDuelsView; room: RoomView }) {
  const last = view.round >= view.rounds - 1;
  const text = last ? 'This is the last duel round. Answer along for practice.' : view.rules.powers ? 'Answer now to build charge for your first duel.' : 'Answer now to warm up.';
  useAnnounce(last ? text : `You join the next round. ${text}`, 'waiting');
  return (
    <StagePanel className="flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
      <PlayerGlim avatar={myAvatar(room)} seed={room.me.playerId ?? 'you'} size={56} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-2xl leading-tight font-extrabold">{last ? 'Watching the last round' : 'You join the next round'}</p>
        <p className="font-semibold text-text-2">{text}</p>
      </div>
      {view.rules.powers && view.you ? <ChargeBolts charge={view.you.charge} cap={view.rules.cap} /> : null}
    </StagePanel>
  );
}

/** "Next: you vs Ben", with both Glims. */
function NextDuel({ view, room, title = 'Next duel' }: { view: GlimDuelsView; room: RoomView; title?: string }) {
  const n = view.next;
  const rival: SideView | null = n ? { id: n.rival?.id ?? null, health: view.rules.health } : null;
  const text = !n ? 'You get a rival when the round starts.' : n.shadow ? `You vs the ${SHADOW_NAME}` : `You vs ${n.rival!.name}`;
  useAnnounce(`${title}: ${text}.`, `${title}|${text}`);
  return (
    <StagePanel className="flex items-center gap-3 px-4 py-3" label={title}>
      <PlayerGlim avatar={myAvatar(room)} seed={room.me.playerId ?? 'you'} size={64} className="size-14 shrink-0" />
      <span className="font-display text-xl font-extrabold text-text-2 italic" aria-hidden>
        vs
      </span>
      {rival ? <SideGlim side={rival} room={room} className="size-14" /> : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-text-2">{title}</p>
        <p className="font-display text-2xl leading-tight font-extrabold break-words">{text}</p>
        {n?.shadow ? (
          <p className="text-sm font-semibold text-text-2">
            A computer rival with no powers. It gets {view.rules.shadow.accuracy}% of questions right and answers at a random moment between {view.rules.shadow.from}% and {view.rules.shadow.to}% of the time.
          </p>
        ) : null}
      </div>
    </StagePanel>
  );
}

const toLeader = (r: StandingRow): LeaderRow => ({ playerId: r.playerId, name: r.name, score: r.points, rank: r.rank, teamId: r.teamId });
const record = (r: { wins: number; draws: number; losses: number }) => `${plural(r.wins, 'win')}${r.draws ? `, ${plural(r.draws, 'draw')}` : ''}`;

function teamFormat(view: Base) {
  return view.rules.clash ? (n: number) => String(n) : (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
}

function Standings({ view, room }: { view: GlimDuelsView; room: RoomView }) {
  const me = view.board.you;
  const done = view.sync.phase === 'done';
  useAnnounce(me ? `You are ${ordinal(me.rank)} with ${plural(me.points, 'point')}: ${record(me)}.` : null, `standings|${view.round}`);
  const d = view.duel;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <PlayerGlim avatar={myAvatar(room)} seed={room.me.playerId ?? 'you'} size={76} className="shrink-0" pose={d?.result === 'win' ? 'cheer' : 'idle'} />
        <div className="min-w-0">
          <p className="font-bold text-text-2">{done ? 'Final standings' : `Round ${view.round + 1} of ${view.rounds} done`}</p>
          {/* Your rank on the gold plate: the moment of the standings. */}
          <h2 className={me ? 'plate plate-gold my-1 text-[2rem]' : 'font-display text-[2.25rem] leading-tight font-bold'}>{me ? <span>You are {ordinal(me.rank)}</span> : 'Standings'}</h2>
          {me ? (
            <p className="font-semibold text-text-2">
              {plural(me.points, 'point')}, {record(me)}
            </p>
          ) : null}
        </div>
      </div>
      {d?.result ? (
        <StagePanel className="px-4 py-2.5 font-semibold">
          This round's duel: {outcomeText(d.result, d.how, d, room).line}
        </StagePanel>
      ) : null}
      {!done ? <NextDuel view={view} room={room} /> : null}
      {view.teams ? <TeamScores teams={view.teams} format={teamFormat(view)} /> : null}
      <Leaderboard rows={view.board.rows.map(toLeader)} you={me ? toLeader(me) : null} players={room.players} teams={room.room.teams} label={(r) => `${r.score} pts`} />
    </div>
  );
}

function rulesLine(view: Base): string {
  const r = view.rules;
  const parts = [`${view.rounds} rounds of duels, up to ${view.duelLength} questions each.`, `A right answer hits for ${r.hit[0]} to ${r.hit[1]}: faster hits harder.`];
  if (r.powers) parts.push('Hits build charge for a shield, a power strike or a mend.');
  return parts.join(' ');
}

export function GlimDuelsPlayer({ view, act, gameNow, paused, room }: ModeScreenProps<GlimDuelsView>) {
  const s = view.sync;
  const seed = room.me.playerId ?? 'you';
  if (s.phase === 'intro') {
    const n = view.next;
    const rival: SideView | null = n ? { id: n.rival?.id ?? null, health: view.rules.health } : null;
    return (
      <IntroScreen
        kicker="Get ready to duel"
        title={room.room.title}
        until={s.phaseEndsAt}
        gameNow={gameNow}
        room={room}
        art={
          <div className="flex items-center gap-3">
            <PlayerGlim avatar={myAvatar(room)} seed={seed} size={110} />
            {rival ? (
              <>
                <span className="font-display text-[2.5rem] font-extrabold text-text-2 italic">vs</span>
                <SideGlim side={rival} room={room} className="size-[110px]" />
              </>
            ) : null}
          </div>
        }
      >
        {n ? <p className="font-display text-2xl font-extrabold text-text">{n.shadow ? `First duel: you vs the ${SHADOW_NAME}` : `First duel: you vs ${n.rival!.name}`}</p> : null}
        <p>{rulesLine(view)}</p>
      </IntroScreen>
    );
  }
  if (s.phase === 'leaderboard' || s.phase === 'done') return <Standings view={view} room={room} />;
  const q = s.question;
  if (!q) return null;
  const d = view.duel;
  const answered = Boolean(s.you?.answered);
  const submit = async (answer: Answer) => (await act({ type: 'answer', iid: q.iid, answer })).ok;
  const lastRound = view.round >= view.rounds - 1;
  const inDuel = d !== null && d.result === null;
  const points = view.you?.points ?? 0;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-4">
      <DuelProgress view={view}>
        <HudScore value={points} unit={points === 1 ? 'point' : 'points'} />
      </DuelProgress>
      {d ? <DuelHeader view={view} room={room} /> : <WaitingPanel view={view} room={room} />}
      {s.phase === 'question' ? (
        <>
          {d && !inDuel ? <DuelOutcome d={d} room={room} rules={view.rules} last={lastRound} /> : null}
          {inDuel && view.rules.powers && !answered ? <PowerBar view={view} act={act} paused={paused} /> : null}
          <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} />
          <QuestionCard q={q.q} />
          {answered ? <LockedIn answered={s.answered} eligible={s.eligible} avatar={myAvatar(room)} seed={seed} /> : <AnswerInput key={q.iid} q={q.q} onSubmit={submit} disabled={paused} compact />}
        </>
      ) : (
        <PlayerReveal view={view} room={room} q={q} last={lastRound} />
      )}
    </div>
  );
}

function PlayerReveal({ view, room, q, last }: { view: GlimDuelsView; room: RoomView; q: QuestionView; last: boolean }) {
  const s = view.sync;
  const d = view.duel;
  const role = useSoundRole();
  const answered = Boolean(s.you?.answered);
  const late = Boolean(s.you?.joinedLate && !answered);
  const fought = Boolean(d?.hits);
  const lines = d && fought ? duelLines(d, room, answered) : null;
  const sound: SfxName | null = !d || !fought || d.endedNow ? null : d.hits?.mine && !d.hits.mine.blocked ? 'hit' : d.hits?.theirs && !d.hits.theirs.blocked ? 'hurt' : d.hits?.mine || d.hits?.theirs ? 'shield' : null;
  useLaterSfx(sound, `${q.iid}|duel`, role !== 'host' && sound !== null);
  useAnnounce(lines ? `${lines.mine} ${lines.theirs} You have ${d!.me.health} health, ${called(d!.rival, room)} has ${d!.rival.health}.` : null, `${q.iid}|duel`);
  const charge = view.rules.powers && s.you?.correct ? ' +1 charge.' : '';
  return (
    <div className="flex flex-col gap-3">
      {d?.endedNow ? <DuelOutcome d={d} room={room} rules={view.rules} last={last} /> : null}
      {late ? (
        <StagePanel className="px-4 py-3 font-semibold text-text">You joined during this question, so it does not count. You play from the next one.</StagePanel>
      ) : (
        <>
          <ResultBanner key={q.iid} correct={answered ? (s.you?.correct ?? false) : false} partial={s.you?.partial} text={lines ? `${lines.mine}${charge}` : charge.trim() || undefined} answer={s.reveal ? shortAnswer(q.q, s.reveal) : null} />
          {lines ? <p className={`rounded-[var(--radius-m)] px-3 py-2 font-bold ${NIGHT}`}>{lines.theirs}</p> : null}
          {!answered ? <p className="font-semibold text-text-2">You did not answer.</p> : null}
        </>
      )}
      {s.reveal ? <RevealAnswer q={q.q} reveal={s.reveal} compact /> : null}
      <Explanation text={s.explanation} />
    </div>
  );
}

/* ---------------------------- the projector ---------------------------- */

/**
 * Duel cards are sized by how many there are: a few big ones that read from
 * the back of the room, or more, smaller ones when the class is large.
 */
type Tier = 'roomy' | 'normal' | 'dense';
const tierOf = (n: number): Tier => (n <= 4 ? 'roomy' : n <= 10 ? 'normal' : 'dense');
const TIER: Record<Tier, { glim: string; text: string; cols: string; pad: string }> = {
  roomy: { glim: 'size-[clamp(3rem,8vh,5.5rem)]', text: 'text-[clamp(1.15rem,min(1.7vw,3vh),2.1rem)]', cols: 'grid-cols-1', pad: 'py-[clamp(0.45rem,1.1vh,0.9rem)]' },
  normal: { glim: 'size-[clamp(2.5rem,6vh,4.25rem)]', text: 'text-[clamp(0.95rem,min(1.25vw,2.3vh),1.5rem)]', cols: 'grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))]', pad: 'py-[clamp(0.35rem,0.9vh,0.7rem)]' },
  dense: { glim: 'size-[clamp(2rem,4.4vh,3rem)]', text: 'text-[clamp(0.9rem,min(1.1vw,2.1vh),1.3rem)]', cols: 'grid-cols-[repeat(auto-fill,minmax(min(100%,15.5rem),1fr))]', pad: 'py-[clamp(0.25rem,0.6vh,0.45rem)]' },
};

/** One side of a duel card under its name: the Glim, health and what it has ready. */
function HostSide({ side, room, rules, mirror = false, hit, result, how, phase, tier }: { side: SideView; room: RoomView; rules: Rules; mirror?: boolean; hit: HitView | null; result: Result | null; how: How | undefined; phase: SyncView['phase']; tier: Tier }) {
  const name = nameOf(side, room);
  const revealed = phase === 'reveal';
  const ko = how === 'ko' && result !== 'win' && side.health <= 0;
  const t = TIER[tier];
  const row = mirror ? 'flex-row-reverse' : '';
  const chip = 'px-2! py-0! text-[clamp(0.85rem,1.6vh,1.2rem)]';
  return (
    <div className={`relative flex min-w-0 items-center gap-[clamp(0.35rem,0.6vw,0.75rem)] ${row}`}>
      <div className="relative shrink-0">
        <SideGlim side={side} room={room} className={t.glim} pose={result === 'win' ? 'cheer' : 'idle'} down={result === 'loss'} />
        {hit && revealed ? (
          // At the Glim's feet: the name sits above it on the card.
          <span className="absolute -bottom-2 left-1/2 z-20 -translate-x-1/2">
            <HitMark hit={hit} big delay={250} />
          </span>
        ) : null}
        {ko ? <KoStamp big delay={revealed ? 600 : 0} /> : null}
      </div>
      <div className={`flex min-w-0 flex-1 flex-col gap-[clamp(0.15rem,0.4vh,0.35rem)] ${mirror ? 'items-end' : 'items-start'}`}>
        <div className={`flex w-full min-w-0 items-center gap-[clamp(0.3rem,0.5vw,0.6rem)] ${row}`}>
          <span className={`min-w-[2ch] font-display leading-none font-extrabold tabular ${t.text}`} aria-hidden>
            {side.health}
          </span>
          <HealthBar health={side.health} max={rules.health} mirror={mirror} big label={healthLabel(name, side, rules.health)} delay={revealed && hit && !hit.blocked ? 250 : 0} />
        </div>
        <div className={`flex min-h-[clamp(1.1rem,2.2vh,1.75rem)] items-center gap-1 ${row}`}>
          {result === 'win' ? (
            <Pill tone="lantern" className={chip}>
              <Crown className="size-[1.05em]" strokeWidth={2.6} aria-hidden /> Won
            </Pill>
          ) : null}
          {result === 'draw' ? <Pill className={chip}>Draw</Pill> : null}
          {!result && rules.powers && side.charge !== undefined && tier !== 'dense' ? <ChargeBolts charge={side.charge} cap={rules.cap} big /> : null}
          {!result ? <Ready side={side} big /> : null}
          {!result && side.answered && phase === 'question' ? (
            <span className="inline-grid place-items-center rounded-full bg-glim p-[2px] text-on-accent" title="Locked in">
              <Check className="size-[clamp(0.8rem,1.6vh,1.2rem)]" strokeWidth={3.2} aria-hidden />
              <span className="sr-only">Locked in</span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** A player's team, as the leaderboard marks it: a dot in the team's colour, named for screen readers. */
function TeamDot({ id, room }: { id: string | null; room: RoomView }) {
  const teamId = id ? room.players.find((p) => p.id === id)?.teamId : null;
  const team = teamId ? room.room.teams.find((t) => t.id === teamId) : undefined;
  if (!team) return null;
  return (
    <>
      <span className="size-[0.7em] shrink-0 rounded-full" style={{ background: `hsl(${team.hue} 80% 60%)` }} title={team.name} aria-hidden />
      <span className="sr-only">({team.name})</span>
    </>
  );
}

function DuelCard({ d, room, rules, phase, tier }: { d: HostDuel; room: RoomView; rules: Rules; phase: SyncView['phase']; tier: Tier }) {
  const res = (i: 0 | 1): Result | null => (d.winner === undefined ? null : d.winner === 'draw' ? 'draw' : d.winner === i ? 'win' : 'loss');
  const [a, b] = d.sides;
  const verdict = d.winner === undefined ? null : d.winner === 'draw' ? 'A draw.' : `${nameOf(d.sides[d.winner], room)} won${d.how === 'ko' ? ' by knockout' : ''}.`;
  const name = `flex min-w-0 items-center gap-1.5 leading-tight font-bold ${TIER[tier].text}`;
  return (
    <li
      data-duel={d.id}
      className={`relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-[clamp(0.25rem,0.6vw,0.75rem)] gap-y-[clamp(0.1rem,0.4vh,0.3rem)] rounded-[var(--radius-m)] px-[clamp(0.5rem,0.8vw,0.9rem)] ${TIER[tier].pad} ${d.endedNow ? 'bg-lantern/[0.12] ring-2 ring-lantern ring-inset' : NIGHT}`}
    >
      {/* Names take a row of their own across the card, so they are not squeezed by the Glims. */}
      <span className={name}>
        <TeamDot id={a.id} room={room} />
        <span className="min-w-0 truncate">{nameOf(a, room)}</span>
      </span>
      <span aria-hidden />
      <span className={`${name} flex-row-reverse text-right`}>
        <TeamDot id={b.id} room={room} />
        <span className="min-w-0 truncate">{nameOf(b, room)}</span>
      </span>
      <HostSide side={a} room={room} rules={rules} hit={d.hits?.[1] ?? null} result={res(0)} how={d.how} phase={phase} tier={tier} />
      <span className="px-[clamp(0.25rem,0.7vw,0.8rem)] text-center font-display text-[clamp(0.9rem,1.6vh,1.25rem)] font-extrabold text-text-2 italic">vs</span>
      <HostSide side={b} room={room} rules={rules} mirror hit={d.hits?.[0] ?? null} result={res(1)} how={d.how} phase={phase} tier={tier} />
      {verdict ? <span className="sr-only">{verdict}</span> : null}
    </li>
  );
}

/**
 * The right answer on the projector at a reveal: just the right choice (or
 * choices) with how many picked it, so the duels beside it keep the room.
 * Other kinds of question show the usual answer card.
 */
function HostAnswer({ q, reveal, distribution }: { q: PublicQuestion; reveal: AnswerReveal; distribution: Record<string, number> | null }) {
  const key = `${q.prompt}|${JSON.stringify(reveal)}`;
  const choices = (q.type === 'mcq' || q.type === 'multi') && (reveal.type === 'mcq' || reveal.type === 'multi');
  const tf = q.type === 'truefalse' && reveal.type === 'truefalse';
  useAnnounce(choices || tf ? answerWords(q, reveal) : null, key);
  useSfx('reveal', key, useSoundRole() === 'host' && (choices || tf));
  if (!choices && !tf) return <RevealAnswer q={q} reveal={reveal} distribution={distribution} size="lg" />;
  const max = Math.max(1, ...Object.values(distribution ?? {}));
  if (tf) {
    const v = reveal.correct;
    return <ChoiceTile index={v ? 0 : 1} text={v ? 'True' : 'False'} correct disabled size="lg" layout="row" count={distribution?.[String(v)] ?? 0} max={max} />;
  }
  const right = new Set(reveal.type === 'mcq' ? [reveal.correct] : reveal.type === 'multi' ? reveal.correct : []);
  return (
    <div className="flex flex-col gap-[clamp(0.6rem,1.3vh,1.1rem)] pt-2">
      {q.type === 'mcq' || q.type === 'multi'
        ? q.choices.map((c, i) => (right.has(c.id) ? <ChoiceTile key={c.id} index={i} text={c.text} media={c.media} correct disabled size="lg" layout="row" count={distribution?.[c.id] ?? 0} max={max} /> : null))
        : null}
    </div>
  );
}

/**
 * How many duel cards fit on the projector at once. The cards flow into as
 * many columns as the width allows; the rows are measured against the screen's
 * height, and pages take turns when there are more duels than fit.
 */
function usePages(count: number, list: RefObject<HTMLOListElement | null>, key: string) {
  const [perPage, setPerPage] = useState(count);
  const [page, setPage] = useState(0);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const measure = () => {
      if (!window.matchMedia('(min-width: 1024px)').matches) return setPerPage(count);
      const card = el.querySelector('li');
      if (!card) return;
      const style = getComputedStyle(el);
      const cols = Math.max(1, style.gridTemplateColumns.split(' ').filter(Boolean).length);
      const gap = parseFloat(style.rowGap) || 0;
      // Room left on the screen under the top of the list, less the key under it.
      const below = el.nextElementSibling ? el.nextElementSibling.getBoundingClientRect().height + gap : 0;
      const room = window.innerHeight - el.getBoundingClientRect().top - below - 20;
      const rows = Math.max(1, Math.floor((room + gap) / (card.getBoundingClientRect().height + gap)));
      setPerPage(Math.max(cols, cols * rows));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [count, list, key]);
  const pages = Math.max(1, Math.ceil(count / Math.max(1, perPage)));
  useEffect(() => setPage(0), [key]);
  useEffect(() => {
    if (pages <= 1) return;
    const t = window.setInterval(() => setPage((p) => (p + 1) % pages), 5000);
    return () => window.clearInterval(t);
  }, [pages, key]);
  return { perPage, page: Math.min(page, pages - 1), pages };
}

function DuelGrid({ view, room }: { view: GlimDuelsHostView; room: RoomView }) {
  const list = useRef<HTMLOListElement>(null);
  // While a question is open the question has most of the screen, so a big class's duels step down a size to fit beside it.
  const tier: Tier = view.sync.phase === 'question' && view.duels.length > 6 ? 'dense' : tierOf(view.duels.length);
  const key = `${view.round}|${view.q}|${view.sync.phase}|${tier}`;
  const { perPage, page, pages } = usePages(view.duels.length, list, key);
  const shown = view.duels.slice(page * perPage, page * perPage + perPage);
  const shadow = view.duels.some((d) => d.sides[1].id === null);
  const small = 'text-[clamp(1rem,min(1.3vw,2.4vh),1.4rem)]';
  return (
    <section aria-label="Duels" className="flex min-w-0 flex-col gap-[clamp(0.4rem,1vh,0.75rem)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[clamp(1.6rem,min(2.5vw,4.3vh),2.75rem)] leading-tight font-bold">{plural(view.duels.length, 'duel')}</h3>
        <div className={`flex flex-wrap items-center gap-2 ${small}`}>
          {view.sync.phase === 'question' ? <HudCount value={view.sync.answered} total={view.sync.eligible} label="answered" className="text-[1.1em]" /> : null}
          {view.sync.phase === 'reveal' && view.kos > 0 ? (
            <Pill tone="ember" className="px-4">
              {view.kos === 1 ? '1 knockout' : `${view.kos} knockouts`}
            </Pill>
          ) : null}
          {view.waiting > 0 ? <Pill className="px-4">{view.waiting} join next round</Pill> : null}
          {pages > 1 ? (
            <Pill className="px-4">
              Page {page + 1} of {pages}
            </Pill>
          ) : null}
        </div>
      </div>
      <ol ref={list} className={`grid gap-[clamp(0.35rem,0.8vh,0.6rem)] ${TIER[tier].cols}`}>
        {shown.map((d) => (
          <DuelCard key={d.id} d={d} room={room} rules={view.rules} phase={view.sync.phase} tier={tier} />
        ))}
      </ol>
      {view.rules.powers || shadow ? (
        <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold text-text-2 ${small}`}>
          {view.rules.powers ? (
            <>
              <span className="inline-flex items-center gap-1">
                <Zap className="size-[1em] fill-lantern text-lantern" aria-hidden /> charge
              </span>
              <span className="inline-flex items-center gap-1">
                <Shield className="size-[1em]" aria-hidden /> shield up
              </span>
              <span className="inline-flex items-center gap-1">
                <Swords className="size-[1em]" aria-hidden /> power strike ready
              </span>
            </>
          ) : null}
          {/* The Shadow Glim's odds are always on show where it duels. */}
          {shadow ? (
            <span>
              {SHADOW_NAME}: {view.rules.shadow.accuracy}% right
            </span>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}

/** The big screen's HUD row: "Round 2 of 4" on the blue plate, the question within the duel, and how many have answered. */
/**
 * The big screen's HUD row: "Round 2 of 4" on the blue plate, the question within the duel and,
 * while a question is open, its timer in the same row, so a long question and five or six
 * answers still fit a 768-pixel projector.
 */
function HostHeader({ view, timer }: { view: GlimDuelsHostView; timer?: ReactNode }) {
  useAnnounce(`Round ${view.round + 1} of ${view.rounds}, question ${view.q + 1} of ${view.duelLength}.`, `${view.round}|${view.q}`);
  return (
    <div className="flex flex-wrap items-center gap-x-[clamp(0.75rem,1.2vw,1.25rem)] gap-y-2">
      <p className="plate plate-blue text-[clamp(1.4rem,2.1vw,2.4rem)] tabular">
        <span>
          Round {view.round + 1} of {view.rounds}
        </span>
      </p>
      <span className="text-[clamp(1.1rem,1.8vw,2rem)] font-bold text-text-2 tabular">
        Question {view.q + 1} of {view.duelLength}
      </span>
      {timer ? <div className="min-w-[14rem] flex-1">{timer}</div> : null}
    </div>
  );
}

function HostStandings({ view, room }: { view: GlimDuelsHostView; room: RoomView }) {
  const done = view.sync.phase === 'done';
  const pairs = view.next ?? [];
  const shown = pairs.slice(0, 12);
  // Fewer pairs, bigger rows; a long list (or one sharing the column with the teams) steps down, and only past ten splits into two columns.
  const tier: Tier = shown.length <= (view.teams ? 3 : 6) ? 'roomy' : 'dense';
  const twoCols = shown.length > 10;
  const name = (id: string | null) => (id === null ? SHADOW_NAME : (room.players.find((p) => p.id === id)?.name ?? 'A player'));
  useAnnounce(done ? 'Final standings.' : `Round ${view.round + 1} is over. Here are the standings and the next duels.`, `standings|${view.round}`);
  const heading = 'font-display text-[clamp(1.5rem,min(2.4vw,4.2vh),2.75rem)] leading-tight font-bold';
  const teams = view.teams ? (
    <StagePanel className="flex flex-col gap-2 p-[clamp(0.6rem,1.4vh,1.1rem)]">
      <h3 className={heading}>{view.rules.clash ? 'Teams (total points)' : 'Teams (average points)'}</h3>
      <TeamScores teams={view.teams} format={teamFormat(view)} big />
    </StagePanel>
  ) : null;
  return (
    <div className="mx-auto grid w-full max-w-[110rem] grid-cols-1 gap-[clamp(1rem,2.5vw,2.5rem)] lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-[clamp(0.5rem,1.5vh,1rem)]">
        <h2 className="font-display text-[clamp(2.1rem,min(3.9vw,6.4vh),4.75rem)] leading-none font-extrabold">{done ? 'Final standings' : `After round ${view.round + 1} of ${view.rounds}`}</h2>
        <Leaderboard rows={view.board.slice(0, 8).map(toLeader)} players={room.players} teams={room.room.teams} big dense label={(r) => `${r.score} pts`} />
      </div>
      {/* The teams and the next duels share the second column, so the standings keep their eight rows on a 768-pixel projector. */}
      <div className="flex min-w-0 flex-col gap-[clamp(0.6rem,1.6vh,1.25rem)]">
        {teams}
        {!done && pairs.length ? (
          <section aria-labelledby="next-duels" className="flex min-w-0 flex-col gap-[clamp(0.4rem,1vh,0.75rem)]">
            <h3 id="next-duels" className={heading}>
              Next duels
            </h3>
            <ul className={`grid gap-1.5 ${twoCols ? 'xl:grid-cols-2' : ''}`}>
              {shown.map(([a, b]) => (
                <li key={`${a}-${b}`} className={`flex min-w-0 items-center gap-[clamp(0.4rem,0.8vw,0.75rem)] rounded-[var(--radius-m)] px-3 ${TIER[tier].pad} ${NIGHT} ${TIER[tier].text}`}>
                  <SideGlim side={{ id: a, health: 0 }} room={room} className={TIER[tier].glim} />
                  <span className="min-w-0 flex-1 truncate font-bold">{name(a)}</span>
                  <span className="font-display font-extrabold text-text-2 italic">vs</span>
                  <span className="min-w-0 flex-1 truncate text-right font-bold">{name(b)}</span>
                  <SideGlim side={{ id: b, health: 0 }} room={room} className={TIER[tier].glim} />
                </li>
              ))}
            </ul>
            {pairs.length > shown.length ? <p className={`font-semibold text-text-2 ${TIER.normal.text}`}>And {plural(pairs.length - shown.length, 'more duel')}.</p> : null}
            {pairs.some(([, b]) => b === null) ? (
              <p className={`font-semibold text-text-2 ${TIER.normal.text}`}>
                The {SHADOW_NAME} is a computer rival with no powers: it gets {view.rules.shadow.accuracy}% of questions right.
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

export function GlimDuelsHost({ view, gameNow, paused, room }: ModeScreenProps<GlimDuelsHostView>) {
  const s = view.sync;
  const shared = useSharedSounds();
  const landed = view.duels.some((d) => d.hits?.some((h) => h && !h.blocked));
  // One sound for the room as the hits land: a knockout if there was one.
  useLaterSfx(view.kos > 0 ? 'capture' : landed ? 'hit' : null, `${view.round}|${view.q}|${s.phase}`, shared && s.phase === 'reveal');
  useAnnounce(s.phase === 'reveal' && view.kos > 0 ? (view.kos === 1 ? 'A knockout.' : `${view.kos} knockouts.`) : null, `${view.round}|${view.q}|kos`);
  if (s.phase === 'intro') {
    return (
      <IntroScreen kicker="Get ready to duel" title={room.room.title} until={s.phaseEndsAt} gameNow={gameNow} room={room} big>
        Everyone duels a classmate. {rulesLine(view)}
      </IntroScreen>
    );
  }
  if (s.phase === 'leaderboard' || s.phase === 'done') return <HostStandings view={view} room={room} />;
  const q = s.question;
  if (!q) return null;
  const asking = s.phase === 'question';
  return (
    <div className={`mx-auto grid w-full max-w-[115rem] flex-1 grid-cols-1 gap-[clamp(0.75rem,1.8vw,2rem)] ${asking ? 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.3fr)]'}`}>
      <div className="flex min-w-0 flex-col gap-[clamp(0.35rem,1vh,0.9rem)]">
        <HostHeader view={view} timer={asking ? <TimerBar deadline={q.deadline} start={q.shownAt} gameNow={gameNow} paused={paused} size="lg" /> : null} />
        {asking ? (
          <>
            <QuestionCard q={q.q} size="lg" />
            <ChoicesDisplay q={q.q} />
          </>
        ) : (
          <>
            {/* At the reveal the duels take the room: the question shrinks to a line above its answer. */}
            <h2 className="paper stage-card line-clamp-3 px-[clamp(1rem,1.6vw,1.75rem)] py-[clamp(0.5rem,1.2vh,1rem)] font-sans text-[clamp(1.2rem,min(1.8vw,3.3vh),2.2rem)] leading-tight font-bold text-pretty text-text">{q.q.prompt}</h2>
            {s.reveal ? <HostAnswer q={q.q} reveal={s.reveal} distribution={s.distribution} /> : null}
            <div className={`max-lg:hidden ${q.q.type === 'order' || q.q.type === 'match' ? '[@media(max-height:860px)]:hidden' : ''}`}>
              <Explanation text={s.explanation} big />
            </div>
          </>
        )}
      </div>
      <DuelGrid view={view} room={room} />
    </div>
  );
}
