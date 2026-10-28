import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { customGameHideSchema, customGameInputSchema, type CustomGameInput } from '@ludora/shared';
import { getMode, getVariant, parseSettings } from '@ludora/engine';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { customGames, users } from '../../db/schema.ts';
import { noStore, requireAccount, requirePermission, type AuthContext } from '../../http/context.ts';
import { AppError, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { likeEscape, audit, staff, staffLimit } from '../admin/common.ts';
import { canView, loadSet } from '../sets/access.ts';
import { isModePlayableBy } from '../modes/service.ts';

/*
 * Game Maker. A custom game is a mode (2D or 3D) and variant with its
 * settings tuned, a question set, a name and a cover. The maker hosts it
 * again in one tap or shares the link; trusted players can list it in the
 * community games. The server re-checks everything a room would: the mode
 * and variant exist and the maker may host them, settings are clamped to the
 * mode's own fields, and the set is one the maker may play.
 */

const MAX_GAMES_PER_MAKER = 100;
type GameRow = typeof customGames.$inferSelect;

function canSee(g: GameRow, auth: AuthContext | null): boolean {
  if (auth && (g.ownerId === auth.user.id || auth.permissions.has('content.moderate'))) return true;
  if (g.hiddenAt) return false;
  return g.visibility === 'public' || g.visibility === 'unlisted';
}

async function view(db: DbOrTx, g: GameRow, auth: AuthContext | null, ownerName: string | null, full: boolean) {
  const mode = getMode(g.modeId);
  const variant = g.variantId ? getVariant(g.variantId) : undefined;
  const set = g.setId ? await loadSet(db, g.setId) : null;
  const setVisible = set && canView(set, auth);
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    mode: mode ? { id: mode.meta.id, title: mode.meta.title, stage: mode.meta.stage ?? '2d' } : null,
    variant: variant ? { id: variant.meta.id, title: variant.meta.title } : null,
    set: setVisible ? { id: set.id, title: set.title } : null,
    glyph: g.glyph,
    hue: g.hue,
    visibility: g.visibility,
    hidden: Boolean(g.hiddenAt),
    plays: g.plays,
    // Only the display name, as on public sets and leaderboards: never an account id or username.
    owner: { name: ownerName ?? 'A player' },
    mine: Boolean(auth && g.ownerId === auth.user.id),
    updatedAt: g.updatedAt.toISOString(),
    ...(full ? { settings: g.settings, common: g.common, options: g.options } : {}),
  };
}

/** Check a game the way a room would be checked, and return the values to store. */
async function cleaned(deps: AppDeps, auth: AuthContext, input: CustomGameInput) {
  const variant = input.variantId ? getVariant(input.variantId) : undefined;
  if (input.variantId && !variant) throw notFound('That variant does not exist.');
  if (variant && variant.meta.modeId !== input.modeId) throw new AppError(400, 'validation_failed', 'That variant belongs to another mode.');
  const mode = getMode(input.modeId);
  if (!mode) throw notFound('That game mode does not exist.');
  await isModePlayableBy(deps, auth, mode.meta.id, input.variantId);
  const set = await loadSet(deps.db, input.setId);
  if (!set || !canView(set, auth)) throw forbidden('Pick a question set you can play: one of yours, or a public one.');
  if (input.visibility === 'public' && !auth.permissions.has('sets.publish_public')) {
    throw forbidden('Listing a game for everyone needs a trusted account. Keep it private or share its link instead.');
  }
  // Settings are clamped to what the mode allows; a variant's locked settings win.
  const settings = parseSettings(mode.settings, { ...input.settings, ...variant?.settings });
  return {
    title: input.title,
    description: input.description,
    modeId: mode.meta.id,
    variantId: variant ? variant.meta.id : null,
    setId: set.id,
    settings,
    common: { ...input.common, ...variant?.common },
    options: input.options,
    glyph: input.glyph,
    hue: input.hue,
    visibility: input.visibility,
  };
}

async function loadGame(db: DbOrTx, id: string): Promise<GameRow> {
  if (!z.string().uuid().safeParse(id).success) throw notFound('No game with that id.');
  const [g] = await db.select().from(customGames).where(eq(customGames.id, id)).limit(1);
  if (!g) throw notFound('No game with that id.');
  return g;
}

