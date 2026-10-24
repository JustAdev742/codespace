import { memo } from 'react';
import type { ModeThumbnail } from '@ludora/shared';

/*
 * Mode thumbnails, like the covers in a game catalogue: each mode stands on its
 * own small stage in its colour, under the floodlight, over the faint lines of
 * a pitch, with its glyph big in the middle and a crisp ink contour so it reads
 * on any colour. Glyphs are drawn in a 48 x 48 box.
 */

const G: Record<string, string> = {
  bolt: 'M27 3L9 27H22L19 45L39 19H26Z',
  comet: 'M30 10A11 11 0 1 1 29.9 10ZM20 26L3 43M17 20L5 28M26 30L18 42',
  heart: 'M24 42C10 32 4 25 4 17C4 10 9 6 15 6C19 6 22 8 24 12C26 8 29 6 33 6C39 6 44 10 44 17C44 25 38 32 24 42Z',
  crown: 'M6 38L4 12L16 22L24 8L32 22L44 12L42 38Z',
  castle: 'M8 44V18H14V24H19V18H29V24H34V18H40V44H28V34A4 4 0 0 0 20 34V44Z',
  map: 'M4 10L16 5L32 11L44 6V38L32 43L16 37L4 42ZM16 5V37M32 11V43',
  bingo: 'M6 6H42V42H6ZM18 6V42M30 6V42M6 18H42M6 30H42',
  cards: 'M8 12L28 6L36 34L16 40ZM24 10L40 14L34 40',
  letters: 'M6 38L14 10H18L26 38M9 28H23M30 10H38A6 6 0 0 1 38 22H30V38H39A6 6 0 0 0 39 22',
  rope: 'M2 24H46M12 18L18 30M22 18L28 30M32 18L38 30',
  baton: 'M10 38L34 14M30 10L38 18M6 42A3 3 0 1 0 6.1 42Z',
  bracket: 'M4 8H14V20H24M4 32H14V20M24 20H32V28H44M24 40H32V28',
  sprout: 'M24 44V22M24 26C24 16 16 10 6 10C6 20 14 26 24 26ZM24 22C24 12 32 6 42 6C42 16 34 22 24 22Z',
  gavel: 'M20 6L34 20M14 12L28 26M24 16L8 32M6 44H26',
  mask: 'M6 14C14 10 34 10 42 14C42 30 34 38 24 38C14 38 6 30 6 14ZM15 22A3 3 0 1 0 15.1 22ZM33 22A3 3 0 1 0 33.1 22Z',
  target: 'M24 4A20 20 0 1 1 23.9 4ZM24 12A12 12 0 1 1 23.9 12ZM24 20A4 4 0 1 1 23.9 20Z',
  notes: 'M18 36V10L40 6V30M18 36A6 5 0 1 1 6 36A6 5 0 1 1 18 36ZM40 30A6 5 0 1 1 28 30A6 5 0 1 1 40 30Z',
  puzzle: 'M8 14H18A5 5 0 1 1 28 14H38V24A5 5 0 1 0 38 34V42H28A5 5 0 1 0 18 42H8V32A5 5 0 1 1 8 22Z',
  hourglass: 'M10 4H38M10 44H38M12 4C12 18 36 22 36 44M36 4C36 18 12 22 12 44',
  dice: 'M8 8H40V40H8ZM16 16A2 2 0 1 0 16.1 16ZM32 16A2 2 0 1 0 32.1 16ZM24 24A2 2 0 1 0 24.1 24ZM16 32A2 2 0 1 0 16.1 32ZM32 32A2 2 0 1 0 32.1 32Z',
  sword: 'M38 4L44 4L44 10L20 34L14 28ZM12 30L18 36M8 34L14 40M10 42A2 2 0 1 0 10.1 42Z',
  shield: 'M24 4L40 10V22C40 32 33 40 24 44C15 40 8 32 8 22V10Z',
  rocket: 'M24 4C32 10 36 18 34 30H14C12 18 16 10 24 4ZM14 30L8 40L16 36M34 30L40 40L32 36M24 18A4 4 0 1 0 24.1 18Z',
  lantern: 'M18 7H30L32 13H16ZM12 22C12 15 17 13 24 13C31 13 36 15 36 22V33C36 40 31 42 24 42C17 42 12 40 12 33ZM19 41H29L27 46H21Z',
  brain: 'M24 8C20 4 10 6 10 14C4 16 4 26 10 28C8 36 16 42 24 38C32 42 40 36 38 28C44 26 44 16 38 14C38 6 28 4 24 8ZM24 8V38',
  globe: 'M24 4A20 20 0 1 1 23.9 4ZM4 24H44M24 4C16 12 16 36 24 44M24 4C32 12 32 36 24 44',
  numbers: 'M10 14L16 10V38M24 16C24 10 36 10 36 16C36 22 24 28 24 38H38',
  ladder: 'M14 4V44M34 4V44M14 12H34M14 22H34M14 32H34',
  chest: 'M6 20H42V40H6ZM6 20C6 10 42 10 42 20M20 24H28V30H20Z',
  wave: 'M2 30C10 20 16 20 24 30C32 40 38 40 46 30M2 18C10 8 16 8 24 18C32 28 38 28 46 18',
  snow: 'M24 4V44M6 14L42 34M6 34L42 14M20 8L24 12L28 8M20 40L24 36L28 40',
  trophy: 'M14 6H34V18C34 26 29 30 24 30C19 30 14 26 14 18ZM14 10H6C6 18 10 20 14 20M34 10H42C42 18 38 20 34 20M24 30V38M16 44H32',
  owl: 'M10 12L16 18A12 12 0 0 1 32 18L38 12V32C38 40 32 44 24 44C16 44 10 40 10 32ZM18 26A3 3 0 1 0 18.1 26ZM30 26A3 3 0 1 0 30.1 26Z',
  scales: 'M24 6V42M14 42H34M8 12H40M8 12L2 26H14ZM40 12L34 26H46Z',
  compass: 'M24 4A20 20 0 1 1 23.9 4ZM30 18L20 30L18 30L28 18Z',
  ghost: 'M10 44V22C10 12 16 6 24 6C32 6 38 12 38 22V44L33 39L28 44L24 39L20 44L15 39ZM19 22A2.5 2.5 0 1 0 19.1 22ZM29 22A2.5 2.5 0 1 0 29.1 22Z',
  flask: 'M18 4H30M20 4V16L8 38C6 42 9 44 12 44H36C39 44 42 42 40 38L28 16V4M14 32H34',
  book: 'M24 10C18 6 10 6 4 8V40C10 38 18 38 24 42C30 38 38 38 44 40V8C38 6 30 6 24 10ZM24 10V42',
  eye: 'M2 24C10 12 38 12 46 24C38 36 10 36 2 24ZM24 17A7 7 0 1 1 23.9 17Z',
  magnet: 'M10 6H20V24A4 4 0 0 0 28 24V6H38V24A14 14 0 0 1 10 24ZM10 14H20M28 14H38',
  key: 'M16 14A10 10 0 1 1 15.9 14ZM24 26L42 44M34 36L38 32M38 40L42 36',
  mountain: 'M2 42L18 14L26 28L32 20L46 42Z',
  fish: 'M6 24C14 12 30 12 38 24C30 36 14 36 6 24ZM38 24L46 14V34ZM16 22A2 2 0 1 0 16.1 22Z',
  train: 'M10 8H38V34H10ZM10 22H38M16 40L12 46M32 40L36 46M16 28A2 2 0 1 0 16.1 28ZM32 28A2 2 0 1 0 32.1 28Z',
  potion: 'M18 4H30V14C38 18 42 24 40 32C38 40 32 44 24 44C16 44 10 40 8 32C6 24 10 18 18 14Z',
  flag: 'M10 44V4M10 6H38L32 15L38 24H10',
  stopwatch: 'M24 10A16 16 0 1 1 23.9 10ZM20 4H28M24 4V10M24 26L32 18',
  tree: 'M24 4L36 20H30L40 32H28V44H20V32H8L18 20H12Z',
  anchor: 'M24 10A4 4 0 1 1 23.9 10ZM24 14V44M14 22H34M6 30C8 40 16 44 24 44C32 44 40 40 42 30',
  layers: 'M24 6L44 16L24 26L4 16ZM4 24L24 34L44 24M4 32L24 42L44 32',
  spark: 'M24 2C26 14 34 22 46 24C34 26 26 34 24 46C22 34 14 26 2 24C14 22 22 14 24 2Z',
};

