import { afterEach, describe, expect, it } from 'vitest';
import { roomOptionsSchema } from '@ludora/shared';
import { MIXED_SET } from '@ludora/engine/testing';
import { Room, type RoomSubscriber } from '../src/realtime/room.ts';

/*
 * The live room on its own, with no sockets or database: bugs found by playing
 * the game in the browser, each pinned here.
 */

const rooms: Room[] = [];
afterEach(() => {
  for (const r of rooms.splice(0)) r.close('test over');
});

function makeRoom(modeId = 'classic', settings: Record<string, unknown> = {}) {
  const r = new Room(
    {
      code: '123456',
      hostUserId: 'host-user',
      hostName: 'Ms Host',
      modeId,
      variantId: null,
      settings,
      common: { questionLimit: 4 },
      options: roomOptionsSchema.parse({}),
      set: { id: null, title: 'Mixed', questions: MIXED_SET },
      solo: false,
    },
    { now: () => Date.now(), persist: async () => null, onError: () => {}, onClosed: () => {} },
  );
  rooms.push(r);
  return r;
}

function sub(role: 'host' | 'player', playerId: string | null, id = `${role}-${playerId ?? 'h'}`): RoomSubscriber & { views: any[] } {
  const views: any[] = [];
  return { id, role, playerId, views, emit: (e, p) => (e === 'room:view' ? views.push(p) : undefined) };
}

const account = (userId: string) => ({ userId, accountName: 'Kai', isGuestAccount: false, avatar: null });

describe('live room', () => {
  it('a signed-in player who was away at the start and comes back on another device is in the game', () => {
    const room = makeRoom();
    const first = room.join({ name: 'Kai', ...account('u-kai') });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const other = room.join({ name: 'Mia', userId: null, accountName: null, isGuestAccount: true, avatar: null });
    expect(other.ok).toBe(true);
    // Kai's phone drops out in the lobby, so the game starts without him.
    const kaiSub = sub('player', first.player.id);
    room.subscribe(kaiSub);
    room.unsubscribe(kaiSub.id);
    expect(room.hostCommand({ cmd: 'start' }).ok).toBe(true);
    expect(room.runtime!.hasPlayer(first.player.id)).toBe(false);
    // He signs in on a laptop, with no reconnect token, and takes over his own slot.
    const back = room.join({ name: 'Kai', ...account('u-kai') });
    expect(back.ok && back.resumed).toBe(true);
    expect(room.runtime!.hasPlayer(first.player.id)).toBe(true);
    expect(room.players.get(first.player.id)!.connected).toBe(true);
  });

  it('a host-paced game paused because the host dropped out carries on when the host is back', () => {
    const room = makeRoom();
    const p = room.join({ name: 'Mia', userId: null, accountName: null, isGuestAccount: true, avatar: null });
    expect(p.ok).toBe(true);
    const host = sub('host', null);
    room.subscribe(host);
    expect(room.hostCommand({ cmd: 'start' }).ok).toBe(true);
    // The host reloads the page: the old connection goes, then a new one arrives.
    room.unsubscribe(host.id);
    expect(room.status).toBe('paused');
    room.subscribe(sub('host', null, 'host-2'));
    expect(room.status).toBe('running');
    expect(room.runtime!.status).toBe('running');
  });

  it('a game the host paused on purpose stays paused when the host reconnects', () => {
    const room = makeRoom();
    room.join({ name: 'Mia', userId: null, accountName: null, isGuestAccount: true, avatar: null });
    const host = sub('host', null);
    room.subscribe(host);
    room.hostCommand({ cmd: 'start' });
    expect(room.hostCommand({ cmd: 'pause' }).ok).toBe(true);
    room.unsubscribe(host.id);
    room.subscribe(sub('host', null, 'host-2'));
    expect(room.status).toBe('paused');
  });

  it('practice bots get different animals while there are animals to spare', () => {
    const room = makeRoom();
    for (let i = 0; i < 7; i++) expect(room.hostCommand({ cmd: 'addBots', count: 3 }).ok).toBe(true);
    const bots = [...room.players.values()].filter((p) => p.isBot).map((p) => p.name);
    expect(bots).toHaveLength(20);
    expect(bots.filter((n) => / \d+$/.test(n))).toEqual([]);
    expect(new Set(bots).size).toBe(20);
  });
});
