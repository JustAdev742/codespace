import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { commonSettingsSchema, roomCodeSchema, roomOptionsSchema } from '@ludora/shared';
import { getMode, getVariant } from '@ludora/engine';
import type { AppDeps } from '../../app.ts';
import { requirePermission } from '../../http/context.ts';
import { AppError, notFound } from '../../lib/errors.ts';
import { parse } from '../../lib/validate.ts';
import { loadSetForPlay } from '../sets/access.ts';
import { MAX_ROOMS_PER_HOST } from '../../realtime/manager.ts';
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

export async function roomRoutes(app: FastifyInstance, deps: AppDeps) {
  const manager = deps.rooms;
  {
    app.post('/api/rooms', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
      const auth = requirePermission(req, 'rooms.host');
      const body = parse(createSchema, req.body);
      const mode = getMode(body.variantId ? (getVariant(body.variantId)?.meta.modeId ?? body.modeId) : body.modeId);
      if (!mode) throw notFound('That game mode does not exist.');
      const solo = body.solo === true || mode.meta.pacing === 'solo';
      await isModePlayableBy(deps, auth, mode.meta.id, body.variantId ?? null);
      if (manager.hostedBy(auth.user.id).filter((r) => !r.solo).length >= MAX_ROOMS_PER_HOST && !solo) {
        throw new AppError(409, 'conflict', 'You already have several rooms open. Close one first.');
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
      return { code: room.code, solo };
    });

    app.get('/api/rooms/:code', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
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

    app.get('/api/rooms', async (req) => {
      const auth = requirePermission(req, 'rooms.host');
      return { rooms: manager.hostedBy(auth.user.id).map((r) => r.summary()) };
    });
  }
}
