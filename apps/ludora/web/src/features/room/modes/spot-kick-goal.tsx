import { useEffect, useRef, useState } from 'react';
import { AIM_INFO, POWER_INFO, type Aim } from '@ludora/engine/spot-kick';
import type { KickShot } from './spot-kick-scene.ts';

/*
 * Spot Kick drawn flat, for devices with 3D off: the goal mouth under the
 * floodlights, seen from behind the spot. The ball flies along its path to
 * where it was aimed, the keeper dives where the server said, and a caption
 * says what happened. It shows what the 3D scene shows, from the same view,
 * so the game reads the same either way. CSS transitions do the moving; they
 * stop under reduced motion like every other transition in the app.
 */

const W = 400;
const H = 260;
/** Pixels per metre, and where the goal's centre meets the grass. */
const PX = 46;
const CX = 200;
const GROUND = 190;
const GOAL_HALF = 2.6 * PX;
const BAR = GROUND - 1.95 * PX;
const SPOT: [number, number] = [CX, 240];

const TARGET: Record<Aim, [number, number]> = { tl: [-1.95, 1.48], tr: [1.95, 1.48], mid: [0, 0.95], bl: [-1.95, 0.32], br: [1.95, 0.32] };
const toPx = ([x, y]: [number, number]): [number, number] => [CX + x * PX, GROUND - y * PX];

/** Where the ball ends up, in pixels, for the way a shot went. */
function landing(s: KickShot): [number, number] {
  const [tx, ty] = TARGET[s.aim];
  const side = Math.sign(tx) || 1;
  if (s.outcome !== 'wide') return toPx([tx, ty]);
  if (s.how === 'over') return toPx([tx * 1.05, 2.5]);
  if (s.how === 'wide') return toPx([side * 3.1, ty]);
  if (s.how === 'post') return toPx([side * 2.55, ty]);
  return toPx([tx * 0.9, 1.97]);
}

/** Where the keeper ends up: a shift, a lift and a lean, from feet at the middle of the goal line. */
function dive(a: Aim): { x: number; y: number; r: number } {
  const [tx, ty] = TARGET[a];
  if (a === 'mid') return { x: 0, y: -16, r: 0 };
  const side = Math.sign(tx);
  return ty > 1 ? { x: tx * PX * 0.62, y: -26, r: side * 62 } : { x: tx * PX * 0.62, y: -4, r: side * 82 };
}

/** A stand full of fans: fixed dots, so the picture is the same every time. */
const FANS = Array.from({ length: 120 }, (_, i) => {
  const row = Math.floor(i / 24);
  const col = i % 24;
  const hue = (i * 137) % 360;
  return { x: 14 + col * 15.8 + (row % 2) * 7, y: 50 + row * 11, hue };
});

