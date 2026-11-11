import { eq } from 'drizzle-orm';
import { schoolSettingsSchema, type SchoolSettings } from '@ludora/shared';
import type { DbOrTx } from '../../db/client.ts';
import { economyConfig } from '../../db/schema.ts';

/*
 * The school's own settings, stored as one row of economy_config. Read often (every game's end,
 * every avatar), so kept for a few seconds; a save clears the copy.
 */

const KEY = 'school:settings';
let cached: { at: number; value: SchoolSettings } | null = null;

export async function schoolSettings(db: DbOrTx): Promise<SchoolSettings> {
  if (cached && Date.now() - cached.at < 5000) return cached.value;
  const [row] = await db.select().from(economyConfig).where(eq(economyConfig.key, KEY)).limit(1);
  const parsed = schoolSettingsSchema.safeParse(row?.value ?? {});
  const value = parsed.success ? parsed.data : schoolSettingsSchema.parse({});
  cached = { at: Date.now(), value };
  return value;
}

export async function saveSchoolSettings(db: DbOrTx, value: SchoolSettings, userId: string): Promise<void> {
  await db
    .insert(economyConfig)
    .values({ key: KEY, value, updatedBy: userId })
    .onConflictDoUpdate({ target: economyConfig.key, set: { value, updatedAt: new Date(), updatedBy: userId } });
  cached = null;
}

export function clearSchoolSettingsCache(): void {
  cached = null;
}
