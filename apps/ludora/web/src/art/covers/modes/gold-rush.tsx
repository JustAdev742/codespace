import { Cast, Cel, Glow, INK, Lift, Sky, hsl, sparkle, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

function Nugget({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Glow x={0} y={0} r={8} color="hsl(48 100% 70%)" strength={0.6} />
      <Cel d="M-4 1L-2 -3L2 -3.6L4.4 0L2 3L-2.4 3.2Z" fill="hsl(46 100% 58%)" off={1.2} line={0.9} light={0.5} />
    </g>
  );
}

/** Gold Rush: dig deeper for bigger gold, and bank it before the shaft caves in. A cut-away mine: the shaft down from the winch to a lit cavern where a Glim has struck a huge nugget. */
export default function GoldRush({ p }: { p: Palette }) {
  const layers = [
    { y: 26, fill: hsl(p.accentHue, 42, 32) },
    { y: 44, fill: hsl(p.accentHue, 42, 24) },
    { y: 62, fill: hsl(p.accentHue, 42, 17) },
    { y: 80, fill: hsl(p.accentHue, 42, 11) },
  ];
  return (
    <g>
      <Sky p={p} horizon={26} light={0.16} />
      {layers.map((l, i) => (
        <path key={i} d={`M-2 ${l.y}Q40 ${l.y - 3} 80 ${l.y}T162 ${l.y}V102H-2Z`} fill={l.fill} />
      ))}
      <path d="M-2 26Q40 23 80 26T162 26" fill="none" stroke={hsl(100, 40, 30)} strokeWidth={2.4} />
      {/* The shaft and ladder, down to the cavern. */}
      <path d="M50 25H64V66H50Z" fill={hsl(p.accentHue, 30, 7)} />
      <path d="M52.5 25V66M61.5 25V66" stroke={hsl(30, 40, 42)} strokeWidth={1.4} />
      <path d="M52.5 33H61.5M52.5 41H61.5M52.5 49H61.5M52.5 57H61.5" stroke={hsl(30, 40, 42)} strokeWidth={1.1} />
      <path d="M46 26L57 10L68 26" fill="none" stroke={INK} strokeWidth={3.2} strokeLinejoin="round" />
      <path d="M46 26L57 10L68 26" fill="none" stroke={hsl(30, 50, 46)} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={57} cy={12} r={3} fill={p.main} stroke={INK} strokeWidth={1.1} />
      {/* The cavern. */}
      <path d="M40 100Q38 70 60 64Q90 58 116 68Q132 76 128 100Z" fill={hsl(p.accentHue, 36, 7)} stroke={INK} strokeWidth={1.4} />
      <Glow x={88} y={84} r={34} color="hsl(46 100% 66%)" strength={0.55} />
      <Nugget x={22} y={40} />
      <Nugget x={138} y={46} s={1.2} />
      <Nugget x={146} y={78} s={1.4} />
      <Nugget x={14} y={74} s={1.1} />
      <Lift>
        <Nugget x={106} y={86} s={2.6} />
        <path d={sparkle(114, 76, 4)} fill="#fff" />
        <Cast art={CAST.pebblet} x={78} y={99} size={38} pose="cheer" />
      </Lift>
    </g>
  );
}
