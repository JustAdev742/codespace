import { Cast, Cel, Glow, INK, Lift, MiniLantern, Ridge, Sky, hsl, rr, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Tower Together: the whole class builds one lantern tower before dawn. Timber and stone stacked high in the wind, a lantern brace holding it, Glims adding the next piece. */
export default function TowerTogether({ p }: { p: Palette }) {
  const timber = hsl(30, 60, 50);
  const stone = hsl(p.hue, 12, 64);
  const rows: [number, number, string][] = [
    [80, 54, stone],
    [70, 44, timber],
    [60, 48, stone],
    [50, 40, timber],
    [40, 42, timber],
    [30, 34, stone],
    [20, 30, timber],
  ];
  return (
    <g>
      <Sky p={p} horizon={86} light={0.14} />
      <path d="M-2 78Q80 68 162 78V84H-2Z" fill={hsl(p.accentHue, 90, 60)} opacity={0.35} />
      <Ridge y={82} amp={3} seed={3.4} fill={p.far} />
      {/* Gusts from both sides. */}
      <g fill="none" stroke={hsl(p.hue, 50, 78)} strokeWidth={1.6} strokeLinecap="round" opacity={0.65}>
        <path d="M4 30H34Q41 30 41 24Q41 19 36 19Q32 19 32 23" />
        <path d="M8 46H40" />
        <path d="M122 60H152M128 70H156" />
      </g>
      <Glow x={80} y={46} r={46} color={p.accentLight} strength={0.3} />
      <g transform="rotate(2.5 80 92)">
        {rows.map(([y, w, fill], i) => (
          <Cel key={i} d={rr(80 - w / 2 + (i % 2 ? 2 : -1), y, w, 10, 1.6)} fill={fill} off={1.6} line={1.3}>
            {fill === timber ? <path d={`M${80 - w / 2 + 4} ${y + 5}H${80 + w / 2 - 2}`} stroke={INK} strokeWidth={0.7} opacity={0.4} /> : <path d={`M80 ${y}V${y + 10}`} stroke={INK} strokeWidth={0.7} opacity={0.35} />}
          </Cel>
        ))}
        <path d="M52 60H108" stroke={INK} strokeWidth={3} />
        <path d="M52 60H108" stroke={p.accent} strokeWidth={1.4} />
        <MiniLantern x={52} y={60} hue={p.accentHue} size={1.4} />
        <MiniLantern x={108} y={60} hue={p.accentHue} size={1.4} />
      </g>
      <Lift>
        <path d="M82 0V7" stroke={INK} strokeWidth={0.9} />
        <Cel d={rr(70, 7, 24, 9, 1.6)} fill={timber} off={1.2} line={1.2} />
        <Cast art={CAST.lamplighter} x={80} y={21} size={20} pose="cheer" shadow={false} />
      </Lift>
      <Cast art={CAST.sprig} x={34} y={99} size={34} pose="cheer" />
      <Cast art={CAST.pebblet} x={126} y={99} size={34} pose="wave" flip />
      <path d="M-2 102V93Q80 89 162 93V102Z" fill={p.near} />
    </g>
  );
}
