import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CARD_EXPRESSIONS, CARD_POSES, EQUIP_SLOTS, GOAL_LIMITS, GOAL_METRICS, MAX_FAVOURITES, MAX_OUTFITS, MAX_WISHLIST, type GoalMetric } from '@ludora/shared';
import type { Db, DbOrTx } from '../../db/client.ts';
import { playerExtras } from '../../db/schema.ts';

/*
 * A player's own choices outside games, kept in one JSON row per player:
 * favourites, a weekly goal, a shop wishlist, saved outfits, Glim nicknames,
 * the title they earned and show, their profile card pose, and which help
 * cards they have closed. Each field is validated on its own when read, so a
 * bad value in one never hides the rest.
 */

const itemId = z.string().min(1).max(80);

export const FAVOURITE_KINDS = ['modes', 'sets', 'glims'] as const;
export type FavouriteKind = (typeof FAVOURITE_KINDS)[number];
export const HELP_KEYS = ['first-steps', 'teacher-start'] as const;

export const outfitSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{6,16}$/),
  name: z.string().min(1).max(24),
  /** Slot to item id, for the slots an outfit covers. */
  items: z.partialRecord(z.enum(EQUIP_SLOTS), itemId),
});
export type Outfit = z.infer<typeof outfitSchema>;

const fields = {
  favourites: z.object({ modes: z.array(z.string().max(60)).max(MAX_FAVOURITES).default([]), sets: z.array(z.string().uuid()).max(MAX_FAVOURITES).default([]), glims: z.array(itemId).max(MAX_FAVOURITES).default([]) }),
  goal: z.object({ metric: z.enum(GOAL_METRICS), target: z.number().int().min(1).max(1000) }).nullable(),
  wishlist: z.array(z.string().min(1).max(80)).max(MAX_WISHLIST),
  outfits: z.array(outfitSchema).max(MAX_OUTFITS),
  nicknames: z.record(itemId, z.string().min(1).max(24)),
  title: z.string().max(60).nullable(),
  card: z.object({ pose: z.enum(CARD_POSES), expression: z.enum(CARD_EXPRESSIONS) }),
  help: z.object({ dismissed: z.array(z.enum(HELP_KEYS)).max(HELP_KEYS.length) }),
};

export interface Extras {
  favourites: { modes: string[]; sets: string[]; glims: string[] };
  goal: { metric: GoalMetric; target: number } | null;
  wishlist: string[];
  outfits: Outfit[];
  nicknames: Record<string, string>;
  title: string | null;
  card: { pose: (typeof CARD_POSES)[number]; expression: (typeof CARD_EXPRESSIONS)[number] };
  help: { dismissed: (typeof HELP_KEYS)[number][] };
}

export const DEFAULT_EXTRAS: Extras = {
  favourites: { modes: [], sets: [], glims: [] },
  goal: null,
  wishlist: [],
  outfits: [],
  nicknames: {},
  title: null,
  card: { pose: 'wave', expression: 'own' },
  help: { dismissed: [] },
};

/** Read stored JSON field by field, falling back to the default for any field that does not validate. */
export function parseExtras(raw: unknown): Extras {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { ...DEFAULT_EXTRAS };
  for (const [key, schema] of Object.entries(fields)) {
    if (!(key in src)) continue;
    const r = (schema as z.ZodType).safeParse(src[key]);
    if (r.success) out[key] = r.data;
  }
  return out as unknown as Extras;
}

/** A goal target inside its metric's limits. */
export function clampGoal(metric: GoalMetric, target: number): number {
  const l = GOAL_LIMITS[metric];
  return Math.min(l.max, Math.max(l.min, Math.round(target)));
}

export async function readExtras(db: DbOrTx, userId: string): Promise<Extras> {
  const [row] = await db.select({ data: playerExtras.data }).from(playerExtras).where(eq(playerExtras.userId, userId)).limit(1);
  return parseExtras(row?.data);
}

/**
 * Change a player's extras under a row lock, so two quick taps (two favourites, two outfits)
 * cannot overwrite each other. `change` may throw to refuse; nothing is written then.
 */
export async function updateExtras<T>(db: Db, userId: string, change: (current: Extras, tx: DbOrTx) => Promise<{ next: Extras; result: T }> | { next: Extras; result: T }): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.insert(playerExtras).values({ userId, data: {} }).onConflictDoNothing();
    const [row] = await tx.select({ data: playerExtras.data }).from(playerExtras).where(eq(playerExtras.userId, userId)).for('update');
    const { next, result } = await change(parseExtras(row?.data), tx);
    await tx.update(playerExtras).set({ data: next, updatedAt: sql`now()` }).where(eq(playerExtras.userId, userId));
    return result;
  });
}
