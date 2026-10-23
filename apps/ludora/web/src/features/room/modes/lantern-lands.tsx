import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CloudFog, CloudLightning, Flame, Hourglass, Map as MapIcon, Mountain, Shield, Sparkles, Swords, Zap } from 'lucide-react';
import type { Answer, RoomPlayerView } from '@ludora/shared';
import { grid, hexPoints, mapBounds, toPixel } from '@ludora/engine/lantern-lands-map';
import type { ModeScreenProps } from './registry.ts';
import type { FeedbackView, QuestionView } from '../game/types.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner, RevealAnswer } from '../game/Reveal.tsx';
import { Explanation } from '../game/parts.tsx';
import { useAnnounce } from '../game/announce.tsx';
import { NIGHT, Pill, PlayerGlim, SIGN, StagePanel, avatarOf, motionOK } from '../game/stage.tsx';
import { Button } from '../../../ui/Button.tsx';
import { useNow } from '../../../lib/useNow.ts';
import { formatNumber, plural } from '../../../lib/format.ts';
import { playSfx, useSharedSounds } from '../../../lib/sound/react.tsx';
import type { SfxName } from '../../../lib/sound/sfx.ts';

/* Lantern Lands: teams light up a shared map of hexagon lands, claiming, fortifying and raiding with the energy right answers give. */

type EventKind = 'storm' | 'bloom' | 'double' | 'rumble' | 'fog';
type MoveKind = 'claim' | 'fortify' | 'raid' | 'capture';
type Action = 'claim' | 'fortify' | 'raid';

interface LandsMapData {
  radius: number;
  homes: number[];
  shrines: number[];
  lakes: number[];
  hills: number[];
}

interface TeamRow {
  name: string;
  hue: number;
  points: number;
  gain: number;
  lands: number;
  shrines: number;
  players: number;
  underdog: boolean;
}

export interface LanternLandsView {
  map: LandsMapData;
  /** Team index holding each land; -1 nobody, -2 hidden by fog. */
  owner: number[];
  /** Forts on each land; -1 hidden by fog. */
  fort: number[];
  fortMax: number;
  claimFort: number;
  fog: boolean;
  teams: TeamRow[];
  scoring: { shrinesOnly: boolean; every: number; next: number | null; last: number | null };
  endsAt: number;
  glowAt: number;
  finalStretch: boolean;
  goal: number;
  event: { kind: EventKind; label: string; text: string; endsAt: number } | null;
  nextEvent: { at: number; pool: { kind: EventKind; label: string; chance: number }[] } | null;
  winners: number[] | null;
  changes?: { land: number; at: number; team: number; from: number }[];
  plays?: { at: number; team: number; text: string; shrine: boolean }[];
  board?: { playerId: string; name: string; team: number; score: number; label: string }[];
  you: {
    team: number;
    energy: number;
    cap: number;
    underdog: boolean;
    boost: { small: number; under: number; players: number; biggest: number; lands: number; most: number; meter: number } | null;
    streak: number;
    score: number;
    stats: { claims: number; captures: number; raids: number; forts: number; right: number };
    move: { kind: MoveKind; land: number; at: number; fort: number } | null;
    options: { claim: number[]; fortify: number[]; raid: number[] };
    question: QuestionView | null;
    last: FeedbackView | null;
  } | null;
}

/* --------------------------------- look --------------------------------- */

const NOBODY = -1;
const UNSEEN = -2;
const HEX = 10;
const PATTERN_NAMES = ['striped', 'dotted', 'wavy', 'checked', 'plain', 'cross-hatched'];
const SHRINE_RAID_COST = 2;
const SHRINE_FORT_COST = 2;

const teamFill = (hue: number) => `hsl(${hue} 78% 60%)`;
const letterOf = (t: TeamRow | undefined) => t?.name[0] ?? '?';
const patternName = (team: number) => PATTERN_NAMES[team] ?? 'plain';

const EVENT_ICON: Record<EventKind, typeof Zap> = { storm: CloudLightning, bloom: Sparkles, double: Zap, rumble: Mountain, fog: CloudFog };
const EVENT_TONE: Record<EventKind, 'dusk' | 'glim' | 'lantern' | 'ember' | 'calm'> = { storm: 'dusk', bloom: 'glim', double: 'lantern', rumble: 'ember', fog: 'calm' };
/** What each event means, short enough for one line on the projector. */
const EVENT_SHORT: Record<EventKind, string> = {
  storm: 'No raids until it passes.',
  bloom: 'Shrines score double.',
  double: 'Every right answer gives 2 energy.',
  rumble: 'Every fort dropped by 1.',
  fog: 'Forts are hidden.',
};

