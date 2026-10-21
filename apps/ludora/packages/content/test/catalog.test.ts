import { describe, expect, it } from 'vitest';
import {
  ACCESSORY_SHAPES,
  ACCESSORY_SLOTS,
  BANNER_PATTERNS,
  EFFECT_STYLES,
  EMOTE_GLYPHS,
  FRAME_STYLES,
  GLIM_BODIES,
  GLIM_EYES,
  GLIM_MOUTHS,
  GLIM_PATTERNS,
  GLIM_TOPPERS,
  RARITIES,
  VICTORY_STYLES,
  itemArtSchema,
} from '@ludora/shared';
import type { ItemArt, ItemType, Rarity } from '@ludora/shared';
import { COSMETICS } from '../src/cosmetics.ts';
import { COLLECTIONS, GLIMS } from '../src/glims.ts';
import type { SeedItem } from '../src/types.ts';

type ArtOf<K extends ItemArt['kind']> = Extract<ItemArt, { kind: K }>;

const ALL_ITEMS: SeedItem[] = [...GLIMS, ...COSMETICS];

/** Every item id starts with the prefix for its type... */
const ID_PREFIX: Record<ItemType, string> = {
  glim: 'glim-',
  accessory: 'acc-',
  frame: 'frame-',
  banner: 'banner-',
  title: 'title-',
  emote: 'emote-',
  victory: 'victory-',
  theme: 'theme-',
  effect: 'effect-',
};
/** ...except Frost Festival cosmetics, which share the event's prefix. */
const EVENT_PREFIX = 'frost-';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Drop tables cap item ids at 64 characters. */
const MAX_ID_LENGTH = 64;

const STANDARD_MIX: Record<Rarity, number> = { common: 5, uncommon: 4, rare: 2, epic: 2, legendary: 1, mythic: 0 };
const MYTHIC_MIX: Record<Rarity, number> = { common: 5, uncommon: 4, rare: 2, epic: 1, legendary: 1, mythic: 1 };
/** Collections in Lantern order, with the rarity mix each must have. */
const RARITY_MIX: Record<string, Record<Rarity, number>> = {
  meadow: STANDARD_MIX,
  tidepool: STANDARD_MIX,
  ember: STANDARD_MIX,
  frost: STANDARD_MIX,
  starfall: MYTHIC_MIX,
  library: STANDARD_MIX,
  circuit: STANDARD_MIX,
  nightmarket: MYTHIC_MIX,
};

/** The Glims every new player is given (economy rules `starterItems`). */
const STARTERS: Record<string, string> = {
  'glim-pebblet': 'meadow',
  'glim-dewdrop': 'tidepool',
  'glim-sprig': 'meadow',
};

function artsOf<K extends ItemArt['kind']>(items: readonly SeedItem[], kind: K): ArtOf<K>[] {
  return items.map((item) => item.art).filter((art): art is ArtOf<K> => art.kind === kind);
}

function rarityCounts(items: readonly SeedItem[]): Record<Rarity, number> {
  const counts = Object.fromEntries(RARITIES.map((rarity) => [rarity, 0])) as Record<Rarity, number>;
  for (const item of items) counts[item.rarity] += 1;
  return counts;
}

function duplicates(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

/** JSON for a flat object that does not depend on key order. */
function canonical(value: object): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
}

function expectEveryValueUsed(label: string, allowed: readonly string[], used: readonly string[]) {
  expect(
    allowed.filter((value) => !used.includes(value)),
    `${label} never used`,
  ).toEqual([]);
}

describe('item art', () => {
  it('parses with itemArtSchema, relies on no defaults and matches the item type', () => {
    for (const item of ALL_ITEMS) {
      const parsed = itemArtSchema.safeParse(item.art);
      expect(parsed.success, `${item.id}: ${parsed.error?.message}`).toBe(true);
      expect(parsed.data, item.id).toEqual(item.art);
      expect(item.art.kind, item.id).toBe(item.type);
    }
  });

  it('gives every accessory a shape that belongs to its slot', () => {
    for (const item of ALL_ITEMS) {
      if (item.art.kind !== 'accessory') continue;
      const shapes: readonly string[] = ACCESSORY_SHAPES[item.art.slot];
      expect(shapes, item.id).toContain(item.art.shape);
    }
  });
});

