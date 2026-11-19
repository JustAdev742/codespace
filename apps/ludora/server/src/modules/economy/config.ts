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
  /**
   * Teachers' class rewards (D58): Sparks a teacher can give each week, per class, at most per student in
   * one award, and the most one student can be given in a week across every class they are in. That last
   * limit is what stops a made-up class being used to pass Sparks to a friend: anyone can open a teacher account.
   */
  classRewards: z
    .object({
      weeklyBudget: z.number().int().min(0).max(100_000).default(500),
      maxPerStudent: z.number().int().min(1).max(1000).default(25),
      weeklyPerStudent: z.number().int().min(1).max(10_000).default(100),
    })
    .default({ weeklyBudget: 500, maxPerStudent: 25, weeklyPerStudent: 100 }),
  /**
   * A Sparks boost (D58): between the two dates, game Sparks are multiplied. The daily cap still
   * applies, so a boost speeds up a day's earning and never raises it. Null when none is set.
   */
  boost: z
    .object({
      label: z.string().trim().min(3).max(60),
      multiplier: z.number().min(1.1).max(3),
      startsAt: z.iso.datetime({ offset: true }),
      endsAt: z.iso.datetime({ offset: true }),
    })
    .refine((b) => new Date(b.startsAt) < new Date(b.endsAt), { message: 'The boost has to end after it starts.', path: ['endsAt'] })
    .refine((b) => new Date(b.endsAt).getTime() - new Date(b.startsAt).getTime() <= 14 * 86_400_000, { message: 'A boost lasts at most 14 days.', path: ['endsAt'] })
    .nullable()
    .default(null),
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

/** The boost running at `now`, if any. */
export function activeBoost(rules: EconomyRules, now = new Date()): NonNullable<EconomyRules['boost']> | null {
  const b = rules.boost;
  if (!b) return null;
  return new Date(b.startsAt) <= now && now < new Date(b.endsAt) ? b : null;
}

/* ----------------------------- staff grant limits ----------------------------- */

/**
 * The most an economy manager may grant in one UTC day, in total, per currency (D58). Only an
 * administrator (economy.limits) changes it. Administrators themselves are not held to it; every
 * grant, theirs included, is still capped per change by REAL_GRANT_MAX.
 */
export const grantLimitsSchema = z.object({
  sparks: z.number().int().min(0).max(1_000_000).default(20_000),
  moonstones: z.number().int().min(0).max(100_000).default(1_000),
  dust: z.number().int().min(0).max(1_000_000).default(10_000),
  other: z.number().int().min(0).max(1_000_000).default(2_000),
});
export type GrantLimits = z.infer<typeof grantLimitsSchema>;
export const DEFAULT_GRANT_LIMITS: GrantLimits = grantLimitsSchema.parse({});
const LIMITS_KEY = 'grant_limits';

export function dailyLimitFor(limits: GrantLimits, currency: string): number {
  return currency === 'sparks' || currency === 'moonstones' || currency === 'dust' ? limits[currency] : limits.other;
}

export async function getGrantLimits(db: DbOrTx): Promise<GrantLimits> {
  const rows = await db.select().from(economyConfig).where(eq(economyConfig.key, LIMITS_KEY)).limit(1);
  const parsed = grantLimitsSchema.safeParse(rows[0]?.value ?? {});
  return parsed.success ? parsed.data : DEFAULT_GRANT_LIMITS;
}

export async function saveGrantLimits(db: DbOrTx, limits: GrantLimits, userId: string): Promise<void> {
  await db
    .insert(economyConfig)
    .values({ key: LIMITS_KEY, value: limits, updatedBy: userId })
    .onConflictDoUpdate({ target: economyConfig.key, set: { value: limits, updatedAt: new Date(), updatedBy: userId } });
}
