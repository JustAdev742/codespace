import { Cast, Cel, Glow, INK, Lift, Ridge, Sky, hsl, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Lantern Lands: light up the map with your team. A board of hexagon lands in two teams' colours, a fort and a shrine, and a Glim planting a flag on new ground. */
export default function LanternLands({ p }: { p: Palette }) {
  const R = 11;
  const hex = (cx: number, cy: number) => {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      return `${(cx + Math.cos(a) * R).toFixed(1)} ${(cy + Math.sin(a) * R * 0.62).toFixed(1)}`;
    });
    return `M${pts.join('L')}Z`;
  };
  const dx = R * Math.sqrt(3);
  const dy = R * 0.62 * 1.5;
  const teamA = p.main;
  const teamB = hsl(p.accentHue, 85, 56);
  const plain = hsl(p.hue, 25, 30);
  const map: string[][] = [
    ['p', 'a', 'a', 'p', 'b', 'b'],
    ['a', 'a', 'a', 'p', 'b', 'b', 'b'],
    ['p', 'a', 'n', 'p', 'b', 'p'],
    ['a', 'p', 'p', 'p', 'b', 'p', 'p'],
  ];
  const fill = { a: teamA, b: teamB, p: plain, n: hsl(p.hue, 60, 44) } as Record<string, string>;
  return (
    <g>
      <Sky p={p} horizon={50} light={0.14} />
      <Ridge y={40} amp={4} seed={3} fill={p.far} />
      <Glow x={80} y={66} r={60} color={p.main} strength={0.25} />
      {map.map((row, r) =>
        row.map((k, c) => {
          const cx = 80 + (c - (row.length - 1) / 2) * dx;
          const cy = 46 + r * dy;
          return (
            <g key={`${r}-${c}`}>
              <path d={hex(cx, cy + 3)} fill={INK} />
              <Cel d={hex(cx, cy)} fill={fill[k]!} off={1.4} line={0.9} shade={0.2} light={0.25} />
            </g>
          );
        }),
      )}
      {/* A fort on team B's ground and a lit shrine. */}
      <Cel d="M107 46V36H110V39H113V36H116V39H119V36H122V46Z" fill={hsl(p.accentHue, 40, 70)} off={1.2} line={1} />
      <Glow x={80} y={50} r={10} color="hsl(48 100% 78%)" strength={0.7} />
      <path d="M77 52V44L80 41L83 44V52Z" fill="hsl(48 100% 72%)" stroke={INK} strokeWidth={1} />
      <Lift>
        <path d="M58 70V44" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
        <path d="M58 44L72 48L58 53Z" fill={teamA} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
        <Cast art={CAST.pebblet} x={48} y={78} size={26} pose="cheer" />
      </Lift>
      <path d="M-2 102V94Q80 90 162 94V102Z" fill={p.near} />
    </g>
  );
}
