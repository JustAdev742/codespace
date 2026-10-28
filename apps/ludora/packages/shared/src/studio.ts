import { z } from 'zod';
import { ACCESSORY_SHAPES, LANTERN_PATTERNS, accessoryArtSchema, bannerArtSchema, frameArtSchema, glimArtSchema, titleArtSchema } from './economy.ts';
import { containsBlockedLanguage } from './validation.ts';
import { staffReasonSchema } from './admin.ts';

/*
 * The Creator Studio: what a designer may make, and the house rules that keep
 * everything they make looking and reading like the rest of Ludora. Art is
 * built only from the Glim genome and the cosmetic vocabulary (no uploads),
 * names follow the catalogue's rules, and prices stay within the shop's
 * range for each rarity. The server checks all of it; the page uses the same
 * schemas to explain what is wrong before you send.
 */

export const STUDIO_KINDS = ['glim', 'accessory', 'frame', 'banner', 'title'] as const;
export type StudioKind = (typeof STUDIO_KINDS)[number];

/** Designers make up to legendary; mythics stay rare and are made by the team that sets the odds. */
export const STUDIO_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

const clean = (what: string) => (s: string) => !containsBlockedLanguage(s) || `Pick a different ${what}.`;

const glimName = z
  .string()
  .trim()
  .min(2, 'Give it a name.')
  .max(16, 'Glim names are at most 16 characters.')
  .regex(/^[A-Za-z][A-Za-z' -]*$/, 'Letters, spaces, hyphens and apostrophes only.')
  .refine((s) => s.split(/\s+/).length <= 2, 'One or two words, like every other Glim.')
  .refine((s) => clean('name')(s) === true, 'Pick a different name.');

const itemName = z
  .string()
  .trim()
  .min(2, 'Give it a name.')
  .max(24, 'At most 24 characters.')
  .regex(/^[A-Za-z0-9][A-Za-z0-9' -]*$/, 'Letters, numbers, spaces, hyphens and apostrophes only.')
  .refine((s) => clean('name')(s) === true, 'Pick a different name.');

const description = (max: number) =>
  z
    .string()
    .trim()
    .min(10, 'Write a line about it.')
    .max(max, `At most ${max} characters.`)
    .refine((s) => clean('description')(s) === true, 'Reword the description.');

const rarity = z.enum(STUDIO_RARITIES);

export const studioDraftSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('glim'), name: glimName, description: description(120), rarity, art: glimArtSchema }),
  z.object({
    kind: z.literal('accessory'),
    name: itemName,
    description: description(100),
    rarity,
    art: accessoryArtSchema.refine((a) => (ACCESSORY_SHAPES[a.slot] as readonly string[]).includes(a.shape), 'That shape does not fit that slot.'),
  }),
  z.object({ kind: z.literal('frame'), name: itemName, description: description(100), rarity, art: frameArtSchema }),
  z.object({ kind: z.literal('banner'), name: itemName, description: description(100), rarity, art: bannerArtSchema }),
  z.object({
    kind: z.literal('title'),
    name: itemName,
    description: description(100),
    rarity,
    art: titleArtSchema.refine((t) => !containsBlockedLanguage(t.text), 'Pick a different title.'),
  }),
]);
export type StudioDraftInput = z.infer<typeof studioDraftSchema>;

/** What a designer may charge, by rarity, in Sparks; the shop's own prices sit inside these. */
export const STUDIO_PRICES: Record<(typeof STUDIO_RARITIES)[number], { min: number; max: number }> = {
  common: { min: 40, max: 200 },
  uncommon: { min: 80, max: 400 },
  rare: { min: 150, max: 800 },
  epic: { min: 300, max: 1600 },
  legendary: { min: 700, max: 3000 },
};

const isoInstant = z.string().datetime({ offset: true });

/** Putting a published item in the shop: Sparks only, a price inside the rarity's range, an optional window. */
export const studioListingSchema = z
  .object({
    priceAmount: z.number().int().min(1).max(5000),
    startsAt: isoInstant.nullable().default(null),
    endsAt: isoInstant.nullable().default(null),
  })
  .refine((l) => !l.startsAt || !l.endsAt || Date.parse(l.startsAt) < Date.parse(l.endsAt), { message: 'The end has to come after the start.', path: ['endsAt'] });

export const studioPublishSchema = z.object({
  /** Leave out to publish without a shop listing (it can still go in a Lantern later from the staff catalogue). */
  listing: studioListingSchema.nullable().default(null),
  reason: staffReasonSchema,
});

/** A limited Lantern made from Glim drafts: they are published together into their own collection. */
export const studioLanternSchema = z
  .object({
    name: itemName.refine((s) => s.length <= 20, 'At most 20 characters.'),
    description: description(120),
    hue: z.number().int().min(0).max(359),
    accentHue: z.number().int().min(0).max(359),
    pattern: z.enum(LANTERN_PATTERNS),
    draftIds: z.array(z.string().uuid()).min(3, 'A Lantern needs at least 3 Glims.').max(14, 'At most 14 Glims in one Lantern.'),
    priceAmount: z.number().int().min(100, 'At least 100 Sparks.').max(400, 'At most 400 Sparks.'),
    startsAt: isoInstant,
    endsAt: isoInstant,
    reason: staffReasonSchema,
  })
  .refine((l) => Date.parse(l.startsAt) < Date.parse(l.endsAt), { message: 'The end has to come after the start.', path: ['endsAt'] })
  .refine((l) => Date.parse(l.endsAt) - Date.parse(l.startsAt) <= 62 * 86_400_000, { message: 'A Lantern is on sale for two months at most.', path: ['endsAt'] })
  .refine((l) => new Set(l.draftIds).size === l.draftIds.length, { message: 'Each Glim once.', path: ['draftIds'] });

/** Canonical JSON for comparing art: key order never matters. */
export function canonicalArt(art: unknown): string {
  return JSON.stringify(art, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
}
