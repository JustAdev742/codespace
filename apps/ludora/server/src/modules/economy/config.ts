import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import { economyConfig } from '../../db/schema.ts';

/**
 * Tunable economy rules. Stored in the database (admins edit them from the
 * staff panel, with an audit record) and validated with this schema on
 * every read, falling back to these defaults for anything missing.
 */
export const economyRulesSchema = z.object({
  welcomeSparks: z.number().int().min(0).max(100_000).default(250),
  starterItems: z.array(z.string()).default(['glim-pebblet', 'glim-dewdrop', 'glim-sprig']),
  game: z
    .object({
      participationSparks: z.number().int().min(0).max(1000).default(20),
      sparksPerCorrect: z.number().int().min(0).max(100).default(4),
      placeSparks: z.array(z.number().int().min(0).max(5000)).max(10).default([60, 40, 25]),
      /** Answers needed before a game pays anything, so joining and idling earns nothing. */
      minAnswered: z.number().int().min(0).max(50).default(3),
      dailySparkCap: z.number().int().min(0).max(1_000_000).default(1500),
      soloMultiplier: z.number().min(0).max(2).default(0.6),
      xpParticipation: z.number().int().min(0).max(1000).default(20),
      xpPerCorrect: z.number().int().min(0).max(100).default(6),
      xpWin: z.number().int().min(0).max(1000).default(30),
      xpHost: z.number().int().min(0).max(1000).default(25),
    })
    .default({
      participationSparks: 20,
      sparksPerCorrect: 4,
      placeSparks: [60, 40, 25],
      minAnswered: 3,
      dailySparkCap: 1500,
      soloMultiplier: 0.6,
      xpParticipation: 20,
      xpPerCorrect: 6,
      xpWin: 30,
      xpHost: 25,
    }),
  levelUp: z
    .object({
      sparks: z.number().int().min(0).max(10_000).default(100),
      moonstonesEvery: z.number().int().min(1).max(50).default(5),
      moonstones: z.number().int().min(0).max(1000).default(10),
    })
    .default({ sparks: 100, moonstonesEvery: 5, moonstones: 10 }),
  dailyStreak: z
    .object({
      sparksPerDay: z.number().int().min(0).max(1000).default(15),
      maxBonusDays: z.number().int().min(1).max(30).default(7),
      moonstonesOnWeek: z.number().int().min(0).max(1000).default(5),
    })
    .default({ sparksPerDay: 15, maxBonusDays: 7, moonstonesOnWeek: 5 }),
});
export type EconomyRules = z.infer<typeof economyRulesSchema>;

export const DEFAULT_RULES: EconomyRules = economyRulesSchema.parse({});
const KEY = 'rules';

let cache: { rules: EconomyRules; at: number } | null = null;
const CACHE_MS = 10_000;

export async function getRules(db: DbOrTx): Promise<EconomyRules> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rules;
  const rows = await db.select().from(economyConfig).where(eq(economyConfig.key, KEY)).limit(1);
  const parsed = economyRulesSchema.safeParse(rows[0]?.value ?? {});
  const rules = parsed.success ? parsed.data : DEFAULT_RULES;
  cache = { rules, at: Date.now() };
  return rules;
}

export async function saveRules(db: DbOrTx, rules: EconomyRules, userId: string | null): Promise<void> {
  await db
    .insert(economyConfig)
    .values({ key: KEY, value: rules, updatedBy: userId })
    .onConflictDoUpdate({ target: economyConfig.key, set: { value: rules, updatedAt: new Date(), updatedBy: userId } });
  cache = null;
}

export function clearRulesCache() {
  cache = null;
}
