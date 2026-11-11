import { Cast, Cel, Glow, INK, Lift, Ridge, Rooftops, Sky, hsl, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** A paper sky lantern: a tall glowing bag, wider at the top, with a little flame below. */
function SkyLantern({ x, y, s, hue }: { x: number; y: number; s: number; hue: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <Glow x={0} y={2} r={16} color={hsl(hue, 100, 70)} strength={0.55} />
      <Cel d="M-7.4 -9Q0 -11.5 7.4 -9L3.8 9Q0 10 -3.8 9Z" fill={hsl(hue, 96, 64)} off={1.6} line={1} />
      <path d="M0 -10V9" stroke={hsl(hue, 80, 44)} strokeWidth={0.8} />
      <path d="M-3.4 10.6Q0 13 3.4 10.6" fill="none" stroke={INK} strokeWidth={1} />
      <circle cx={0} cy={11.6} r={1.2} fill="hsl(48 100% 80%)" />
    </g>
  );
}

/** Sky Lanterns: light lanterns, read the wind and launch them all at once. A sky full of rising lanterns, a Glim sending up one more. */
export default function SkyLanterns({ p }: { p: Palette }) {
  return (
    <g>
      <Sky p={p} horizon={80} light={0.14} />
      {/* The wind they ride. */}
      <g fill="none" stroke={hsl(p.hue, 60, 70)} strokeWidth={1.2} strokeLinecap="round" opacity={0.5}>
        <path d="M0 48Q40 40 70 46T150 34" />
        <path d="M10 22Q50 16 90 22T160 12" />
      </g>
      <SkyLantern x={30} y={30} s={0.8} hue={p.accentHue} />
      <SkyLantern x={58} y={14} s={0.6} hue={p.accentHue + 14} />
      <SkyLantern x={108} y={20} s={0.9} hue={p.accentHue - 10} />
      <SkyLantern x={136} y={42} s={0.6} hue={p.accentHue} />
      <SkyLantern x={96} y={40} s={0.7} hue={p.accentHue + 6} />
      <Ridge y={78} amp={5} seed={2.7} fill={p.far} />
      <Rooftops y={88} fill={p.mid} lit={hsl(p.accentHue, 100, 70)} seed={3} />
      <Lift>
        <SkyLantern x={80} y={46} s={1.2} hue={p.accentHue} />
        <Cast art={CAST.lamplighter} x={80} y={100} size={38} pose="cheer" />
      </Lift>
    </g>
  );
}
