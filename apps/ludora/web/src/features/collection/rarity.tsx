import type { CSSProperties, ReactNode } from 'react';
import { RARITY_INFO, type Rarity } from '@ludora/shared';
import { RarityTag } from '../../ui/game.tsx';

/*
 * Collectible cards, like trading cards: the rarity's colour is the frame,
 * epic and up get a foil edge and a sheen across the art, and mythic an
 * iridescent edge with a moving sheen (the .tcard classes in app.css). The
 * rarity is always written on the card as well, never shown by colour alone:
 * the shared RarityTag on a card, the slanted RarityPlate only for the big
 * moment of a reveal. Used by the shop, the collection, the locker and the
 * Lantern reveal, so a rarity looks the same everywhere.
 */

const rarityVar = (r: Rarity) => `var(--r-${r})`;
const rank = (r: Rarity) => RARITY_INFO[r].rank;

/** Class and style for a card's outer frame. Missing items get a dashed line instead. `selected` rings an equipped item. */
export function frameProps(rarity: Rarity, { missing = false, selected = false }: { missing?: boolean; selected?: boolean } = {}): { className: string; style: CSSProperties } {
  if (missing) {
    return { className: 'relative rounded-[var(--radius-l)] border-2 border-dashed border-line-strong bg-sunken', style: {} };
  }
  const finish = rarity === 'mythic' ? 'tcard-mythic' : rank(rarity) >= rank('epic') ? 'tcard-foil' : '';
  return {
    className: `tcard relative rounded-[var(--radius-l)] ${finish} ${selected ? 'outline-[3px] outline-offset-[3px] outline-lantern outline-solid' : ''}`,
    style: { '--r': rarityVar(rarity) } as CSSProperties,
  };
}

/** The window inside a card that holds the item, lit in the rarity's colour. Epic and up catch a sheen; a mythic's moves. */
export function RarityPanel({ rarity, missing = false, tag = true, className = '', children }: { rarity: Rarity; missing?: boolean; tag?: boolean; className?: string; children: ReactNode }) {
  const sheen = missing ? '' : rarity === 'mythic' ? 'tcard-sheen tcard-sheen-move' : rank(rarity) >= rank('epic') ? 'tcard-sheen' : '';
  return (
    <div className={`relative grid place-items-center overflow-hidden rounded-[var(--radius-m)] ${missing ? '' : rarity === 'mythic' ? 'tcard-art-mythic' : 'tcard-art'} ${sheen} ${className}`} style={{ '--r': rarityVar(rarity) } as CSSProperties}>
      {tag && !missing ? <RarityTag rarity={rarity} className="absolute top-2 left-2 z-[2]" /> : null}
      {children}
    </div>
  );
}

const PLATE_SIZE = { sm: 'text-[13px] px-2 py-0', md: 'text-[15px] px-2.5 py-0.5', lg: 'text-[1.6rem] px-4 py-0.5' } as const;

/** The rarity in words on a slanted plate of its own colour, for the moment a Glim is revealed. Ink text passes AA on every rarity colour. */
export function RarityPlate({ rarity, size = 'sm', className = '', style }: { rarity: Rarity; size?: keyof typeof PLATE_SIZE; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={`plate tracking-wide whitespace-nowrap text-on-accent uppercase ${PLATE_SIZE[size]} ${rarity === 'mythic' ? 'rarity-mythic-shimmer' : ''} ${className}`}
      style={{ ...(rarity === 'mythic' ? {} : { background: rarityVar(rarity) }), ...style }}
    >
      <span>{RARITY_INFO[rarity].label}</span>
    </span>
  );
}

/** The rarity as a small gem and its name, for dense lists. */
export function RarityLabel({ rarity, className = '' }: { rarity: Rarity; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${className}`}>
      <span className={`size-2.5 shrink-0 rotate-45 rounded-[2px] ${rarity === 'mythic' ? 'rarity-mythic-shimmer' : ''}`} style={rarity === 'mythic' ? undefined : { background: rarityVar(rarity) }} aria-hidden />
      {RARITY_INFO[rarity].label}
    </span>
  );
}
