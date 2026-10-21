import { getMode, getVariant } from '@ludora/engine';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { modeOverrides } from '../../db/schema.ts';
import type { AuthContext } from '../../http/context.ts';
import { AppError } from '../../lib/errors.ts';
import { isFlagOn } from '../flags/service.ts';

export type ModeVisibility = 'published' | 'hidden' | 'featured';

let cache: { at: number; map: Map<string, ModeVisibility> } | null = null;

export async function modeVisibility(db: DbOrTx): Promise<Map<string, ModeVisibility>> {
  if (cache && Date.now() - cache.at < 5000) return cache.map;
  const rows = await db.select().from(modeOverrides);
  const map = new Map(rows.map((r) => [r.id, r.visibility as ModeVisibility]));
  cache = { at: Date.now(), map };
  return map;
}

export function clearModeCache() {
  cache = null;
}

export async function setModeVisibility(db: DbOrTx, id: string, visibility: ModeVisibility, note: string | null, userId: string) {
  await db
    .insert(modeOverrides)
    .values({ id, visibility, note, updatedBy: userId })
    .onConflictDoUpdate({ target: modeOverrides.id, set: { visibility, note, updatedBy: userId, updatedAt: new Date() } });
  clearModeCache();
}

/** Throws unless this player may start the mode: it exists, is playable, is not hidden, and beta modes need the beta flag. */
export async function isModePlayableBy(deps: AppDeps, auth: AuthContext, modeId: string, variantId: string | null): Promise<void> {
  const mode = getMode(modeId);
  const variant = variantId ? getVariant(variantId) : null;
  if (!mode || (variantId && !variant)) throw new AppError(404, 'not_found', 'That game mode does not exist.');
  const status = variant?.meta.status ?? mode.meta.status;
  if (status === 'planned') throw new AppError(409, 'not_available', 'That mode is still being built.');
  const staff = auth.permissions.has('modes.manage');
  const vis = await modeVisibility(deps.db);
  if (!staff && (vis.get(mode.meta.id) === 'hidden' || (variantId && vis.get(variantId) === 'hidden'))) {
    throw new AppError(409, 'not_available', 'That mode is not available right now.');
  }
  if (status === 'beta' && !staff && !(await isFlagOn(deps.db, 'modes.beta', auth))) {
    throw new AppError(409, 'not_available', 'That mode is in beta testing.');
  }
}