/** The six team patterns, drawn in white over the team colour (team 5 is plain colour). */
function TeamPatterns({ uid }: { uid: string }) {
  const ink = 'rgb(255 255 255 / 0.45)';
  return (
    <defs>
      <pattern id={`${uid}-t0`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="1.7" height="4" fill={ink} />
      </pattern>
      <pattern id={`${uid}-t1`} width="4" height="4" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.95" fill={ink} />
      </pattern>
      <pattern id={`${uid}-t2`} width="6" height="4" patternUnits="userSpaceOnUse">
        <path d="M0 2.6Q1.5 0.6 3 2.6T6 2.6" fill="none" stroke={ink} strokeWidth="0.9" />
      </pattern>
      <pattern id={`${uid}-t3`} width="4.4" height="4.4" patternUnits="userSpaceOnUse">
        <rect width="2.2" height="2.2" fill={ink} />
        <rect x="2.2" y="2.2" width="2.2" height="2.2" fill={ink} />
      </pattern>
      <pattern id={`${uid}-t5`} width="3.6" height="3.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <path d="M0 0.4H3.6M0.4 0V3.6" stroke={ink} strokeWidth="0.75" />
      </pattern>
      <pattern id={`${uid}-lake`} width="6" height="3" patternUnits="userSpaceOnUse">
        <path d="M0 1.8Q1.5 0.6 3 1.8T6 1.8" fill="none" stroke="rgb(255 255 255 / 0.35)" strokeWidth="0.6" />
      </pattern>
    </defs>
  );
}

const patternFill = (uid: string, team: number) => (team === 4 ? null : `url(#${uid}-t${team})`);

/** A team's hexagon badge: colour, pattern and letter, so a team is never told by colour alone. */
function TeamBadge({ team, row, size = 28, className = '' }: { team: number; row: TeamRow | undefined; size?: number; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const pts = hexPoints(0, 0, 9.4);
  const pattern = patternFill(uid, team);
  return (
    <svg viewBox="-10 -10 20 20" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden focusable={false}>
      <TeamPatterns uid={uid} />
      <polygon points={pts} fill={teamFill(row?.hue ?? 0)} stroke="var(--ink)" strokeWidth="1.4" />
      {pattern ? <polygon points={pts} fill={pattern} /> : null}
      <text x="0" y="0.6" textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="800" fill="var(--ink)" stroke="white" strokeWidth="1.6" paintOrder="stroke" fontFamily="var(--font-display)">
        {letterOf(row)}
      </text>
    </svg>
  );
}

function ShrineIcon({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  // A four-pointed lantern spark.
  const d = `M${x} ${y - 2.6 * s}L${x + 0.9 * s} ${y - 0.9 * s}L${x + 2.6 * s} ${y}L${x + 0.9 * s} ${y + 0.9 * s}L${x} ${y + 2.6 * s}L${x - 0.9 * s} ${y + 0.9 * s}L${x - 2.6 * s} ${y}L${x - 0.9 * s} ${y - 0.9 * s}Z`;
  return <path d={d} fill="#fff4c2" stroke="var(--ink)" strokeWidth={0.6} strokeLinejoin="round" />;
}

function HomeIcon({ x, y }: { x: number; y: number }) {
  return <path d={`M${x - 2.4} ${y + 2}V${y - 0.4}L${x} ${y - 2.6}L${x + 2.4} ${y - 0.4}V${y + 2}Z`} fill="#fff" stroke="var(--ink)" strokeWidth={0.6} strokeLinejoin="round" />;
}

function HillIcon({ x, y }: { x: number; y: number }) {
  return <path d={`M${x - 4.2} ${y + 2.6}L${x - 1.2} ${y - 2.4}L${x + 0.6} ${y + 0.2}L${x + 1.8} ${y - 1.4}L${x + 4.2} ${y + 2.6}Z`} fill="rgb(255 255 255 / 0.32)" stroke="rgb(255 255 255 / 0.55)" strokeWidth={0.5} strokeLinejoin="round" />;
}

/** Fort pips along the bottom of a land: filled for each fort, hollow up to the most it can hold. */
function FortPips({ x, y, fort, max, big = false }: { x: number; y: number; fort: number; max: number; big?: boolean }) {
  if (fort < 0) {
    return (
      <text x={x} y={y + 0.3} textAnchor="middle" dominantBaseline="middle" fontSize="3.6" fontWeight="800" fill="var(--ink)" stroke="white" strokeWidth="1" paintOrder="stroke">
        ?
      </text>
    );
  }
  if (fort === 0) return null;
  const gap = (max > 3 ? 2.15 : 2.6) * (big ? 1.18 : 1);
  const r = (max > 3 ? 0.8 : 0.95) * (big ? 1.3 : 1);
  return (
    <g>
      {Array.from({ length: fort }, (_, i) => (
        <circle key={i} cx={x + (i - (fort - 1) / 2) * gap} cy={y} r={r} fill="var(--ink)" stroke="white" strokeWidth={0.45} />
      ))}
    </g>
  );
}

interface LandInfo {
  label: string;
  owner: number;
  fort: number;
  shrine: boolean;
  home: boolean;
  blocked: 'lake' | 'hill' | null;
}

function useLandInfo(view: LanternLandsView) {
  return useMemo(() => {
    const g = grid(view.map.radius);
    const shrines = new Set(view.map.shrines);
    const homes = new Set(view.map.homes);
    const lakes = new Set(view.map.lakes);
    const hills = new Set(view.map.hills);
    const nearShrine = g.hexes.map((_, i) => g.adj[i]!.some((n) => shrines.has(n)));
    return {
      g,
      nearShrine,
      info: (i: number): LandInfo => ({
        label: g.labels[i] ?? '?',
        owner: view.owner[i] ?? NOBODY,
        fort: view.fort[i] ?? 0,
        shrine: shrines.has(i),
        home: homes.has(i),
        blocked: lakes.has(i) ? 'lake' : hills.has(i) ? 'hill' : null,
      }),
    };
  }, [view.map, view.owner, view.fort]);
}

function landWords(l: LandInfo, view: LanternLandsView, me: number | null): string {
  const kind = l.shrine ? (l.label === grid(view.map.radius).labels[grid(view.map.radius).centre] ? 'the centre shrine' : 'a shrine') : l.home ? 'a home' : 'a land';
  if (l.blocked) return `${l.label}, a ${l.blocked}`;
  if (l.owner === UNSEEN) return `${l.label}, hidden by fog`;
  const who = l.owner === NOBODY ? 'nobody holds it' : l.owner === me ? 'your team holds it' : `the ${view.teams[l.owner]?.name ?? 'other team'} hold it`;
  const forts = l.owner < 0 || l.home ? '' : l.fort < 0 ? ', forts hidden' : `, ${plural(l.fort, 'fort')}`;
  return `${l.label}, ${kind}: ${who}${forts}`;
}

/* ---------------------------------- map ---------------------------------- */

interface MapProps {
  view: LanternLandsView;
  me: number | null;
  /** Lands the player can act on, outlined and labelled. */
  actionable?: Map<number, Action[]>;
  selected?: number | null;
  onSelect?: (land: number) => void;
  gameNow: () => number;
  big?: boolean;
  className?: string;
  label: string;
}

/** The map: every land as a hexagon in its team's colour and pattern, with its letter, forts, shrine or home. */
function LandsMap({ view, me, actionable, selected = null, onSelect, gameNow, big = false, className = '', label }: MapProps) {
  const uid = useId().replace(/:/g, '');
  const { g, info } = useLandInfo(view);
  const box = mapBounds(view.map.radius, HEX);
  const pad = 1.6;
  // Recent changes glow for a moment on the big screen.
  const glowing = (view.changes ?? []).length > 0;
  useNow(400, glowing);
  const now = gameNow();
  const moving = motionOK();
  const key = (e: KeyboardEvent, land: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(land);
    }
  };
  return (
    <svg viewBox={`${box.x - pad} ${box.y - pad} ${box.width + 2 * pad} ${box.height + 2 * pad}`} className={`block ${className}`} role="group" aria-label={label}>
      <TeamPatterns uid={uid} />
      {g.hexes.map((h, i) => {
        const l = info(i);
        const { x, y } = toPixel(h, HEX);
        const pts = hexPoints(x, y, HEX * 0.965);
        const acts = actionable?.get(i);
        const isMine = me !== null && l.owner === me;
        const fill = l.blocked === 'lake' ? '#2f5d9e' : l.blocked === 'hill' ? '#5b4a3a' : l.owner === UNSEEN ? 'rgb(8 6 34 / 0.78)' : l.owner >= 0 ? teamFill(view.teams[l.owner]?.hue ?? 0) : 'rgb(255 255 255 / 0.09)';
        const pattern = l.owner >= 0 ? patternFill(uid, l.owner) : l.blocked === 'lake' ? `url(#${uid}-lake)` : null;
        const showLabel = Boolean(acts?.length) && !big;
        const iconY = y - HEX * 0.52;
        const body = (
          <>
            <polygon points={pts} fill={fill} stroke={l.owner >= 0 ? 'var(--ink)' : 'rgb(255 255 255 / 0.22)'} strokeWidth={l.owner >= 0 ? 0.7 : 0.5} />
            {pattern ? <polygon points={pts} fill={pattern} pointerEvents="none" /> : null}
            {l.blocked === 'hill' ? <HillIcon x={x} y={y} /> : null}
            {l.shrine ? <ShrineIcon x={x} y={iconY} s={big ? 1.05 : 0.95} /> : null}
            {l.home ? <HomeIcon x={x} y={iconY} /> : null}
            {showLabel ? (
              <text x={x} y={y + 0.9} textAnchor="middle" dominantBaseline="middle" fontSize="4.6" fontWeight="800" fill="var(--ink)" stroke="white" strokeWidth="1.3" paintOrder="stroke">
                {l.label}
              </text>
            ) : l.owner >= 0 ? (
              <text x={x} y={y + 0.9} textAnchor="middle" dominantBaseline="middle" fontSize={big ? 6.4 : 5.6} fontWeight="800" fill="var(--ink)" stroke="white" strokeWidth="1.2" paintOrder="stroke" fontFamily="var(--font-display)">
                {letterOf(view.teams[l.owner])}
              </text>
            ) : null}
            {l.owner >= 0 && !l.home ? <FortPips x={x} y={y + HEX * 0.56} fort={l.fort} max={view.fortMax} big={big} /> : null}
            {acts?.length ? <polygon points={hexPoints(x, y, HEX * 0.86)} fill="none" stroke="var(--lantern)" strokeWidth={1.3} pointerEvents="none" /> : null}
            {isMine && !acts?.length && !big ? <polygon points={hexPoints(x, y, HEX * 0.88)} fill="none" stroke="white" strokeOpacity={0.5} strokeWidth={0.5} pointerEvents="none" /> : null}
            {selected === i ? <polygon points={hexPoints(x, y, HEX * 0.98)} fill="none" stroke="white" strokeWidth={1.6} pointerEvents="none" /> : null}
          </>
        );
        if (acts?.length && onSelect) {
          return (
            <g key={i} role="button" tabIndex={0} aria-label={`${landWords(l, view, me)}. You can ${acts.join(' or ')} it.`} aria-pressed={selected === i} onClick={() => onSelect(i)} onKeyDown={(e) => key(e, i)} className="cursor-pointer outline-none focus-visible:[&>polygon:first-child]:stroke-[var(--focus)] focus-visible:[&>polygon:first-child]:[stroke-width:1.6]">
              {body}
            </g>
          );
        }
        return (
          <g key={i} aria-hidden onClick={onSelect ? () => onSelect(i) : undefined} className={onSelect ? 'cursor-pointer' : undefined}>
            {body}
          </g>
        );
      })}
      {(view.changes ?? [])
        .filter((c) => now - c.at < 2600)
        .map((c) => {
          const h = g.hexes[c.land];
          if (!h) return null;
          const { x, y } = toPixel(h, HEX);
          const fade = moving ? Math.max(0, 1 - (now - c.at) / 2600) : 1;
          return <polygon key={`${c.land}-${c.at}`} points={hexPoints(x, y, HEX * 1.02)} fill="none" stroke="#fff6c9" strokeWidth={2.2} opacity={fade} pointerEvents="none" style={{ filter: `drop-shadow(0 0 2px ${teamFill(view.teams[c.team]?.hue ?? 50)})` }} />;
        })}
    </svg>
  );
}

/* ---------------------------- shared readouts ---------------------------- */

/** "Event in 0:40", or the event now running with its countdown. */
function EventPill({ view, gameNow, big = false }: { view: LanternLandsView; gameNow: () => number; big?: boolean }) {
  const size = big ? 'px-5 py-1.5 text-[clamp(1.1rem,1.8vw,2rem)]' : 'px-2.5! py-0.5! text-sm';
  if (view.event) {
    const Icon = EVENT_ICON[view.event.kind];
    return (
      <Pill tone={EVENT_TONE[view.event.kind]} className={size}>
        <Icon className="size-[1.1em] shrink-0" aria-hidden />
        {view.event.label} <Countdown until={view.event.endsAt} gameNow={gameNow} label={`${view.event.label} ends in`} />
      </Pill>
    );
  }
  if (view.nextEvent) {
    return (
      <Pill className={size}>
        <Hourglass className="size-[1.05em] shrink-0" aria-hidden />
        Event in <Countdown until={view.nextEvent.at} gameNow={gameNow} label="Next room event in" />
      </Pill>
    );
  }
  return null;
}

/** The energy a player holds, as big pips. */
function EnergyPips({ energy, cap }: { energy: number; cap: number }) {
  return (
    <div className="flex items-center gap-1" role="meter" aria-label="Energy" aria-valuenow={energy} aria-valuemin={0} aria-valuemax={cap} aria-valuetext={`${energy} of ${cap} energy`}>
      <Zap className="size-5 shrink-0 text-lantern" aria-hidden />
      {Array.from({ length: cap }, (_, i) => (
        <span key={i} className={`size-[1.15rem] rounded-full border-2 transition-colors ${i < energy ? 'border-ink bg-lantern' : 'border-white/40 bg-white/10'}`} />
      ))}
    </div>
  );
}

function scoringWords(view: LanternLandsView) {
  const every = Math.round(view.scoring.every / 1000);
  return view.scoring.shrinesOnly ? `Every ${every} seconds each team scores 5 points per shrine. Other lands score nothing.` : `Every ${every} seconds each team scores 1 point per land and 3 more per shrine.`;
}

/* --------------------------------- player -------------------------------- */

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
    const t = setTimeout(() => setFeedback(null), feedback.correct ? 1100 : 2400);
    return () => clearTimeout(t);
  }, [feedback]);
  return { feedback, answered: feedback ? (asked.current.get(feedback.iid) ?? null) : null, dismiss: () => setFeedback(null) };
}

