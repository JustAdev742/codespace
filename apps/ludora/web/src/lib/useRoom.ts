import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ChaosRequest, HostCommand, PulseView, RoomView } from '@ludora/shared';
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
  phase: 'connecting' | 'joined' | 'error' | 'closed';
  online: boolean;
  view: RoomView<any> | null;
  /** Local time when the current view arrived, for extrapolating the game clock. */
  receivedAt: number;
  error: RoomError | null;
  closedMessage: string | null;
  role: 'host' | 'player' | null;
  reactions: Reaction[];
  /** The server says this account just finished the lantern ritual: the lantern can be lit. */
  glow: boolean;
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

function emitWithAck(socket: Socket, event: string, payload: unknown, timeoutMs = 6000): Promise<AckResult> {
  return new Promise((resolve) => {
    socket.timeout(timeoutMs).emit(event, payload, (err: Error | null, ack: AckResult) => {
      if (err) resolve({ ok: false, error: { code: 'timeout', message: 'The server did not answer. Check your connection.' } });
      else resolve(ack);
    });
  });
}

export function useRoom(code: string, opts: { name?: string | undefined; as?: 'host' | 'player'; enabled?: boolean }) {
  const [state, setState] = useState<RoomState>({
    phase: 'connecting',
    online: false,
    view: null,
    receivedAt: 0,
    error: null,
    closedMessage: null,
    role: null,
    reactions: [],
    glow: false,
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
      const ack = await emitWithAck(socket, 'room:join', { code, name: nameRef.current, reconnectToken: storedToken(code), as: opts.as });
      if (closed) return;
      if (!ack.ok) {
        // A stale token (room restarted, or we were removed) should not block a fresh join.
        if (ack.error.code === 'forbidden' || ack.error.code === 'room_not_found') storeToken(code, null);
        setState((s) => ({ ...s, phase: 'error', error: ack.error }));
        return;
      }
      if (typeof ack.reconnectToken === 'string') storeToken(code, ack.reconnectToken);
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
    socket.on('room:pulse', (p: PulseView) => pulseRef.current?.push(p));
    socket.on('room:closed', (p: { reason: string; message: string }) => {
      storeToken(code, null);
      setState((s) => ({ ...s, phase: 'closed', closedMessage: p.message }));
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

  const react = useCallback(async (emote: string) => {
    const socket = socketRef.current;
    if (socket) await emitWithAck(socket, 'room:react', { emote }, 3000);
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
    if (socket) await emitWithAck(socket, 'room:leave', {}, 2000);
  }, [code]);

  /** Game time now, extrapolated from the last view. */
  const gameNow = useCallback(() => {
    const v = state.view;
    if (!v) return 0;
    return v.paused ? v.gameNow : v.gameNow + (Date.now() - state.receivedAt);
  }, [state.view, state.receivedAt]);

  return { ...state, act, fire, pulse, host, react, leave, gameNow, chaos, clearGlow };
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type RoomHandle = ReturnType<typeof useRoom>;
