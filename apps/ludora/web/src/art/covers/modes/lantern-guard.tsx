import { Cast, Cel, Glow, INK, Lift, Ridge, Sky, circ, hsl, rr, sparkle, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

function Gloomling({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle cx={0} cy={-1} r={9} fill="hsl(320 100% 60%)" opacity={0.16} />
      <Cel d="M-6 4Q-7 -6 0 -7Q7 -6 6 4Q3 2 0 4Q-3 2 -6 4Z" fill={hsl(275, 42, 30)} off={1.6} line={0.9} light={0.2} />
      <path d="M-3.6 -2.6L-0.8 -1.4L-3.6 -0.4ZM3.6 -2.6L0.8 -1.4L3.6 -0.4Z" fill="hsl(330 100% 72%)" />
    </g>
  );
}

/** Lantern Guard: hold back the gloom together. A light tower blasts the gloomlings creeping up the road towards the Great Lantern on the hill. */
export default function LanternGuard({ p }: { p: Palette }) {
  const road = 'M168 96Q120 88 100 74T56 56T28 44';
  return (
    <g>
      <Sky p={p} horizon={64} light={0.14} />
      <Ridge y={50} amp={5} seed={2} fill={p.far} />
      {/* The Great Lantern on its hill, far back. */}
      <Glow x={28} y={30} r={34} color={p.accentLight} strength={0.65} />
      <g transform="translate(28 24) scale(2.2)">
        <path d="M0 -6V-3" stroke={INK} strokeWidth="0.8" />
        <rect x="-4" y="-3" width="8" height="10" rx="3.6" fill={p.accent} stroke={INK} strokeWidth="0.8" />
        <rect x="-2.6" y="-1.6" width="1.4" height="5.4" rx="0.7" fill="#fff" opacity={0.7} />
        <path d="M-2.4 -3H2.4M-2.4 7H2.4" stroke={INK} strokeWidth="1" strokeLinecap="round" />
      </g>
      <Ridge y={64} amp={4} seed={5} fill={p.mid} />
      <path d={road} fill="none" stroke={INK} strokeWidth={12} strokeLinecap="round" />
      <path d={road} fill="none" stroke={hsl(34, 34, 42)} strokeWidth={9} strokeLinecap="round" />
      {/* The tower and its beam. */}
      <path d="M78 34L122 76" stroke="hsl(50 100% 70%)" strokeWidth={9} strokeLinecap="round" opacity={0.3} />
      <path d="M78 34L122 76" stroke="hsl(50 100% 88%)" strokeWidth={3} strokeLinecap="round" />
      <Cel d="M68 92L71 42H85L88 92Z" fill={hsl(36, 26, 62)} off={2.4} line={1.4}>
        <path d="M70 56H86M69 70H87M68 84H88" stroke={INK} strokeWidth={0.8} opacity={0.35} />
      </Cel>
      <Cel d={rr(66, 38, 24, 6, 1.4)} fill={hsl(36, 26, 52)} off={1} line={1.2} />
      <Glow x={78} y={32} r={16} color={p.accentLight} strength={0.8} />
      <path d={circ(78, 32, 6)} fill={p.accent} stroke={INK} strokeWidth={1.4} />
      <circle cx={76} cy={30} r={1.8} fill="#fff" opacity={0.8} />
      <Lift>
        <Glow x={124} y={78} r={16} color="hsl(50 100% 80%)" strength={0.7} />
        <Gloomling x={124} y={80} s={2.4} />
        <path d={sparkle(118, 72, 5)} fill="#fff" />
      </Lift>
      <Gloomling x={146} y={88} s={2.1} />
      <Gloomling x={104} y={68} s={1.6} />
      <Cast art={CAST.constella} x={46} y={94} size={30} pose="cheer" />
      <path d="M-2 102V98Q80 94 162 99V102Z" fill={p.near} />
    </g>
  );
}
