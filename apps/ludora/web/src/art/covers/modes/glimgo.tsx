import { Cast, Cel, Glow, INK, Lift, Ridge, Sky, circ, rr, sparkle, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Glimgo: bingo where the calls are questions. A tilted card with squares marked off, the called ball glowing, a Glim stamping the next square. */
export default function Glimgo({ p }: { p: Palette }) {
  const marked = new Set([0, 5, 6, 10, 12, 15]);
  const cells = Array.from({ length: 16 }, (_, i) => ({ x: 52 + (i % 4) * 14, y: 22 + Math.floor(i / 4) * 14, i }));
  return (
    <g>
      <Sky p={p} horizon={74} />
      <Ridge y={74} amp={4} seed={2.5} fill={p.far} />
      <Glow x={80} y={50} r={48} color={p.main} strength={0.35} />
      <g transform="rotate(-8 80 50)">
        <Cel d={rr(46, 14, 68, 70, 5)} fill="#f4f6ff" off={3.4} shade={0.18} />
        <rect x={46} y={14} width={68} height={6} rx={3} fill={p.main} />
        {cells.map((c) => (
          <g key={c.i}>
            <rect x={c.x - 1} y={c.y} width={12} height={12} rx={2} fill={c.i % 2 ? '#dfe4f5' : '#e9ecf8'} />
            <rect x={c.x + 2} y={c.y + 4.5} width={6} height={2} rx={1} fill={INK} opacity={0.22} />
            {marked.has(c.i) ? <path d={circ(c.x + 5, c.y + 6, 5)} fill={p.accent} stroke={INK} strokeWidth={1.2} opacity={0.95} /> : null}
            {marked.has(c.i) ? <circle cx={c.x + 3.4} cy={c.y + 4.2} r={1.3} fill="#fff" opacity={0.8} /> : null}
          </g>
        ))}
      </g>
      {/* The called ball. */}
      <Glow x={128} y={26} r={18} color={p.accentLight} strength={0.6} />
      <Cel d={circ(128, 26, 9)} fill={p.accent} off={2.4} light={0.4} />
      <path d={circ(128, 26, 4.6)} fill="#fff" stroke={INK} strokeWidth={0.8} />
      <path d={sparkle(30, 30, 3.4)} fill="#fff" />
      <Ridge y={90} amp={2} seed={6} fill={p.mid} />
      <Lift>
        <Cast art={CAST.dappledew} x={106} y={98} size={36} pose="cheer" turn={-6} />
      </Lift>
      <path d="M-2 102V97Q80 93 162 97V102Z" fill={p.near} />
    </g>
  );
}
