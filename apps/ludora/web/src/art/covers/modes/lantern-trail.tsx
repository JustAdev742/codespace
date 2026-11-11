import { Cast, Cel, Glow, INK, LanternString, Lift, MiniLantern, Rooftops, Sky, circ, hsl, rr, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Lantern Trail: roll the dice round the festival town. Board spaces wind past the houses to the Golden Lantern stall, a big die mid-roll. */
export default function LanternTrail({ p }: { p: Palette }) {
  const spaces: [number, number, string][] = [
    [6, 92, p.main], [22, 88, p.accent], [38, 86, p.main], [54, 82, '#fbf7ea'], [70, 80, p.main], [86, 78, p.accent], [102, 74, p.main], [116, 68, '#fbf7ea'], [128, 61, p.main],
  ];
  return (
    <g>
      <Sky p={p} horizon={68} />
      <Rooftops y={58} fill={p.far} lit={hsl(p.accentHue, 100, 70)} seed={7} />
      <LanternString x1={-4} y1={12} x2={70} y2={14} sag={4} n={5} hues={[p.accentHue, 350]} size={0.7} />
      <path d="M-2 102V70Q80 60 162 66V102Z" fill={p.mid} />
      {spaces.map(([x, y, c], i) => (
        <g key={i}>
          <ellipse cx={x} cy={y + 1.4} rx={7.4} ry={3.6} fill={INK} />
          <ellipse cx={x} cy={y} rx={7} ry={3.2} fill={c} stroke={INK} strokeWidth={1} />
        </g>
      ))}
      {/* The Golden Lantern stall at the end of the trail. */}
      <Glow x={140} y={40} r={26} color={p.accentLight} strength={0.6} />
      <Cel d={rr(128, 38, 24, 20, 2)} fill={hsl(28, 46, 38)} off={1.6} line={1.2} />
      <Cel d="M124 38L140 28L156 38Z" fill={p.accent} off={1.6} line={1.2} />
      <MiniLantern x={140} y={40} hue={46} size={1.3} />
      {/* The die, mid-roll. */}
      <Lift>
        <g transform="rotate(16 74 40)">
          <Cel d={rr(62, 28, 24, 24, 4)} fill="#fbf7ea" off={3} line={1.5} shade={0.22} />
          {[[68, 34], [80, 34], [74, 40], [68, 46], [80, 46]].map(([cx, cy], i) => (
            <path key={i} d={circ(cx!, cy!, 2.2)} fill={INK} />
          ))}
        </g>
        <g stroke={p.accentLight} strokeWidth={1.4} strokeLinecap="round" opacity={0.8}>
          <path d="M50 30L56 33M48 40H55M52 50L57 47" />
        </g>
      </Lift>
      <Cast art={CAST.sprig} x={70} y={82} size={28} pose="cheer" />
      <path d="M-2 102V98Q80 94 162 98V102Z" fill={p.near} />
    </g>
  );
}
