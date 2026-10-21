import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { HostCommand, RoomView } from '@ludora/shared';
import { newRequestKey } from './api.ts';

/*
 * One live connection to a room. Handles joining, rejoining after a dropped
 * connection (with the reconnect token the server gave us), ignoring
 * out-of-date views, and sending actions with an acknowledgement and a
 * single retry under the same id (so a retry can never count twice).
 */

export type RoomError = { code: string; message: string };
export type AckResult = { ok: true; [k: string]: unknown } | { ok: false; error: RoomError };

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
    debug: { transport: '-', views: 0, reconnects: 0, lastAckMs: null },
  });
  const socketRef = useRef<Socket | null>(null);
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
    if (!socket) return { ok: false, error: { code: 'offline', message: 'Not connected.' } };
    const actionId = newRequestKey('a').slice(0, 30);
    const sent = performance.now();
    let ack = await emitWithAck(socket, 'room:action', { actionId, action });
    if (!ack.ok && ack.error.code === 'timeout') ack = await emitWithAck(socket, 'room:action', { actionId, action });
    const ms = Math.round(performance.now() - sent);
    setState((s) => ({ ...s, debug: { ...s.debug, lastAckMs: ms } }));
    return ack;
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

  return { ...state, act, host, react, leave, gameNow };
}

export type RoomHandle = ReturnType<typeof useRoom>;
