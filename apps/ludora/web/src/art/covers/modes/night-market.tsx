import { Cast, Cel, Glow, INK, LanternString, Lift, MiniLantern, Rooftops, Sky, circ, hsl, rr, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Night Market: every right answer picks one of three mystery lanterns. A stall under a striped awning, three lanterns on the counter, coins spilling from the one just opened. */
export default function NightMarket({ p }: { p: Palette }) {
  const stripes = Array.from({ length: 8 }, (_, i) => `M${28 + i * 13} 26h13l-1 12h-11Z`).filter((_, i) => i % 2 === 0).join('');
  return (
    <g>
      <Sky p={p} horizon={70} />
      <Rooftops y={66} fill={p.far} lit={hsl(p.accentHue, 100, 70)} seed={5} />
      <LanternString x1={-4} y1={6} x2={164} y2={10} sag={5} n={9} hues={[p.accentHue, 330, 190]} size={0.7} />
      {/* The stall. */}
      <path d="M32 38V88M128 38V88" stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
      <path d="M32 38V88M128 38V88" stroke={hsl(28, 50, 40)} strokeWidth={1.6} strokeLinecap="round" />
      <Cel d="M24 26H136L132 38H28Z" fill={p.main} off={2} line={1.4}>
        <path d={stripes} fill="#fbf7ea" />
      </Cel>
      <path d="M28 38Q34 44 41 38Q47 44 54 38Q60 44 67 38Q73 44 80 38Q86 44 93 38Q99 44 106 38Q112 44 119 38Q125 44 132 38" fill={p.mainDeep} stroke={INK} strokeWidth={1.2} />
      <Cast art={CAST.novabelle} x={80} y={74} size={28} pose="wave" shadow={false} />
      <Cel d={rr(22, 70, 116, 14, 2)} fill={hsl(28, 46, 36)} off={2} line={1.4} />
      {/* Three mystery lanterns: coins, a gamble, a charm. */}
      <Lift>
        <MiniLantern x={48} y={50} hue={p.accentHue} size={2.1} />
        <MiniLantern x={112} y={50} hue={190} size={2.1} />
        <Glow x={80} y={62} r={20} color={p.accentLight} strength={0.6} />
        {[[70, 66], [76, 63], [86, 64], [91, 67], [80, 60]].map(([cx, cy], i) => (
          <g key={i}>
            <path d={circ(cx!, cy!, 3.4)} fill={p.accent} stroke={INK} strokeWidth={1} />
            <circle cx={cx! - 1} cy={cy! - 1} r={1} fill="#fff" opacity={0.8} />
          </g>
        ))}
      </Lift>
      <path d="M-2 102V90H162V102Z" fill={p.near} />
      <path d="M-2 90H162" stroke={p.mid} strokeWidth={1.2} />
    </g>
  );
}