describe('item ids', () => {
  it('are unique across Glims and cosmetics', () => {
    expect(duplicates(ALL_ITEMS.map((item) => item.id))).toEqual([]);
  });

  it('are lowercase slugs that fit in a drop table', () => {
    for (const item of ALL_ITEMS) {
      expect(item.id).toMatch(SLUG);
      expect(item.id.length, item.id).toBeLessThanOrEqual(MAX_ID_LENGTH);
    }
  });

  it('start with the prefix for their type, or the event prefix for event cosmetics', () => {
    for (const item of GLIMS) {
      expect(item.type, item.id).toBe('glim');
      expect(item.id.startsWith(ID_PREFIX.glim), item.id).toBe(true);
    }
    for (const item of COSMETICS) {
      expect(item.type, item.id).not.toBe('glim');
      const prefixed = item.id.startsWith(ID_PREFIX[item.type]) || item.id.startsWith(EVENT_PREFIX);
      expect(prefixed, item.id).toBe(true);
    }
  });
});

describe('collections', () => {
  it('are the eight Lantern collections, in order', () => {
    expect(COLLECTIONS.map((collection) => collection.id)).toEqual(Object.keys(RARITY_MIX));
    expect(COLLECTIONS.map((collection) => collection.sort)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('each pay 25 to 40 moonstones when completed', () => {
    for (const collection of COLLECTIONS) {
      expect(collection.reward?.currency, collection.id).toBe('moonstones');
      expect(collection.reward?.amount, collection.id).toBeGreaterThanOrEqual(25);
      expect(collection.reward?.amount, collection.id).toBeLessThanOrEqual(40);
      expect(Number.isInteger(collection.hue) && collection.hue >= 0 && collection.hue <= 359, collection.id).toBe(true);
    }
  });
});

describe('Glims', () => {
  it('all belong to a known collection', () => {
    const known = new Set(COLLECTIONS.map((collection) => collection.id));
    for (const glim of GLIMS) expect(known.has(glim.collectionId ?? ''), glim.id).toBe(true);
  });

  it.each(Object.entries(RARITY_MIX))('%s has the right rarity mix', (collectionId, expected) => {
    expect(rarityCounts(GLIMS.filter((glim) => glim.collectionId === collectionId))).toEqual(expected);
  });

  it('are numbered 1 to 14 within each collection, commons first', () => {
    for (const collection of COLLECTIONS) {
      const members = GLIMS.filter((glim) => glim.collectionId === collection.id).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
      expect(members.map((glim) => glim.sort), collection.id).toEqual(members.map((_, index) => index + 1));
      const ranks = members.map((glim) => RARITIES.indexOf(glim.rarity));
      expect(ranks, collection.id).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it('include the starter Glims, as commons in their original collections', () => {
    for (const [id, collectionId] of Object.entries(STARTERS)) {
      const glim = GLIMS.find((item) => item.id === id);
      expect(glim, id).toBeDefined();
      expect(glim?.rarity, id).toBe('common');
      expect(glim?.collectionId, id).toBe(collectionId);
    }
  });

  it('never share identical art', () => {
    const seen = new Map<string, string>();
    for (const glim of GLIMS) {
      const key = canonical(itemArtSchema.parse(glim.art));
      expect(seen.get(key), `${glim.id} has the same art as ${seen.get(key)}`).toBeUndefined();
      seen.set(key, glim.id);
    }
  });

  it('have unique names of one or two words and at most 16 characters', () => {
    for (const glim of GLIMS) {
      expect(glim.name.length, glim.id).toBeLessThanOrEqual(16);
      expect(glim.name.split(' ').length, glim.id).toBeLessThanOrEqual(2);
    }
    expect(duplicates(GLIMS.map((glim) => glim.name.toLowerCase()))).toEqual([]);
  });

  it('have descriptions of at most 120 characters', () => {
    for (const glim of GLIMS) {
      expect(glim.description.length, glim.id).toBeGreaterThan(0);
      expect(glim.description.length, glim.id).toBeLessThanOrEqual(120);
    }
  });

  it('use every body, eye, mouth, pattern and topper somewhere', () => {
    const arts = artsOf(GLIMS, 'glim');
    expectEveryValueUsed('bodies', GLIM_BODIES, arts.map((art) => art.body));
    expectEveryValueUsed('eyes', GLIM_EYES, arts.map((art) => art.eyes));
    expectEveryValueUsed('mouths', GLIM_MOUTHS, arts.map((art) => art.mouth));
    expectEveryValueUsed('patterns', GLIM_PATTERNS, arts.map((art) => art.pattern));
    expectEveryValueUsed('toppers', GLIM_TOPPERS, arts.map((art) => art.topper));
  });

  it('give every rare-or-better Glim both a pattern and a topper', () => {
    const rare = RARITIES.indexOf('rare');
    for (const glim of GLIMS) {
      if (glim.art.kind !== 'glim' || RARITIES.indexOf(glim.rarity) < rare) continue;
      expect(glim.art.pattern, glim.id).not.toBe('none');
      expect(glim.art.topper, glim.id).not.toBe('none');
    }
  });
});

describe('cosmetics', () => {
  it('never belong to a collection and are never mythic', () => {
    for (const item of COSMETICS) {
      expect(item.collectionId, item.id).toBeNull();
      expect(item.rarity, item.id).not.toBe('mythic');
    }
  });

  it('have descriptions of at most 100 characters and unique names within their type', () => {
    for (const item of COSMETICS) {
      expect(item.description.length, item.id).toBeGreaterThan(0);
      expect(item.description.length, item.id).toBeLessThanOrEqual(100);
    }
    expect(duplicates(COSMETICS.map((item) => `${item.type}:${item.name.toLowerCase()}`))).toEqual([]);
  });

  it('use every accessory shape in its own slot', () => {
    const accessories = artsOf(COSMETICS, 'accessory');
    for (const slot of ACCESSORY_SLOTS) {
      const used = accessories.filter((art) => art.slot === slot).map((art) => art.shape);
      expectEveryValueUsed(`${slot} shapes`, ACCESSORY_SHAPES[slot], used);
    }
  });

  it('use every frame style, banner pattern, emote glyph, victory style and answer effect', () => {
    expectEveryValueUsed('frame styles', FRAME_STYLES, artsOf(COSMETICS, 'frame').map((art) => art.style));
    expectEveryValueUsed('banner patterns', BANNER_PATTERNS, artsOf(COSMETICS, 'banner').map((art) => art.pattern));
    expectEveryValueUsed('emote glyphs', EMOTE_GLYPHS, artsOf(COSMETICS, 'emote').map((art) => art.glyph));
    expectEveryValueUsed('victory styles', VICTORY_STYLES, artsOf(COSMETICS, 'victory').map((art) => art.style));
    expectEveryValueUsed('answer effects', EFFECT_STYLES, artsOf(COSMETICS, 'effect').map((art) => art.style));
  });

  it('include at least five Frost Festival event items', () => {
    const event = COSMETICS.filter((item) => item.id.startsWith(EVENT_PREFIX));
    expect(event.length).toBeGreaterThanOrEqual(5);
  });
});

describe('release states', () => {
  it('mark exactly three non-event items as unreleased previews', () => {
    const unreleased = ALL_ITEMS.filter((item) => item.releaseState === 'unreleased');
    expect(unreleased).toHaveLength(3);
    for (const item of unreleased) expect(item.id.startsWith(EVENT_PREFIX), item.id).toBe(false);
  });

  it('leave everything else to the live default', () => {
    for (const item of ALL_ITEMS) {
      if (item.releaseState !== 'unreleased') expect(item.releaseState, item.id).toBeUndefined();
    }
  });
});
