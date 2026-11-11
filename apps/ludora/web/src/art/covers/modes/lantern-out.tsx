import { Cast, Glow, INK, Lift, MiniLantern, Ridge, Rooftops, Sky, hsl, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Lantern Out: keep your lanterns lit. A row of lanterns in the wind, one just blown out and smoking, a Glim guarding the rest. */
export default function LanternOut({ p }: { p: Palette }) {
  const lit = [p.hue, p.hue + 10, p.hue - 8];
  return (
    <g>
      <Sky p={p} horizon={72} light={0.14} />
      <Rooftops y={74} fill={p.far} lit={hsl(p.hue, 100, 70)} seed={2} />
      <Ridge y={84} amp={1} seed={3} fill={p.mid} />
      {/* The wind: a few hard curls blowing in from the left. */}
      <g fill="none" stroke={hsl(p.accentHue, 70, 78)} strokeWidth={1.6} strokeLinecap="round" opacity={0.75}>
        <path d="M4 26H34Q42 26 42 20Q42 15 37 15Q33 15 33 19" />
        <path d="M10 40H48" />
        <path d="M2 52H28Q35 52 35 57Q35 61 31 61" />
      </g>
      {/* The line the lanterns hang from. */}
      <path d="M-2 18Q80 34 162 18" fill="none" stroke={INK} strokeWidth={1} />
      <MiniLantern x={44} y={24} hue={lit[0]!} size={2} />
      <MiniLantern x={98} y={26.4} hue={lit[1]!} size={2} />
      <MiniLantern x={126} y={23.4} hue={lit[2]!} size={2} />
      {/* The one that went out: dark paper and a curl of smoke. */}
      <g transform="translate(71 26.5) scale(2)">
        <path d="M0 -1V1.2" stroke={INK} strokeWidth="0.8" />
        <rect x="-3.8" y="1.2" width="7.6" height="8" rx="3.4" fill={hsl(p.hue, 22, 28)} stroke={INK} strokeWidth="1.1" />
        <path d="M-2.2 1.2H2.2M-2.2 9.2H2.2" stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
      </g>
      <path d="M71 24Q66 18 71 13Q76 8 71 2" fill="none" stroke={hsl(p.accentHue, 20, 70)} strokeWidth={1.8} strokeLinecap="round" opacity={0.7} />
      <Glow x={84} y={74} r={30} color={hsl(p.hue, 100, 64)} strength={0.4} />
      <Lift>
        <Cast art={CAST.lamplighter} x={84} y={96} size={46} pose="wave" />
      </Lift>
      <path d="M-2 102V94Q80 88 162 94V102Z" fill={p.near} />
    </g>
  );
}
