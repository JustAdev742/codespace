import { Cast, Cel, Glow, INK, Lift, MiniLantern, Rooftops, Sky, hsl, rr, sparkle, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** A kite: a diamond with a cross and a ribbon tail. */
function Kite({ x, y, hue }: { x: number; y: number; hue: number }) {
  return (
    <g>
      <Cel d={`M${x} ${y - 6}L${x + 4.6} ${y}L${x} ${y + 7}L${x - 4.6} ${y}Z`} fill={hsl(hue, 90, 62)} off={1} line={0.9} />
      <path d={`M${x} ${y + 7}q2 3 0 5q-2 2 0 4`} fill="none" stroke={hsl(hue, 90, 70)} strokeWidth={0.9} />
    </g>
  );
}

/** Festival Workshop: build a workshop for the festival and sell what it makes. A Glim behind the belt as lanterns roll out, kites on the racks, a firework bursting overhead. */
export default function FestivalWorkshop({ p }: { p: Palette }) {
  const burst = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return `M${126 + Math.cos(a) * 4} ${14 + Math.sin(a) * 4}L${126 + Math.cos(a) * 11} ${14 + Math.sin(a) * 11}`;
  }).join('');
  const wood = hsl(28, 46, 34);
  return (
    <g>
      <Sky p={p} horizon={60} />
      <Rooftops y={44} fill={p.far} seed={9} />
      <Glow x={126} y={14} r={20} color={hsl(p.accentHue, 100, 72)} strength={0.6} />
      <path d={burst} stroke={hsl(p.accentHue, 100, 78)} strokeWidth={1.8} strokeLinecap="round" />
      <path d={sparkle(126, 14, 3.4)} fill="#fff" />
      {/* The workshop: back wall with racks, posts and a beam. */}
      <rect x={8} y={30} width={144} height={60} fill={p.mainDeep} />
      <rect x={8} y={30} width={144} height={60} fill={INK} opacity={0.2} />
      <path d="M14 46H62M98 46H146" stroke={INK} strokeWidth={2.4} />
      <path d="M14 46H62M98 46H146" stroke={wood} strokeWidth={1.2} />
      <Kite x={22} y={38} hue={p.accentHue} />
      <Kite x={36} y={38} hue={330} />
      <Kite x={50} y={38} hue={p.hue + 30} />
      <MiniLantern x={108} y={32} hue={p.accentHue} size={1} />
      <MiniLantern x={122} y={32} hue={330} size={1} />
      <MiniLantern x={136} y={32} hue={p.hue + 20} size={1} />
      <Cel d="M4 24H156V31H4Z" fill={wood} off={1} line={1.3} />
      <path d="M8 31V92M152 31V92" stroke={INK} strokeWidth={4} />
      <path d="M8 31V92M152 31V92" stroke={wood} strokeWidth={2} />
      <Glow x={80} y={60} r={36} color={hsl(p.hue, 100, 68)} strength={0.45} />
      <Lift>
        <Cast art={CAST.hearthkeeper} x={80} y={82} size={40} pose="cheer" shadow={false} />
      </Lift>
      {/* The belt in front, carrying lanterns out to the right. */}
      <Cel d={rr(4, 76, 152, 9, 4.5)} fill={hsl(p.hue, 20, 26)} off={1} line={1.4} shade={0} />
      {[14, 30, 46, 62, 78, 94, 110, 126, 142].map((x) => (
        <circle key={x} cx={x} cy={80.5} r={1.8} fill={hsl(p.hue, 20, 52)} />
      ))}
      {/* An unfinished frame on the left, finished lanterns on the right. */}
      <Cel d={rr(20, 62, 22, 14, 1.6)} fill={hsl(32, 50, 50)} off={1.4} line={1.2}>
        <path d="M20 69H42M31 62V76" stroke={INK} strokeWidth={0.9} opacity={0.5} />
      </Cel>
      <MiniLantern x={114} y={59} hue={p.accentHue} size={1.7} />
      <MiniLantern x={138} y={59} hue={330} size={1.7} />
      <path d="M-2 102V88H162V102Z" fill={p.near} />
    </g>
  );
}