/** A room was made from this game: count the play. Quietly does nothing for a game the host may not see. */
export async function countGamePlay(db: DbOrTx, id: string, auth: AuthContext): Promise<void> {
  if (!z.string().uuid().safeParse(id).success) return;
  const [g] = await db.select().from(customGames).where(eq(customGames.id, id)).limit(1);
  if (!g || !canSee(g, auth)) return;
  await db.update(customGames).set({ plays: sql`${customGames.plays} + 1` }).where(eq(customGames.id, id));
}

export async function gameRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  /** Your games, or the community's public ones (most played first). */
  app.get('/api/games', async (req, reply) => {
    noStore(reply);
    const auth = req.auth ?? null;
    const q = parse(z.object({ scope: z.enum(['mine', 'public']).default('public'), q: z.string().trim().max(60).optional() }), req.query);
    if (q.scope === 'mine' && !auth) return { games: [] };
    const where =
      q.scope === 'mine'
        ? eq(customGames.ownerId, auth!.user.id)
        : and(eq(customGames.visibility, 'public'), isNull(customGames.hiddenAt), q.q ? ilike(customGames.title, `%${likeEscape(q.q)}%`) : undefined);
    const rows = await db
      .select({ g: customGames, ownerName: users.displayName })
      .from(customGames)
      .leftJoin(users, eq(users.id, customGames.ownerId))
      .where(where)
      .orderBy(q.scope === 'mine' ? desc(customGames.updatedAt) : desc(customGames.plays))
      .limit(60);
    return { games: await Promise.all(rows.map((r) => view(db, r.g, auth, r.ownerName, false))) };
  });

  app.get('/api/games/:id', async (req, reply) => {
    noStore(reply);
    const auth = req.auth ?? null;
    const { id } = parse(z.object({ id: z.string().max(40) }), req.params);
    const g = await loadGame(db, id);
    if (!canSee(g, auth)) throw notFound('No game with that id.');
    const [owner] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, g.ownerId)).limit(1);
    return { game: await view(db, g, auth, owner?.name ?? null, true) };
  });

  app.post('/api/games', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    requirePermission(req, 'rooms.host');
    const auth = requireAccount(req);
    const input = parse(customGameInputSchema, req.body);
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(customGames).where(eq(customGames.ownerId, auth.user.id));
    if (n >= MAX_GAMES_PER_MAKER) throw new AppError(409, 'conflict', `You have ${MAX_GAMES_PER_MAKER} games, the most you can keep. Delete one to make another.`);
    const values = await cleaned(deps, auth, input);
    const [g] = await db.insert(customGames).values({ ...values, ownerId: auth.user.id }).returning();
    return { game: await view(db, g!, auth, auth.user.displayName, true) };
  });

  app.put('/api/games/:id', { config: { rateLimit: { max: 60, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(z.object({ id: z.string().max(40) }), req.params);
    const g = await loadGame(db, id);
    if (g.ownerId !== auth.user.id) throw forbidden('Only the person who made this game can change it.');
    const values = await cleaned(deps, auth, parse(customGameInputSchema, req.body));
    const [after] = await db.update(customGames).set({ ...values, updatedAt: new Date() }).where(eq(customGames.id, id)).returning();
    return { game: await view(db, after!, auth, auth.user.displayName, true) };
  });

  app.delete('/api/games/:id', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(z.object({ id: z.string().max(40) }), req.params);
    const g = await loadGame(db, id);
    if (g.ownerId !== auth.user.id) throw forbidden('Only the person who made this game can delete it.');
    await db.delete(customGames).where(eq(customGames.id, id));
    return { ok: true };
  });

  /** Moderators hide a game from everyone but its maker, or show it again. Audited. */
  app.post('/api/admin/games/:id/hide', staffLimit(30), async (req) => {
    const auth = staff(req, 'content.moderate');
    const { id } = parse(z.object({ id: z.string().max(40) }), req.params);
    const body = parse(customGameHideSchema, req.body);
    return db.transaction(async (tx) => {
      const g = await loadGame(tx, id);
      await tx.update(customGames).set({ hiddenAt: body.hidden ? new Date() : null }).where(eq(customGames.id, id));
      await audit(deps, req, tx, { actor: auth, action: body.hidden ? 'game.hide' : 'game.show', targetType: 'game', targetId: id, targetName: g.title, reason: body.reason });
      return { ok: true };
    });
  });

}
