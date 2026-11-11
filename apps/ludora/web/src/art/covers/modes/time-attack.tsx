import { Cast, Cel, Glow, INK, Lift, Ridge, Sky, circ, hsl, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Time Attack: beat the clock. A giant stopwatch with most of its time gone, and a Glim sprinting past it. */
export default function TimeAttack({ p }: { p: Palette }) {
  const cx = 80;
  const cy = 44;
  const r = 30;
  // The time left: a wedge from twelve o'clock to about four.
  const a = (120 - 90) * (Math.PI / 180);
  const left = `M${cx} ${cy}L${cx} ${cy - r + 4}A${r - 4} ${r - 4} 0 0 1 ${cx + Math.cos(a) * (r - 4)} ${cy + Math.sin(a) * (r - 4)}Z`;
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const t = (i / 12) * Math.PI * 2;
    return `M${cx + Math.sin(t) * (r - 4)} ${cy - Math.cos(t) * (r - 4)}L${cx + Math.sin(t) * (r - 8)} ${cy - Math.cos(t) * (r - 8)}`;
  }).join('');
  return (
    <g>
      <Sky p={p} horizon={74} light={0.2} />
      <Ridge y={76} amp={3} seed={2.9} fill={p.far} />
      <Glow x={cx} y={cy} r={50} color={p.accent} strength={0.4} />
      <Cel d={`M${cx - 5} ${cy - r - 9}H${cx + 5}V${cy - r + 2}H${cx - 5}Z`} fill={p.mainDeep} off={1.4} line={1.3} />
      <Cel d={`M${cx - 8} ${cy - r - 13}H${cx + 8}V${cy - r - 7}H${cx - 8}Z`} fill={p.accent} off={1.4} line={1.3} />
      <Cel d={circ(cx, cy, r)} fill={p.main} off={3.4} />
      <path d={circ(cx, cy, r - 4)} fill="#fbf7ea" stroke={INK} strokeWidth={1.4} />
      <path d={left} fill={hsl(p.hue, 90, 62)} opacity={0.9} />
      <path d={ticks} stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
      <path d={`M${cx} ${cy}L${cx + Math.cos(a) * (r - 7)} ${cy + Math.sin(a) * (r - 7)}`} stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <path d={circ(cx, cy, 2.6)} fill={INK} />
      <Ridge y={88} amp={2} seed={5.2} fill={p.mid} />
      {/* Speed lines behind the runner. */}
      <g stroke={p.accentLight} strokeWidth={1.8} strokeLinecap="round" opacity={0.8}>
        <path d="M40 74H64M34 82H60M44 90H66" />
      </g>
      <Lift>
        <Cast art={CAST.buzzbean} x={92} y={98} size={34} turn={12} pose="cheer" />
      </Lift>
      <path d="M-2 102V97Q80 93 162 97V102Z" fill={p.near} />
    </g>
  );
}
