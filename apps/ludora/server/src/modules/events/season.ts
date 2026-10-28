import { eq } from 'drizzle-orm';
import { seasonView, type CalendarDate, type SeasonOverrides, type SeasonView } from '@ludora/content/seasons';
import type { DbOrTx } from '../../db/client.ts';
import { economyConfig } from '../../db/schema.ts';

/*
 * The season the whole site is dressed in. The calendar itself lives in
 * @ludora/content/seasons and runs on Sydney dates; the server works it out
 * from its own clock (so a changed device clock changes nothing) and applies
 * the staff changes stored here: a moved window or a celebration left out
 * for one year.
 */

const KEY = 'season:overrides';

const isDate = (v: unknown): v is CalendarDate => {
  const c = v as CalendarDate;
  return Boolean(c) && Number.isInteger(c.y) && Number.isInteger(c.m) && Number.isInteger(c.d);
};

export async function seasonOverrides(db: DbOrTx): Promise<SeasonOverrides> {
  const [row] = await db.select().from(economyConfig).where(eq(economyConfig.key, KEY)).limit(1);
  const raw = (row?.value ?? {}) as Record<string, unknown>;
  const out: SeasonOverrides = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === null) out[k] = null;
    else if (v && typeof v === 'object' && isDate((v as { start: unknown }).start) && isDate((v as { end: unknown }).end)) out[k] = v as { start: CalendarDate; end: CalendarDate };
  }
  return out;
}

export async function saveSeasonOverrides(db: DbOrTx, value: SeasonOverrides, userId: string | null): Promise<void> {
  await db
    .insert(economyConfig)
    .values({ key: KEY, value, updatedBy: userId })
    .onConflictDoUpdate({ target: economyConfig.key, set: { value, updatedAt: new Date(), updatedBy: userId } });
}

/* The season changes at most once a day; one read a minute is plenty. */
let cached: { at: number; view: SeasonView } | null = null;

export async function currentSeason(db: DbOrTx, now = new Date()): Promise<SeasonView> {
  if (cached && now.getTime() - cached.at < 60_000 && now.getTime() >= cached.at) return cached.view;
  const view = seasonView(now, await seasonOverrides(db));
  cached = { at: now.getTime(), view };
  return view;
}

export function clearSeasonCache(): void {
  cached = null;
}
