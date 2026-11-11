import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { actionRequestSchema, C2S, chaosRequestSchema, hostCommandSchema, joinRequestSchema, playerRequestSchema, reactionSchema, S2C } from '@ludora/shared';
import type { AppDeps } from '../app.ts';
import type { AuthContext } from '../http/context.ts';
import { originAllowed } from '../http/origins.ts';
import { hashIp } from '../lib/crypto.ts';
import { SESSION_COOKIE, resolveSession } from '../modules/auth/service.ts';
import { loadAvatar } from '../modules/profiles/avatar.ts';
import { chaosService } from '../modules/extras/service.ts';
import { fail, type Ack, type Room, type RoomSubscriber } from './room.ts';
import { and, eq, gt } from 'drizzle-orm';
import { inventory, items, users } from '../db/schema.ts';
import { readPreferences } from '../modules/users/preferences.ts';

/*
 * Socket.IO transport. Long-polling stays enabled as a fallback because some
 * school networks block WebSockets. Every inbound payload is validated, every
 * socket has an event budget, and joins are limited per IP so room codes
 * cannot be guessed by brute force.
 */

interface SocketState {
  auth: AuthContext | null;
  ipHash: string | null;
}

class TokenBucket {
  private tokens: number;
  private last = Date.now();
  constructor(private readonly capacity: number, private readonly perSecond: number) {
    this.tokens = capacity;
  }
  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Per IP. A school often puts every class behind one public IP, so this has to fit a few classes joining at once.
const JOINS_PER_MINUTE = 150;
// 'remote': the host's controls-only view on a phone, beside the big screen.
const joinAsSchema = joinRequestSchema.extend({ as: z.enum(['host', 'player', 'remote']).optional() });

export function attachRealtime(app: FastifyInstance, deps: AppDeps) {
  const manager = deps.rooms;
  const io = new Server(app.server, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 20_000,
    pingTimeout: 25_000,
    connectionStateRecovery: undefined,
    // Browsers always send Origin cross-site, so a missing Origin is a same-origin request or not a browser.
    allowRequest: (req, cb) => {
      const origin = req.headers.origin;
      cb(null, !origin || originAllowed(origin, req.headers, deps.config.allowedOrigins, deps.config.trustProxy));
    },
  });

  const joinCounts = new Map<string, { n: number; resetAt: number }>();
  const joinAllowed = (key: string | null) => {
    if (!key) return true;
    const now = Date.now();
    const e = joinCounts.get(key);
    if (!e || e.resetAt < now) {
      joinCounts.set(key, { n: 1, resetAt: now + 60_000 });
      if (joinCounts.size > 50_000) joinCounts.clear();
      return true;
    }
    e.n++;
    return e.n <= JOINS_PER_MINUTE;
  };

