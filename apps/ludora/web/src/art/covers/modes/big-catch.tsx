import { Cast, Cel, Glow, INK, Lift, Ridge, Sky, hsl, sparkle, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Big Catch: wait for the bite, reel it in. A Glim on the jetty, its line bent tight, a big fish leaping out of the moonlit river. */
export default function BigCatch({ p }: { p: Palette }) {
  const water = hsl(p.hue, 60, 24);
  return (
    <g>
      <Sky p={p} horizon={58} light={0.14} />
      <circle cx={122} cy={18} r={8} fill="hsl(48 100% 88%)" />
      <Glow x={122} y={18} r={20} color="hsl(48 100% 80%)" strength={0.3} />
      <Ridge y={54} amp={4} seed={1.7} fill={p.far} />
      <path d="M-2 102V60H162V102Z" fill={water} />
      {/* Moonlight on the water. */}
      <path d="M114 64H130M110 70H134M116 76H128" stroke="hsl(48 100% 86%)" strokeWidth={1.4} strokeLinecap="round" opacity={0.5} />
      <path d="M-2 60H162" stroke={p.mainLight} strokeWidth={0.8} opacity={0.6} />
      {/* The jetty. */}
      <Cel d="M-4 78H56V84H-4Z" fill={hsl(28, 40, 34)} off={1.4} line={1.3} />
      <path d="M8 84V100M30 84V100M50 84V100" stroke={INK} strokeWidth={3} />
      {/* The rod and the line, pulled tight. */}
      <path d="M44 64L72 30Q96 40 106 58" fill="none" stroke={INK} strokeWidth={0.9} />
      <path d="M44 64L72 30" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M44 64L72 30" stroke={hsl(28, 50, 50)} strokeWidth={1.2} strokeLinecap="round" />
      <Lift>
        {/* The fish leaping, with a splash. */}
        <path d="M94 66Q100 58 106 66M112 66Q118 58 124 66" fill="none" stroke="#fff" strokeWidth={1.4} strokeLinecap="round" opacity={0.8} />
        <g transform="rotate(-28 108 50)">
          <Cel d="M92 50Q104 38 118 50Q104 62 92 50ZM118 50L128 42V58Z" fill={p.accent} off={2} line={1.3} />
          <circle cx={98} cy={48} r={1.4} fill={INK} />
          <path d="M104 44Q108 50 104 56" fill="none" stroke={INK} strokeWidth={1} opacity={0.5} />
        </g>
        <path d={sparkle(124, 36, 3.4)} fill="#fff" />
      </Lift>
      <Cast art={CAST.anglet} x={34} y={79} size={32} pose="cheer" />
      <path d="M-2 102V96Q80 92 162 96V102Z" fill={p.near} opacity={0.6} />
    </g>
  );
}
