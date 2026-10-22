import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { commonSettingsSchema, roomCodeSchema, roomOptionsSchema } from '@ludora/shared';
import { getMode, getVariant } from '@ludora/engine';
import { soloBlocker } from '@ludora/engine/catalog';
import type { AppDeps } from '../../app.ts';
import { noStore, requirePermission } from '../../http/context.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { loadSetForPlay } from '../sets/access.ts';
import { MAX_ROOMS_PER_HOST, type RoomManager } from '../../realtime/manager.ts';
import type { Room } from '../../realtime/room.ts';
import { isModePlayableBy } from '../modes/service.ts';

const createSchema = z.object({
  setId: z.string().uuid(),
  modeId: z.string().min(1).max(60),
  variantId: z.string().min(1).max(60).nullable().optional(),
  settings: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
  common: commonSettingsSchema.partial().optional(),
  options: roomOptionsSchema.partial().optional(),
  solo: z.boolean().optional(),
});

/**
 * A host's open games: rooms in the lobby or with a game running or paused. These
 * count toward MAX_ROOMS_PER_HOST and are listed for the host to rejoin or close.
 * Solo games and finished games do not count.
 */
function openGames(manager: RoomManager, userId: string): Room[] {
  return manager.hostedBy(userId).filter((r) => !r.solo && r.status !== 'ended');
}

/**
 * Finished games do not count toward the limit, but each still holds a room for its
 * results screen and for Play again. Once a host has more rooms than the limit, the
 * oldest finished ones close (their games were saved when they ended), so restarting
 * old rooms can never take a host past the limit.
 */
function closeOldestFinished(manager: RoomManager, userId: string) {
  const hosted = manager.hostedBy(userId).filter((r) => !r.solo);
  const finished = hosted.filter((r) => r.status === 'ended').sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0));
  for (const room of finished.slice(0, Math.max(0, hosted.length - MAX_ROOMS_PER_HOST))) {
    room.close('The host started a new game, so this room closed. Your results were saved.');
  }
}

export async function roomRoutes(app: FastifyInstance, deps: AppDeps) {
  const manager = deps.rooms;
  {
    app.post('/api/rooms', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
      const auth = requirePermission(req, 'rooms.host');
      const body = parse(createSchema, req.body);
      const mode = getMode(body.variantId ? (getVariant(body.variantId)?.meta.modeId ?? body.modeId) : body.modeId);
      if (!mode) throw notFound('That game mode does not exist.');
      const solo = body.solo === true || mode.meta.pacing === 'solo';
      if (solo) {
        const blocker = soloBlocker(mode.meta.id, body.variantId ?? null, body.settings ?? {});
        if (blocker) throw new AppError(409, 'conflict', blocker);
      }
      await isModePlayableBy(deps, auth, mode.meta.id, body.variantId ?? null);
      if (!solo && openGames(manager, auth.user.id).length >= MAX_ROOMS_PER_HOST) {
        throw new AppError(409, 'conflict', `You already have ${MAX_ROOMS_PER_HOST} games open, the most you can have at once. Close one in Your open games, then try again.`);
      }
      const { set, questions } = await loadSetForPlay(deps.db, body.setId, auth);
      let room;
      try {
        room = manager.create({
          hostUserId: auth.user.id,
          hostName: auth.user.displayName,
          modeId: mode.meta.id,
          variantId: body.variantId ?? null,
          settings: body.settings ?? {},
          common: body.common ?? {},
          options: roomOptionsSchema.parse(solo ? { ...body.options, maxPlayers: 1, lateJoin: false } : (body.options ?? {})),
          set: { id: set.id, title: set.title, questions },
          solo,
        });
      } catch (err) {
        throw new AppError(400, 'validation_failed', (err as Error).message);
      }
      if (!solo) closeOldestFinished(manager, auth.user.id);
      return { code: room.code, solo };
    });

    // Generous because a whole class looks the code up at once, often from one school IP.
    app.get('/api/rooms/:code', { config: { rateLimit: { max: 240, timeWindow: '1 minute' } } }, async (req) => {
      const code = parse(roomCodeSchema, (req.params as { code: string }).code);
      const room = manager.get(code);
      if (!room || room.solo) throw new AppError(404, 'room_not_found', 'No game with that code. Check the code on the host screen.');
      const joinable = !room.locked && (room.status === 'lobby' || ((room.status === 'running' || room.status === 'paused') && room.options.lateJoin));
      return {
        code: room.code,
        title: room.variant?.meta.title ?? room.mode.meta.title,
        modeId: room.mode.meta.id,
        setTitle: room.set.title,
        hostName: room.hostName,
        status: room.status,
        requireAccount: room.options.requireAccount,
        generatedNames: room.options.generatedNames,
        joinable,
        isHost: req.auth?.user.id === room.hostUserId,
      };
    });

    /** The signed-in host's open games, newest first, and how many they may have open at once. */
    app.get('/api/rooms', async (req, reply) => {
      noStore(reply);
      const auth = requirePermission(req, 'rooms.host');
      const rooms = openGames(manager, auth.user.id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((r) => {
          const s = r.summary();
          return { code: s.code, status: s.status, modeId: s.modeId, variantId: s.variantId, title: s.title, setTitle: s.setTitle, players: s.players, connected: s.connected, locked: s.locked, createdAt: s.createdAt, lastActivity: s.lastActivity };
        });
      return { rooms, limit: MAX_ROOMS_PER_HOST };
    });

    /**
     * The host closes one of their games from outside the room. A game in progress
     * ends the way the room's own End game button ends it: the game is saved and
     * players see their results and rewards, and nobody new can join a finished
     * game. A lobby (or a game that has already finished) closes straight away.
     */
    app.post('/api/rooms/:code/close', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
      const auth = requirePermission(req, 'rooms.host');
      const code = parse(roomCodeSchema, (req.params as { code: string }).code);
      const room = manager.get(code);
      // Someone else's room reads the same as one that does not exist, so codes cannot be probed.
      if (!room || room.hostUserId !== auth.user.id) throw new AppError(404, 'room_not_found', 'That game has already closed.');
      if ((room.status === 'running' || room.status === 'paused') && room.hostCommand({ cmd: 'end' }).ok) return { ok: true, outcome: 'ended' as const };
      room.close('The host closed this room.');
      return { ok: true, outcome: 'closed' as const };
    });
  }
}
