import type { FastifyInstance } from 'fastify';
import { and, count, desc, eq, ilike, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { actsOnOthers, blueprintTagline, GAME_VISIBILITIES, KIND_INFO, MAX_BLUEPRINTS_PER_MAKER, parseBlueprint, staffReasonSchema, type Blueprint } from '@ludora/shared';
import type { AppDeps } from '../../app.ts';
import type { DbOrTx } from '../../db/client.ts';
import { blueprints, users } from '../../db/schema.ts';
import { noStore, requireAccount, requirePermission, type AuthContext } from '../../http/context.ts';
import { AppError, forbidden, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { audit, likeEscape, staff, staffLimit } from '../admin/common.ts';
import type { MadeGame } from '../../realtime/room.ts';

/*
 * Mode Studio on the server. A made game is stored as a blueprint and checked again by
 * parseBlueprint every time it is saved, copied or hosted, so nothing unchecked ever reaches the
 * interpreter. Private ones are seen only by their maker (and moderators); link-shared ones by
 * anyone with the link; public ones are listed for everyone and need the trusted permission that
 * public sets need. A moderator can hide one, after which nobody can host it.
 */

type Row = typeof blueprints.$inferSelect;

const idSchema = z.object({ id: z.string().max(40) });
const saveSchema = z.object({ blueprint: z.unknown(), visibility: z.enum(GAME_VISIBILITIES).default('private') });

function canSee(row: Row, auth: AuthContext | null): boolean {
  if (auth && (row.ownerId === auth.user.id || auth.permissions.has('content.moderate'))) return true;
  if (row.hiddenAt) return false;
  return row.visibility === 'public' || row.visibility === 'unlisted';
}

/** The card everyone may see: no account id, only the maker's display name. */
function card(row: Row, auth: AuthContext | null, ownerName: string | null) {
  const parsed = parseBlueprint(row.blueprint);
  const bp = parsed.ok ? parsed.blueprint : null;
  return {
    id: row.id,
    name: row.name,
    tagline: bp ? blueprintTagline(bp) : '',
    kind: bp ? bp.kind.type : null,
    kindLabel: bp ? KIND_INFO[bp.kind.type].label : null,
    dimension: bp?.look.dimension ?? '2d',
    pacing: bp?.pacing ?? null,
    glyph: bp?.cover.glyph ?? 'spark',
    hue: bp?.cover.hue ?? 210,
    actsOnOthers: bp ? actsOnOthers(bp) : [],
    visibility: row.visibility,
    hidden: Boolean(row.hiddenAt),
    plays: row.plays,
    owner: { name: ownerName ?? 'A player' },
    mine: Boolean(auth && row.ownerId === auth.user.id),
    copied: Boolean(row.copiedFrom),
    updatedAt: row.updatedAt.toISOString(),
    /** False when a stored blueprint no longer passes the checks (it cannot be hosted until fixed). */
    playable: Boolean(bp) && !row.hiddenAt,
  };
}

async function loadRow(db: DbOrTx, id: string): Promise<Row> {
  if (!z.string().uuid().safeParse(id).success) throw notFound('No made game with that id.');
  const [row] = await db.select().from(blueprints).where(eq(blueprints.id, id)).limit(1);
  if (!row) throw notFound('No made game with that id.');
  return row;
}

/** Check a blueprint and the visibility asked for, or refuse in words. */
function checked(auth: AuthContext, body: z.infer<typeof saveSchema>): { bp: Blueprint; visibility: Row['visibility'] } {
  const r = parseBlueprint(body.blueprint);
  if (!r.ok) throw new AppError(400, 'validation_failed', r.problems[0]!.message, Object.fromEntries(r.problems.map((p) => [p.path || 'blueprint', p.message])));
  if (body.visibility === 'public' && !auth.permissions.has('sets.publish_public')) {
    throw forbidden('Listing a game for everyone needs a trusted account. Keep it private or share its link instead.');
  }
  return { bp: r.blueprint, visibility: body.visibility };
}

async function underLimit(db: DbOrTx, ownerId: string) {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(blueprints).where(eq(blueprints.ownerId, ownerId));
  if (n >= MAX_BLUEPRINTS_PER_MAKER) throw new AppError(409, 'conflict', `You have ${MAX_BLUEPRINTS_PER_MAKER} made games, the most you can keep. Delete one to make another.`);
}

/**
 * A room is being set up from a made game: check the host may play it and its blueprint still passes,
 * count the play, and return what the room needs. Someone else's private game reads as missing.
 */
export async function madeGameForRoom(db: DbOrTx, id: string, auth: AuthContext): Promise<MadeGame> {
  const row = await loadRow(db, id);
  if (!canSee(row, auth)) throw notFound('No made game with that id.');
  if (row.hiddenAt) throw forbidden('This game has been hidden by a moderator, so it cannot be played.');
  const r = parseBlueprint(row.blueprint);
  if (!r.ok) throw new AppError(409, 'conflict', `This game needs fixing in Mode Studio first: ${r.problems[0]!.message}`);
  await db.update(blueprints).set({ plays: sql`${blueprints.plays} + 1` }).where(eq(blueprints.id, row.id));
  return { id: row.id, name: r.blueprint.name, blueprint: r.blueprint };
}

export async function modeStudioRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  /** Your made games, the public ones (most played first, optionally searched), or one maker's public ones. */
  app.get('/api/blueprints', async (req, reply) => {
    noStore(reply);
    const auth = req.auth ?? null;
    const q = parse(z.object({ scope: z.enum(['mine', 'public']).default('public'), q: z.string().trim().max(60).optional(), maker: z.string().uuid().optional() }), req.query);
    if (q.scope === 'mine' && !auth) return { games: [] };
    const where =
      q.scope === 'mine'
        ? eq(blueprints.ownerId, auth!.user.id)
        : and(eq(blueprints.visibility, 'public'), isNull(blueprints.hiddenAt), q.q ? ilike(blueprints.name, `%${likeEscape(q.q)}%`) : undefined, q.maker ? eq(blueprints.ownerId, q.maker) : undefined);
    const rows = await db
      .select({ row: blueprints, ownerName: users.displayName })
      .from(blueprints)
      .leftJoin(users, eq(users.id, blueprints.ownerId))
      .where(where)
      .orderBy(q.scope === 'mine' ? desc(blueprints.updatedAt) : desc(blueprints.plays))
      .limit(60);
    return { games: rows.map((r) => card(r.row, auth, r.ownerName)), limit: MAX_BLUEPRINTS_PER_MAKER };
  });

  app.get('/api/blueprints/:id', async (req, reply) => {
    noStore(reply);
    const auth = req.auth ?? null;
    const { id } = parse(idSchema, req.params);
    const row = await loadRow(db, id);
    if (!canSee(row, auth)) throw notFound('No made game with that id.');
    const [owner] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, row.ownerId)).limit(1);
    return { game: { ...card(row, auth, owner?.name ?? null), blueprint: row.blueprint } };
  });

  app.post('/api/blueprints', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    requirePermission(req, 'rooms.host');
    const auth = requireAccount(req);
    const { bp, visibility } = checked(auth, parse(saveSchema, req.body));
    await underLimit(db, auth.user.id);
    const [row] = await db.insert(blueprints).values({ ownerId: auth.user.id, name: bp.name, blueprint: bp, visibility }).returning();
    return { game: { ...card(row!, auth, auth.user.displayName), blueprint: row!.blueprint } };
  });

  app.put('/api/blueprints/:id', { config: { rateLimit: { max: 120, timeWindow: '10 minutes' } } }, async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idSchema, req.params);
    const row = await loadRow(db, id);
    if (row.ownerId !== auth.user.id) throw forbidden('Only the person who made this game can change it.');
    const { bp, visibility } = checked(auth, parse(saveSchema, req.body));
    const [after] = await db.update(blueprints).set({ name: bp.name, blueprint: bp, visibility, updatedAt: new Date() }).where(eq(blueprints.id, id)).returning();
    return { game: { ...card(after!, auth, auth.user.displayName), blueprint: after!.blueprint } };
  });

  app.delete('/api/blueprints/:id', async (req) => {
    const auth = requireAccount(req);
    const { id } = parse(idSchema, req.params);
    const row = await loadRow(db, id);
    if (row.ownerId !== auth.user.id) throw forbidden('Only the person who made this game can delete it.');
    await db.delete(blueprints).where(eq(blueprints.id, id));
    return { ok: true };
  });

  /** Copy a game you can see (someone's public or shared one, or your own) to change it: the copy is yours and private. */
  app.post('/api/blueprints/:id/copy', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    requirePermission(req, 'rooms.host');
    const auth = requireAccount(req);
    const { id } = parse(idSchema, req.params);
    const row = await loadRow(db, id);
    if (!canSee(row, auth)) throw notFound('No made game with that id.');
    if (row.hiddenAt && row.ownerId !== auth.user.id) throw forbidden('This game has been hidden by a moderator, so it cannot be copied.');
    const r = parseBlueprint(row.blueprint);
    if (!r.ok) throw new AppError(409, 'conflict', 'This game cannot be copied until its maker fixes it.');
    await underLimit(db, auth.user.id);
    const name = `${r.blueprint.name.slice(0, 33)} (copy)`;
    const bp = { ...r.blueprint, name };
    const [copy] = await db.insert(blueprints).values({ ownerId: auth.user.id, name, blueprint: bp, visibility: 'private', copiedFrom: row.id }).returning();
    return { game: { ...card(copy!, auth, auth.user.displayName), blueprint: copy!.blueprint } };
  });

  /** Moderators hide a made game from everyone but its maker (and stop it being hosted), or show it again. Audited. */
  app.post('/api/admin/blueprints/:id/hide', staffLimit(30), async (req) => {
    const auth = staff(req, 'content.moderate');
    const { id } = parse(idSchema, req.params);
    const body = parse(z.object({ hidden: z.boolean(), reason: staffReasonSchema }), req.body);
    return db.transaction(async (tx) => {
      const row = await loadRow(tx, id);
      await tx.update(blueprints).set({ hiddenAt: body.hidden ? new Date() : null }).where(eq(blueprints.id, id));
      await audit(deps, req, tx, { actor: auth, action: body.hidden ? 'blueprint.hide' : 'blueprint.show', targetType: 'blueprint', targetId: id, targetName: row.name, reason: body.reason });
      return { ok: true };
    });
  });
}
