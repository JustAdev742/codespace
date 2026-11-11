import { Cast, Cel, Glow, INK, Lift, Ridge, Sky, hsl, sparkle, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Gloom Giant: the whole room against one giant. It looms over the hills, and the Glims below strike it with light. */
export default function GloomGiant({ p }: { p: Palette }) {
  const giant = 'M30 100C26 70 34 44 52 30C60 14 74 8 86 10C104 12 116 26 120 40C134 52 138 76 132 100Z';
  return (
    <g>
      <Sky p={p} horizon={80} light={0.12} />
      <Ridge y={70} amp={4} seed={4.2} fill={p.far} />
      <Glow x={84} y={44} r={52} color={hsl(p.accentHue, 100, 60)} strength={0.3} />
      <Cel d={giant} fill={hsl(p.hue, 40, 22)} off={4} light={0.12} shade={0.3}>
        <path d="M44 100Q50 70 70 66Q96 64 112 84L120 100Z" fill={hsl(p.hue, 40, 16)} />
      </Cel>
      {/* Its eyes and frown. */}
      <path d="M62 34L76 40L62 44Z" fill={p.accent} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M106 34L92 40L106 44Z" fill={p.accent} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
      <Glow x={70} y={40} r={10} color={p.accentLight} strength={0.6} />
      <Glow x={98} y={40} r={10} color={p.accentLight} strength={0.6} />
      <path d="M72 56Q84 50 96 56" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      {/* Strikes of light hitting it. */}
      <g stroke="hsl(50 100% 78%)" strokeWidth={2.4} strokeLinecap="round">
        <path d="M40 82L62 60M120 82L104 62M80 86L82 66" />
      </g>
      <path d={sparkle(63, 59, 5)} fill="#fff" />
      <path d={sparkle(104, 61, 4)} fill="#fff" />
      <Lift>
        <Cast art={CAST.sprig} x={36} y={99} size={28} pose="cheer" />
        <Cast art={CAST.dewdrop} x={124} y={99} size={28} pose="cheer" flip />
        <Cast art={CAST.buzzbean} x={80} y={101} size={26} pose="cheer" />
      </Lift>
      <path d="M-2 102V98Q80 94 162 98V102Z" fill={p.near} />
    </g>
  );
}