  io.use(async (socket, next) => {
    try {
      const token = parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE];
      const ip = deps.config.trustProxy ? String(socket.handshake.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim() || socket.handshake.address : socket.handshake.address;
      const state: SocketState = { auth: token ? await resolveSession(deps.db, token) : null, ipHash: hashIp(ip, deps.config.IP_HASH_KEY) };
      socket.data = state;
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  const chaos = chaosService(deps);

  io.on('connection', (socket: Socket) => {
    const state = socket.data as SocketState;
    const bucket = new TokenBucket(40, 20);
    // Casting has its own, tighter budget on top of the general one.
    const chaosBucket = new TokenBucket(6, 2);
    let current: { room: Room; sub: RoomSubscriber } | null = null;
    // A request waiting in a room's waiting room, so it can be withdrawn if this socket goes.
    let waiting: { room: Room; id: string } | null = null;
    const withdraw = () => {
      if (waiting) waiting.room.cancelPending(waiting.id);
      waiting = null;
    };
    // The account's unlock, read from the database and re-read at most every few seconds.
    let unlocked: { value: boolean; at: number } | null = null;
    const isUnlocked = async (): Promise<boolean> => {
      const userId = state.auth?.user.id;
      if (!userId) return false;
      if (unlocked && Date.now() - unlocked.at < 5000) return unlocked.value;
      unlocked = { value: await chaos.isUnlocked(userId), at: Date.now() };
      return unlocked.value;
    };

    const reply = (ack: unknown, payload: Ack | object) => {
      if (typeof ack === 'function') ack(payload);
    };
    const guard = (ack: unknown): boolean => {
      if (bucket.take()) return true;
      reply(ack, fail('rate_limited', 'Slow down a little.'));
      return false;
    };
    const detach = () => {
      withdraw();
      if (!current) return;
      current.room.unsubscribe(current.sub.id);
      current = null;
    };

    socket.on(C2S.join, async (payload: unknown, ack: unknown) => {
      if (!guard(ack)) return;
      if (!joinAllowed(state.ipHash)) return reply(ack, fail('rate_limited', 'Too many join attempts. Wait a minute and try again.'));
      const parsed = joinAsSchema.safeParse(payload);
      if (!parsed.success) return reply(ack, fail('validation_failed', 'Room codes are 6 digits.'));
      const room = manager.get(parsed.data.code);
      if (!room) return reply(ack, fail('room_not_found', 'No game with that code. Check the code on the host screen.'));
      detach();
      const auth = state.auth;
      const isHost = Boolean(auth && auth.user.id === room.hostUserId);
      const asHost = isHost && !room.solo && parsed.data.as !== 'player';
      if (asHost) {
        const sub: RoomSubscriber = { id: randomUUID(), role: 'host', playerId: null, remote: parsed.data.as === 'remote', emit: (e, p) => socket.emit(e, p) };
        current = { room, sub };
        room.subscribe(sub);
        return reply(ack, { ok: true, role: 'host', playerId: null });
      }
      const avatar = auth ? await loadAvatar(deps.db, auth.user.id).catch(() => null) : null;
      // Reactions the account owns and the bar it chose: bought reactions are only ever sendable by their owners.
      const reacts = auth ? await loadReactions(deps.db, auth.user.id).catch(() => null) : null;
      // A class game: someone added to the class after the room opened is let in, checked against the database.
      if (room.classMembers && room.classId && auth && !room.classMembers.has(auth.user.id) && (await manager.isClassMember(room.classId, auth.user.id).catch(() => false))) {
        room.classMembers.add(auth.user.id);
      }
      const joined = room.join({
        name: parsed.data.name,
        reconnectToken: parsed.data.reconnectToken,
        userId: auth?.user.id ?? null,
        accountName: auth?.user.displayName ?? null,
        isGuestAccount: auth?.user.isGuest ?? true,
        avatar,
        dress: parsed.data.dress,
        ...(reacts ? { ownedReactions: reacts.owned, reactionBar: reacts.bar } : {}),
        // Waiting room: the host's answer arrives later, on this socket.
        onAdmitted: (reconnectToken) => {
          waiting = null;
          socket.emit(S2C.admitted, { reconnectToken });
        },
        onDeclined: (message) => {
          waiting = null;
          socket.emit(S2C.closed, { reason: 'declined', message });
        },
      });
      if (!joined.ok) {
        const pendingId = (joined as { pendingId?: string }).pendingId;
        if (pendingId) waiting = { room, id: pendingId };
        return reply(ack, joined);
      }
      const sub: RoomSubscriber = { id: randomUUID(), role: 'player', playerId: joined.player.id, emit: (e, p) => socket.emit(e, p) };
      current = { room, sub };
      if (auth) room.setChaosUnlocked(auth.user.id, await isUnlocked().catch(() => false));
      room.subscribe(sub);
      // Solo games start as soon as their player arrives.
      if (room.solo && room.status === 'lobby') room.hostCommand({ cmd: 'start' });
      reply(ack, { ok: true, role: 'player', playerId: joined.player.id, reconnectToken: joined.player.reconnectToken, resumed: joined.resumed });
    });

    // School: a read-only second screen. It sees what the projector shows every player (the host's
    // view: display names, no answers before the reveal, no reconnect tokens) and can send nothing.
    socket.on('room:watch', (payload: unknown, ack: unknown) => {
      if (!guard(ack)) return;
      if (!joinAllowed(state.ipHash)) return reply(ack, fail('rate_limited', 'Too many join attempts. Wait a minute and try again.'));
      if (!state.auth || state.auth.user.isGuest) return reply(ack, fail('forbidden', 'Sign in with an account to show a game on another screen.'));
      const parsed = z.object({ code: joinRequestSchema.shape.code }).safeParse(payload);
      if (!parsed.success) return reply(ack, fail('validation_failed', 'Room codes are 6 digits.'));
      const room = manager.get(parsed.data.code);
      if (!room || room.solo) return reply(ack, fail('room_not_found', 'No game with that code. Check the code on the host screen.'));
      // Not a way round a class-only game, a locked room or a waiting room: see Room.watchAllowed.
      if (!room.watchAllowed(state.auth.user.id, state.auth.permissions.has('school.view'))) {
        return reply(ack, fail('forbidden', 'Only the host and school staff can show this game on another screen.'));
      }
      detach();
      const sub: RoomSubscriber = { id: randomUUID(), role: 'spectator', playerId: null, emit: (e, p) => socket.emit(e, p) };
      current = { room, sub };
      room.subscribe(sub);
      reply(ack, { ok: true, role: 'spectator', playerId: null });
    });

    socket.on(C2S.action, (payload: unknown, ack: unknown) => {
      if (!guard(ack)) return;
      if (!current || current.sub.role !== 'player' || !current.sub.playerId) return reply(ack, fail('forbidden', 'Join the game first.'));
      const parsed = actionRequestSchema.safeParse(payload);
      if (!parsed.success) return reply(ack, fail('bad_request', 'That move was not understood.'));
      reply(ack, current.room.action(current.sub.playerId, parsed.data.actionId, parsed.data.action));
    });

    socket.on(C2S.host, (payload: unknown, ack: unknown) => {
      if (!guard(ack)) return;
      if (!current) return reply(ack, fail('forbidden', 'Join the room first.'));
      const isHostSocket = current.sub.role === 'host';
      const soloOwner = current.room.solo && state.auth?.user.id === current.room.hostUserId;
      if (!isHostSocket && !soloOwner) return reply(ack, fail('not_host', 'Only the host can do that.'));
      const parsed = hostCommandSchema.safeParse(payload);
      if (!parsed.success) return reply(ack, fail('bad_request', 'That command was not understood.'));
      reply(ack, current.room.hostCommand(parsed.data));
    });

    socket.on(C2S.player, (payload: unknown, ack: unknown) => {
      if (!guard(ack)) return;
      if (!current || current.sub.role !== 'player' || !current.sub.playerId) return reply(ack, fail('forbidden', 'Join the game first.'));
      const parsed = playerRequestSchema.safeParse(payload);
      if (!parsed.success) return reply(ack, fail('bad_request', 'That was not understood.'));
      reply(ack, current.room.playerRequest(current.sub.playerId, parsed.data));
    });

    socket.on(C2S.react, (payload: unknown, ack: unknown) => {
      if (!guard(ack)) return;
      if (!current || current.sub.role === 'spectator') return reply(ack, fail('forbidden', 'Join the room first.'));
      if (state.auth?.user.mutedUntil && state.auth.user.mutedUntil > new Date()) return reply(ack, fail('forbidden', 'Reactions are turned off for your account for now.'));
      const parsed = reactionSchema.safeParse(payload);
      if (!parsed.success) return reply(ack, fail('bad_request', 'Unknown reaction.'));
      const r = current.room.react(current.sub.playerId, parsed.data.emote, current.sub.role);
      reply(ack, r);
      // The lantern ritual: reactions sent as a player in a running game, in the right order.
      const userId = state.auth?.user.id;
      if (r.ok && userId && current.sub.role === 'player' && chaos.tracker.reaction(userId, parsed.data.emote, current.room.status === 'running')) {
        socket.emit(S2C.glow, { ok: true });
      }
    });

    socket.on(C2S.chaos, async (payload: unknown, ack: unknown) => {
      if (!guard(ack)) return;
      if (!chaosBucket.take()) return reply(ack, fail('rate_limited', 'Slow down a little.'));
      if (!current || current.sub.role !== 'player' || !current.sub.playerId) return reply(ack, fail('forbidden', 'Nothing happens.'));
      const parsed = chaosRequestSchema.safeParse(payload);
      if (!parsed.success) return reply(ack, fail('bad_request', 'Nothing happens.'));
      // Checked against the database every time (with a short cache), whatever the browser claims.
      const ok = await isUnlocked().catch(() => false);
      if (!current) return reply(ack, fail('forbidden', 'Nothing happens.'));
      current.room.setChaosUnlocked(state.auth?.user.id ?? '', ok);
      if (!ok) return reply(ack, fail('forbidden', 'Nothing happens.'));
      reply(ack, current.room.chaos(current.sub.playerId!, parsed.data));
    });

    socket.on(C2S.leave, (_payload: unknown, ack: unknown) => {
      if (current?.sub.playerId) current.room.leave(current.sub.playerId);
      detach();
      reply(ack, { ok: true });
    });

    socket.on('disconnect', () => detach());
  });

  app.addHook('onClose', async () => {
    io.close();
  });

  deps.realtime = {
    /** Drop every socket signed in as this account, e.g. after a ban or suspension. */
    disconnectUser(userId: string, message: string) {
      let n = 0;
      for (const socket of io.sockets.sockets.values()) {
        if ((socket.data as SocketState).auth?.user.id !== userId) continue;
        socket.emit('room:closed', { reason: 'signed_out', message });
        socket.disconnect(true);
        n++;
      }
      return n;
    },
    connectedSockets: () => io.sockets.sockets.size,
  };

  return {
    io,
    manager,
    async shutdown() {
      await manager.shutdown();
      io.close();
    },
  };
}

/** The reaction glyphs an account owns (emote items in its inventory) and the bar it chose in Settings. */
async function loadReactions(db: AppDeps['db'], userId: string): Promise<{ owned: string[]; bar: string[] }> {
  const rows = await db
    .select({ art: items.art })
    .from(inventory)
    .innerJoin(items, eq(items.id, inventory.itemId))
    .where(and(eq(inventory.userId, userId), eq(items.type, 'emote'), gt(inventory.quantity, 0)));
  const owned = [...new Set(rows.map((r) => (r.art as { glyph?: unknown })?.glyph).filter((g): g is string => typeof g === 'string'))];
  const [u] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, userId)).limit(1);
  return { owned, bar: readPreferences(u?.preferences).reactionBar };
}
