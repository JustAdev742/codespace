import { Cast, Cel, Glow, INK, Lift, Ridge, Sky, rr, sparkle, type Palette } from '../kit.tsx';
import { CAST } from '../cast.ts';

/** Flashcard Study: turn the card, be honest, master the set. A card mid-turn over three boxes of cards filed by how well you know them. */
export default function FlashcardStudy({ p }: { p: Palette }) {
  const box = (x: number, cards: number, fill: string) => (
    <g key={x}>
      {Array.from({ length: cards }, (_, i) => (
        <rect key={i} x={x + 3 + i * 0.6} y={70 - i * 3} width={22} height={14} rx={1.6} fill="#fbf7ea" stroke={INK} strokeWidth={1} />
      ))}
      <Cel d={`M${x} 76H${x + 28}L${x + 26} 92H${x + 2}Z`} fill={fill} off={2} line={1.3} />
    </g>
  );
  return (
    <g>
      <Sky p={p} horizon={72} />
      <Ridge y={70} amp={3} seed={2.4} fill={p.far} />
      <Glow x={80} y={34} r={40} color={p.mainLight} strength={0.45} />
      {/* The card turning over: the front, edge-on at the fold, and the back. */}
      <Lift>
        <g transform="rotate(-8 80 34)">
          <Cel d={rr(48, 18, 30, 34, 3)} fill="#fbf7ea" off={2.4} line={1.4} shade={0.12} />
          <path d="M58 30A5 5 0 1 1 63 35V37.5" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" opacity={0.55} />
          <circle cx={63} cy={42} r={1.5} fill={INK} opacity={0.55} />
          <Cel d="M82 20L104 16V50L82 54Z" fill={p.main} off={2} line={1.4} />
          <path d="M87 33L91 38L99 28" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M78.5 18V54" stroke={INK} strokeWidth={2} />
        </g>
        <path d={sparkle(112, 18, 3.4)} fill="#fff" />
      </Lift>
      <Ridge y={86} amp={1.4} seed={3} fill={p.mid} />
      {box(24, 4, p.mainDeep)}
      {box(108, 2, p.accentDeep)}
      <Cast art={CAST.quillington} x={80} y={99} size={36} pose="wave" />
      <path d="M-2 102V97Q80 93 162 97V102Z" fill={p.near} />
    </g>
  );
}
