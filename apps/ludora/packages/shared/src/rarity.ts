/*
 * Rarity vocabulary. Kept apart from the economy schemas, with no zod import, so
 * the web app can show rarity labels without loading the schema library on
 * the first page.
 */

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_INFO: Record<Rarity, { label: string; rank: number; dustValue: number; craftCost: number }> = {
  common: { label: 'Common', rank: 0, dustValue: 5, craftCost: 40 },
  uncommon: { label: 'Uncommon', rank: 1, dustValue: 10, craftCost: 100 },
  rare: { label: 'Rare', rank: 2, dustValue: 25, craftCost: 250 },
  epic: { label: 'Epic', rank: 3, dustValue: 60, craftCost: 600 },
  legendary: { label: 'Legendary', rank: 4, dustValue: 150, craftCost: 1600 },
  mythic: { label: 'Mythic', rank: 5, dustValue: 400, craftCost: 4000 },
};
