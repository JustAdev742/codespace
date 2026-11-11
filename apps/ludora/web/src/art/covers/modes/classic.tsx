import { Beam, Cast, Cel, Crowd, Glow, INK, Lift, Ridge, SHAPE, Sky, TILE, TILE_DEEP, rr, sparkle, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Classic: the whole room answers the same question at once. Four answer tiles light up over the stage, a Glim leaps for the right one, the crowd goes up. */
export default function Classic({ p }: { p: Palette }) {
  const tiles = [
    { x: 46, y: 14, i: 0, s: 'sun' as const },
    { x: 84, y: 14, i: 1, s: 'moon' as const },
    { x: 46, y: 36, i: 2, s: 'leaf' as const },
    { x: 84, y: 36, i: 3, s: 'flame' as const },
  ];
  return (
    <g>
      <Sky p={p} horizon={78} light={0.24} />
      <Beam x={24} spread={22} tilt={20} strength={0.16} />
      <Beam x={136} spread={22} tilt={-20} strength={0.16} />
      <Ridge y={76} amp={2} seed={3} fill={p.far} />
      <Crowd y={80} fill={p.mid} seed={2} size={0.8} cheer={0.2} />
      <Glow x={103} y={44} r={30} color={TILE[2]} strength={0.55} />
      {tiles.map((t) => {
        const right = t.i === 2;
        return (
          <g key={t.i} transform={`translate(${t.x + 15} ${t.y + 9}) skewX(-10) translate(${-t.x - 15} ${-t.y - 9})`} opacity={right ? 1 : 0.9}>
            <Cel d={rr(t.x, t.y, 30, 18, 3)} fill={right ? TILE[t.i]! : TILE_DEEP[t.i]!} off={2} line={1.4}>
              <rect x={t.x} y={t.y + 15} width={30} height={3} fill={INK} opacity={0.3} />
            </Cel>
            <path d={SHAPE[t.s]} transform={`translate(${t.x + 8} ${t.y + 2.5}) scale(0.55)`} fill={INK} opacity={right ? 0.9 : 0.6} />
            <rect x={t.x + 18} y={t.y + 6} width={8} height={2.2} rx={1.1} fill={INK} opacity={right ? 0.75 : 0.45} />
            <rect x={t.x + 18} y={t.y + 10} width={5} height={2.2} rx={1.1} fill={INK} opacity={right ? 0.75 : 0.45} />
          </g>
        );
      })}
      <Lift>
        <path d={sparkle(118, 33, 5)} fill="#fff" />
        <path d={sparkle(41, 52, 3.2)} fill={p.accentLight} />
        <Cast art={CAST.buzzbean} x={84} y={93} size={46} pose="cheer" turn={-6} />
      </Lift>
      <Crowd y={104} fill={p.near} seed={7} size={1.5} cheer={0.55} />
      <path d="M0 100V96H160V100Z" fill={INK} opacity={0.4} />
    </g>
  );
}
