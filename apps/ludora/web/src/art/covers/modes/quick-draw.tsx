import { Beam, Cast, Cel, Crowd, Glow, INK, Lift, Ridge, Sky, sparkle, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Quick Draw: one try each, first right answer takes it. A Glim slams the buzzer while its rival reaches a moment too late. */
export default function QuickDraw({ p }: { p: Palette }) {
  const rays = Array.from({ length: 9 }, (_, i) => {
    const a = (-160 + i * 17.5) * (Math.PI / 180);
    return `M${80 + Math.cos(a) * 30} ${58 + Math.sin(a) * 26}L${80 + Math.cos(a) * 40} ${58 + Math.sin(a) * 35}`;
  }).join('');
  return (
    <g>
      <Sky p={p} horizon={74} light={0.22} />
      <Beam x={80} spread={30} width={12} strength={0.16} />
      <Ridge y={70} amp={2} seed={1.5} fill={p.far} />
      <Crowd y={76} fill={p.mid} seed={3} size={0.8} cheer={0.4} />
      <Glow x={80} y={58} r={44} color={p.accent} strength={0.6} />
      <path d={rays} stroke={p.accentLight} strokeWidth={2.2} strokeLinecap="round" />
      <Cast art={CAST.novabelle} x={126} y={86} size={34} turn={18} flip pose="wave" />
      {/* The buzzer: a gold dome on a dark plinth, pressed down. */}
      <Cel d="M50 100V80Q50 74 56 74H104Q110 74 110 80V100Z" fill={p.mainDeep} off={3} />
      <Cel d="M58 75Q58 58 80 58Q102 58 102 75Z" fill={p.accent} off={3.4} light={0.4} />
      <path d="M56 74.5H104" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <ellipse cx={72} cy={63} rx={6} ry={2.4} transform="rotate(-18 72 63)" fill="#fff" opacity={0.85} />
      <Lift>
        <Cast art={CAST.hearthkeeper} x={80} y={60} size={38} pose="cheer" turn={-4} shadow={false} />
      </Lift>
      <path d={sparkle(34, 34, 4)} fill="#fff" />
      <path d={sparkle(128, 30, 3)} fill={p.accentLight} />
    </g>
  );
}