function useWide() {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

const MOVE_SOUND: Record<MoveKind, 'build' | 'shield' | 'hit' | 'capture'> = { claim: 'build', fortify: 'shield', raid: 'hit', capture: 'capture' };

/** Plays `name` when `key` changes while the screen is up (not when it first appears), if `enabled`. One sound per moment. */
function useChangeSfx(name: SfxName, key: unknown, enabled: boolean) {
  const first = useRef(true);
  const latest = useRef(enabled);
  latest.current = enabled;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (latest.current) playSfx(name);
  }, [key, name]);
}

function moveWords(move: NonNullable<NonNullable<LanternLandsView['you']>['move']>, view: LanternLandsView, before: number | null): string {
  const label = grid(view.map.radius).labels[move.land] ?? '?';
  switch (move.kind) {
    case 'claim':
      return `You claimed ${label}.${move.fort ? ' It starts with 1 fort.' : ''}`;
    case 'fortify':
      return `You fortified ${label}: ${plural(move.fort, 'fort')}.`;
    case 'raid':
      return `You raided ${label}: ${move.fort ? `${plural(move.fort, 'fort')} left` : 'no forts left, so the next raid captures it'}.`;
    case 'capture':
      return `You captured ${label}${before !== null && before >= 0 ? ` from the ${view.teams[before]?.name ?? 'other team'}` : ''}!`;
  }
}

