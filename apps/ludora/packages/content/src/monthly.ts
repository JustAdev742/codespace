import type { GlimArt, ItemArt } from '@ludora/shared';
import { sydneyMidnight } from './seasons.ts';
import { STANDARD_WEIGHTS } from './packs.ts';
import type { SeedCollection, SeedItem, SeedListing, SeedPack } from './types.ts';

/*
 * Monthly drops. Each month brings its own collection of seven Glims, sold
 * only in that month's Lantern, and one accessory sold only that month. The
 * Lantern and the accessory go on sale at midnight on the 1st in Sydney and
 * leave at the last second of the month; the Glims are kept forever by
 * whoever found them, and the collection stays in everyone's book so players
 * can see what they missed. Monthly Glims are never in the daily picks or the
 * Moonlit Lantern.
 *
 * Every drop has 2 common, 2 uncommon, 1 rare, 1 epic and 1 legendary Glim.
 * Odds are the standard weights rescaled to those rarities and are shown on
 * the Lantern, like every other Lantern's.
 */

/** Monthly collection ids start with this, so pools that mean "every collection" can leave them out. */
export const MONTHLY_PREFIX = 'monthly-';

interface Drop {
  /** `YYYY-MM`. */
  month: string;
  name: string;
  description: string;
  hue: number;
  accentHue: number;
  pattern: 'plain' | 'waves' | 'stars' | 'leaves' | 'flames' | 'frost' | 'circuit' | 'books' | 'moons';
  glims: [name: string, rarity: SeedItem['rarity'], description: string, art: Omit<GlimArt, 'kind'>][];
  accessory: { id: string; name: string; description: string; art: Extract<ItemArt, { kind: 'accessory' }> };
}

