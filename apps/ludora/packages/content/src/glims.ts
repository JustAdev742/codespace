import type { SeedCollection, SeedItem } from './types.ts';

/** Glim collections. Each has a matching Lantern. (Full catalogue in progress.) */
export const COLLECTIONS: SeedCollection[] = [
  { id: 'meadow', name: 'Meadow Glims', description: 'Found where the grass is long and the bees are busy.', hue: 105, reward: { currency: 'moonstones', amount: 25 }, sort: 1 },
  { id: 'tidepool', name: 'Tidepool Glims', description: 'They glow in rock pools when the tide goes out.', hue: 190, reward: { currency: 'moonstones', amount: 25 }, sort: 2 },
];

export const GLIMS: SeedItem[] = [
  { id: 'glim-pebblet', type: 'glim', name: 'Pebblet', description: 'Small, round and very good at sitting still.', rarity: 'common', collectionId: 'meadow', art: { kind: 'glim', body: 'blob', hue: 30, accentHue: 45, saturation: 25, eyes: 'dot', mouth: 'smile', pattern: 'freckles', topper: 'none', cheeks: true } },
  { id: 'glim-dewdrop', type: 'glim', name: 'Dewdrop', description: 'Wakes up before everyone else and sparkles about it.', rarity: 'common', collectionId: 'tidepool', art: { kind: 'glim', body: 'drop', hue: 195, accentHue: 175, saturation: 75, eyes: 'big', mouth: 'o', pattern: 'none', topper: 'none', cheeks: true } },
  { id: 'glim-sprig', type: 'glim', name: 'Sprig', description: 'Grows a new leaf every time it learns a new word.', rarity: 'common', collectionId: 'meadow', art: { kind: 'glim', body: 'bean', hue: 110, accentHue: 80, saturation: 65, eyes: 'happy', mouth: 'smile', pattern: 'belly', topper: 'leaf', cheeks: true } },
];
