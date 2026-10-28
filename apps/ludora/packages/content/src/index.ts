import { COLLECTIONS, GLIMS } from './glims.ts';
import { COSMETICS } from './cosmetics.ts';
import { buildPacks } from './packs.ts';
import { buildListings } from './shop.ts';
import { MONTHLY_ACCESSORIES, MONTHLY_COLLECTIONS, MONTHLY_GLIMS, MONTHLY_LISTINGS, MONTHLY_PACKS } from './monthly.ts';

export * from './types.ts';
export { CURRENCIES } from './currencies.ts';
export { COLLECTIONS, GLIMS } from './glims.ts';
export { COSMETICS } from './cosmetics.ts';
export { QUESTS, ACHIEVEMENTS } from './progression.ts';
export { SETS } from './sets/index.ts';
export { STANDARD_WEIGHTS } from './packs.ts';
export { GLIM_PRICES, FROST_FESTIVAL } from './shop.ts';
export { MONTHLY, MONTHLY_PREFIX, MONTHLY_COLLECTIONS, MONTHLY_GLIMS, MONTHLY_ACCESSORIES, MONTHLY_PACKS, MONTHLY_LISTINGS, currentDrop, monthWindow } from './monthly.ts';

/* The permanent catalogue plus the monthly drops, which carry their own sale windows. */
const PERMANENT_PACKS = buildPacks(COLLECTIONS, GLIMS);
export const ALL_COLLECTIONS = [...COLLECTIONS, ...MONTHLY_COLLECTIONS];
export const PACKS = [...PERMANENT_PACKS, ...MONTHLY_PACKS];
export const LISTINGS = [...buildListings(GLIMS, COSMETICS, PERMANENT_PACKS), ...MONTHLY_LISTINGS];
export const ALL_ITEMS = [...GLIMS, ...COSMETICS, ...MONTHLY_GLIMS, ...MONTHLY_ACCESSORIES];
