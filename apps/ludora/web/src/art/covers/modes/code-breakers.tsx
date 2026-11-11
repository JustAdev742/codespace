import { Cast, Cel, Glow, INK, Lift, Ridge, Sky, circ, hsl, rr, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Code Breakers: mine bits, crack rivals' passwords, guard your own. A giant padlock behind a shield, streams of data packets, and a Glim with the key. */
export default function CodeBreakers({ p }: { p: Palette }) {
  const bits = Array.from({ length: 22 }, (_, i) => ({ x: 8 + ((i * 37) % 150), y: 6 + ((i * 23) % 60), on: i % 3 !== 0 }));
  const code = hsl(p.accentHue, 90, 64);
  return (
    <g>
      <Sky p={p} horizon={72} light={0.12} />
      {bits.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.on ? 3 : 1.6} height={3} rx={0.6} fill={code} opacity={b.on ? 0.7 : 0.4} />
      ))}
      <Ridge y={76} amp={2} seed={8} fill={p.far} />
      {/* The shield, a firewall, behind the lock. */}
      <Glow x={80} y={46} r={44} color={code} strength={0.3} />
      <Cel d="M80 10L114 22V46C114 66 98 80 80 86C62 80 46 66 46 46V22Z" fill={hsl(p.hue, 50, 30)} off={3} line={1.6} light={0.18} />
      <path d="M80 16L108 26V46C108 62 95 74 80 79C65 74 52 62 52 46V26Z" fill="none" stroke={code} strokeWidth={1.2} strokeDasharray="3 2" />
      {/* The padlock. */}
      <path d="M70 44V36A10 10 0 0 1 90 36V44" fill="none" stroke={INK} strokeWidth={7} />
      <path d="M70 44V36A10 10 0 0 1 90 36V44" fill="none" stroke={hsl(p.hue, 20, 76)} strokeWidth={4} />
      <Cel d={rr(64, 42, 32, 26, 4)} fill={p.accent} off={2.4} light={0.4} />
      <path d={circ(80, 52, 3.4)} fill={INK} />
      <path d="M78.4 53H81.6L82.6 61H77.4Z" fill={INK} />
      <Lift>
        <g transform="rotate(-30 118 72)">
          <path d={circ(112, 72, 5)} fill="none" stroke={INK} strokeWidth={4.4} />
          <path d={circ(112, 72, 5)} fill="none" stroke={p.accent} strokeWidth={2.2} />
          <path d="M117 72H132M128 72V77M124 72V76" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <path d="M117 72H132M128 72V77M124 72V76" fill="none" stroke={p.accent} strokeWidth={2} strokeLinecap="round" />
        </g>
        <Cast art={CAST.anglet} x={128} y={99} size={30} pose="cheer" flip />
      </Lift>
      <path d="M-2 102V94Q80 90 162 94V102Z" fill={p.near} />
    </g>
  );
}
