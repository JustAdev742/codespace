import { COLLECTIONS, GLIMS } from './glims.ts';
import { COSMETICS } from './cosmetics.ts';
import { buildPacks } from './packs.ts';
import { buildListings } from './shop.ts';

export * from './types.ts';
export { CURRENCIES } from './currencies.ts';
export { COLLECTIONS, GLIMS } from './glims.ts';
export { COSMETICS } from './cosmetics.ts';
export { QUESTS, ACHIEVEMENTS } from './progression.ts';
export { SETS } from './sets/index.ts';
export { STANDARD_WEIGHTS } from './packs.ts';
export { GLIM_PRICES, FROST_FESTIVAL } from './shop.ts';

export const PACKS = buildPacks(COLLECTIONS, GLIMS);
export const LISTINGS = buildListings(GLIMS, COSMETICS, PACKS);
export const ALL_ITEMS = [...GLIMS, ...COSMETICS];