/** Ink detail drawn over a filled glyph: lantern ribs, the lid of a chest. */
const DETAIL: Record<string, string> = {
  lantern: 'M24 2V7M18.5 13.5C16.5 22 16.5 33 18.5 41.5M29.5 13.5C31.5 22 31.5 33 29.5 41.5',
  chest: 'M6 26H42',
  potion: 'M12 28H36',
};

const FILLED = new Set(['bolt', 'heart', 'crown', 'castle', 'shield', 'chest', 'mountain', 'tree', 'spark', 'puzzle', 'ghost', 'potion', 'trophy', 'lantern', 'rocket', 'mask', 'fish', 'flag']);

export const MODE_GLYPHS = Object.keys(G);

export function ModeGlyph({ glyph, size = 48, color = 'currentColor', className }: { glyph: string; size?: number; color?: string; className?: string }) {
  const d = G[glyph] ?? G.spark!;
  const filled = FILLED.has(glyph);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden focusable={false}>
      <path d={d} fill={filled ? color : 'none'} stroke={filled ? 'var(--ink)' : color} strokeWidth={filled ? 2.5 : 4} strokeLinecap="round" strokeLinejoin="round" />
      {DETAIL[glyph] ? <path d={DETAIL[glyph]} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" /> : null}
    </svg>
  );
}

