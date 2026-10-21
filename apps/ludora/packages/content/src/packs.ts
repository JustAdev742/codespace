import type { LanternArt, Rarity } from '@ludora/shared';
import type { SeedCollection, SeedItem, SeedPack } from './types.ts';

/** Standard odds, as relative weights out of 10,000. Rarities with no items in a Lantern are skipped and the rest rescaled. */
export const STANDARD_WEIGHTS: Partial<Record<Rarity, number>> = {
  common: 5000,
  uncommon: 2800,
  rare: 1400,
  epic: 600,
  legendary: 170,
  mythic: 30,
};

const MOONLIT_WEIGHTS: Partial<Record<Rarity, number>> = { rare: 7000, epic: 2300, legendary: 600, mythic: 100 };

const LANTERN_LOOK: Record<string, Pick<LanternArt, 'pattern'> & { price: number }> = {
  meadow: { pattern: 'leaves', price: 150 },
  tidepool: { pattern: 'waves', price: 150 },
  ember: { pattern: 'flames', price: 150 },
  frost: { pattern: 'frost', price: 150 },
  starfall: { pattern: 'stars', price: 200 },
  library: { pattern: 'books', price: 150 },
  circuit: { pattern: 'circuit', price: 150 },
  nightmarket: { pattern: 'moons', price: 200 },
};

export function buildPacks(collections: readonly SeedCollection[], glims: readonly SeedItem[]): SeedPack[] {
  const packs = collections.map((c, i) => {
    const look = LANTERN_LOOK[c.id] ?? { pattern: 'plain' as const, price: 150 };
    const hasItems = glims.some((g) => g.collectionId === c.id && (g.releaseState ?? 'live') === 'live');
    return {
      hasItems,
      id: `lantern-${c.id}`,
      name: c.name.replace(/ Glims$/, ' Lantern'),
      description: `Holds one Glim from the ${c.name} collection.`,
      art: { hue: c.hue, accentHue: (c.hue + 40) % 360, pattern: look.pattern },
      priceCurrency: 'sparks',
      priceAmount: look.price,
      dropTable: { weights: STANDARD_WEIGHTS, itemIds: [], collectionIds: [c.id], pityEvery: 15 },
      sort: i + 1,
    };
  });
  const rareAndUp = glims.some((g) => ['rare', 'epic', 'legendary', 'mythic'].includes(g.rarity) && (g.releaseState ?? 'live') === 'live');
  const result: SeedPack[] = packs.filter((p) => p.hasItems).map(({ hasItems: _h, ...p }) => p);
  if (rareAndUp) {
    result.push({
      id: 'lantern-moonlit',
      name: 'Moonlit Lantern',
      description: 'Always rare or better, from any collection.',
      art: { hue: 255, accentHue: 45, pattern: 'moons' },
      priceCurrency: 'moonstones',
      priceAmount: 20,
      dropTable: { weights: MOONLIT_WEIGHTS, itemIds: [], collectionIds: ['*'], minRarity: 'rare', pityEvery: 0 },
      sort: 100,
    });
  }
  return result;
}
