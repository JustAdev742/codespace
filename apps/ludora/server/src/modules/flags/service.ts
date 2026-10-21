import { hashString } from '@ludora/shared';
import type { DbOrTx } from '../../db/client.ts';
import { featureFlags } from '../../db/schema.ts';
import type { AuthContext } from '../../http/context.ts';

type FlagRow = typeof featureFlags.$inferSelect;
let cache: { at: number; rows: FlagRow[] } | null = null;

export async function allFlags(db: DbOrTx): Promise<FlagRow[]> {
  if (cache && Date.now() - cache.at < 5000) return cache.rows;
  const rows = await db.select().from(featureFlags);
  cache = { at: Date.now(), rows };
  return rows;
}

export function clearFlagCache() {
  cache = null;
}

/**
 * A flag is on for a user when it is enabled globally, or the user is
 * listed, or holds one of its roles, or falls inside the rollout percentage
 * (stable per user, so the same people keep seeing it).
 */
export function evaluateFlag(flag: FlagRow, auth: AuthContext | null): boolean {
  if (flag.enabled) return true;
  if (!auth) return false;
  if (flag.userIds.includes(auth.user.id)) return true;
  if (flag.roles.some((r) => auth.roles.includes(r as never))) return true;
  if (flag.rolloutPercent > 0) return hashString(`${flag.key}:${auth.user.id}`) % 100 < flag.rolloutPercent;
  return false;
}

export async function isFlagOn(db: DbOrTx, key: string, auth: AuthContext | null): Promise<boolean> {
  const flag = (await allFlags(db)).find((f) => f.key === key);
  return flag ? evaluateFlag(flag, auth) : false;
}

export async function flagsFor(db: DbOrTx, auth: AuthContext | null): Promise<Record<string, boolean>> {
  return Object.fromEntries((await allFlags(db)).map((f) => [f.key, evaluateFlag(f, auth)]));
}
