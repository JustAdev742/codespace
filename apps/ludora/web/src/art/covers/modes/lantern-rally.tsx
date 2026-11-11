import { Cast, Cel, Glow, INK, LanternString, Lift, Ridge, Sky, circ, hsl, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** A kart, side on, facing right. */
function Kart({ x, y, fill, s = 1 }: { x: number; y: number; fill: string; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Cel d="M-20 -2Q-20 -10 -12 -10H6L16 -4Q20 -2 20 2V4H-20Z" fill={fill} off={1.8} line={1.3} light={0.35} />
      <path d={circ(-12, 5, 5)} fill={INK} />
      <path d={circ(12, 5, 5)} fill={INK} />
      <circle cx={-12} cy={5} r={2} fill="#9aa5c4" />
      <circle cx={12} cy={5} r={2} fill="#9aa5c4" />
    </g>
  );
}

/** Lantern Rally: right answers are the fuel. A Glim boosts its kart round a lantern-lit circuit, a rival close behind. */
export default function LanternRally({ p }: { p: Palette }) {
  return (
    <g>
      <Sky p={p} horizon={66} />
      <Ridge y={58} amp={5} seed={2.1} fill={p.far} />
      <LanternString x1={-4} y1={10} x2={164} y2={20} sag={5} n={10} hues={[p.accentHue, 350, 190]} size={0.75} />
      {/* The circuit, curving away. */}
      <path d="M-4 102Q20 66 90 64Q150 62 164 50V40Q120 54 80 54Q10 56 -4 80Z" fill={hsl(p.hue, 20, 18)} />
      <path d="M-4 80Q10 56 80 54Q120 54 164 40" fill="none" stroke={p.accent} strokeWidth={1.2} strokeDasharray="4 3" />
      <path d="M-4 102Q20 66 90 64Q150 62 164 50" fill="none" stroke="#fff" strokeWidth={1.2} strokeDasharray="4 3" opacity={0.6} />
      <path d="M-2 102V86Q60 70 164 64V102Z" fill={p.mid} />
      <Kart x={44} y={64} fill={hsl(p.accentHue + 160, 70, 56)} s={0.7} />
      <Cast art={CAST.briarcat} x={42} y={60} size={16} shadow={false} />
      <Lift>
        {/* The boost: a flare out of the back. */}
        <Glow x={70} y={82} r={18} color={p.accentLight} strength={0.7} />
        <path d="M74 80L54 74L60 82L52 88Z" fill={p.accentLight} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
        <Cast art={CAST.dewdrop} x={98} y={78} size={26} pose="cheer" shadow={false} />
        <Kart x={98} y={84} fill={p.main} s={1.1} />
        <g stroke="#fff" strokeWidth={1.4} strokeLinecap="round" opacity={0.7}>
          <path d="M40 92H52M46 98H60" />
        </g>
      </Lift>
    </g>
  );
}