export function GoalMouth({ shot, guard, aim, ready, onFire, reads, big = false }: { shot: KickShot | null; guard: readonly Aim[] | null; aim: Aim | null; ready: boolean; onFire: boolean; reads: Record<Aim, number> | null; big?: boolean }) {
  // Each new shot plays from the spot: set, then flying, then landed.
  const [phase, setPhase] = useState<'set' | 'flying' | 'landed'>('landed');
  const [playing, setPlaying] = useState<KickShot | null>(null);
  const played = useRef(shot?.seq ?? null);
  const seq = shot?.seq ?? null;
  useEffect(() => {
    // A shot from before the picture appeared is not played again. Views bring fresh copies, so this keys on seq.
    if (!shot || seq === played.current) return;
    played.current = seq;
    setPlaying(shot);
    setPhase('set');
    const a = requestAnimationFrame(() => requestAnimationFrame(() => setPhase('flying')));
    const t = setTimeout(() => setPhase('landed'), 750);
    return () => {
      cancelAnimationFrame(a);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  const s = playing;
  const moving = s && phase !== 'set';
  const end = s ? landing(s) : SPOT;
  const ball = moving ? end : SPOT;
  const k = moving ? dive(s.dive) : { x: 0, y: 0, r: 0 };
  const [mx, my] = [(SPOT[0] + end[0]) / 2 - (Math.sign(end[0] - CX) || 1) * 14, (SPOT[1] + end[1]) / 2 - (s?.power === 'placed' ? 30 : 10)];
  const caption = s && phase === 'landed' ? (s.outcome === 'goal' ? (s.fire ? 'Double goal!' : 'Goal!') : s.outcome === 'saved' ? 'Saved' : s.how === 'post' ? 'Off the post' : s.how === 'bar' ? 'Off the bar' : 'Missed') : null;
  const showBall = Boolean(s) || ready;
  const label = s
    ? `The goal mouth: a ${POWER_INFO[s.power].label.toLowerCase()} shot to the ${AIM_INFO[s.aim].label.toLowerCase()}; the keeper dived ${AIM_INFO[s.dive].label.toLowerCase()}. ${caption ?? ''}`
    : `The goal mouth: the keeper is ready${ready ? ' and the ball is on the spot' : ''}.`;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[inherit] bg-[#0a0f2c]">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid slice" role="img" aria-label={label}>
        <defs>
          <linearGradient id="sk-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#060a22" />
            <stop offset="1" stopColor="#1b2650" />
          </linearGradient>
          <radialGradient id="sk-lamp">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="0.3" stopColor="#dfe8ff" stopOpacity="0.45" />
            <stop offset="1" stopColor="#dfe8ff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sk-pool" cx="0.5" cy="0.45" r="0.6">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.14" />
            <stop offset="1" stopColor="#000000" stopOpacity="0.25" />
          </radialGradient>
          <pattern id="sk-net" width="9" height="9" patternUnits="userSpaceOnUse">
            <path d="M0 4.5L4.5 0L9 4.5L4.5 9Z" fill="none" stroke="#eef2ff" strokeOpacity="0.55" strokeWidth="0.8" />
          </pattern>
          <radialGradient id="sk-fire">
            <stop offset="0" stopColor="#ffd25a" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ff4d6a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#sk-sky)" />
        {/* Floodlights and the roof's strip of light. */}
        <circle cx="24" cy="10" r="46" fill="url(#sk-lamp)" />
        <circle cx="376" cy="10" r="46" fill="url(#sk-lamp)" />
        <rect x="0" y="32" width={W} height="3" fill="#dfe8ff" opacity="0.85" />
        {/* The stand. */}
        <rect x="0" y="40" width={W} height="68" fill="#1c2452" />
        {[0, 1, 2, 3, 4].map((r) => (
          <rect key={r} x="0" y={56 + r * 11} width={W} height="2" fill="#2f4fd0" opacity="0.8" />
        ))}
        {FANS.map((f, i) => (
          <g key={i}>
            <circle cx={f.x} cy={f.y} r="4.2" fill={`hsl(${f.hue} 70% 60%)`} />
            <circle cx={f.x - 1.4} cy={f.y - 1} r="0.9" fill="#fff" />
            <circle cx={f.x + 1.4} cy={f.y - 1} r="0.9" fill="#fff" />
          </g>
        ))}
        {/* The boards. */}
        <rect x="0" y="106" width={W} height="12" fill="#0d1440" />
        {[0, 1, 2, 3].map((i) => (
          <text key={i} x={24 + i * 100} y="115.5" fontSize="8.5" fontWeight="800" fontStyle="italic" fill={i % 2 ? '#ffc233' : '#7fb2ff'} fontFamily="'Barlow Condensed', system-ui, sans-serif">
            {i % 2 ? 'LUDORA' : 'SPOT KICK'}
          </text>
        ))}
        {/* The pitch, mown in stripes, under a pool of light. */}
        <rect x="0" y="118" width={W} height={H - 118} fill="#2f8a47" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x="0" y={118 + i * 24} width={W} height="12" fill="#36994f" />
        ))}
        <rect x="0" y="118" width={W} height={H - 118} fill="url(#sk-pool)" />
        <g stroke="#ffffff" strokeOpacity="0.9" strokeWidth="1.6" fill="none">
          <path d={`M0 ${GROUND}H${W}`} />
          <path d={`M${CX - GOAL_HALF - 50} ${GROUND}L${CX - GOAL_HALF - 66} 214H${CX + GOAL_HALF + 66}L${CX + GOAL_HALF + 50} ${GROUND}`} />
        </g>
        <ellipse cx={SPOT[0]} cy={SPOT[1] + 2} rx="5" ry="2" fill="#ffffff" />
        {/* The goal: net, then the frame. */}
        <rect x={CX - GOAL_HALF} y={BAR} width={GOAL_HALF * 2} height={GROUND - BAR} fill="#0b1238" opacity="0.55" />
        <rect x={CX - GOAL_HALF} y={BAR} width={GOAL_HALF * 2} height={GROUND - BAR} fill="url(#sk-net)" />
        {/* What the keeper has learned: a warm glow where you keep shooting. */}
        {reads
          ? (Object.entries(reads) as [Aim, number][])
              .filter(([, r]) => r > 0)
              .map(([a, r]) => {
                const [x, y] = toPx(TARGET[a]);
                return <circle key={a} cx={x} cy={y} r={10 + r * 3} fill="#ff4d6a" opacity={0.12 + r * 0.07} />;
              })
          : null}
        {guard?.map((a) => {
          const [x, y] = toPx(TARGET[a]);
          return <circle key={a} cx={x} cy={y} r="13" fill="none" stroke="#ffc233" strokeWidth="2.5" />;
        })}
        {aim ? <circle cx={toPx(TARGET[aim])[0]} cy={toPx(TARGET[aim])[1]} r="10" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeDasharray="4 3" /> : null}
        <g stroke="#f5f7ff" strokeWidth="5" strokeLinecap="round" fill="none">
          <path d={`M${CX - GOAL_HALF} ${GROUND}V${BAR}H${CX + GOAL_HALF}V${GROUND}`} />
        </g>
        {/* The keeper, Mitts. */}
        <g style={{ transform: `translate(${CX + k.x}px, ${GROUND + k.y}px) rotate(${-k.r}deg)`, transition: 'transform 380ms cubic-bezier(0.2, 0.7, 0.2, 1)' }}>
          <ellipse cx="0" cy="1" rx="20" ry="4" fill="#000" opacity="0.3" />
          <rect x="-11" y="-16" width="22" height="10" rx="4" fill="#141a3a" />
          <ellipse cx="0" cy="-30" rx="17" ry="19" fill="#7d5cff" />
          <rect x="-17" y="-25" width="34" height="3" fill="#ffc233" />
          <ellipse cx="0" cy="-36" rx="10.5" ry="8" fill="#ffe9c7" />
          <circle cx="-4" cy="-37" r="2.4" fill="#fff" />
          <circle cx="4" cy="-37" r="2.4" fill="#fff" />
          <circle cx="-4" cy="-36.6" r="1.2" fill="#141a3a" />
          <circle cx="4" cy="-36.6" r="1.2" fill="#141a3a" />
          <circle cx="-11" cy="-47" r="4" fill="#7d5cff" />
          <circle cx="11" cy="-47" r="4" fill="#7d5cff" />
          <g style={{ transform: moving ? 'translateY(-14px)' : 'none', transition: 'transform 380ms ease-out' }}>
            <circle cx="-22" cy="-34" r="6.5" fill="#ffc233" stroke="#141a3a" strokeWidth="1" />
            <circle cx="22" cy="-34" r="6.5" fill="#ffc233" stroke="#141a3a" strokeWidth="1" />
          </g>
        </g>
        {/* The ball's path, then the ball. */}
        {s && moving ? <path d={`M${SPOT[0]} ${SPOT[1]}Q${mx} ${my} ${end[0]} ${end[1]}`} fill="none" stroke={s.fire || onFire ? '#ffb24a' : '#ffffff'} strokeOpacity="0.7" strokeWidth="2" strokeDasharray="5 5" /> : null}
        {showBall ? (
          <g style={{ transform: `translate(${ball[0]}px, ${ball[1]}px) scale(${moving ? 0.75 : 1})`, transition: `transform ${s?.power === 'blasted' ? 420 : 620}ms cubic-bezier(0.25, 0.6, 0.3, 1)` }}>
            {onFire || s?.fire ? <circle r="12" fill="url(#sk-fire)" /> : null}
            <circle r="6.5" fill="#f7f7fb" stroke="#141a3a" strokeWidth="1" />
            <path d="M0 -3l2.8 2-1 3.2h-3.6l-1-3.2z" fill="#141a3a" />
          </g>
        ) : null}
      </svg>
      {caption ? (
        <div className="pointer-events-none absolute inset-x-0 top-[12%] flex justify-center" aria-hidden>
          <span className={`plate ${big ? 'text-[clamp(1.6rem,3.4vw,3.6rem)]' : 'text-2xl'} ${s?.outcome === 'goal' ? 'bg-lantern text-on-accent' : s?.outcome === 'saved' ? 'bg-black/80 text-white' : 'bg-ember text-on-accent'}`}>
            <span className="font-display font-extrabold italic">{caption}</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
