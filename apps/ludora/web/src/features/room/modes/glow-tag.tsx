import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Gauge, Package, ShieldCheck, Sun, Zap, type LucideIcon } from 'lucide-react';
import type { Answer, PulseView, RoomPlayerView } from '@ludora/shared';
import {
  CHARGE,
  COVER_KINDS,
  CRATE_INFO,
  RING,
  SCORE,
  TAG,
  TAG_WORDS,
  type ArenaMap,
  type CrateKind,
  type GlowTagHostView,
  type GlowTagPlayerView,
  type GlowTagPulse,
  type GlowTagYou,
} from '@ludora/engine/glow-tag';
import type { ModeScreenProps } from './registry.ts';
import { AnswerInput } from '../game/AnswerInput.tsx';
import { QuestionCard } from '../game/QuestionCard.tsx';
import { Countdown } from '../game/TimerBar.tsx';
import { ResultBanner } from '../game/Reveal.tsx';
import { Leaderboard, TeamScores } from '../game/Leaderboard.tsx';
import { Explanation, ModeTitle } from '../game/parts.tsx';
import { useAnnounce } from '../game/announce.tsx';
import { Pill, StagePanel, fallbackArt } from '../game/stage.tsx';
import { Dialog } from '../../../ui/primitives.tsx';
import { formatNumber } from '../../../lib/format.ts';
import { playSfx } from '../../../lib/sound/react.tsx';
import type { PulseSource } from '../../../lib/useRoom.ts';
import { Joystick, Stage3D, lookFor, useMoveInput, type GlimLook, type MoveInput } from '../../../three/index.ts';
import { Field, type Aim, type AnyView } from './glow-tag-field.ts';
import { CRATE_COLOUR, GlowTagHostScene, GlowTagScene } from './glow-tag-scene.ts';

/*
 * Glow Tag Royale screens. The park is the picture (3D, or a flat map with 3D
 * off); the controls are ordinary: walk with W A S D, the arrows or the stick,
 * tag with the big Tag button (or Space), and answer in the question panel.
 * The Tag button picks the nearest rival in front of you, in reach and in
 * sight, turns you to face them and tags: so a phone, a keyboard or a switch
 * is enough.
 */

/* --------------------------------- shared --------------------------------- */

const mapKey = (m: ArenaMap) => `${m.size}|${m.boxes.length}|${m.trees.length}|${m.boxes[0]?.join(',') ?? ''}`;

/** The client-side picture of the game: built once per park, fed every view and pulse. */
function useField(view: AnyView, meId: string | null, gameNow: () => number, pulse: PulseSource): Field {
  const key = mapKey(view.map);
  const clock = useRef(gameNow);
  clock.current = gameNow;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const field = useMemo(() => new Field(view.map, meId, () => clock.current()), [key, meId]);
  useEffect(() => field.applyView(view), [field, view]);
  useEffect(() => {
    const last = pulse.latest() as PulseView<GlowTagPulse> | null;
    if (last) field.applyPulse(last);
    return pulse.subscribe((p) => field.applyPulse(p as PulseView<GlowTagPulse>));
  }, [field, pulse]);
  return field;
}

/** Glim looks for players, from their avatars (or a stand-in that is always the same for them). */
function useLooks(players: RoomPlayerView[]): (id: string) => GlimLook {
  const ref = useRef(players);
  ref.current = players;
  return useCallback((id: string) => lookFor(ref.current.find((p) => p.id === id)?.avatar, fallbackArt(id)), []);
}

/** Re-render every `ms` while mounted (for the flat map and the HUD's timers). */
function useFrameTick(ms: number) {
  const [, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last >= ms) {
        last = t;
        setN((n) => (n + 1) % 1_000_000);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ms]);
}

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    const mq = matchMedia('(pointer: coarse)');
    const on = () => setCoarse(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return coarse;
}

/** Where the ring stands, in words. */
function ringLine(view: AnyView, now: number): string {
  const r = view.ring;
  if (r.final) return 'Final ring: nobody relights';
  if (now < r.endAt && now >= r.startAt) return 'The ring is shrinking';
  if (r.next) {
    const secs = Math.max(0, Math.ceil((r.next.startAt - now) / 1000));
    const which = r.phase + 1 === r.phases ? 'Final ring' : `Ring ${String(r.phase + 1)} of ${String(r.phases)}`;
    return `${which} in ${String(Math.floor(secs / 60))}:${String(secs % 60).padStart(2, '0')}`;
  }
  return 'Stay inside the ring';
}

