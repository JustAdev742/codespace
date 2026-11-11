import { Cast, Glow, INK, Lift, Ridge, Sky, circ, hsl, sparkle, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** A comet streaking up and to the right: a long tapering tail and a bright head. */
function Comet({ x, y, len, r, hue, light }: { x: number; y: number; len: number; r: number; hue: number; light: string }) {
  // The tail runs back down and to the left of the head.
  const a = Math.atan2(0.42, 1);
  const tx = x - Math.cos(a) * len;
  const ty = y + Math.sin(a) * len;
  const nx = Math.sin(a) * r;
  const ny = Math.cos(a) * r;
  const tail = `M${x - nx} ${y - ny}Q${(x + tx) / 2} ${(y + ty) / 2 - r * 0.6} ${tx} ${ty}Q${(x + tx) / 2 + r * 0.4} ${(y + ty) / 2 + r * 1.1} ${x + nx} ${y + ny}Z`;
  return (
    <g>
      <path d={tail} fill={hsl(hue, 100, 70)} opacity={0.35} transform={`translate(0 ${r * 0.5})`} />
      <path d={tail} fill={light} opacity={0.85} />
      <Glow x={x} y={y} r={r * 3.4} color={light} strength={0.7} />
      <path d={circ(x, y, r)} fill="#fff" stroke={INK} strokeWidth={1.2} />
      <path d={circ(x - r * 0.25, y - r * 0.25, r * 0.55)} fill={light} />
    </g>
  );
}

/** Comet Dash: a race along a trail of light. Each right answer pushes your comet on; the one behind slipstreams in its tail. */
export default function CometDash({ p }: { p: Palette }) {
  return (
    <g>
      <Sky p={p} horizon={86} light={0.16} />
      {/* The trail: a dotted arc of markers to a finishing gate. */}
      <path d="M-4 92Q70 70 150 18" fill="none" stroke={p.mainLight} strokeWidth={1.2} strokeDasharray="0.1 5" strokeLinecap="round" opacity={0.8} />
      <g transform="translate(136 10)">
        <path d="M0 0V22M14 0V22" stroke={INK} strokeWidth={3} strokeLinecap="round" />
        <path d="M0 0V22M14 0V22" stroke={p.accent} strokeWidth={1.4} strokeLinecap="round" />
        <path d="M-1 2H15" stroke={p.accent} strokeWidth={2} />
      </g>
      <Ridge y={84} amp={5} seed={2.2} fill={p.far} />
      <Ridge y={92} amp={3} seed={6} fill={p.mid} />
      <Comet x={66} y={64} len={60} r={4} hue={p.hue} light={p.mainLight} />
      <Lift>
        <Comet x={106} y={42} len={86} r={6} hue={p.accentHue} light={p.accentLight} />
        <Cast art={CAST.constella} x={100} y={44} size={34} pose="cheer" turn={-12} shadow={false} />
      </Lift>
      <Cast art={CAST.dewdrop} x={62} y={66} size={24} turn={-10} shadow={false} />
      <path d={sparkle(124, 30, 3)} fill="#fff" />
      <path d={sparkle(40, 40, 2)} fill={p.accentLight} />
      <path d="M-2 102V94Q40 90 80 96Q120 100 162 92V102Z" fill={p.near} />
    </g>
  );
}
