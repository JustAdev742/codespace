import { useCallback, useEffect, useRef, useState } from 'react';
import { deviceDress, schoolLook } from './school.ts';
import { io, type Socket } from 'socket.io-client';
import type { ChaosRequest, HostCommand, PlayerRequest, PulseView, RoomView } from '@ludora/shared';
import { newRequestKey } from './api.ts';

/*
 * One live connection to a room. Handles joining, rejoining after a dropped
 * connection (with the reconnect token the server gave us), ignoring
 * out-of-date views, and sending actions with an acknowledgement and a
 * single retry under the same id (so a retry can never count twice).
 */

export type RoomError = { code: string; message: string };
export type AckResult = { ok: true; [k: string]: unknown } | { ok: false; error: RoomError };

/**
 * Pulses arrive up to ten times a second (where everyone is standing in a 3D mode). They are
 * not React state, so they never re-render the room: a scene reads `latest()` each frame or
 * subscribes.
 */
export interface PulseSource {
  latest(): PulseView | null;
  subscribe(fn: (p: PulseView) => void): () => void;
}

export function createPulseSource(): PulseSource & { push(p: PulseView): void; clear(): void } {
  let last: PulseView | null = null;
  const fns = new Set<(p: PulseView) => void>();
  return {
    latest: () => last,
    subscribe(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    push(p) {
      last = p;
      for (const fn of fns) fn(p);
    },
    clear() {
      last = null;
    },
  };
}

export interface Reaction {
  key: number;
  playerId: string | null;
  name: string;
  emote: string;
}

export interface RoomState {
  /** 'waiting': in the room's waiting room, until the host lets this player in. */
  phase: 'connecting' | 'waiting' | 'joined' | 'error' | 'closed';
  online: boolean;
  view: RoomView<any> | null;
  /** Local time when the current view arrived, for extrapolating the game clock. */
  receivedAt: number;
  error: RoomError | null;
  closedMessage: string | null;
  /** Why the room closed for this device: 'removed' when the host (or staff) took this player out. */
  closedReason?: string | null;
  role: 'host' | 'player' | null;
  reactions: Reaction[];
  /** The server says this account just finished the lantern ritual: the lantern can be lit. */
  glow: boolean;
  /** When the host last nudged this player ("Your teacher is waiting for your answer"). */
  nudgedAt: number | null;
  /** Connection numbers for the staff debug overlay. */
  debug: { transport: string; views: number; reconnects: number; lastAckMs: number | null };
}

const tokenKey = (code: string) => `ludora.rt.${code}`;
function storedToken(code: string): string | undefined {
  try {
    return sessionStorage.getItem(tokenKey(code)) ?? undefined;
  } catch {
    return undefined;
  }
}
function storeToken(code: string, token: string | null) {
  try {
    if (token) sessionStorage.setItem(tokenKey(code), token);
    else sessionStorage.removeItem(tokenKey(code));
  } catch {
    /* ignore */
  }
}

/*
 * The tab's token is kept for the session, so a reload keeps your place. A player who closes the
 * tab and opens the game again in a new one comes back under the same name: the device remembers
 * which name holds which seat, so coming back as "Sam" on the same browser takes up Sam's seat
 * (and score) again instead of making a second "Sam 2". A different name is a different player.
 */
const seatKey = (code: string) => `ludora.seat.${code}`;
function deviceRemovedToken(code: string): string | undefined {
  try {
    return localStorage.getItem(`ludora.removed.${code}`) ?? undefined;
  } catch {
    return undefined;
  }
}
/** A seat the host removed this device from. Kept so the same device cannot come straight back under another name. */
const removedKey = (code: string) => `ludora.removed.${code}`;
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
function deviceToken(code: string, name: string | undefined): string | undefined {
  try {
    // Removed by the host: join with the removed seat's token, whatever the name, so the server refuses it.
    const removed = localStorage.getItem(removedKey(code));
    if (removed) return removed;
    if (!name?.trim()) return undefined;
    const seat = JSON.parse(localStorage.getItem(seatKey(code)) ?? 'null') as { name?: unknown; token?: unknown } | null;
    return seat && typeof seat.name === 'string' && typeof seat.token === 'string' && sameName(seat.name, name) ? seat.token : undefined;
  } catch {
    return undefined;
  }
}
function storeRemoved(code: string, token: string | null | undefined) {
  try {
    if (token) localStorage.setItem(removedKey(code), token);
    else localStorage.removeItem(removedKey(code));
  } catch {
    /* private mode: the tab's own token still keeps them out */
  }
}
function storeDeviceSeat(code: string, name: string | undefined, token: string | null) {
  try {
    if (!token) localStorage.removeItem(seatKey(code));
    else if (name?.trim()) localStorage.setItem(seatKey(code), JSON.stringify({ name: name.trim(), token }));
  } catch {
    /* private mode: a reload in this tab still keeps the seat */
  }
}

function emitWithAck(socket: Socket, event: string, payload: unknown, timeoutMs = 6000): Promise<AckResult> {
  return new Promise((resolve) => {
    socket.timeout(timeoutMs).emit(event, payload, (err: Error | null, ack: AckResult) => {
      if (err) resolve({ ok: false, error: { code: 'timeout', message: 'The server did not answer. Check your connection.' } });
      else resolve(ack);
    });
  });
}

export function useRoom(code: string, opts: { name?: string | undefined; as?: 'host' | 'player' | 'remote'; enabled?: boolean }) {
  const [state, setState] = useState<RoomState>({
    phase: 'connecting',
    online: false,
    view: null,
    receivedAt: 0,
    error: null,
    closedMessage: null,
    closedReason: null,
    role: null,
    reactions: [],
    glow: false,
    nudgedAt: null,
    debug: { transport: '-', views: 0, reconnects: 0, lastAckMs: null },
  });
  const socketRef = useRef<Socket | null>(null);
  const pulseRef = useRef<ReturnType<typeof createPulseSource> | null>(null);
  pulseRef.current ??= createPulseSource();
  const pulse: PulseSource = pulseRef.current;
  const nameRef = useRef(opts.name);
  nameRef.current = opts.name;
  const enabled = opts.enabled !== false;

  useEffect(() => {
    if (!enabled) return;
    const socket = io({ path: '/socket.io', reconnection: true, reconnectionDelay: 600, reconnectionDelayMax: 4000 });
    socketRef.current = socket;
    let reactionKey = 0;
    let closed = false;

    const join = async () => {
      const dress = schoolLook() ? deviceDress() : null;
      const reconnectToken = deviceRemovedToken(code) ?? storedToken(code) ?? deviceToken(code, nameRef.current);
      const ack = await emitWithAck(socket, 'room:join', { code, name: nameRef.current, reconnectToken, as: opts.as, ...(dress ? { dress } : {}) });
      if (closed) return;
      if (!ack.ok) {
        // A token for a room that is gone should not get in the way of the next game with that code. A player the host
        // removed keeps theirs, so joining again from this browser is refused rather than slipping back in as someone new.
        if (ack.error.code === 'room_not_found') {
          storeToken(code, null);
          storeDeviceSeat(code, undefined, null);
          storeRemoved(code, null);
        }
        // The waiting room: stay connected until the host lets this player in (room:admitted) or not (room:closed).
        if (ack.error.code === 'waiting_room') {
          setState((s) => ({ ...s, phase: 'waiting', error: null }));
          return;
        }
        setState((s) => ({ ...s, phase: 'error', error: ack.error }));
        return;
      }
      if (typeof ack.reconnectToken === 'string') {
        storeToken(code, ack.reconnectToken);
        storeDeviceSeat(code, nameRef.current, ack.reconnectToken);
      }
      setState((s) => ({ ...s, phase: 'joined', error: null, role: (ack.role as 'host' | 'player') ?? 'player' }));
    };

    let connects = 0;
    socket.on('connect', () => {
      const transport = socket.io.engine?.transport?.name ?? '-';
      socket.io.engine?.on('upgrade', (t: { name: string }) => setState((s) => ({ ...s, debug: { ...s.debug, transport: t.name } })));
      setState((s) => ({ ...s, online: true, debug: { ...s.debug, transport, reconnects: connects++ } }));
      void join();
    });
    socket.on('disconnect', () => setState((s) => ({ ...s, online: false })));
    socket.on('connect_error', () => setState((s) => ({ ...s, online: false })));
    socket.on('room:view', (view: RoomView) => {
      setState((s) => {
        s = { ...s, debug: { ...s.debug, views: s.debug.views + 1 } };
        if (s.view && view.version < s.view.version && view.room.code === s.view.room.code) return s;
        return { ...s, view, receivedAt: Date.now() };
      });
      if (view.me.reconnectToken) storeToken(code, view.me.reconnectToken);
    });
    socket.on('room:reaction', (r: { playerId: string | null; name: string; emote: string }) => {
      const key = ++reactionKey;
      setState((s) => ({ ...s, reactions: [...s.reactions.slice(-12), { key, ...r }] }));
      setTimeout(() => setState((s) => ({ ...s, reactions: s.reactions.filter((x) => x.key !== key) })), 3200);
    });
    socket.on('room:glow', () => setState((s) => ({ ...s, glow: true })));
    socket.on('room:nudge', () => setState((s) => ({ ...s, nudgedAt: Date.now() })));
    // Let in from the waiting room: the seat is ready, so join again with its token.
    socket.on('room:admitted', (p: { reconnectToken?: string }) => {
      if (typeof p?.reconnectToken !== 'string') return;
      storeToken(code, p.reconnectToken);
      storeDeviceSeat(code, nameRef.current, p.reconnectToken);
      void join();
    });
    socket.on('room:pulse', (p: PulseView) => pulseRef.current?.push(p));
    socket.on('room:closed', (p: { reason: string; message: string }) => {
      if (p.reason !== 'removed') {
        storeToken(code, null);
        storeDeviceSeat(code, undefined, null);
      } else {
        // Removed by the host: this device stays out, under any name, for as long as the room is open.
        storeRemoved(code, storedToken(code) ?? null);
      }
      setState((s) => ({ ...s, phase: 'closed', closedMessage: p.message, closedReason: p.reason }));
      socket.disconnect();
    });

    return () => {
      closed = true;
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code, enabled, opts.as]);

  const act = useCallback(async (action: unknown): Promise<AckResult> => {
    const socket = socketRef.current;
    // Not queued while offline: a buffered action could reach the server before the room is rejoined and be dropped.
    if (!socket?.connected) return { ok: false, error: { code: 'offline', message: 'You are offline. Answer again when the connection is back.' } };
    const actionId = newRequestKey('a').slice(0, 30);
    const sent = performance.now();
    let ack = await emitWithAck(socket, 'room:action', { actionId, action });
    if (!ack.ok && ack.error.code === 'timeout') ack = await emitWithAck(socket, 'room:action', { actionId, action });
    const ms = Math.round(performance.now() - sent);
    setState((s) => ({ ...s, debug: { ...s.debug, lastAckMs: ms } }));
    return ack;
  }, []);

  /**
   * A quiet move (walking about a map) sent without waiting for an answer and never retried:
   * the next one supersedes it. Dropped while offline.
   */
  const fire = useCallback((action: unknown) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit('room:action', { actionId: newRequestKey('m').slice(0, 30), action });
  }, []);

  const host = useCallback(async (cmd: HostCommand): Promise<AckResult> => {
    const socket = socketRef.current;
    if (!socket) return { ok: false, error: { code: 'offline', message: 'Not connected.' } };
    return emitWithAck(socket, 'room:host', cmd);
  }, []);

  const react = useCallback(async (emote: string): Promise<AckResult | null> => {
    const socket = socketRef.current;
    return socket ? emitWithAck(socket, 'room:react', { emote }, 3000) : null;
  }, []);

  /** A player's own lobby and end-of-game choices: Ready, their team, the exit ticket. */
  const player = useCallback(async (req: PlayerRequest): Promise<AckResult> => {
    const socket = socketRef.current;
    if (!socket?.connected) return { ok: false, error: { code: 'offline', message: 'You are offline. Try again when the connection is back.' } };
    return emitWithAck(socket, 'room:player', req);
  }, []);

  /** A chaos request. The server checks the account's unlock; a locked account is told nothing. */
  const chaos = useCallback(async (req: DistributiveOmit<ChaosRequest, 'actionId'>): Promise<AckResult> => {
    const socket = socketRef.current;
    if (!socket?.connected) return { ok: false, error: { code: 'offline', message: 'You are offline.' } };
    const actionId = newRequestKey('c').slice(0, 30);
    let ack = await emitWithAck(socket, 'room:chaos', { ...req, actionId });
    if (!ack.ok && ack.error.code === 'timeout') ack = await emitWithAck(socket, 'room:chaos', { ...req, actionId });
    return ack;
  }, []);

  const clearGlow = useCallback(() => setState((s) => ({ ...s, glow: false })), []);

  const leave = useCallback(async () => {
    const socket = socketRef.current;
    storeToken(code, null);
    storeDeviceSeat(code, undefined, null);
    if (socket) await emitWithAck(socket, 'room:leave', {}, 2000);
  }, [code]);

  /** Game time now, extrapolated from the last view. */
  const gameNow = useCallback(() => {
    const v = state.view;
    if (!v) return 0;
    return v.paused ? v.gameNow : v.gameNow + (Date.now() - state.receivedAt);
  }, [state.view, state.receivedAt]);

  return { ...state, act, fire, pulse, host, react, player, leave, gameNow, chaos, clearGlow };
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type RoomHandle = ReturnType<typeof useRoom>;
