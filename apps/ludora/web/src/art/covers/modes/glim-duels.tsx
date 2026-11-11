import { Beam, Cast, Cel, Glow, INK, Lift, Sky, hsl, rr, sparkle, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Glim Duels: Glim to Glim with a classmate. Two Glims face off on lit pads, their hits meeting in a burst in the middle. */
export default function GlimDuels({ p }: { p: Palette }) {
  const burst = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 7 : 15;
    return `${i ? 'L' : 'M'}${(80 + Math.cos(a) * r).toFixed(1)} ${(52 + Math.sin(a) * r).toFixed(1)}`;
  }).join('') + 'Z';
  const left = p.main;
  const right = hsl(p.accentHue, 85, 58);
  return (
    <g>
      <Sky p={p} horizon={72} light={0.14} />
      <Beam x={40} spread={20} tilt={-6} strength={0.14} />
      <Beam x={120} spread={20} tilt={6} strength={0.14} />
      {/* The arena floor. */}
      <path d="M-2 102L14 70H146L162 102Z" fill={p.mid} />
      <path d="M14 70H146" stroke={p.far} strokeWidth={1.4} />
      {/* Health bars above each side. */}
      <Cel d={rr(14, 10, 50, 7, 3)} fill={hsl(p.hue, 20, 20)} off={1} line={1.2} shade={0} light={0} />
      <rect x={15} y={11} width={38} height={5} rx={2.5} fill={left} />
      <Cel d={rr(96, 10, 50, 7, 3)} fill={hsl(p.hue, 20, 20)} off={1} line={1.2} shade={0} light={0} />
      <rect x={117} y={11} width={28} height={5} rx={2.5} fill={right} />
      <ellipse cx={42} cy={86} rx={24} ry={6} fill={left} opacity={0.55} stroke={INK} strokeWidth={1.2} />
      <ellipse cx={118} cy={86} rx={24} ry={6} fill={right} opacity={0.55} stroke={INK} strokeWidth={1.2} />
      <path d="M52 56L74 53M108 56L86 53" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
      <Glow x={80} y={52} r={26} color="hsl(50 100% 76%)" strength={0.75} />
      <path d={burst} fill="hsl(50 100% 72%)" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
      <path d={sparkle(80, 52, 5)} fill="#fff" />
      <Lift>
        <Cast art={CAST.hearthkeeper} x={42} y={88} size={42} pose="cheer" turn={6} />
        <Cast art={CAST.dewdrop} x={118} y={88} size={42} pose="cheer" turn={-6} flip />
      </Lift>
    </g>
  );
}
