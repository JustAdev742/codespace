import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { roomOptionsSchema, type HostCommand, type Question, type RoomView } from '@ludora/shared';
import { findCatalogMode } from '@ludora/engine/catalog';
// The room the live server runs, unchanged. It knows nothing about sockets or the database, so it runs here too.
import { Room } from '../../../server/src/realtime/room.ts';
import { newRequestKey } from '../lib/api.ts';
import type { AckResult, Reaction, RoomHandle } from '../lib/useRoom.ts';

/*
 * A game room inside the page, for the playable demo. It is the server's own
 * Room, with the page as both screens: your player's screen and the host's big
 * screen. Practice bots fill the other seats. Nothing leaves the browser and
 * nothing is saved: the room's save hook does nothing, so no rewards are paid.
 *
 * The two handles have the same shape as a live connection (useRoom), so the
 * real game screens, results and reactions run unchanged. Views and actions go
 * through JSON on the way, as they would over the network, so a screen never
 * holds a live reference into the game's state.
 */

export interface DemoSetup {
  set: { title: string; questions: Question[] };
  modeId: string;
  variantId: string | null;
  /** Practice bots to add, besides you. */
  bots: number;
  name: string;
}

/** The demo's one account. It exists only inside this page's room. */
const DEMO_USER = 'demo';

/** Over the network a view or an action is copied; the same here. */
const copy = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

/**
 * Host-paced modes wait for the host to press Next unless they move on by
 * themselves. The demo has nobody at the front, so they always move on.
 */
export function selfRunningSettings(modeId: string): Record<string, unknown> {
  const mode = findCatalogMode(modeId);
  return mode?.meta.pacing === 'host' && mode.settings.some((f) => f.key === 'autoAdvance') ? { autoAdvance: true } : {};
}

interface Screens {
  player: { view: RoomView | null; receivedAt: number };
  host: { view: RoomView | null; receivedAt: number };
  reactions: Reaction[];
  error: string | null;
}

const CLOSED: AckResult = { ok: false, error: { code: 'room_closed', message: 'This game has closed.' } };

export function useLocalRoom(setup: DemoSetup): { player: RoomHandle | null; host: RoomHandle | null; error: string | null } {
  const room = useRef<Room | null>(null);
  const playerId = useRef<string | null>(null);
  const [screens, setScreens] = useState<Screens>({ player: { view: null, receivedAt: 0 }, host: { view: null, receivedAt: 0 }, reactions: [], error: null });

  useEffect(() => {
    const fail = (message: string) => setScreens((s) => ({ ...s, error: message }));
    let r: Room;
    try {
      r = new Room(
        {
          code: '000000',
          hostUserId: DEMO_USER,
          hostName: 'Ludora',
          modeId: setup.modeId,
          variantId: setup.variantId,
          settings: selfRunningSettings(setup.modeId),
          common: {},
          options: roomOptionsSchema.parse({}),
          set: { id: null, title: setup.set.title, questions: setup.set.questions },
          // A room of one person and some bots: you are its host as well as its player, as in a solo game.
          solo: true,
        },
        {
          now: () => Date.now(),
          persist: async () => null,
          onError: (err, where) => console.error(`Game error (${where})`, err),
          onClosed: () => {},
        },
      );
    } catch (err) {
      fail(err instanceof Error ? err.message : 'This game could not be set up.');
      return;
    }
    room.current = r;
    let reactionKey = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const screen = (who: 'player' | 'host') => (event: string, payload: unknown) => {
      if (event === 'room:view') {
        const view = copy(payload as RoomView);
        setScreens((s) => ({ ...s, [who]: { view, receivedAt: Date.now() } }));
      } else if (event === 'room:reaction' && who === 'player') {
        // Every screen hears each reaction; keep one copy.
        const key = ++reactionKey;
        const { playerId: from, name, emote } = payload as { playerId: string | null; name: string; emote: string };
        setScreens((s) => ({ ...s, reactions: [...s.reactions.slice(-12), { key, playerId: from, name, emote }] }));
        const t = setTimeout(() => {
          timers.delete(t);
          setScreens((s) => ({ ...s, reactions: s.reactions.filter((x) => x.key !== key) }));
        }, 3200);
        timers.add(t);
      }
    };

    r.subscribe({ id: 'host', role: 'host', playerId: null, emit: screen('host') });
    const joined = r.join({ name: setup.name, userId: DEMO_USER, accountName: null, isGuestAccount: true, avatar: null });
    if (!joined.ok) {
      fail(joined.error.message);
      r.close('');
      return;
    }
    playerId.current = joined.player.id;
    r.subscribe({ id: 'player', role: 'player', playerId: joined.player.id, emit: screen('player') });
    if (setup.bots > 0) r.hostCommand({ cmd: 'addBots', count: setup.bots });
    const started = r.hostCommand({ cmd: 'start' });
    if (!started.ok) fail(started.error.message);

    return () => {
      for (const t of timers) clearTimeout(t);
      room.current = null;
      playerId.current = null;
      r.close('The demo game closed.');
    };
  }, [setup]);

  const act = useCallback(async (action: unknown): Promise<AckResult> => {
    const r = room.current;
    const id = playerId.current;
    if (!r || !id) return CLOSED;
    return r.action(id, newRequestKey('a').slice(0, 30), copy(action));
  }, []);
  const host = useCallback(async (cmd: HostCommand): Promise<AckResult> => room.current?.hostCommand(copy(cmd)) ?? CLOSED, []);
  const react = useCallback(async (emote: string) => {
    if (playerId.current) room.current?.react(playerId.current, emote, 'player');
  }, []);
  // Leaving is going back to the demo's start page, which closes the room.
  const leave = useCallback(async () => {}, []);
  // Chaos needs the game server (the unlock lives on an account); the demo has none.
  const chaos = useCallback(async (): Promise<AckResult> => ({ ok: false, error: { code: 'unavailable', message: 'Nothing happens.' } }), []);
  const clearGlow = useCallback(() => {}, []);
  // The game clock, read from the game itself rather than worked out from the last view.
  const gameNow = useCallback(() => room.current?.runtime?.gameNow() ?? 0, []);

  const handle = useCallback(
    (role: 'player' | 'host', screen: Screens['player']): RoomHandle | null =>
      screen.view
        ? {
            phase: 'joined',
            online: true,
            view: screen.view,
            receivedAt: screen.receivedAt,
            error: null,
            closedMessage: null,
            role,
            reactions: screens.reactions,
            glow: false,
            debug: { transport: 'in-page', views: 0, reconnects: 0, lastAckMs: null },
            act,
            host,
            react,
            leave,
            gameNow,
            chaos,
            clearGlow,
          }
        : null,
    [screens.reactions, act, host, react, leave, gameNow, chaos, clearGlow],
  );
  const player = useMemo(() => handle('player', screens.player), [handle, screens.player]);
  const hostHandle = useMemo(() => handle('host', screens.host), [handle, screens.host]);
  return { player, host: hostHandle, error: screens.error };
}
