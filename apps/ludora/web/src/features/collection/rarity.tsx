import type { CSSProperties, ReactNode } from 'react';
import type { Rarity } from '@ludora/shared';
import { RarityTag } from '../home/kit.tsx';

/*
 * Collectible cards: a frame in the rarity's colour with a hard shadow in a
 * darker shade, and a tinted panel where the item sits big and centred. Used by
 * the shop, the collection and the locker so a rarity looks the same everywhere.
 */

const rarityVar = (r: Rarity) => `var(--r-${r})`;

/** Class and style for a card's outer frame. Missing items get a dashed outline instead. */
export function frameProps(rarity: Rarity, { missing = false, selected = false }: { missing?: boolean; selected?: boolean } = {}): { className: string; style: CSSProperties } {
  if (missing) {
    return { className: 'rounded-[20px] border-2 border-dashed border-line-strong bg-sunken', style: {} };
  }
  const c = rarityVar(rarity);
  return {
    className: `rounded-[20px] border-[3px] bg-raised ${rarity === 'mythic' ? 'fx-mythic-frame' : ''} ${selected ? 'outline-[3px] outline-offset-[3px] outline-lantern outline-solid' : ''}`,
    style: {
      borderColor: c,
      boxShadow: `0 4px 0 color-mix(in oklab, ${c} 50%, var(--ink))`,
    },
  };
}

/** The tinted panel inside a card that holds the item. */
export function RarityPanel({ rarity, missing = false, tag = true, className = '', children }: { rarity: Rarity; missing?: boolean; tag?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={`relative grid place-items-center rounded-[14px] ${className}`} style={{ background: missing ? 'transparent' : `color-mix(in oklab, ${rarityVar(rarity)} 17%, var(--bg-raised))` }}>
      {tag && !missing ? <RarityTag rarity={rarity} className="absolute top-2 left-2" /> : null}
      {children}
    </div>
  );
}
