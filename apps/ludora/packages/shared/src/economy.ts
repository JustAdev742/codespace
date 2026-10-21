import { z } from 'zod';

/**
 * Economy vocabulary shared by every layer. Amounts are integers; balances
 * and prices never use floating point.
 */

export const CORE_CURRENCIES = ['sparks', 'moonstones', 'dust'] as const;
export type CoreCurrency = (typeof CORE_CURRENCIES)[number];
/** Event currencies are defined in the database, so codes are open strings. */
export const currencyCodeSchema = z.string().regex(/^[a-z][a-z0-9_]{1,31}$/);
export type CurrencyCode = string;

export const CURRENCY_KINDS = ['soft', 'premium', 'crafting', 'event'] as const;
export type CurrencyKind = (typeof CURRENCY_KINDS)[number];

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

export const ITEM_TYPES = [
  'glim',
  'accessory',
  'frame',
  'banner',
  'title',
  'emote',
  'victory',
  'theme',
  'effect',
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_INFO: Record<ItemType, { label: string; plural: string; equipSlot: string | null; stackable: boolean }> = {
  glim: { label: 'Glim', plural: 'Glims', equipSlot: 'buddy', stackable: true },
  accessory: { label: 'Accessory', plural: 'Accessories', equipSlot: null, stackable: false },
  frame: { label: 'Profile frame', plural: 'Profile frames', equipSlot: 'frame', stackable: false },
  banner: { label: 'Banner', plural: 'Banners', equipSlot: 'banner', stackable: false },
  title: { label: 'Title', plural: 'Titles', equipSlot: 'title', stackable: false },
  emote: { label: 'Emote', plural: 'Emotes', equipSlot: null, stackable: false },
  victory: { label: 'Victory effect', plural: 'Victory effects', equipSlot: 'victory', stackable: false },
  theme: { label: 'Theme', plural: 'Themes', equipSlot: 'theme', stackable: false },
  effect: { label: 'Answer effect', plural: 'Answer effects', equipSlot: 'effect', stackable: false },
};

export const ACCESSORY_SLOTS = ['hat', 'eyes', 'neck'] as const;
export type AccessorySlot = (typeof ACCESSORY_SLOTS)[number];

/** Equip slots on a profile. Accessory slots hang off the equipped Glim. */
export const EQUIP_SLOTS = ['buddy', 'hat', 'eyes', 'neck', 'frame', 'banner', 'title', 'victory', 'theme', 'effect'] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export const MAX_EQUIPPED_EMOTES = 6;

export const RELEASE_STATES = ['draft', 'unreleased', 'live', 'retired'] as const;
export type ReleaseState = (typeof RELEASE_STATES)[number];

/* ------------------------------------------------------------------ */
/* Procedural art specs. Every collectible is drawn from one of these. */
/* ------------------------------------------------------------------ */

export const GLIM_BODIES = [
  'blob', 'drop', 'bean', 'star', 'cloud', 'bell', 'ghost', 'cat',
  'owl', 'jelly', 'flame', 'sprout', 'crystal', 'moth', 'orb', 'mushroom',
] as const;
export const GLIM_EYES = ['dot', 'big', 'sleepy', 'happy', 'wink', 'star', 'cyclops', 'visor', 'sparkle', 'curious'] as const;
export const GLIM_MOUTHS = ['smile', 'grin', 'o', 'cat', 'tooth', 'tongue', 'none', 'smirk'] as const;
export const GLIM_PATTERNS = ['none', 'spots', 'stripes', 'belly', 'freckles', 'stars', 'patch'] as const;
export const GLIM_TOPPERS = ['none', 'antenna', 'leaf', 'horns', 'flame', 'halo', 'tuft', 'spikes', 'bolt', 'bud'] as const;

const hue = z.number().int().min(0).max(359);

export const glimArtSchema = z.object({
  kind: z.literal('glim'),
  body: z.enum(GLIM_BODIES),
  hue,
  /** Secondary hue for belly, pattern and topper. */
  accentHue: hue,
  /** 0..100: how saturated the body is. Low values give stone and ghost tones. */
  saturation: z.number().int().min(0).max(100).default(70),
  eyes: z.enum(GLIM_EYES),
  mouth: z.enum(GLIM_MOUTHS),
  pattern: z.enum(GLIM_PATTERNS).default('none'),
  topper: z.enum(GLIM_TOPPERS).default('none'),
  cheeks: z.boolean().default(true),
});
export type GlimArt = z.infer<typeof glimArtSchema>;

export const ACCESSORY_SHAPES = {
  hat: ['beanie', 'wizard', 'party', 'crown', 'flowers', 'mortarboard', 'headphones', 'bow', 'tophat', 'propeller', 'chef', 'beret'],
  eyes: ['round', 'stars', 'monocle', 'goggles', 'visor', 'heart'],
  neck: ['scarf', 'bowtie', 'medal', 'bandana', 'pearls', 'bell'],
} as const satisfies Record<AccessorySlot, readonly string[]>;

export const accessoryArtSchema = z.object({
  kind: z.literal('accessory'),
  slot: z.enum(ACCESSORY_SLOTS),
  shape: z.string().min(1).max(30),
  hue,
  accentHue: hue.optional(),
});
export type AccessoryArt = z.infer<typeof accessoryArtSchema>;

export const FRAME_STYLES = ['ring', 'dotted', 'laurel', 'stars', 'flames', 'waves', 'circuit', 'petals', 'crystal', 'aurora'] as const;
export const frameArtSchema = z.object({ kind: z.literal('frame'), style: z.enum(FRAME_STYLES), hue, accentHue: hue.optional() });

export const BANNER_PATTERNS = ['constellation', 'waves', 'confetti', 'stripes', 'grid', 'hills', 'lanterns', 'circuit', 'bubbles', 'aurora'] as const;
export const bannerArtSchema = z.object({ kind: z.literal('banner'), pattern: z.enum(BANNER_PATTERNS), hue, accentHue: hue });

export const titleArtSchema = z.object({ kind: z.literal('title'), text: z.string().min(1).max(32) });

export const EMOTE_GLYPHS = ['wave', 'laugh', 'wow', 'gg', 'heart', 'fire', 'think', 'clap', 'party', 'cool', 'sleepy', 'star'] as const;
export const emoteArtSchema = z.object({ kind: z.literal('emote'), glyph: z.enum(EMOTE_GLYPHS), hue });

export const VICTORY_STYLES = ['confetti', 'fireworks', 'lanterns', 'comets', 'bubbles', 'petals'] as const;
export const victoryArtSchema = z.object({ kind: z.literal('victory'), style: z.enum(VICTORY_STYLES), hue });

export const themeArtSchema = z.object({
  kind: z.literal('theme'),
  /** Accent hue applied to the player's own interface. */
  hue,
  accentHue: hue,
});

export const EFFECT_STYLES = ['sparkle', 'bubbles', 'stars', 'ripple', 'leaves', 'embers'] as const;
export const effectArtSchema = z.object({ kind: z.literal('effect'), style: z.enum(EFFECT_STYLES), hue });

export const itemArtSchema = z.discriminatedUnion('kind', [
  glimArtSchema,
  accessoryArtSchema,
  frameArtSchema,
  bannerArtSchema,
  titleArtSchema,
  emoteArtSchema,
  victoryArtSchema,
  themeArtSchema,
  effectArtSchema,
]);
export type ItemArt = z.infer<typeof itemArtSchema>;

/** Lantern (pack) art: a hue and a pattern drawn on the lantern paper. */
export const LANTERN_PATTERNS = ['plain', 'waves', 'stars', 'leaves', 'flames', 'frost', 'circuit', 'books', 'moons'] as const;
export const lanternArtSchema = z.object({ hue, accentHue: hue, pattern: z.enum(LANTERN_PATTERNS) });
export type LanternArt = z.infer<typeof lanternArtSchema>;

/** Drop table for a Lantern: rarity weights plus the item pool. */
export const dropTableSchema = z.object({
  /** Relative weights per rarity. Missing rarities never drop. */
  weights: z.partialRecord(z.enum(RARITIES), z.number().int().min(0).max(1_000_000)),
  /** Items that can drop. Each is drawn uniformly within its rarity. */
  itemIds: z.array(z.string().min(1).max(64)).min(1).max(500),
  /** Opening this many Lanterns without an epic-or-better guarantees one. 0 disables. */
  pityEvery: z.number().int().min(0).max(200).default(0),
});
export type DropTable = z.infer<typeof dropTableSchema>;

export const SHOP_SECTIONS = [
  'featured',
  'daily',
  'weekly',
  'lanterns',
  'glims',
  'accessories',
  'profile',
  'effects',
  'bundles',
  'event',
] as const;
export type ShopSection = (typeof SHOP_SECTIONS)[number];

export const SHOP_SECTION_INFO: Record<ShopSection, { label: string; description: string }> = {
  featured: { label: 'Featured', description: 'Hand-picked this week.' },
  daily: { label: 'Daily picks', description: 'A fresh selection every day at 00:00 UTC.' },
  weekly: { label: 'Weekly picks', description: 'Changes every Monday at 00:00 UTC.' },
  lanterns: { label: 'Lanterns', description: 'Open a Lantern to find Glims. Odds are listed on every Lantern.' },
  glims: { label: 'Glims', description: 'Pick the exact Glim you want.' },
  accessories: { label: 'Accessories', description: 'Hats, glasses and neckwear for your buddy Glim.' },
  profile: { label: 'Profile', description: 'Frames, banners and titles.' },
  effects: { label: 'Effects', description: 'Emotes, answer effects, victory effects and themes.' },
  bundles: { label: 'Bundles', description: 'Several items for less than buying them one by one.' },
  event: { label: 'Event', description: 'Limited-time items bought with event tickets.' },
};
