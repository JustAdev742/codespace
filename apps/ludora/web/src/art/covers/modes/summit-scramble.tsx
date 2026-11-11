import { Cast, Cel, Glow, INK, Lift, MiniLantern, Ridge, Sky, hsl, rr, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Summit Scramble: climb the mountain by lantern light and race to the summit. A Glim halfway up a night cliff on its rope, lantern swinging, another close behind, the summit flag above. */
export default function SummitScramble({ p }: { p: Palette }) {
  const cliff = 'M30 102L54 60L66 64L84 26L100 8L112 14L130 34L148 40L166 70V102Z';
  const rock = hsl(p.hue, 26, 34);
  return (
    <g>
      <Sky p={p} horizon={84} light={0.14} />
      <circle cx={24} cy={20} r={7} fill="hsl(48 100% 88%)" />
      <Glow x={24} y={20} r={18} color="hsl(48 100% 80%)" strength={0.3} />
      <Ridge y={72} amp={8} seed={4} fill={p.far} />
      <Cel d={cliff} fill={rock} off={4} light={0.14} shade={0.35}>
        <path d="M100 8L92 20L98 18L102 24L108 18L112 14Z" fill="#eef2ff" />
        <path d="M70 80L80 70M110 50L120 44M126 74L138 68M90 40L96 34" stroke={INK} strokeWidth={1} opacity={0.35} />
      </Cel>
      <path d="M100 8V-2" stroke={INK} strokeWidth={1.8} />
      <path d="M100 -1L111 2.4L100 6Z" fill={p.accent} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      <Glow x={104} y={2} r={12} color={p.accentLight} strength={0.5} />
      {/* The rope from the summit. */}
      <path d="M100 9Q98 30 96 56" fill="none" stroke={hsl(36, 60, 70)} strokeWidth={1} strokeDasharray="2 1.4" />
      {/* Ledges. */}
      <Cel d={rr(80, 56, 32, 4, 2)} fill={hsl(p.hue, 26, 46)} off={1} line={1.1} />
      <Cel d={rr(56, 84, 30, 4, 2)} fill={hsl(p.hue, 26, 46)} off={1} line={1.1} />
      <Glow x={100} y={44} r={22} color={p.accentLight} strength={0.5} />
      <Lift>
        <Cast art={CAST.buzzbean} x={94} y={57} size={34} pose="cheer" shadow={false} />
        <MiniLantern x={110} y={34} hue={p.accentHue} size={1.6} />
      </Lift>
      <Glow x={72} y={76} r={14} color={p.accentLight} strength={0.4} />
      <Cast art={CAST.sprig} x={70} y={85} size={26} pose="wave" shadow={false} />
      <MiniLantern x={82} y={68} hue={p.accentHue} size={1.1} />
      <path d="M-2 102V96Q80 92 162 98V102Z" fill={p.near} />
    </g>
  );
}
