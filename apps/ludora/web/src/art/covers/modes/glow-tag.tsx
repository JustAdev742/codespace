import { Cast, Glow, INK, Lift, Ridge, Sky, hsl, sparkle, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Glow Tag Royale: charge your beam, tag rivals and stay inside the ring. A glowing park at night, one Glim tagging another as the ring closes in. */
export default function GlowTag({ p }: { p: Palette }) {
  const ring = hsl(p.accentHue, 100, 70);
  return (
    <g>
      <Sky p={p} horizon={60} light={0.12} />
      <Ridge y={54} amp={4} seed={6} fill={p.far} />
      {/* Trees round the park. */}
      {[[18, 56], [40, 50], [126, 52], [146, 58]].map(([x, y], i) => (
        <g key={i}>
          <path d={`M${x} ${y! + 10}V${y! + 2}`} stroke={p.near} strokeWidth={2.4} />
          <circle cx={x} cy={y} r={8} fill={p.mid} />
        </g>
      ))}
      <path d="M-2 102V60Q80 56 162 60V102Z" fill={p.mid} />
      {/* The shrinking ring on the grass, and its old edge. */}
      <ellipse cx={80} cy={82} rx={70} ry={16} fill="none" stroke={ring} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
      <ellipse cx={80} cy={82} rx={52} ry={12} fill={ring} opacity={0.08} />
      <ellipse cx={80} cy={82} rx={52} ry={12} fill="none" stroke={INK} strokeWidth={3.4} />
      <ellipse cx={80} cy={82} rx={52} ry={12} fill="none" stroke={ring} strokeWidth={1.8} />
      {/* The beam: from the tagger to the one tagged. */}
      <path d="M66 66L104 60" stroke={p.mainLight} strokeWidth={6} strokeLinecap="round" opacity={0.4} />
      <path d="M66 66L104 60" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
      <Glow x={106} y={60} r={18} color={p.mainLight} strength={0.7} />
      <path d={sparkle(106, 60, 5)} fill="#fff" />
      <Lift>
        <Cast art={CAST.moonchill} x={60} y={90} size={36} pose="wave" />
        <Cast art={CAST.briarcat} x={112} y={86} size={30} turn={12} flip />
      </Lift>
      <path d={sparkle(30, 30, 2)} fill={p.accentLight} />
      <path d="M-2 102V98Q80 95 162 98V102Z" fill={INK} opacity={0.5} />
    </g>
  );
}