/** The ink of the contour: the same navy as text on bright fills. */
const INK = '#0b1020';
export const ModeArt = memo(function ModeArt({ thumb, className, label }: { thumb: ModeThumbnail; className?: string; label?: string }) {
  const base = `hsl(${thumb.hue} 68% 50%)`;
  const floor = `hsl(${thumb.hue} 72% 36%)`;
  const glyphFill = `hsl(${thumb.accentHue} 96% 66%)`;
  const d = G[thumb.glyph] ?? G.spark!;
  const detail = DETAIL[thumb.glyph];
  const filled = FILLED.has(thumb.glyph);
  return (
    <svg viewBox="0 0 160 100" className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} preserveAspectRatio="xMidYMid slice" focusable={false}>
      <rect width="160" height="100" fill={base} />
      {/* The floor, its edge leaning like the slanted plate */}
      <path d="M0 76L160 58V100H0Z" fill={floor} />
      {/* The floodlight from the top centre */}
      <path d="M62 -2H98L134 102H26Z" fill="#fff" opacity={0.12} />
      {/* The glyph standing in the light: a shadow on the floor, then the glyph with its ink contour */}
      <ellipse cx="80" cy="84" rx="25" ry="4.5" fill={INK} opacity={0.32} />
      <g transform="translate(80 48) rotate(-6) scale(1.3) translate(-24 -24)">
        {filled ? (
          <>
            <path d={d} fill={glyphFill} stroke={INK} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            {detail ? <path d={detail} fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round" /> : null}
          </>
        ) : (
          <>
            <path d={d} fill="none" stroke={INK} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
            <path d={d} fill="none" stroke={glyphFill} strokeWidth={4.6} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </g>
    </svg>
  );
});
