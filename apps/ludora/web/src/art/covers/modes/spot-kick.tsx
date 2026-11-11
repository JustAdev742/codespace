import { Beam, Cast, Cel, Crowd, Glow, INK, Lift, Sky, circ, hsl, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Spot Kick: pick your spot, beat the keeper under the floodlights. The ball bending into the top corner past a diving keeper. */
export default function SpotKick({ p }: { p: Palette }) {
  const net = Array.from({ length: 11 }, (_, i) => `M${38 + i * 8.4} 24V66`).join('') + Array.from({ length: 6 }, (_, i) => `M38 ${24 + i * 8.4}H122`).join('');
  return (
    <g>
      <Sky p={p} horizon={60} light={0.18} />
      <Beam x={14} spread={24} tilt={22} strength={0.18} />
      <Beam x={146} spread={24} tilt={-22} strength={0.18} />
      <Crowd y={56} fill={p.far} seed={12} size={0.7} cheer={0.4} />
      {/* The pitch. */}
      <path d="M-2 102V62H162V102Z" fill={p.mainDeep} />
      <path d="M-2 76H162" stroke={hsl(p.hue, 60, 46)} strokeWidth={8} opacity={0.4} />
      <path d="M20 66L6 102M140 66L154 102M20 66H140" stroke="#fff" strokeWidth={1.2} opacity={0.7} />
      {/* The goal. */}
      <path d={net} stroke="#fff" strokeWidth={0.5} opacity={0.4} />
      <path d="M36 66V22H124V66" fill="none" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <path d="M36 66V22H124V66" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinejoin="round" />
      <Cast art={CAST.anglet} x={70} y={66} size={30} turn={-40} pose="cheer" shadow={false} />
      <Lift>
        <path d="M80 92Q98 60 108 34" fill="none" stroke="#fff" strokeWidth={1.4} strokeDasharray="2 3" opacity={0.8} />
        <Glow x={110} y={32} r={14} color={p.accentLight} strength={0.6} />
        <Cel d={circ(110, 32, 6)} fill="#fbfbff" off={1.6} line={1.2} light={0.4} />
        <path d="M110 29L113 31L112 34.4H108L107 31Z" fill={INK} />
      </Lift>
      <Cast art={CAST.hearthkeeper} x={66} y={100} size={30} turn={10} pose="cheer" />
    </g>
  );
}
