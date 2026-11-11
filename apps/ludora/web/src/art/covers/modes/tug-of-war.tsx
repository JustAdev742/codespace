import { Beam, Cast, Crowd, Glow, INK, LanternString, Lift, Ridge, Sky, hsl, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Tug of War: two sides, one rope, a gold knot over the centre line. Every right answer is a heave. */
export default function TugOfWar({ p }: { p: Palette }) {
  const rope = 'M6 84Q46 88 80 87T154 82';
  return (
    <g>
      <Sky p={p} horizon={66} />
      <Beam x={80} spread={34} width={14} strength={0.12} />
      <LanternString x1={-4} y1={8} x2={164} y2={8} sag={6} n={11} hues={[p.accentHue, 350, p.accentHue, 190]} size={0.7} />
      <Crowd y={58} fill={p.far} seed={4} size={0.9} cheer={0.35} />
      <Ridge y={66} amp={0.6} seed={2} fill={p.mid} />
      {/* The pitch: end zones on either side, the centre line lit gold. */}
      <path d="M-2 102L18 66H142L162 102Z" fill={p.mainDeep} />
      <path d="M-2 102L18 66H40L26 102Z" fill={hsl(p.hue, 70, 30)} />
      <path d="M162 102L142 66H120L134 102Z" fill={hsl(p.hue, 70, 30)} />
      <Glow x={80} y={84} r={26} color={p.accent} strength={0.5} />
      <path d="M78.6 66H81.4L83 102H77Z" fill={p.accentLight} />
      <Lift>
        <Cast art={CAST.hearthkeeper} x={40} y={96} size={48} turn={-16} />
        <Cast art={CAST.briarcat} x={121} y={94} size={48} turn={16} flip />
        <path d={rope} fill="none" stroke={INK} strokeWidth={5.4} strokeLinecap="round" />
        <path d={rope} fill="none" stroke="hsl(36 62% 66%)" strokeWidth={3} strokeLinecap="round" />
        <path d={rope} fill="none" stroke="hsl(30 50% 42%)" strokeWidth={3} strokeDasharray="1.4 2.6" />
        {/* The knot and its flag, a little over the centre: the left side is winning. */}
        <g transform="translate(74 87)">
          <path d="M0 0V-16" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
          <path d="M0 -16L11 -12.5L0 -9Z" fill={p.accent} stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
          <circle r={4} fill="hsl(36 62% 60%)" stroke={INK} strokeWidth={1.4} />
          <circle cx={-1.2} cy={-1.2} r={1.2} fill="#fff" opacity={0.7} />
        </g>
      </Lift>
      <Crowd y={106} fill={p.near} seed={9} size={1.4} cheer={0.5} from={-10} to={36} />
      <Crowd y={106} fill={p.near} seed={5} size={1.4} cheer={0.5} from={128} to={170} />
    </g>
  );
}
