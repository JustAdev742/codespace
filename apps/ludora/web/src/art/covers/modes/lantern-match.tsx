import { Cast, Cel, Glow, INK, Lift, Ridge, SHAPE, Sky, rr, sparkle, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Lantern Match: turn two cards, find the pair. A spread of face-down cards, two turned over and glowing as a match. */
export default function LanternMatch({ p }: { p: Palette }) {
  const back = (x: number, y: number, r: number) => (
    <g key={`${x}-${y}`} transform={`rotate(${r} ${x + 11} ${y + 15})`}>
      <Cel d={rr(x, y, 22, 30, 3)} fill={p.mainDeep} off={2.4} line={1.3} />
      <rect x={x + 3} y={y + 3} width={16} height={24} rx={2} fill="none" stroke={p.main} strokeWidth={1} />
      <path d={`M${x + 11} ${y + 9}l4 6l-4 6l-4 -6Z`} fill={p.accent} opacity={0.8} />
    </g>
  );
  const face = (x: number, y: number, r: number) => (
    <g transform={`rotate(${r} ${x + 12} ${y + 16})`}>
      <Glow x={x + 12} y={y + 16} r={26} color={p.accentLight} strength={0.55} />
      <Cel d={rr(x, y, 24, 32, 3)} fill="#fbf7ea" off={2.4} line={1.4} shade={0.15} />
      <path d={SHAPE.star} transform={`translate(${x + 3} ${y + 5}) scale(0.75)`} fill={p.accent} stroke={INK} strokeWidth={1.4} />
      <rect x={x + 6} y={y + 25} width={12} height={2} rx={1} fill={INK} opacity={0.25} />
    </g>
  );
  return (
    <g>
      <Sky p={p} horizon={76} />
      <Ridge y={78} amp={3} seed={3.3} fill={p.far} />
      {back(20, 52, -8)}
      {back(118, 50, 9)}
      {back(34, 16, -4)}
      {back(106, 14, 6)}
      <Lift>
        {face(52, 24, -10)}
        {face(84, 24, 10)}
        <path d={sparkle(80, 20, 4)} fill="#fff" />
      </Lift>
      <Ridge y={90} amp={2} seed={5} fill={p.mid} />
      <Cast art={CAST.lamplighter} x={80} y={99} size={34} pose="cheer" />
      <path d="M-2 102V97Q80 93 162 97V102Z" fill={p.near} />
    </g>
  );
}
