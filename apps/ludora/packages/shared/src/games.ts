import { z } from 'zod';
import { commonSettingsSchema, roomOptionsSchema } from './realtime.ts';
import { containsBlockedLanguage } from './validation.ts';
import { staffReasonSchema } from './admin.ts';

/*
 * Game Maker: a game anyone can make from any mode, 2D or 3D. It is a mode
 * (and variant) with its settings tuned, a question set, a name and a cover,
 * saved so it can be hosted again in one tap or shared. The server checks
 * every field: settings are clamped to what the mode allows, the set must be
 * one the maker may play, and only players trusted to publish sets may make
 * a game public.
 */

export const GAME_VISIBILITIES = ['private', 'unlisted', 'public'] as const;
export type GameVisibility = (typeof GAME_VISIBILITIES)[number];

/** Cover glyphs a maker can pick for their game's card (the same set the mode cards draw). */
export const GAME_GLYPHS = ['spark', 'rocket', 'crown', 'castle', 'key', 'flag', 'shield', 'chest', 'trophy', 'heart', 'tree', 'lantern', 'book', 'map', 'puzzle', 'compass', 'fish', 'mountain', 'globe', 'ghost'] as const;

const clean = (msg: string) => (s: string) => !containsBlockedLanguage(s) || msg;

export const customGameInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Give your game a name of at least 3 characters.')
    .max(40, 'At most 40 characters.')
    .refine((s) => clean('x')(s) === true, 'Pick a different name.'),
  description: z
    .string()
    .trim()
    .max(200, 'At most 200 characters.')
    .refine((s) => clean('x')(s) === true, 'Reword the description.')
    .default(''),
  modeId: z.string().min(1).max(60),
  variantId: z.string().min(1).max(60).nullable().default(null),
  setId: z.string().uuid(),
  settings: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).default({}),
  common: commonSettingsSchema.partial().default({}),
  options: roomOptionsSchema.pick({ lateJoin: true, generatedNames: true, requireAccount: true }).partial().default({}),
  glyph: z.enum(GAME_GLYPHS).default('spark'),
  hue: z.number().int().min(0).max(359).default(200),
  visibility: z.enum(GAME_VISIBILITIES).default('private'),
});
export type CustomGameInput = z.infer<typeof customGameInputSchema>;

export const customGameHideSchema = z.object({ hidden: z.boolean(), reason: staffReasonSchema });
