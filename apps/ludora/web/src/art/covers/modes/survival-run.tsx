import { Cast, Cel, Glow, INK, Lift, Ridge, Sky, hsl, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

const HEART = 'M0 7C-6 3 -9 0 -9 -3.4C-9 -6.4 -6.8 -8 -4.4 -8C-2.6 -8 -1 -7 0 -5.4C1 -7 2.6 -8 4.4 -8C6.8 -8 9 -6.4 9 -3.4C9 0 6 3 0 7Z';

/** Survival Run: three hearts, a shrinking timer and no finish line. A Glim runs a road into the night under its last hearts. */
export default function SurvivalRun({ p }: { p: Palette }) {
  return (
    <g>
      <Sky p={p} horizon={62} light={0.16} />
      <Ridge y={58} amp={5} seed={3.6} fill={p.far} />
      <Ridge y={64} amp={3} seed={1.2} fill={p.mid} />
      {/* The road to the horizon, with lit markers. */}
      <path d="M72 62H88L132 102H28Z" fill={hsl(p.hue, 30, 22)} />
      <path d="M80 64V67M80 72V77M80 83V91" stroke={p.accentLight} strokeWidth={1.8} strokeLinecap="round" />
      <Glow x={80} y={62} r={16} color={p.accentLight} strength={0.6} />
      <Lift>
        {[52, 80, 108].map((x, i) => (
          <g key={x} transform={`translate(${x} ${i === 1 ? 20 : 24}) scale(${i === 1 ? 1.5 : 1.3})`}>
            {i < 2 ? <Glow x={0} y={0} r={14} color={p.main} strength={0.55} /> : null}
            <Cel d={HEART} fill={i < 2 ? p.main : hsl(p.hue, 20, 30)} off={2} line={1.2} />
            {i === 2 ? <path d="M0 -5L-2 -1L1.5 1L-0.6 6" fill="none" stroke={INK} strokeWidth={1.2} strokeLinejoin="round" /> : null}
          </g>
        ))}
        <Cast art={CAST.hearthkeeper} x={80} y={98} size={40} turn={6} pose="cheer" />
      </Lift>
      <g stroke={p.accentLight} strokeWidth={1.4} strokeLinecap="round" opacity={0.7}>
        <path d="M46 80H58M42 88H56M104 82H114" />
      </g>
    </g>
  );
}
