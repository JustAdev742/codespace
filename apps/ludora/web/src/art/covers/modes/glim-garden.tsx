import { Cast, Cel, Glow, INK, Lift, Ridge, Sky, circ, hsl, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** A five-petal bloom with a glowing heart. */
function Bloom({ x, y, r, hue, open = 1 }: { x: number; y: number; r: number; hue: number; open?: number }) {
  const petals = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return circ(x + Math.cos(a) * r * 0.62 * open, y + Math.sin(a) * r * 0.62 * open, r * 0.5);
  }).join('');
  return (
    <g>
      <Glow x={x} y={y} r={r * 2.6} color={hsl(hue, 100, 72)} strength={0.5} />
      <Cel d={petals} fill={hsl(hue, 92, 64)} off={r * 0.3} line={1.1} />
      <circle cx={x} cy={y} r={r * 0.36} fill={hsl(52, 100, 70)} stroke={INK} strokeWidth={1} />
    </g>
  );
}

function Stem({ x, y, to, lean = 0 }: { x: number; y: number; to: number; lean?: number }) {
  return (
    <g>
      <path d={`M${x} ${to}Q${x + lean} ${(y + to) / 2} ${x + lean * 0.6} ${y}`} fill="none" stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
      <path d={`M${x} ${to}Q${x + lean} ${(y + to) / 2} ${x + lean * 0.6} ${y}`} fill="none" stroke="hsl(130 55% 42%)" strokeWidth={1.6} strokeLinecap="round" />
      <Cel d={`M${x + lean * 0.4} ${(y + to) / 2 + 3}q7 -7 12 -3q-6 6 -12 3Z`} fill="hsl(130 58% 46%)" off={1} line={0.9} />
    </g>
  );
}

/** Glim Garden: a night garden the class grows together. A Glim waters a bed of glowing blooms while fireflies gather. */
export default function GlimGarden({ p }: { p: Palette }) {
  const flies: [number, number][] = [[28, 44], [44, 50], [120, 44], [138, 52], [100, 30], [58, 36]];
  return (
    <g>
      <Sky p={p} horizon={72} />
      <circle cx={132} cy={20} r={9} fill="hsl(48 100% 88%)" />
      <Glow x={132} y={20} r={22} color="hsl(48 100% 80%)" strength={0.3} />
      <Ridge y={58} amp={5} seed={1.3} fill={p.far} />
      {/* The hedge round the garden, with an arch. */}
      <Ridge y={66} amp={2.5} seed={4} fill={p.mid} />
      {/* The bed: soil with a lit edge. */}
      <path d="M-2 102V80Q40 70 80 72Q120 70 162 80V102Z" fill="hsl(24 36% 18%)" />
      <path d="M-2 80Q40 70 80 72Q120 70 162 80" fill="none" stroke="hsl(30 40% 32%)" strokeWidth={2} />
      <Stem x={116} y={68} to={84} lean={-3} />
      <Stem x={128} y={66} to={84} lean={4} />
      <Stem x={34} y={62} to={84} lean={3} />
      <Stem x={50} y={70} to={86} lean={-2} />
      <Bloom x={114} y={66} r={8} hue={p.accentHue} />
      <Bloom x={130} y={64} r={6} hue={330} />
      <Bloom x={36} y={60} r={6.5} hue={186} />
      <Bloom x={49} y={69} r={4.5} hue={300} />
      <Lift>
        <Cast art={CAST.sprig} x={72} y={93} size={44} pose="cheer" />
        {/* The watering can, tipped towards the big bloom, with a stream of drops. */}
        <g transform="translate(88 42) rotate(40)">
          <Cel d="M0 0H13Q15 0 15 2V11Q15 13 13 13H0Q-2 13 -2 11V2Q-2 0 0 0Z" fill={hsl(p.hue, 70, 62)} off={1.6} line={1.2} />
          <path d="M14 3L24 -3" stroke={INK} strokeWidth={4} strokeLinecap="round" />
          <path d="M14 3L24 -3" stroke={hsl(p.hue, 70, 62)} strokeWidth={2} strokeLinecap="round" />
          <path d="M1 0Q6 -8 12 0" fill="none" stroke={INK} strokeWidth={1.6} />
        </g>
        {[[109.5, 58], [112.5, 60], [110, 63]].map(([dx, dy], i) => (
          <path key={i} d={`M${dx} ${dy! - 2}q1.4 2 1.4 3a1.4 1.4 0 0 1 -2.8 0q0 -1 1.4 -3Z`} fill="hsl(196 100% 78%)" stroke={INK} strokeWidth={0.6} />
        ))}
      </Lift>
      {flies.map(([fx, fy], i) => (
        <g key={i}>
          <circle cx={fx} cy={fy} r={2.6} fill={p.accentLight} opacity={0.3} />
          <circle cx={fx} cy={fy} r={0.9} fill={p.accentLight} />
        </g>
      ))}
      {/* Big dark leaves in the corners frame the bed. */}
      <path d="M-4 104Q2 80 22 78Q16 94 -4 104ZM-4 92Q-2 74 12 66Q12 84 -4 92Z" fill={p.near} />
      <path d="M164 104Q158 82 138 80Q144 96 164 104ZM164 90Q162 74 150 68Q150 84 164 90Z" fill={p.near} />
    </g>
  );
}
