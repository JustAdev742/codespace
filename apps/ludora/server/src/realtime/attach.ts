import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { actionRequestSchema, C2S, hostCommandSchema, joinRequestSchema, reactionSchema } from '@ludora/shared';
import type { AppDeps } from '../app.ts';
import type { AuthContext } from '../http/context.ts';
import { originAllowed } from '../http/origins.ts';
import { hashIp } from '../lib/crypto.ts';
import { SESSION_COOKIE, resolveSession } from '../modules/auth/service.ts';
import { loadAvatar } from '../modules/profiles/avatar.ts';
import { fail, type Ack, type Room, type RoomSubscriber } from './room.ts';

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
const joinAsSchema = joinRequestSchema.extend({ as: z.enum(['host', 'player']).optional() });

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

  io.on('connection', (socket: Socket) => {
    const state = socket.data as SocketState;
    const bucket = new TokenBucket(40, 20);
    let current: { room: Room; sub: RoomSubscriber } | null = null;

    const reply = (ack: unknown, payload: Ack | object) => {
      if (typeof ack === 'function') ack(payload);
    };
    const guard = (ack: unknown): boolean => {
      if (bucket.take()) return true;
      reply(ack, fail('rate_limited', 'Slow down a little.'));
      return false;
    };
    const detach = () => {
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
        const sub: RoomSubscriber = { id: randomUUID(), role: 'host', playerId: null, emit: (e, p) => socket.emit(e, p) };
        current = { room, sub };
        room.subscribe(sub);
        return reply(ack, { ok: true, role: 'host', playerId: null });
      }
      const avatar = auth ? await loadAvatar(deps.db, auth.user.id).catch(() => null) : null;
      const joined = room.join({
        name: parsed.data.name,
        reconnectToken: parsed.data.reconnectToken,
        userId: auth?.user.id ?? null,
        accountName: auth?.user.displayName ?? null,
        isGuestAccount: auth?.user.isGuest ?? true,
        avatar,
      });
      if (!joined.ok) return reply(ack, joined);
      const sub: RoomSubscriber = { id: randomUUID(), role: 'player', playerId: joined.player.id, emit: (e, p) => socket.emit(e, p) };
      current = { room, sub };
      room.subscribe(sub);
      // Solo games start as soon as their player arrives.
      if (room.solo && room.status === 'lobby') room.hostCommand({ cmd: 'start' });
      reply(ack, { ok: true, role: 'player', playerId: joined.player.id, reconnectToken: joined.player.reconnectToken, resumed: joined.resumed });
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

    socket.on(C2S.react, (payload: unknown, ack: unknown) => {
      if (!guard(ack)) return;
      if (!current) return reply(ack, fail('forbidden', 'Join the room first.'));
      if (state.auth?.user.mutedUntil && state.auth.user.mutedUntil > new Date()) return reply(ack, fail('forbidden', 'Reactions are turned off for your account for now.'));
      const parsed = reactionSchema.safeParse(payload);
      if (!parsed.success) return reply(ack, fail('bad_request', 'Unknown reaction.'));
      reply(ack, current.room.react(current.sub.playerId, parsed.data.emote, current.sub.role));
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
