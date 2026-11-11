import { Cast, Cel, Glow, INK, Lift, Rooftops, Sky, circ, hsl, rr, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Corner Shop: right answers bring the deliveries, customers bring the cash. A lit shop front with full shelves, a customer at the till and a crate arriving. */
export default function CornerShop({ p }: { p: Palette }) {
  const goods = [p.accent, hsl(350, 80, 62), hsl(200, 80, 60), p.mainLight];
  return (
    <g>
      <Sky p={p} horizon={70} />
      <Rooftops y={60} fill={p.far} seed={11} />
      {/* The shop. */}
      <Cel d="M30 30H130V92H30Z" fill={p.mainDeep} off={2.4} line={1.4} />
      <Cel d="M26 22H134V32H26Z" fill={hsl(p.hue, 30, 22)} off={1.2} line={1.3} shade={0} />
      <Cel d="M30 32H130L126 42H34Z" fill={p.accent} off={1.4} line={1.3}>
        <path d="M42 32h12l-1 10h-10ZM66 32h12l-1 10h-10ZM90 32h12l-1 10h-10ZM114 32h12l-1 10h-10Z" fill="#fbf7ea" />
      </Cel>
      {/* The window: shelves of goods, lit from inside. */}
      <Glow x={64} y={64} r={30} color={hsl(p.accentHue, 100, 76)} strength={0.4} />
      <rect x={38} y={48} width={54} height={36} rx={2} fill={hsl(p.accentHue, 70, 86)} stroke={INK} strokeWidth={1.4} />
      {[58, 70, 82].map((y) => (
        <g key={y}>
          <path d={`M38 ${y}H92`} stroke={INK} strokeWidth={1.2} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={41 + i * 8.4} y={y - 7} width={6} height={7} rx={1} fill={goods[(i + y) % goods.length]} stroke={INK} strokeWidth={0.8} />
          ))}
        </g>
      ))}
      {/* The door. */}
      <Cel d={rr(100, 50, 22, 42, 2)} fill={hsl(p.hue, 50, 30)} off={1.4} line={1.3} />
      <circle cx={117} cy={72} r={1.4} fill={p.accent} />
      <Lift>
        <Cast art={CAST.dappledew} x={110} y={98} size={30} pose="wave" />
        {/* A crate arriving, and coins. */}
        <Cel d={rr(46, 84, 18, 14, 1.6)} fill={hsl(32, 50, 50)} off={1.4} line={1.2}>
          <path d="M46 91H64M55 84V98" stroke={INK} strokeWidth={0.9} opacity={0.5} />
        </Cel>
        <path d={circ(74, 92, 3.6)} fill={p.accent} stroke={INK} strokeWidth={1} />
        <path d={circ(80, 95, 3.6)} fill={p.accent} stroke={INK} strokeWidth={1} />
      </Lift>
      <path d="M-2 102V97H162V102Z" fill={p.near} />
    </g>
  );
}