const DROPS: Drop[] = [
  {
    month: '2026-10',
    name: 'Lantern Night Glims',
    description: 'They come out when the pumpkins are carved and the paper lanterns are lit. October only.',
    hue: 28,
    accentHue: 270,
    pattern: 'moons',
    glims: [
      ['Pumpkip', 'common', 'A pumpkin that carved its own smile and is very proud of how it turned out.', { body: 'blob', hue: 28, accentHue: 110, saturation: 86, eyes: 'happy', mouth: 'grin', pattern: 'bands', topper: 'stem', cheeks: true }],
      ['Wispet', 'common', 'A shy little ghost that says boo very quietly and then apologises.', { body: 'ghost', hue: 262, accentHue: 290, saturation: 18, eyes: 'big', mouth: 'o', pattern: 'none', topper: 'none', cheeks: true, brows: 'worried' }],
      ['Batbun', 'uncommon', 'Hangs upside down to read, and says the words make more sense that way.', { body: 'blob', hue: 270, accentHue: 28, saturation: 40, eyes: 'sparkle', mouth: 'fang', pattern: 'belly', topper: 'none', cheeks: true, ears: 'bunny', back: 'bat' }],
      ['Cobwebble', 'uncommon', 'Spins cobwebs shaped like letters so passing moths can practise their spelling.', { body: 'fluff', hue: 240, accentHue: 0, saturation: 8, eyes: 'curious', mouth: 'smile', pattern: 'stripes', topper: 'none', cheeks: false, ears: 'feelers' }],
      ['Hootlight', 'rare', 'Lights the way home on Lantern Night and hoots once for every street it passes.', { body: 'owl', hue: 30, accentHue: 270, saturation: 60, eyes: 'big', mouth: 'beak', pattern: 'constellation', topper: 'moon', cheeks: false, brows: 'soft' }],
      ['Candlewick', 'epic', 'A paper lantern with a candle for a heart. It glows brighter whenever someone laughs.', { body: 'lantern', hue: 36, accentHue: 280, saturation: 80, eyes: 'sleepy', mouth: 'smile', pattern: 'stars', topper: 'flame', cheeks: true }],
      ['Moonmantle', 'legendary', 'Flutters across the full moon once a year, and every lantern in town leans towards it.', { body: 'moth', hue: 268, accentHue: 40, saturation: 55, eyes: 'sparkle', mouth: 'smirk', pattern: 'stars', topper: 'moon', cheeks: false, brows: 'smug', back: 'cape' }],
    ],
    accessory: { id: 'acc-pumpkin-bow', name: 'Pumpkin Bow', description: 'An orange and purple bow for Lantern Night. October only.', art: { kind: 'accessory', slot: 'hat', shape: 'bow', hue: 28, accentHue: 270 } },
  },
  {
    month: '2026-11',
    name: 'Jacaranda Glims',
    description: 'When the jacarandas turn the streets purple, these Glims come out to play. November only.',
    hue: 278,
    accentHue: 120,
    pattern: 'leaves',
    glims: [
      ['Purplet', 'common', 'Turns a shade more purple every November and blushes when anyone notices.', { body: 'bean', hue: 278, accentHue: 120, saturation: 55, eyes: 'happy', mouth: 'smile', pattern: 'freckles', topper: 'bud', cheeks: true }],
      ['Bloomdrop', 'common', "Falls with the jacaranda flowers and lands on someone's head for luck.", { body: 'drop', hue: 286, accentHue: 300, saturation: 60, eyes: 'dot', mouth: 'o', pattern: 'sprinkles', topper: 'none', cheeks: true, ears: 'petals' }],
      ['Swotling', 'uncommon', 'Turns up when the exams do and quietly reminds everyone to drink some water.', { body: 'book', hue: 270, accentHue: 50, saturation: 45, eyes: 'half', mouth: 'smile', pattern: 'none', topper: 'none', cheeks: true, face: 'spectacles' }],
      ['Lilacorn', 'uncommon', 'Leaves a trail of purple petals wherever it trots, which makes it bad at hide and seek.', { body: 'cat', hue: 282, accentHue: 140, saturation: 50, eyes: 'curious', mouth: 'cat', pattern: 'none', topper: 'unihorn', cheeks: true, tail: 'curl' }],
      ['Petalwhirl', 'rare', 'Spins in the breeze until the whole street is carpeted purple.', { body: 'fluff', hue: 290, accentHue: 260, saturation: 70, eyes: 'sparkle', mouth: 'grin', pattern: 'spots', topper: 'tuft', cheeks: true, back: 'fairy' }],
      ['Canopia', 'epic', 'Spreads out like a purple umbrella so everyone underneath can have a shady lunch.', { body: 'cloud', hue: 276, accentHue: 100, saturation: 58, eyes: 'sleepy', mouth: 'smile', pattern: 'drip', topper: 'leaf', cheeks: true }],
      ['Violetta', 'legendary', 'The oldest jacaranda spirit in the city, it decides exactly which day the trees bloom.', { body: 'sprout', hue: 280, accentHue: 48, saturation: 66, eyes: 'star', mouth: 'smile', pattern: 'sprinkles', topper: 'crown', cheeks: true, ears: 'petals', back: 'feather' }],
    ],
    accessory: { id: 'acc-jacaranda-wreath', name: 'Jacaranda Wreath', description: 'A ring of purple blossom for the jacaranda season. November only.', art: { kind: 'accessory', slot: 'hat', shape: 'flowers', hue: 278, accentHue: 120 } },
  },
  {
    month: '2026-12',
    name: 'Tinsel Glims',
    description: 'Fairy lights, beach cricket and pavlova in the sun. December only.',
    hue: 352,
    accentHue: 140,
    pattern: 'stars',
    glims: [
      ['Baublet', 'common', 'A shiny bauble that rolls off the tree on purpose to see who will catch it.', { body: 'orb', hue: 352, accentHue: 48, saturation: 80, eyes: 'happy', mouth: 'smile', pattern: 'stripes', topper: 'none', cheeks: true }],
      ['Pavlump', 'common', 'A wobbly pavlova topped with berries that is very worried about the heat.', { body: 'dumpling', hue: 40, accentHue: 340, saturation: 25, eyes: 'big', mouth: 'wobble', pattern: 'sprinkles', topper: 'berries', cheeks: true, brows: 'worried' }],
      ['Tinselpup', 'uncommon', 'Wraps itself in tinsel and wags so hard that the whole room sparkles.', { body: 'blob', hue: 140, accentHue: 352, saturation: 60, eyes: 'wink', mouth: 'grin', pattern: 'sprinkles', topper: 'none', cheeks: true, ears: 'dogear', tail: 'ribbon' }],
      ['Cricketeer', 'uncommon', 'Bowls a perfect beach-cricket ball every time and appeals for every single one.', { body: 'bean', hue: 30, accentHue: 0, saturation: 50, eyes: 'curious', mouth: 'smirk', pattern: 'split', topper: 'none', cheeks: true, brows: 'determined' }],
      ['Starbright', 'rare', 'Sits at the very top of the tree and refuses to come down until January.', { body: 'star', hue: 50, accentHue: 352, saturation: 92, eyes: 'sparkle', mouth: 'grin', pattern: 'stars', topper: 'halo', cheeks: true, back: 'burst' }],
      ['Gingersnap', 'epic', 'A gingerbread Glim with icing buttons. It runs, it jumps, and it always gets home safe.', { body: 'toast', hue: 28, accentHue: 0, saturation: 60, eyes: 'dot', mouth: 'smile', pattern: 'drip', topper: 'tuft', cheeks: true, brows: 'soft' }],
      ['Jinglewing', 'legendary', 'Rings in the summer holidays at the end of the last school day, and every class cheers.', { body: 'bell', hue: 48, accentHue: 140, saturation: 78, eyes: 'star', mouth: 'smile', pattern: 'bands', topper: 'leaf', cheeks: true, tail: 'ribbon', back: 'feather' }],
    ],
    accessory: { id: 'acc-tinsel-scarf', name: 'Tinsel Scarf', description: 'A red and green scarf, worn ironically in the summer heat. December only.', art: { kind: 'accessory', slot: 'neck', shape: 'scarf', hue: 352, accentHue: 140 } },
  },
  {
    month: '2027-01',
    name: 'Seaside Glims',
    description: 'Long days, hot sand and the sea at the end of the street. January only.',
    hue: 190,
    accentHue: 45,
    pattern: 'waves',
    glims: [
      ['Sandpip', 'common', 'Builds a sandcastle every morning and lets the tide win every afternoon.', { body: 'box', hue: 42, accentHue: 200, saturation: 40, eyes: 'happy', mouth: 'smile', pattern: 'freckles', topper: 'shell', cheeks: true }],
      ['Zinckle', 'common', 'Wears a stripe of sunscreen on each cheek and reminds everyone to put on a hat.', { body: 'blob', hue: 30, accentHue: 190, saturation: 30, eyes: 'dot', mouth: 'grin', pattern: 'none', topper: 'none', cheeks: false, face: 'frosty' }],
      ['Gullbert', 'uncommon', 'Has never once stolen a chip, it says, while holding a chip.', { body: 'owl', hue: 210, accentHue: 45, saturation: 10, eyes: 'half', mouth: 'beak', pattern: 'belly', topper: 'none', cheeks: false, brows: 'smug' }],
      ['Swellie', 'uncommon', 'Catches every wave on a tiny board and waves to the lifeguards on the way in.', { body: 'drop', hue: 195, accentHue: 170, saturation: 70, eyes: 'wink', mouth: 'tongue', pattern: 'stripes', topper: 'none', cheeks: true, ears: 'fin', tail: 'fish' }],
      ['Sorbetta', 'rare', 'Melts a little every afternoon and tastes like lemonade, apparently.', { body: 'bean', hue: 330, accentHue: 50, saturation: 70, eyes: 'sparkle', mouth: 'tongue', pattern: 'drip', topper: 'stem', cheeks: true }],
      ['Driftle', 'epic', 'Drifts between beaches on warm currents and has never once been in a hurry.', { body: 'dumpling', hue: 150, accentHue: 38, saturation: 50, eyes: 'sleepy', mouth: 'smile', pattern: 'patch', topper: 'kelp', cheeks: true, back: 'scallop' }],
      ['Solstella', 'legendary', 'Rises over the beach on the longest days and sets with the last ice block of summer.', { body: 'star', hue: 44, accentHue: 190, saturation: 90, eyes: 'star', mouth: 'grin', pattern: 'constellation', topper: 'halo', cheeks: true, back: 'feather' }],
    ],
    accessory: { id: 'acc-sunny-specs', name: 'Sunny Specs', description: 'Round sunglasses for long days at the beach. January only.', art: { kind: 'accessory', slot: 'eyes', shape: 'round', hue: 45, accentHue: 190 } },
  },
  {
    month: '2027-02',
    name: 'Lucky Lantern Glims',
    description: 'Red lanterns, lion dances and a fresh start for the new year. February only.',
    hue: 356,
    accentHue: 44,
    pattern: 'flames',
    glims: [
      ['Steamling', 'common', 'A fresh dumpling, still steaming, that folds itself into a new shape every year.', { body: 'dumpling', hue: 40, accentHue: 356, saturation: 30, eyes: 'happy', mouth: 'smile', pattern: 'none', topper: 'steam', cheeks: true }],
      ['Lucklet', 'common', 'Carries a red envelope everywhere and hands out good wishes instead of money.', { body: 'blob', hue: 356, accentHue: 44, saturation: 80, eyes: 'big', mouth: 'grin', pattern: 'bands', topper: 'tuft', cheeks: true, ears: 'cat' }],
      ['Drumling', 'uncommon', 'Keeps the beat for the lion dance and never misses, even with its eyes shut.', { body: 'box', hue: 0, accentHue: 44, saturation: 70, eyes: 'curious', mouth: 'o', pattern: 'bands', topper: 'none', cheeks: true, brows: 'determined' }],
      ['Crackle', 'uncommon', 'Pops in a shower of red paper and gold sparkles, then looks around for applause.', { body: 'bulb', hue: 4, accentHue: 48, saturation: 85, eyes: 'wink', mouth: 'grin', pattern: 'sprinkles', topper: 'bolt', cheeks: true }],
      ['Silkglow', 'rare', 'A red silk lantern that floats up at the festival and comes back down with stories.', { body: 'lantern', hue: 356, accentHue: 48, saturation: 82, eyes: 'happy', mouth: 'smile', pattern: 'constellation', topper: 'flame', cheeks: true, tail: 'tassel' }],
      ['Dancemane', 'epic', 'Leaps through the crowd at the head of the lion dance and blinks its huge eyes at the drummers.', { body: 'cat', hue: 42, accentHue: 356, saturation: 85, eyes: 'big', mouth: 'toothy', pattern: 'stripes', topper: 'unihorn', cheeks: true, brows: 'bushy', ears: 'mane' }],
      ['Cloudragon', 'legendary', 'Winds through the sky above the parade, and the year it brings is always a lucky one.', { body: 'cloud', hue: 48, accentHue: 356, saturation: 75, eyes: 'star', mouth: 'grin', pattern: 'bands', topper: 'horns', cheeks: false, brows: 'bushy', tail: 'dragon', face: 'whiskers' }],
    ],
    accessory: { id: 'acc-lucky-bell', name: 'Lucky Bell', description: 'A little gold bell on a red cord for the new year. February only.', art: { kind: 'accessory', slot: 'neck', shape: 'bell', hue: 356, accentHue: 44 } },
  },
  {
    month: '2027-03',
    name: 'Harmony Glims',
    description: 'Everyone belongs. Seven Glims from all over, who found each other. March only.',
    hue: 28,
    accentHue: 200,
    pattern: 'plain',
    glims: [
      ['Waveling', 'common', "Says hello in a different language every day and hasn't run out yet.", { body: 'blob', hue: 28, accentHue: 200, saturation: 80, eyes: 'happy', mouth: 'grin', pattern: 'none', topper: 'sprout', cheeks: true, brows: 'soft' }],
      ['Kindlet', 'common', 'Saves a seat for whoever is new and waves them over first.', { body: 'bean', hue: 36, accentHue: 330, saturation: 70, eyes: 'dot', mouth: 'smile', pattern: 'spots', topper: 'none', cheeks: true, ears: 'bear' }],
      ['Patchwork', 'uncommon', 'Made of patches from every place it has lived, and it loves every one of them.', { body: 'blob', hue: 20, accentHue: 180, saturation: 60, eyes: 'curious', mouth: 'smile', pattern: 'patch', topper: 'none', cheeks: true, ears: 'droopy', tail: 'curl' }],
      ['Choirpip', 'uncommon', 'Sings harmony to any tune you hum, even if you hum it wrong.', { body: 'bell', hue: 32, accentHue: 260, saturation: 65, eyes: 'sleepy', mouth: 'o', pattern: 'stars', topper: 'none', cheeks: true, brows: 'soft' }],
      ['Ribbonette', 'rare', 'Ties a ribbon around anyone who joins the game, so nobody is ever left out.', { body: 'sprout', hue: 24, accentHue: 210, saturation: 75, eyes: 'sparkle', mouth: 'grin', pattern: 'split', topper: 'leaf', cheeks: true, tail: 'ribbon' }],
      ['Mosaica', 'epic', 'Made of a hundred coloured tiles. It looks different from every side and lovely from all of them.', { body: 'crystal', hue: 30, accentHue: 190, saturation: 70, eyes: 'happy', mouth: 'smile', pattern: 'split', topper: 'star', cheeks: true, ears: 'crystal' }],
      ['Harmonia', 'legendary', 'Hums a single note that every other Glim can join, and together it sounds like home.', { body: 'orb', hue: 28, accentHue: 210, saturation: 72, eyes: 'star', mouth: 'smile', pattern: 'constellation', topper: 'halo', cheeks: true, ears: 'petals', back: 'fairy' }],
    ],
    accessory: { id: 'acc-harmony-bandana', name: 'Harmony Bandana', description: 'An orange bandana for Harmony Week. March only.', art: { kind: 'accessory', slot: 'neck', shape: 'bandana', hue: 28, accentHue: 200 } },
  },
];

const nextMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
};

/** When a month's drop is on sale: from Sydney midnight on the 1st to the last second of the month. */
export function monthWindow(month: string): { startsAt: string; endsAt: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const n = nextMonth(month);
  const start = sydneyMidnight({ y, m, d: 1 });
  const end = new Date(sydneyMidnight({ y: n.y, m: n.m, d: 1 }).getTime() - 1000);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export interface MonthlyDrop {
  month: string;
  window: { startsAt: string; endsAt: string };
  collection: SeedCollection;
  glims: SeedItem[];
  accessory: SeedItem;
  pack: SeedPack;
}

export const MONTHLY: MonthlyDrop[] = DROPS.map((d, i) => {
  const id = `${MONTHLY_PREFIX}${d.month}`;
  const window = monthWindow(d.month);
  return {
    month: d.month,
    window,
    collection: { id, name: d.name, description: d.description, hue: d.hue, reward: { currency: 'moonstones', amount: 20 }, sort: 200 + i },
    glims: d.glims.map(([name, rarity, description, art], k) => ({ id: `glim-${slug(name)}`, type: 'glim', name, description, rarity, collectionId: id, sort: k + 1, art: { kind: 'glim', ...art } })),
    accessory: { id: d.accessory.id, type: 'accessory', name: d.accessory.name, description: d.accessory.description, rarity: 'rare', collectionId: null, art: d.accessory.art, sort: 900 + i },
    pack: {
      id: `lantern-${id}`,
      name: d.name.replace(/ Glims$/, ' Lantern'),
      description: `Holds one Glim from the ${d.name} collection. On sale this month only.`,
      art: { hue: d.hue, accentHue: d.accentHue, pattern: d.pattern },
      priceCurrency: 'sparks',
      priceAmount: 150,
      dropTable: { weights: STANDARD_WEIGHTS, itemIds: [], collectionIds: [id], pityEvery: 15 },
      availableFrom: window.startsAt,
      availableUntil: window.endsAt,
      sort: 50 + i,
    },
  };
});

export const MONTHLY_COLLECTIONS = MONTHLY.map((m) => m.collection);
export const MONTHLY_GLIMS = MONTHLY.flatMap((m) => m.glims);
export const MONTHLY_ACCESSORIES = MONTHLY.map((m) => m.accessory);
export const MONTHLY_PACKS = MONTHLY.map((m) => m.pack);

/** Each month's Lantern (in This month and in Featured) and its accessory, all on sale for that month only. */
export const MONTHLY_LISTINGS: SeedListing[] = MONTHLY.flatMap((m) => [
  { id: `l-${m.pack.id}`, section: 'monthly', packId: m.pack.id, priceCurrency: 'sparks', priceAmount: m.pack.priceAmount, ...m.window, sort: 1 },
  { id: `l-featured-${m.pack.id}`, section: 'featured', packId: m.pack.id, priceCurrency: 'sparks', priceAmount: m.pack.priceAmount, ...m.window, sort: 0 },
  { id: `l-${m.accessory.id}`, section: 'monthly', itemId: m.accessory.id, priceCurrency: 'sparks', priceAmount: 240, perUserLimit: 1, ...m.window, sort: 2 },
]);

/** The drop on sale at an instant, if any. */
export function currentDrop(at: Date = new Date()): MonthlyDrop | null {
  const t = at.getTime();
  return MONTHLY.find((m) => Date.parse(m.window.startsAt) <= t && t <= Date.parse(m.window.endsAt)) ?? null;
}