interface Choice {
  land: number;
  action: Action;
  cost: number;
  text: string;
  note: string;
  hot: boolean;
}

/** Every move the player can make right now, in a fixed order (shrines first, then by name) so the list does not jump about. */
function choicesFor(view: LanternLandsView, nearShrine: boolean[]): Choice[] {
  const you = view.you!;
  const g = grid(view.map.radius);
  const shrines = new Set(view.map.shrines);
  const label = (l: number) => g.labels[l] ?? '?';
  const rank = (l: number) => (shrines.has(l) ? 0 : nearShrine[l] ? 1 : 2) * 1000 + l;
  const sorted = (ls: number[]) => [...ls].sort((a, b) => rank(a) - rank(b));
  const storm = view.event?.kind === 'storm';
  const out: Choice[] = [];
  for (const l of sorted(you.options.claim)) {
    out.push({ land: l, action: 'claim', cost: 1, text: `Claim ${label(l)}`, note: shrines.has(l) ? 'Light this shrine!' : nearShrine[l] ? 'Next to a shrine' : 'Empty land', hot: shrines.has(l) });
  }
  for (const l of sorted(you.options.raid)) {
    const f = view.fort[l] ?? 0;
    const who = view.teams[view.owner[l] ?? 0]?.name ?? 'Rival';
    const cost = shrines.has(l) ? SHRINE_RAID_COST : 1;
    out.push({ land: l, action: 'raid', cost, text: `Raid ${label(l)}`, note: storm ? `${who}: the storm protects it` : f < 0 ? `${who}${shrines.has(l) ? ' shrine' : ''}, forts hidden` : f === 0 ? `${who}${shrines.has(l) ? ' shrine' : ''}: no forts, capture it!` : `${who}${shrines.has(l) ? ' shrine' : ''}: ${plural(f, 'fort')}`, hot: f === 0 && !storm });
  }
  for (const l of sorted(you.options.fortify)) {
    const f = view.fort[l] ?? 0;
    const border = g.adj[l]!.some((n) => (view.owner[n] ?? NOBODY) >= 0 && view.owner[n] !== you.team);
    out.push({ land: l, action: 'fortify', cost: shrines.has(l) ? SHRINE_FORT_COST : 1, text: `Fortify ${label(l)}`, note: `${shrines.has(l) ? 'Shrine, ' : border ? 'Border, ' : ''}${f} of ${view.fortMax} forts`, hot: border && f === 0 });
  }
  return out;
}

const ACTION_TITLE: Record<Action, string> = { claim: 'Claim an empty land', raid: 'Raid a rival land', fortify: 'Fortify your land' };
const ACTION_HELP: Record<Action, string> = {
  claim: '1 energy. It becomes your team’s.',
  raid: '1 energy, 2 for a shrine. Takes a fort off; a land with none becomes yours.',
  fortify: '1 energy, 2 for a shrine. Each fort stops one raid.',
};

