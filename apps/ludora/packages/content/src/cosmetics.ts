import type { SeedItem } from './types.ts';

/** Accessories, frames, banners, titles, emotes, victory effects, themes and answer effects. (Full catalogue in progress.) */
export const COSMETICS: SeedItem[] = [
  { id: 'acc-beanie', type: 'accessory', name: 'Cosy Beanie', description: 'Knitted with care. Slightly too big.', rarity: 'common', collectionId: null, art: { kind: 'accessory', slot: 'hat', shape: 'beanie', hue: 8 } },
  { id: 'frame-ring', type: 'frame', name: 'Simple Ring', description: 'A clean ring around your buddy.', rarity: 'common', collectionId: null, art: { kind: 'frame', style: 'ring', hue: 42 } },
  { id: 'title-newcomer', type: 'title', name: 'Newcomer', description: 'Everyone starts somewhere.', rarity: 'common', collectionId: null, art: { kind: 'title', text: 'Newcomer' } },
  { id: 'emote-wave', type: 'emote', name: 'Wave', description: 'Hello there.', rarity: 'common', collectionId: null, art: { kind: 'emote', glyph: 'wave', hue: 42 } },
];
