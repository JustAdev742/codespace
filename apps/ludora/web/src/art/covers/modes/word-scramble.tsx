import { Cast, Cel, Glow, INK, Lift, Ridge, Sky, rr, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** A letter tile, blank but for the grain lines and a corner pip: covers carry no text. */
const MARKS = [
  (x: number, y: number) => `M${x + 5} ${y + 5}L${x + 11} ${y + 11}M${x + 11} ${y + 5}L${x + 5} ${y + 11}`,
  (x: number, y: number) => `M${x + 8} ${y + 4.5}V${y + 11.5}M${x + 4.5} ${y + 8}H${x + 11.5}`,
  (x: number, y: number) => `M${x + 4.5} ${y + 10.5}L${x + 8} ${y + 5}L${x + 11.5} ${y + 10.5}`,
];

function Tile({ x, y, r, fill, lit = false, mark = 0 }: { x: number; y: number; r: number; fill: string; lit?: boolean; mark?: number }) {
  return (
    <g transform={`rotate(${r} ${x + 8} ${y + 8})`}>
      {lit ? <Glow x={x + 8} y={y + 8} r={16} color={fill} strength={0.5} /> : null}
      <Cel d={rr(x, y, 16, 16, 2.6)} fill={fill} off={1.8} line={1.3}>
        <rect x={x} y={y + 13} width={16} height={3} fill={INK} opacity={0.22} />
      </Cel>
      <path d={MARKS[mark % MARKS.length]!(x, y)} fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
    </g>
  );
}

/** Word Scramble: the answer is in the tiles. Three tiles already snapped into the answer slot, three tumbling down to join them. */
export default function WordScramble({ p }: { p: Palette }) {
  return (
    <g>
      <Sky p={p} horizon={74} />
      <Ridge y={70} amp={4} seed={1.1} fill={p.far} />
      {/* Motion arcs behind the falling tiles. */}
      <g stroke={p.accentLight} strokeWidth={1.4} strokeLinecap="round" opacity={0.7}>
        <path d="M40 14V22M46 12V19M78 2V9M84 1V7M116 12V20M122 10V17" />
      </g>
      <Tile x={36} y={28} r={-24} fill={p.accent} />
      <Tile x={74} y={14} r={18} fill={p.accent} mark={1} />
      <Tile x={112} y={26} r={-12} fill={p.accent} mark={2} />
      {/* The answer slot. */}
      <Cel d={rr(26, 50, 108, 24, 5)} fill={p.mid} off={2} line={1.4} shade={0} light={0.12} />
      <Lift>
        <Tile x={31} y={54} r={0} fill={p.main} lit />
        <Tile x={49} y={54} r={0} fill={p.main} lit mark={2} />
        <Tile x={67} y={54} r={0} fill={p.main} lit mark={1} />
      </Lift>
      <rect x={87} y={67} width={14} height={2} rx={1} fill={p.mainLight} opacity={0.6} />
      <rect x={105} y={67} width={14} height={2} rx={1} fill={p.mainLight} opacity={0.6} />
      <Ridge y={90} amp={2} seed={4.4} fill={p.mid} />
      <Cast art={CAST.briarcat} x={112} y={99} size={30} pose="cheer" />
      <path d="M-2 102V97Q80 93 162 97V102Z" fill={p.near} />
    </g>
  );
}