/** The big-button lists of moves. While a finger is down the list holds still, so a move cannot jump under it. */
function MoveLists({ view, choices, busy, disabled, onMove }: { view: LanternLandsView; choices: Choice[]; busy: boolean; disabled: boolean; onMove: (c: Choice) => void }) {
  const [held, setHeld] = useState<Choice[] | null>(null);
  const release = useRef(0);
  const [all, setAll] = useState<Record<Action, boolean>>({ claim: false, raid: false, fortify: false });
  const shown = held ?? choices;
  const energy = view.you!.energy;
  const storm = view.event?.kind === 'storm';
  const hold = () => {
    window.clearTimeout(release.current);
    setHeld((h) => h ?? choices);
  };
  const letGo = () => {
    window.clearTimeout(release.current);
    release.current = window.setTimeout(() => setHeld(null), 450);
  };
  useEffect(() => () => window.clearTimeout(release.current), []);
  return (
    <div className="flex flex-col gap-3" onPointerDown={hold} onPointerUp={letGo} onPointerCancel={letGo} onPointerLeave={letGo}>
      {(['claim', 'raid', 'fortify'] as const).map((action) => {
        const list = shown.filter((c) => c.action === action);
        const limit = all[action] ? list.length : 4;
        return (
          <section key={action} aria-labelledby={`ll-${action}`} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <h3 id={`ll-${action}`} className="font-display text-lg leading-tight font-extrabold">
                {ACTION_TITLE[action]} <span className="text-base font-bold text-text-2">({list.length})</span>
              </h3>
            </div>
            <p className="text-sm leading-snug font-semibold text-text-2">{action === 'raid' && storm ? 'The lantern storm protects every land: raids wait until it passes.' : ACTION_HELP[action]}</p>
            {list.length ? (
              <ul className="grid grid-cols-1 gap-1.5 min-[480px]:grid-cols-2">
                {list.slice(0, limit).map((c) => {
                  const off = disabled || busy || energy < c.cost || (action === 'raid' && storm);
                  return (
                    <li key={`${c.action}-${c.land}`}>
                      <button
                        type="button"
                        onClick={() => onMove(c)}
                        disabled={off}
                        className={`flex min-h-[3.25rem] w-full items-center justify-between gap-2 rounded-[14px] border-[3px] px-3 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${c.hot && !off ? 'border-ink bg-lantern text-on-accent shadow-[0_3px_0_var(--ink)]' : 'border-white/25 bg-white/10 text-text hover:bg-white/15'}`}
                      >
                        <span className="min-w-0">
                          <span className="block font-display text-base leading-tight font-extrabold">{c.text}</span>
                          <span className={`block truncate text-sm font-semibold ${c.hot && !off ? 'text-on-accent' : 'text-text-2'}`}>{c.note}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-0.5 font-display text-sm font-extrabold">
                          <Zap className="size-4" aria-hidden />
                          {c.cost}
                          <span className="sr-only"> energy</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm font-semibold text-text-2">{action === 'claim' ? 'No empty land next to your team right now.' : action === 'raid' ? 'No rival land next to yours yet.' : 'Every land you could fortify is as strong as it gets.'}</p>
            )}
            {list.length > 4 ? (
              <button type="button" className="self-start rounded-[10px] px-2 py-2 text-sm font-bold text-link hover:bg-white/10" onClick={() => setAll((a) => ({ ...a, [action]: !a[action] }))} aria-expanded={all[action]}>
                {all[action] ? 'Show fewer' : `Show all ${list.length}`}
              </button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

/** The land a player tapped: who holds it, its forts, and what they can do with it. */
function LandPanel({ view, land, choices, busy, disabled, onMove, onClose }: { view: LanternLandsView; land: number; choices: Choice[]; busy: boolean; disabled: boolean; onMove: (c: Choice) => void; onClose: () => void }) {
  const { info } = useLandInfo(view);
  const l = info(land);
  const me = view.you!.team;
  const here = choices.filter((c) => c.land === land);
  const owner = l.owner >= 0 ? view.teams[l.owner] : undefined;
  let why = '';
  if (!here.length) {
    if (l.blocked) why = `Nobody can light a ${l.blocked}.`;
    else if (l.owner === UNSEEN) why = 'The fog hides this land. Claim lands nearby to see it.';
    else if (l.home) why = l.owner === me ? 'Your home. Homes can never be raided.' : 'A home. Homes can never be raided.';
    else if (l.owner === me) why = `It already has ${plural(Math.max(0, l.fort), 'fort')}, the most it can hold.`;
    else why = 'It is not next to your team’s lands.';
  }
  return (
    <StagePanel as="section" label={`Land ${l.label}`} className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        {owner ? <TeamBadge team={l.owner} row={owner} size={34} /> : null}
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-tight font-extrabold">
            {l.label}
            {l.shrine ? ' · shrine' : ''}
            {l.home ? ' · home' : ''}
          </p>
          <p className="text-sm font-semibold text-text-2">
            {l.blocked
              ? l.blocked === 'lake'
                ? 'A lake'
                : 'A hill'
              : l.owner === UNSEEN
                ? 'Hidden by fog'
                : l.owner === NOBODY
                  ? 'Empty land'
                  : `${l.owner === me ? 'Your team' : `The ${owner?.name}`}${l.home ? '' : l.fort < 0 ? ', forts hidden' : `, ${l.fort} of ${view.fortMax} forts`}`}
          </p>
        </div>
        <button type="button" onClick={onClose} className="min-h-11 rounded-[12px] px-3 font-bold text-text-2 hover:bg-white/10">
          Close
        </button>
      </div>
      {here.length ? (
        <div className="flex flex-wrap gap-2">
          {here.map((c) => (
            <Button key={c.action} variant={c.action === 'raid' ? 'danger' : c.action === 'claim' ? 'primary' : 'success'} size="lg" disabled={disabled || busy || view.you!.energy < c.cost || (c.action === 'raid' && view.event?.kind === 'storm')} onClick={() => onMove(c)} icon={c.action === 'raid' ? <Swords className="size-5" aria-hidden /> : c.action === 'claim' ? <Flame className="size-5" aria-hidden /> : <Shield className="size-5" aria-hidden />}>
              {c.action === 'claim' ? 'Claim' : c.action === 'raid' ? 'Raid' : 'Fortify'} ({plural(c.cost, 'energy', 'energy')})
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm font-semibold text-text-2">{why}</p>
      )}
    </StagePanel>
  );
}

/** How the game works, with the odds of the next event. */
function HowItWorks({ view }: { view: LanternLandsView }) {
  const you = view.you!;
  const shrineBonus = view.scoring.shrinesOnly ? 'Only shrines score: 5 points each.' : 'Shrines score 3 more than other lands.';
  return (
    <details className={`rounded-[18px] border border-white/12 px-3 py-2 ${NIGHT}`}>
      <summary className="min-h-11 cursor-pointer py-2 font-display text-lg font-extrabold">How it works and the odds</summary>
      <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm leading-snug font-semibold text-text-2">
        <li>A right answer gives 1 energy; after 3 right in a row, each gives 2. You can hold {you.cap}.</li>
        <li>{scoringWords(view)} {view.scoring.shrinesOnly ? '' : shrineBonus}</li>
        <li>The last 45 seconds are the final glow: every score counts double.</li>
        <li>Teams behind on lands, and teams with fewer players, fill a bonus meter with every right answer. Each time it fills, the next right answer on that team earns 1 more energy.</li>
        {view.nextEvent ? (
          <li>
            The next room event is one of these, picked at random (never the same as the last one):{' '}
            {view.nextEvent.pool.map((p, i) => (
              <span key={p.kind}>
                {i ? ', ' : ''}
                {p.label} {p.chance}%
              </span>
            ))}
            .
          </li>
        ) : (
          <li>No more room events this game.</li>
        )}
        <li>Lantern storm: no raids. Shrine bloom: shrines score double. Double energy: every right answer gives 2. Rumbling ground: every fort drops by 1. Fog: rival forts are hidden.</li>
      </ul>
    </details>
  );
}

function BoostLine({ view }: { view: LanternLandsView }) {
  const b = view.you?.boost;
  if (!b || (b.small <= 0 && b.under <= 0)) return null;
  const pct = Math.round((b.small + b.under) * 100);
  const why = [b.small > 0 ? `your team has ${plural(b.players, 'player')} to the biggest team’s ${b.biggest}` : '', b.under > 0 ? `your team holds ${plural(b.lands, 'land')} to the leaders’ ${b.most}` : ''].filter(Boolean).join(' and ');
  return (
    <p className="flex items-center gap-1.5 text-sm leading-snug font-semibold text-text-2">
      <Sparkles className="size-4 shrink-0 text-glim" aria-hidden />
      <span>
        Bonus energy: +{pct}% with every right answer, because {why}.
      </span>
    </p>
  );
}

export function LanternLandsPlayer({ view, act, gameNow, paused }: ModeScreenProps<LanternLandsView>) {
  const you = view.you;
  const flow = useAnswerFlow(you?.last, you?.question);
  const wide = useWide();
  const [tab, setTab] = useState<'questions' | 'map'>('questions');
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean; key: string } | null>(null);
  const { nearShrine } = useLandInfo(view);
  const shared = useSharedSounds();
  const tabsId = useId().replace(/:/g, '');

  // My own moves: words and a sound on this device as each one lands.
  const moveKey = you?.move ? `${you.move.at}-${you.move.land}-${you.move.kind}-${you.move.fort}` : null;
  const ownerBefore = useRef<number[]>(view.owner);
  useEffect(() => {
    if (!you?.move || !moveKey) return;
    setNote({ text: moveWords(you.move, view, ownerBefore.current[you.move.land] ?? null), ok: true, key: moveKey });
    playSfx(MOVE_SOUND[you.move.kind]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveKey]);
  // A shrine my team held being taken is my team's loss: one sound, on this device.
  const myShrines = you ? view.map.shrines.filter((s) => view.owner[s] === you.team).join(',') : '';
  const lastShrines = useRef(myShrines);
  useEffect(() => {
    const before = lastShrines.current.split(',').filter(Boolean);
    const now = myShrines.split(',').filter(Boolean);
    if (before.some((s) => !now.includes(s) && (view.owner[Number(s)] ?? NOBODY) >= 0)) playSfx('stolen');
    lastShrines.current = myShrines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myShrines]);
  useEffect(() => {
    ownerBefore.current = view.owner;
  });
  useAnnounce(note?.text, note?.key);
  useAnnounce(view.event ? `${view.event.label}. ${view.event.text}` : null, view.event?.endsAt);
  useAnnounce(view.finalStretch ? 'Final glow! Every score counts double.' : null, view.finalStretch);
  useChangeSfx('event', view.event?.endsAt ?? null, shared && Boolean(view.event));
  useChangeSfx('powerUp', view.finalStretch, shared && view.finalStretch);

  if (!you) return <p className="font-semibold text-text-2">Watching the map.</p>;
  const team = view.teams[you.team];
  const choices = choicesFor(view, nearShrine);
  const actionable = new Map<number, Action[]>();
  for (const c of choices) actionable.set(c.land, [...(actionable.get(c.land) ?? []), c.action]);
  const over = view.winners !== null;

  const move = async (c: Choice) => {
    setBusy(true);
    const ack = await act({ type: c.action, land: c.land });
    setBusy(false);
    if (!ack.ok) {
      setNote({ text: ack.error.message, ok: false, key: `${Date.now()}` });
      playSfx('bust');
    }
  };
  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };

  const full = you.energy >= you.cap;
  const header = (
    <StagePanel as="section" label="Your team" className="flex flex-col gap-1.5 px-2.5 py-2 sm:gap-2 sm:px-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <TeamBadge team={you.team} row={team} size={32} />
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display text-lg font-extrabold">{team?.name}</p>
            <p className="text-sm font-bold text-text-2">
              {plural(team?.points ?? 0, 'point')} · {plural(team?.lands ?? 0, 'land')}
              <span className="sr-only">, {patternName(you.team)} lands with the letter {letterOf(team)}</span>
            </p>
          </div>
        </div>
        <EnergyPips energy={you.energy} cap={you.cap} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <EventPill view={view} gameNow={gameNow} />
        {view.finalStretch ? (
          <Pill tone="lantern" className="px-2.5! py-0.5! text-sm">
            <Flame className="size-4" aria-hidden /> Final glow ×2
          </Pill>
        ) : null}
        <Pill className="px-2.5! py-0.5! text-sm">
          <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
        </Pill>
        {you.streak > 2 ? (
          <Pill tone="glim" className="px-2.5! py-0.5! text-sm">
            Streak {you.streak}
          </Pill>
        ) : null}
      </div>
    </StagePanel>
  );

  const questions = (
    <div className="flex flex-col gap-3">
      {flow.feedback ? (
        <div className="flex flex-col gap-3">
          <ResultBanner key={flow.feedback.iid} correct={flow.feedback.correct} partial={flow.feedback.partial} text={flow.feedback.text} />
          {!flow.feedback.correct && flow.answered ? <RevealAnswer q={flow.answered.q} reveal={flow.feedback.reveal} compact /> : null}
          {!flow.feedback.correct ? <Explanation text={flow.feedback.explanation} /> : null}
          <button type="button" onClick={flow.dismiss} className="min-h-11 self-center rounded-[12px] px-4 py-2 font-bold text-text-2 hover:bg-white/10">
            Next question
          </button>
        </div>
      ) : you.question ? (
        <div className="flex flex-col gap-4">
          <QuestionCard q={you.question.q} />
          <AnswerInput key={you.question.iid} q={you.question.q} onSubmit={submit} disabled={paused || over} compact />
        </div>
      ) : null}
      {!wide && you.energy > 0 ? (
        <div className={`flex items-center justify-between gap-2 rounded-[16px] border-2 px-3 py-2 ${full ? 'border-lantern' : 'border-white/15'} ${NIGHT}`}>
          <p className="text-sm font-bold">{full ? 'Your energy is full. Spend it before your next answer!' : `You have ${plural(you.energy, 'energy', 'energy')} to spend.`}</p>
          <Button size="md" variant={full ? 'primary' : 'secondary'} className="min-h-11" icon={<MapIcon className="size-4" aria-hidden />} onClick={() => setTab('map')}>
            Map
          </Button>
        </div>
      ) : null}
    </div>
  );

  const map = (
    <div className="flex flex-col gap-3">
      {note ? (
        <p className={`rounded-[14px] border-2 px-3 py-2 text-sm font-bold ${note.ok ? 'border-glim' : 'border-ember'} ${NIGHT}`} role={note.ok ? undefined : 'alert'}>
          {note.text}
        </p>
      ) : null}
      {view.event ? (
        <p className={`flex items-start gap-2 rounded-[14px] border border-white/15 px-3 py-2 text-sm font-semibold ${NIGHT}`}>
          {(() => {
            const Icon = EVENT_ICON[view.event.kind];
            return <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />;
          })()}
          <span>
            <span className="font-extrabold">{view.event.label}:</span> {view.event.text}
          </span>
        </p>
      ) : null}
      <LandsMap
        view={view}
        me={you.team}
        actionable={actionable}
        selected={selected}
        onSelect={(l) => setSelected((s) => (s === l ? null : l))}
        gameNow={gameNow}
        className="mx-auto h-auto max-h-[min(62dvh,34rem)] w-full"
        label={`The map. Your team, the ${team?.name}, holds ${plural(team?.lands ?? 0, 'land')} and ${plural(team?.shrines ?? 0, 'shrine')}. Outlined lands are ones you can act on.`}
      />
      {selected !== null ? <LandPanel view={view} land={selected} choices={choices} busy={busy} disabled={paused || over} onMove={(c) => void move(c)} onClose={() => setSelected(null)} /> : null}
      <BoostLine view={view} />
      <MoveLists view={view} choices={choices} busy={busy} disabled={paused || over} onMove={(c) => void move(c)} />
      <ShrineList view={view} me={you.team} />
      <HowItWorks view={view} />
    </div>
  );

  if (wide) {
    return (
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start gap-5">
        <div className="flex flex-col gap-3">
          {header}
          {questions}
        </div>
        <div className="flex flex-col gap-3">{map}</div>
      </div>
    );
  }
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5 sm:gap-3">
      {header}
      <div role="tablist" aria-label="Questions or map" className={`grid grid-cols-2 gap-1 rounded-[16px] border border-white/12 p-1 ${NIGHT}`}>
        {(['questions', 'map'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`${tabsId}-${t}`}
            aria-selected={tab === t}
            aria-controls={`${tabsId}-${t}-panel`}
            onClick={() => setTab(t)}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-[12px] font-display text-base font-extrabold transition-colors ${tab === t ? 'bg-white/90 text-[#1d1846]' : 'text-text hover:bg-white/10'}`}
          >
            {t === 'questions' ? 'Questions' : 'Map'}
            {t === 'map' && you.energy > 0 ? (
              <span className={`inline-flex items-center gap-0.5 rounded-full border-2 border-ink px-1.5 text-sm ${full ? 'bg-lantern text-on-accent' : 'bg-glim text-on-accent'}`}>
                <Zap className="size-3.5" aria-hidden />
                {you.energy}
                <span className="sr-only"> energy to spend</span>
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${tabsId}-${tab}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
        {tab === 'questions' ? questions : map}
      </div>
    </div>
  );
}

/** Who holds each shrine, in words, for anyone who cannot see the map. */
function ShrineList({ view, me }: { view: LanternLandsView; me: number | null }) {
  const g = grid(view.map.radius);
  return (
    <div className="sr-only">
      <h3>Shrines</h3>
      <ul>
        {view.map.shrines.map((s) => {
          const o = view.owner[s] ?? NOBODY;
          return <li key={s}>{`${s === g.centre ? 'Centre shrine' : `Shrine ${g.labels[s]}`}: ${o === UNSEEN ? 'hidden by fog' : o === NOBODY ? 'unlit' : o === me ? 'your team' : `the ${view.teams[o]?.name}`}`}</li>;
        })}
      </ul>
    </div>
  );
}

/* ---------------------------------- host --------------------------------- */

/** One team on the scoreboard, with a ticker that pops up at each scoring. */
function TeamCard({ view, team }: { view: LanternLandsView; team: number }) {
  const t = view.teams[team]!;
  const last = view.scoring.last;
  const pop = motionOK() ? { animation: 'pop-in 320ms var(--ease-spring)' } : undefined;
  const winning = t.points > 0 && t.points === Math.max(...view.teams.map((x) => x.points));
  return (
    <li className={`flex min-h-[clamp(2.75rem,6.4vh,4.5rem)] items-center gap-[clamp(0.5rem,1vw,0.9rem)] rounded-[18px] border px-[clamp(0.6rem,1vw,1rem)] py-1 ${winning ? 'border-lantern ring-2 ring-lantern' : 'border-white/12'} ${NIGHT}`}>
      <TeamBadge team={team} row={t} size={44} className="size-[clamp(2rem,4.6vh,3.25rem)]" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate font-display text-[clamp(1.15rem,min(1.9vw,3.4vh),2.2rem)] font-extrabold">
          {t.name}
          <span className="sr-only">, {patternName(team)}</span>
        </div>
        <div className="truncate text-[clamp(0.85rem,min(1.15vw,2.1vh),1.3rem)] font-semibold text-text-2">
          {plural(t.lands, 'land')} · {plural(t.shrines, 'shrine')}
          {t.players === 0 ? ' · nobody left' : ''}
        </div>
      </div>
      {last !== null && t.gain > 0 ? (
        <span key={last} className="shrink-0 rounded-full border-2 border-ink bg-glim px-2 py-0.5 font-display text-[clamp(0.95rem,min(1.4vw,2.6vh),1.6rem)] font-extrabold text-on-accent tabular" style={pop}>
          +{formatNumber(t.gain)}
        </span>
      ) : null}
      <span className="min-w-[3ch] shrink-0 text-right font-display text-[clamp(1.5rem,min(2.6vw,4.6vh),3rem)] leading-none font-extrabold tabular">
        {formatNumber(t.points)}
        <span className="sr-only"> points</span>
      </span>
    </li>
  );
}

/** The final glow, or the room event now running, in one line beside the title. */
function HostBanner({ view, gameNow }: { view: LanternLandsView; gameNow: () => number }) {
  if (view.finalStretch && !view.winners) {
    return (
      <div className="flex min-w-0 items-center gap-3 rounded-[18px] border-[3px] border-ink bg-lantern px-4 py-1.5 text-on-accent shadow-[0_4px_0_var(--ink)]">
        <Flame className="size-[clamp(1.5rem,3vh,2.4rem)] shrink-0" aria-hidden />
        <p className="min-w-0 font-display text-[clamp(1.15rem,min(1.9vw,3.4vh),2.3rem)] leading-tight font-extrabold">Final glow! Every score counts double.</p>
      </div>
    );
  }
  if (view.event) {
    const Icon = EVENT_ICON[view.event.kind];
    return (
      <div className={`flex min-w-0 items-center gap-3 rounded-[18px] border-2 border-lantern px-4 py-1.5 ${NIGHT}`}>
        <Icon className="size-[clamp(1.5rem,3vh,2.4rem)] shrink-0 text-lantern" aria-hidden />
        <p className="min-w-0 text-[clamp(1rem,min(1.6vw,2.9vh),1.9rem)] leading-tight font-semibold">
          <span className="font-display font-extrabold">{view.event.label}</span> <Countdown until={view.event.endsAt} gameNow={gameNow} label={`${view.event.label} ends in`} />. {EVENT_SHORT[view.event.kind]}
        </p>
      </div>
    );
  }
  return null;
}

export function LanternLandsHost({ view, gameNow, room }: ModeScreenProps<LanternLandsView>) {
  const text = 'text-[clamp(1rem,min(1.45vw,2.6vh),1.65rem)]';
  const heading = `font-display text-[clamp(1.25rem,min(2vw,3.6vh),2.3rem)] leading-tight font-extrabold ${SIGN}`;
  const order = view.teams.map((_, i) => i).sort((a, b) => (view.teams[b]!.points - view.teams[a]!.points) || a - b);
  const plays = (view.plays ?? []).slice(0, view.teams.length > 4 ? 3 : 4);
  const latestShrine = (view.plays ?? []).find((p) => p.shrine)?.at ?? null;
  const shared = useSharedSounds();
  useChangeSfx('event', view.event?.endsAt ?? null, shared && Boolean(view.event));
  useChangeSfx('powerUp', view.finalStretch, shared && view.finalStretch);
  useChangeSfx('capture', latestShrine, shared && latestShrine !== null);
  useAnnounce(view.event ? `${view.event.label}. ${view.event.text}` : null, view.event?.endsAt);
  useAnnounce(view.finalStretch ? 'Final glow! Every score counts double.' : null, view.finalStretch);
  const summary = view.teams.map((t) => `the ${t.name} hold ${plural(t.lands, 'land')} and ${plural(t.shrines, 'shrine')}`).join('; ');
  return (
    <div className="mx-auto flex w-full max-w-[120rem] flex-1 flex-col gap-[clamp(0.5rem,1.6vh,1.25rem)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className={`shrink-0 font-display text-[clamp(2rem,min(3.6vw,6.4vh),4.5rem)] leading-none font-extrabold ${SIGN}`}>Lantern Lands</h2>
        <div className="flex min-w-0 flex-1 justify-center">
          <HostBanner view={view} gameNow={gameNow} />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {!view.event && !view.finalStretch ? <EventPill view={view} gameNow={gameNow} big /> : null}
          <Pill className="px-5 py-1.5 text-[clamp(1.1rem,1.8vw,2rem)]">
            <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </Pill>
        </div>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-[clamp(0.75rem,1.6vw,1.5rem)] lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <StagePanel className={`relative flex items-center justify-center p-[clamp(0.3rem,0.8vh,0.75rem)] ${view.finalStretch ? 'shadow-[0_0_2.5rem_rgb(255_176_32/0.55)] ring-2 ring-lantern' : ''}`}>
          {/* As tall as the screen allows below the title, so the bottom row stays on a 768-pixel projector. */}
          <LandsMap view={view} me={null} gameNow={gameNow} big className="h-auto max-h-[calc(100dvh-16rem)] w-full min-[1600px]:max-h-[calc(100dvh-18.5rem)]" label={`The map: ${summary}.`} />
        </StagePanel>
        <div className="flex min-w-0 flex-col gap-[clamp(0.5rem,1.4vh,1rem)]">
          <section aria-labelledby="ll-teams">
            <h3 id="ll-teams" className={heading}>
              Teams
            </h3>
            <ol className="mt-1 flex flex-col gap-[clamp(0.3rem,0.8vh,0.6rem)]" aria-label="Team scores">
              {order.map((t) => (
                <TeamCard key={t} view={view} team={t} />
              ))}
            </ol>
            <p className={`mt-1 font-semibold text-text-2 ${text}`}>
              {view.scoring.next !== null ? (
                <>
                  Next scoring in <Countdown until={view.scoring.next} gameNow={gameNow} label="Next scoring in" />.{' '}
                </>
              ) : null}
              {view.scoring.shrinesOnly ? 'Shrines score 5 each.' : 'Each land scores 1, each shrine 3 more.'}
              {view.goal > 0 ? ` First to ${formatNumber(view.goal)} wins.` : ''}
            </p>
          </section>
          <section aria-labelledby="ll-plays" className="min-h-0">
            <h3 id="ll-plays" className={heading}>
              Big plays
            </h3>
            {plays.length ? (
              <ul className={`mt-1 flex flex-col gap-1.5 leading-tight ${text}`}>
                {plays.map((p) => (
                  <li key={`${p.at}-${p.text}`} className={`flex min-h-[clamp(2.25rem,5vh,3.5rem)] items-center gap-2.5 rounded-[16px] border border-white/12 px-3 py-1 ${NIGHT}`} style={motionOK() ? { animation: 'rise-fade 300ms var(--ease-out) both' } : undefined}>
                    {p.team >= 0 ? <TeamBadge team={p.team} row={view.teams[p.team]} size={30} /> : <Sparkles className="size-[1.2em] shrink-0 text-lantern" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate font-bold">{p.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`mt-1 font-semibold text-text-2 ${text}`}>Claim lands next to your home and race for the shrines!</p>
            )}
          </section>
          <TopPlayers view={view} players={room.players} />
        </div>
      </div>
    </div>
  );
}

function TopPlayers({ view, players }: { view: LanternLandsView; players: RoomPlayerView[] }) {
  const rows = (view.board ?? []).filter((r) => r.score > 0).slice(0, 3);
  if (!rows.length) return null;
  return (
    <section aria-labelledby="ll-top" className="max-[900px]:hidden [@media(max-height:899px)]:hidden">
      <h3 id="ll-top" className={`font-display text-[clamp(1.1rem,min(1.6vw,2.9vh),1.9rem)] leading-tight font-extrabold ${SIGN}`}>
        Lighting the way
      </h3>
      <ol className="mt-1 flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.playerId} className={`flex items-center gap-2 rounded-full border border-white/12 py-0.5 pr-3 pl-0.5 text-[clamp(0.9rem,min(1.3vw,2.3vh),1.5rem)] ${NIGHT}`}>
            <PlayerGlim avatar={avatarOf(players, r.playerId)} seed={r.playerId} size={36} className="size-[clamp(1.6rem,3.6vh,2.5rem)] shrink-0" />
            <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
            <span className="truncate font-semibold text-text-2">{r.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

