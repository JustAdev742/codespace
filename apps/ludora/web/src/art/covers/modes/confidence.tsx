import { Beam, Cast, Cel, Glow, INK, Lift, Ridge, Sky, circ, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Confidence: say how sure you are before you answer. A big three-step gauge, its needle swung right up to certain, and a Glim backing itself. */
export default function Confidence({ p }: { p: Palette }) {
  const cx = 80;
  const cy = 70;
  const arc = (a0: number, a1: number, r0: number, r1: number) => {
    const pt = (a: number, r: number) => `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy - Math.sin(a) * r).toFixed(1)}`;
    return `M${pt(a0, r1)}A${r1} ${r1} 0 0 1 ${pt(a1, r1)}L${pt(a1, r0)}A${r0} ${r0} 0 0 0 ${pt(a0, r0)}Z`;
  };
  const D = Math.PI / 180;
  const needle = 28 * D;
  return (
    <g>
      <Sky p={p} horizon={74} light={0.2} />
      <Beam x={80} spread={40} width={20} strength={0.1} />
      <Ridge y={76} amp={3} seed={1.8} fill={p.far} />
      <Glow x={112} y={40} r={30} color={p.accent} strength={0.55} />
      {/* The gauge: guessing, fairly sure, certain. */}
      <Cel d={arc(180 * D, 0, 30, 52)} fill={p.mid} off={3} line={1.6} shade={0} />
      <Cel d={arc(176 * D, 124 * D, 33, 49)} fill={p.mainDeep} off={2} line={1.2} />
      <Cel d={arc(118 * D, 62 * D, 33, 49)} fill={p.main} off={2} line={1.2} />
      <Cel d={arc(56 * D, 4 * D, 33, 49)} fill={p.accent} off={2} line={1.2} light={0.45} />
      <path d={`M${cx} ${cy}L${cx + Math.cos(needle) * 46} ${cy - Math.sin(needle) * 46}`} stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <path d={`M${cx} ${cy}L${cx + Math.cos(needle) * 45} ${cy - Math.sin(needle) * 45}`} stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
      <path d={circ(cx, cy, 5)} fill={p.accent} stroke={INK} strokeWidth={1.6} />
      <Ridge y={88} amp={2} seed={4} fill={p.mid} />
      <Lift>
        <Cast art={CAST.quillington} x={80} y={98} size={40} pose="cheer" />
      </Lift>
      <path d="M-2 102V96Q80 92 162 96V102Z" fill={p.near} />
    </g>
  );
}