/** The ring's state in words, kept up to date by itself (the rest of the screen redraws only on new views). */
function RingWords({ view, gameNow }: { view: AnyView; gameNow: () => number }) {
  useFrameTick(500);
  return <>{ringLine(view, gameNow())}</>;
}

/* ------------------------------ the flat map ------------------------------ */

const COVER_FILL = ['#2b7a41', '#b9783f', '#e5484d', '#c86bff'];

/** The park from above, for devices with 3D off. It moves with the same views and pulses as the 3D park. */
function ArenaMap2D({ field, view, gameNow, className = '' }: { field: Field; view: AnyView; gameNow: () => number; className?: string }) {
  useFrameTick(70);
  // An id safe inside url(#...), whatever characters React's ids use.
  const clip = `glow-tag-park${useId().replace(/[^\w-]/g, '')}`;
  const { size, boxes, trees } = field.map;
  const half = size / 2;
  const now = gameNow();
  const players = field.players(now).filter((p) => p.visible);
  const ring = field.ring(now);
  const font = Math.max(1, size / 40);
  const dot = Math.max(0.65, size / 55);
  const beams = view.beams.filter((b) => now - b.at < 500);
  const me = players.find((p) => p.me);
  return (
    <div className={`flex items-center justify-center bg-[#0b1020] ${className}`}>
      <svg
        viewBox={`${-half - 1} ${-half - 1} ${size + 2} ${size + 2}`}
        className="h-full max-h-full w-full max-w-full"
        preserveAspectRatio="xMidYMid meet"
        overflow="hidden"
        role="img"
        aria-label={`Map of the park from above: ${String(players.length)} players glowing${me ? ', you are the ringed dot' : ''}.`}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={-half} y={-half} width={size} height={size} />
          </clipPath>
        </defs>
        <rect x={-half} y={-half} width={size} height={size} fill="#2c5a3b" stroke="#7fe3ff" strokeWidth={0.25} />
        <rect x={-2.5} y={-half} width={5} height={size} fill="#575168" opacity={0.6} />
        <rect x={-half} y={-2.5} width={size} height={5} fill="#575168" opacity={0.6} />
        {boxes.map(([k, x, z, w, d], i) => (
          <rect key={`b${String(i)}`} x={x - w / 2} y={-z - d / 2} width={w} height={d} rx={k === 0 ? 0.4 : 0.15} fill={COVER_FILL[k] ?? '#888'} stroke="#0b1020" strokeWidth={0.12}>
            <title>{COVER_KINDS[k]}</title>
          </rect>
        ))}
        {trees.map(([x, z, r], i) => (
          <circle key={`t${String(i)}`} cx={x} cy={-z} r={r} fill="#24703a" stroke="#0b1020" strokeWidth={0.12} />
        ))}
        {ring ? (
          // Only the park is tinted outside the ring: a ring bigger than the park leaves it clear.
          <g clipPath={`url(#${clip})`}>
            <path
              d={`M ${-half} ${-half} h ${size} v ${size} h ${-size} Z M ${ring.cur.x + ring.cur.r} ${-ring.cur.z} a ${ring.cur.r} ${ring.cur.r} 0 1 0 ${-2 * ring.cur.r} 0 a ${ring.cur.r} ${ring.cur.r} 0 1 0 ${2 * ring.cur.r} 0 Z`}
              fill="#6b0f3a"
              fillOpacity={0.45}
              fillRule="evenodd"
            />
            <circle cx={ring.cur.x} cy={-ring.cur.z} r={ring.cur.r} fill="none" stroke="#ff5fa8" strokeWidth={0.35} />
            {ring.next ? <circle cx={ring.next.x} cy={-ring.next.z} r={ring.next.r} fill="none" stroke="#fff1d6" strokeWidth={0.2} strokeDasharray="1.2 1.2" /> : null}
          </g>
        ) : null}
        {field.crates().map((c) => (
          <g key={c.id}>
            <rect x={c.x - 0.6} y={-c.z - 0.6} width={1.2} height={1.2} rx={0.2} fill={CRATE_COLOUR[c.kind]} stroke="#0b1020" strokeWidth={0.12} />
            <title>{CRATE_INFO[c.kind].label}</title>
          </g>
        ))}
        {beams.map((b) => (
          <line key={b.n} x1={b.x1} y1={-b.z1} x2={b.x2} y2={-b.z2} stroke="#fffbe8" strokeWidth={0.3} strokeLinecap="round" opacity={1 - (now - b.at) / 500} />
        ))}
        {players.map((p) => (
          <g key={p.id}>
            <line x1={p.x} y1={-p.z} x2={p.x + Math.sin(p.h) * dot * 2.2} y2={-p.z - Math.cos(p.h) * dot * 2.2} stroke={p.colour} strokeWidth={dot * 0.45} strokeLinecap="round" />
            <circle cx={p.x} cy={-p.z} r={dot} fill={p.colour} stroke={p.me ? '#ffffff' : '#0b1020'} strokeWidth={p.me ? dot * 0.4 : dot * 0.18} />
            <text x={Math.max(-half + font * 2, Math.min(half - font * 2, p.x))} y={Math.max(-half + font, -p.z - dot * 1.6)} textAnchor="middle" fontSize={font} fontWeight={800} fill="#ffffff" stroke="#0b1020" strokeWidth={font * 0.14} paintOrder="stroke">
              {p.me ? 'You' : p.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ---------------------------------- words --------------------------------- */

function tagLine(you: GlowTagYou, glowOf: (id: string) => number | null): string | null {
  const t = you.lastTag;
  if (!t) return null;
  switch (t.outcome) {
    case 'hit': {
      const g = glowOf(t.target);
      return `${TAG_WORDS.hit} ${t.name}${g !== null ? ` has ${g === 1 ? '1 glow' : `${String(g)} glow`} left.` : '.'}`;
    }
    case 'dimmed':
      return `${TAG_WORDS.dimmed} ${t.name} is out of the arena.`;
    case 'shield':
      return `${TAG_WORDS.shield} ${t.name}'s shield is gone.`;
    default:
      return TAG_WORDS[t.outcome];
  }
}

function hitLine(you: GlowTagYou): string | null {
  const h = you.lastHit;
  if (!h) return null;
  if (h.outcome === 'shield') return `Your shield blocked ${h.name ?? 'a'} beam.`;
  if (!h.by) return h.outcome === 'dimmed' ? 'The ring dimmed you.' : `The ring took 1 glow. Get back inside! ${glowWords(you.glow)} left.`;
  return h.outcome === 'dimmed' ? `${h.name ?? 'Someone'} dimmed you.` : `${h.name ?? 'Someone'} tagged you. ${glowWords(you.glow)} left.`;
}

const glowWords = (n: number) => (n === 1 ? '1 glow' : `${String(n)} glow`);

/** A short line that shows for a few seconds when `key` changes (ignoring the first sight). */
function useFlash(text: string | null, key: unknown, ms = 2600): string | null {
  const [shown, setShown] = useState<string | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!text) return;
    setShown(text);
    const t = setTimeout(() => setShown(null), ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return shown;
}

/** Plays a sound when `key` changes after the first sight. */
function useLaterSfx(play: () => void, key: unknown) {
  const first = useRef(true);
  const latest = useRef(play);
  latest.current = play;
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (key !== null && key !== undefined) latest.current();
  }, [key]);
}

/* ----------------------------------- HUD ---------------------------------- */

function Stat({ label, value, icon: Icon, tone = 'calm' }: { label: string; value: ReactNode; icon: LucideIcon; tone?: 'calm' | 'glow' | 'good' | 'warn' }) {
  const colours = tone === 'glow' ? 'bg-lantern text-on-accent' : tone === 'good' ? 'bg-glim text-on-accent' : tone === 'warn' ? 'bg-ember text-on-accent' : 'bg-black/55 text-white';
  return (
    <div className={`flex min-w-0 items-center gap-1.5 rounded-[var(--radius-m)] px-2.5 py-1.5 backdrop-blur-sm ${colours}`}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">{label}:</span>
      <span className="truncate font-display text-lg leading-none font-extrabold tabular">{value}</span>
    </div>
  );
}

/** Seconds of speed boost left, while there are any. */
function SpeedLeft({ until, gameNow }: { until: number; gameNow: () => number }) {
  useFrameTick(250);
  const left = Math.ceil((until - gameNow()) / 1000);
  return left > 0 ? <Stat label="Speed boost seconds left" value={`${String(left)}s`} icon={Gauge} tone="good" /> : null;
}

function Pips({ have, max }: { have: number; max: number }) {
  return (
    <span aria-hidden className="tracking-[0.08em]">
      {'●'.repeat(Math.max(0, Math.min(max, have)))}
      <span className="opacity-40">{'●'.repeat(Math.max(0, max - have))}</span>
    </span>
  );
}

function TagButton({ aim, busy, onTag }: { aim: Aim; busy: boolean; onTag: () => void }) {
  const ready = Boolean(aim.target) && !busy;
  const name = aim.target?.name ?? null;
  return (
    <button
      type="button"
      onClick={onTag}
      disabled={!ready}
      aria-label={name ? `Tag ${name}` : `Tag: ${aim.reason ?? 'not ready'}`}
      className={`pointer-events-auto flex size-28 flex-col items-center justify-center gap-0.5 rounded-full border-4 px-2 text-center shadow-[0_6px_0_rgb(0_0_0/0.35)] transition-transform select-none active:translate-y-1 sm:size-32 ${
        ready ? 'border-white/80 bg-lantern text-on-accent' : 'border-white/20 bg-black/60 text-white/70'
      }`}
    >
      <Zap className="size-6" aria-hidden />
      <span className="font-display text-2xl leading-none font-extrabold">Tag</span>
      <span className="line-clamp-2 max-w-full text-xs leading-tight font-bold">{name ?? aim.reason}</span>
    </button>
  );
}

const pct = (p: number) => (p > 0 && p < 1 ? '<1%' : `${String(Math.round(p))}%`);

/** What a crate can hold, in words: "Charge pack 50%, Shield 25%, Speed boost 25%". */
function crateOddsLine(odds: { kind: CrateKind; percent: number }[]): string {
  return odds.map((o) => `${CRATE_INFO[o.kind].label} ${pct(o.percent)}`).join(', ');
}

function OddsDialog({ open, onOpenChange, odds }: { open: boolean; onOpenChange: (v: boolean) => void; odds: { kind: CrateKind; percent: number }[] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Crates and tags" description="What a crate holds is drawn when it appears. Walk into one to open it.">
      <table className="w-full text-left text-sm">
        <thead className="text-text-2">
          <tr>
            <th className="py-1 font-bold">Crate</th>
            <th className="py-1 text-right font-bold">Chance</th>
          </tr>
        </thead>
        <tbody>
          {odds.map((o) => (
            <tr key={o.kind} className="border-t border-line">
              <td className="py-1.5 font-semibold">
                <span className="mr-2 inline-block size-3 rounded-sm align-middle" style={{ background: CRATE_COLOUR[o.kind] }} aria-hidden />
                {CRATE_INFO[o.kind].label}
                <span className="block text-xs font-normal text-text-2">{CRATE_INFO[o.kind].blurb}</span>
              </td>
              <td className="py-1.5 text-right font-display text-base font-bold tabular">{pct(o.percent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm text-text-2">
        Tags are never left to chance. A tag costs 1 charge and hits if the player is within {String(TAG.range)} metres, inside a {String(TAG.coneDeg)}-degree cone in front of you, with nothing in
        between. A shield blocks one tag. Each tag scores {String(SCORE.tag)}, and dimming someone {String(SCORE.dim)} more.
      </p>
    </Dialog>
  );
}

/* --------------------------------- player --------------------------------- */

/** The park's size on the player's screen: shorter on a phone, so the question is on screen too. */
const STAGE_SIZE = 'h-[44vh] min-h-[260px] rounded-[var(--radius-l)] sm:h-[55vh] lg:h-[72vh]';

const interactive = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(el.tagName) || el.isContentEditable || Boolean(el.closest('[role="button"], [role="radiogroup"], [role="listbox"], [data-no-move]'));
};

export function GlowTagPlayer({ view, act, fire, pulse, gameNow, paused, room }: ModeScreenProps<GlowTagPlayerView>) {
  const you = view.you ?? null;
  const meId = room.me.playerId;
  const field = useField(view, meId, gameNow, pulse);
  const looks = useLooks(room.players);
  const [oddsOpen, setOddsOpen] = useState(false);
  // Walking and Space stop while the chances are open, so keys stay with the dialog.
  const input: MoveInput = useMoveInput(Boolean(you) && !oddsOpen);
  const coarse = useCoarsePointer();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [aim, setAim] = useState<Aim>({ target: null, reason: null });
  const oddsRef = useRef(oddsOpen);
  oddsRef.current = oddsOpen;
  const youRef = useRef(you);
  youRef.current = you;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const fireRef = useRef(fire);
  fireRef.current = fire;

  // Your walking, every frame, with 3D or without.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      // Up to a tenth of a second a frame, so a slow device still walks at full speed (walk() takes short steps).
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      field.step(dt, input, pausedRef.current, (a) => fireRef.current(a));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [field, input]);

  // Who the Tag button points at.
  useEffect(() => {
    const id = setInterval(() => {
      const next = field.aim(youRef.current);
      setAim((cur) => (cur.target?.id === next.target?.id && cur.target?.name === next.target?.name && cur.reason === next.reason ? cur : next));
    }, 120);
    return () => clearInterval(id);
  }, [field]);

  const tagNow = useCallback(async () => {
    const target = field.aim(youRef.current).target;
    if (!target || busy || pausedRef.current) return;
    const h = field.headingToward(target.id);
    if (h !== null) field.face(h, (a) => fireRef.current(a));
    setBusy(true);
    const ack = await act({ type: 'tag', target: target.id });
    setBusy(false);
    setNote(ack.ok ? null : ack.error.message);
  }, [act, busy, field]);
  const tagRef = useRef(tagNow);
  tagRef.current = tagNow;
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || oddsRef.current) return;
      // Escape in the answer box hands the keys back to walking (a typed answer box takes focus by itself).
      if (e.key === 'Escape' && e.target instanceof HTMLInputElement && e.target.closest('[data-answers]')) {
        e.target.blur();
        return;
      }
      if (e.code !== 'Space' || e.repeat || interactive(e.target)) return;
      e.preventDefault();
      void tagRef.current();
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  // What happened: words, announcements and sounds.
  const glowOf = (id: string) => {
    const p = view.players.find((x) => x[0] === id);
    return p ? p[6] : null;
  };
  const tagText = you ? tagLine(you, glowOf) : null;
  const hitText = you ? hitLine(you) : null;
  const tagFlash = useFlash(tagText, you?.lastTag?.n ?? null);
  const hitFlash = useFlash(hitText, you?.lastHit?.n ?? null);
  useAnnounce(tagFlash, you?.lastTag?.n);
  useAnnounce(hitFlash, you?.lastHit?.n);
  useLaterSfx(() => {
    const o = you?.lastTag?.outcome;
    playSfx(o === 'hit' || o === 'dimmed' ? 'hit' : o === 'shield' ? 'shield' : 'tap');
  }, you?.lastTag?.n ?? null);
  useLaterSfx(() => {
    const o = you?.lastHit?.outcome;
    if (o === 'shield') playSfx('shield');
    else if (o === 'hit') playSfx('hurt');
  }, you?.lastHit?.n ?? null);
  useLaterSfx(() => playSfx(you?.in ? 'lanternRise' : 'bust'), you ? (you.in ? 'in' : 'dimmed') : null);
  const pickup = [...room.feed].reverse().find((f) => f.text.startsWith('You picked up'));
  const pickupFlash = useFlash(pickup?.text ?? null, pickup?.id ?? null);
  useLaterSfx(() => playSfx('powerUp'), pickup?.id ?? null);
  useAnnounce(view.ring.final ? 'Final ring! Nobody relights now.' : null, view.ring.final);

  const lightsOut = view.rules.lightsOut;

  if (!you) return <p className="font-semibold text-text-2">Watching the park.</p>;

  const submit = async (answer: Answer) => {
    const q = you.question;
    if (!q) return false;
    return (await act({ type: 'answer', iid: q.iid, answer })).ok;
  };
  const flash = hitFlash ?? tagFlash ?? pickupFlash;
  const hurt = flash !== null && flash === hitFlash;
  const relightLeft = you.relight ? you.relight.need - you.relight.have : 0;

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
      <section className="flex flex-col gap-2" aria-label="The park">
        <div className="relative">
          <Stage3D<GlowTagScene>
            key={mapKey(view.map)}
            label={`The park at night, seen from behind your Glim. ${lightsOut ? 'Lights out: you only see players close by.' : ''}`}
            create={(env) => new GlowTagScene(env, field, looks, lightsOut)}
            className={STAGE_SIZE}
            fallback={<ArenaMap2D field={field} view={view} gameNow={gameNow} className={`${STAGE_SIZE} px-2 pt-12 pb-2`} />}
          />
          <div className="pointer-events-none absolute top-2 left-2 flex max-w-[calc(100%-3.5rem)] flex-wrap gap-1.5">
            <Stat label={`Glow, ${glowWords(you.glow)} of ${String(you.maxGlow)}`} value={<Pips have={you.glow} max={you.maxGlow} />} icon={Sun} tone={you.in ? 'glow' : 'calm'} />
            <Stat label="Charges" value={`${String(you.charges)}/${String(you.maxCharges)}`} icon={Zap} tone={you.charges ? 'calm' : 'warn'} />
            {you.shield ? <Stat label="Shield up" value="Shield" icon={ShieldCheck} tone="good" /> : null}
            {you.speedUntil > view.at ? <SpeedLeft until={you.speedUntil} gameNow={gameNow} /> : null}
          </div>
          <div className="pointer-events-none absolute top-2 right-12 flex flex-col items-end gap-1 text-right">
            <Pill className="bg-black/55 px-3 py-1 text-sm text-white">
              <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
            </Pill>
            <Pill tone={view.ring.final ? 'ember' : 'calm'} className={`px-3 py-1 text-xs font-bold ${view.ring.final ? '' : 'bg-black/55 text-white'}`}>
              <RingWords view={view} gameNow={gameNow} />
            </Pill>
          </div>
          {flash ? (
            <div className="pointer-events-none absolute inset-x-2 top-14 flex justify-center">
              <p className={`rounded-[var(--radius-m)] px-4 py-2 text-center font-display text-lg font-extrabold shadow-lg ${hurt ? 'bg-ember text-on-accent' : 'bg-black/70 text-white'}`}>{flash}</p>
            </div>
          ) : null}
          {!you.in ? (
            <div className="pointer-events-none absolute inset-x-4 top-1/2 flex -translate-y-1/2 justify-center">
              <div className="max-w-sm rounded-[var(--radius-l)] bg-black/75 px-5 py-4 text-center text-white shadow-xl">
                <p className="font-display text-2xl font-extrabold">{you.out ? 'You are out' : 'You are dimmed'}</p>
                <p className="mt-1 font-semibold">
                  {you.out
                    ? 'The final ring has no relights. Right answers still earn cheer points.'
                    : relightLeft === 1
                      ? 'Answer 1 more question right to relight.'
                      : `Answer ${String(relightLeft)} more questions right to relight.`}
                </p>
              </div>
            </div>
          ) : null}
          {you.in && coarse ? (
            <div className="absolute bottom-3 left-3">
              <Joystick input={input} label="Walk and turn" />
            </div>
          ) : null}
          {you.in ? (
            <div className="pointer-events-none absolute right-3 bottom-3">
              <TagButton aim={aim} busy={busy || paused} onTag={() => void tagNow()} />
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 py-1 font-bold text-text max-sm:hidden">
            <Package className="size-4" aria-hidden /> Crates: {crateOddsLine(view.crateOdds)}
          </span>
          <button type="button" onClick={() => setOddsOpen(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-bold text-lantern underline-offset-2 hover:underline max-sm:px-0">
            <Package className="size-4 sm:hidden" aria-hidden />
            <span className="sm:hidden">Crate chances</span>
            <span className="max-sm:hidden">All the chances</span>
          </button>
        </div>
        {coarse ? null : (
          <p className="text-sm text-text-2">
            W and S (or the arrow keys) walk, A and D turn. Space or the Tag button tags the nearest player in front of you. Typing an answer? Press Esc or click the park to walk again.
          </p>
        )}
        {note ? (
          <p className="text-sm font-bold text-ember" role="alert">
            {note}
          </p>
        ) : null}
      </section>
      <section className="flex flex-col gap-3" aria-label="Questions" data-answers>
        <p className="text-sm font-semibold text-text-2">
          {!you.in
            ? you.out
              ? `Cheer points: ${formatNumber(you.cheer)}. Each right answer adds ${String(SCORE.cheer)} more.`
              : `Right answers relight you: ${String(you.relight?.have ?? 0)} of ${String(you.relight?.need ?? 2)} so far.`
            : `Right answers give ${String(CHARGE.perRight)} charges, and 1 more every ${String(CHARGE.streakEvery)} in a row. ${you.streak > 0 ? `${String(you.streak)} in a row now.` : ''}`}
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
        <p className="text-sm text-text-2">
          Score {formatNumber(you.score)} · rank {String(you.rank)} · {you.tags === 1 ? '1 tag' : `${String(you.tags)} tags`}
        </p>
      </section>
      <OddsDialog open={oddsOpen} onOpenChange={setOddsOpen} odds={view.crateOdds} />
    </div>
  );
}

/* ---------------------------------- host ---------------------------------- */

export function GlowTagHost({ view, pulse, gameNow, room }: ModeScreenProps<GlowTagHostView>) {
  const field = useField(view, null, gameNow, pulse);
  const looks = useLooks(room.players);
  const rows = view.board.map((r) => ({ playerId: r.id, name: r.name, score: r.score, rank: r.rank, teamId: r.team }));
  const news = room.feed.filter((f) => !f.to).slice(-3).reverse();
  useAnnounce(view.ring.final ? 'Final ring! Nobody relights now.' : null, view.ring.final);
  const finalKey = view.ring.final ? 'final' : view.ring.phase;
  useLaterSfx(() => playSfx('event'), finalKey);

  return (
    <div className="relative mx-auto flex w-full max-w-[110rem] flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col items-start gap-1">
          <ModeTitle>Glow Tag Royale</ModeTitle>
          <p className="font-semibold text-text-2">Right answers charge beams. Stay in the ring and keep your glow.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[clamp(1.1rem,1.8vw,2rem)]">
          <Pill tone={view.ring.final ? 'ember' : 'lantern'} className="px-5 py-1.5">
            <RingWords view={view} gameNow={gameNow} />
          </Pill>
          <Pill className="px-5 py-1.5">{view.glowing === 1 ? '1 still glowing' : `${String(view.glowing)} still glowing`}</Pill>
          <Pill className="px-5 py-1.5 text-[1.15em]">
            <Countdown until={view.endsAt} gameNow={gameNow} label="Time left" />
          </Pill>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] lg:items-start">
        {/* On a wide screen the park is one screen high whatever the board's length, so the whole park stays in view. */}
        <div className="relative min-h-[55vh] lg:h-[calc(100dvh-13.5rem)] lg:min-h-[30rem]">
          <Stage3D<GlowTagHostScene>
            key={mapKey(view.map)}
            label={`The park from above: ${String(view.glowing)} players still glowing.`}
            create={(env) => new GlowTagHostScene(env, field, looks, view.rules.lightsOut)}
            className="absolute inset-0 rounded-[var(--radius-l)]"
            fallback={<ArenaMap2D field={field} view={view} gameNow={gameNow} className="absolute inset-0 rounded-[var(--radius-l)]" />}
          />
          {view.ring.final ? (
            <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2">
              <Pill tone="ember" className="px-5 py-2 text-[clamp(1.1rem,2vw,2.2rem)]">
                Final ring! Nobody relights now.
              </Pill>
            </div>
          ) : null}
          {news.length ? (
            <ul className="absolute bottom-3 left-3 flex max-w-[min(32rem,70%)] flex-col gap-1.5" aria-label="Park news">
              {news.map((n) => (
                <li key={n.id} className={`rounded-[var(--radius-m)] px-3 py-1.5 font-bold backdrop-blur-sm ${n.tone === 'big' ? 'bg-lantern text-on-accent' : 'bg-black/60 text-white'}`}>
                  {n.text}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <StagePanel className="flex flex-col gap-3 p-3" as="aside" label="Leaderboard">
          <h3 className="font-display text-xl font-extrabold">Most points</h3>
          {view.teams ? <TeamScores teams={view.teams.map((t) => ({ teamId: t.id, name: t.name, hue: t.hue, score: t.score, members: t.members }))} /> : null}
          <Leaderboard rows={rows} players={room.players} teams={room.room.teams} big dense />
          <p className="text-sm font-semibold text-text-2">
            {formatNumber(view.stats.tags)} tags · {formatNumber(view.stats.dims)} dimmed · {formatNumber(view.stats.relights)} relit · {formatNumber(view.stats.crates)} crates opened
          </p>
          <p className="text-sm text-text-2">
            Crates hold: {crateOddsLine(view.crateOdds)}. Outside the ring a player loses 1 glow every {String(RING.drainEveryMs / 1000)} seconds.
          </p>
        </StagePanel>
      </div>
    </div>
  );
}
