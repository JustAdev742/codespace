import { describe, expect, it } from 'vitest';
import type { RoomView } from '@ludora/shared';
import { FANFARE_LEAD_MS, ceremonyFor, ceremonyPace, endingKey, fanfareStarted, hasFanfareStarted, overStage, placeLands, sinceEnd, stageAt, winnerLands } from './ceremony.ts';
import { roomMusic } from './music.ts';

const standing = (playerId: string, rank: number) => ({ playerId, name: playerId, rank, score: 100 - rank, label: '', teamId: null, correct: 0, answered: 0 });
function ended(players: number, extra: Partial<NonNullable<RoomView['results']>> = {}, solo = false) {
  const results = { gameId: null, standings: Array.from({ length: players }, (_, i) => standing(`p${i}`, i + 1)), teamStandings: [], outcome: 'competitive', summary: '', durationMs: 60_000, ...extra };
  return { serverNow: 50_000, room: { code: '123456', solo, status: 'ended', modeId: 'classic', options: {} }, results } as unknown as RoomView;
}

describe('the podium ceremony', () => {
  it('reveals a room\'s podium from third place to the winner, a breath apart, in about seven seconds', () => {
    const c = ceremonyFor(3, 'show');
    expect(c.beats.map((b) => b.place)).toEqual([2, 1, 0]);
    // Each place is named (its block rises) before its player lands, and each lands before the next is named.
    for (const [i, b] of c.beats.entries()) {
      expect(b.land).toBeGreaterThan(b.rise);
      if (i > 0) expect(b.rise).toBeGreaterThan(c.beats[i - 1]!.land + 1000);
    }
    // The winner is held longest, and rises slowest.
    const [third, second, winner] = c.beats as [(typeof c.beats)[0], (typeof c.beats)[0], (typeof c.beats)[0]];
    expect(winner.land - winner.rise).toBeGreaterThan(second.land - second.rise);
    expect(winner.riseMs).toBeGreaterThan(third.riseMs);
    expect(winnerLands(c)).toBe(winner.land);
    // The fanfare's drum roll fits before the winner lands, and the rest waits for the fanfare's chord.
    expect(winner.land - FANFARE_LEAD_MS).toBeGreaterThan(second.land);
    expect(c.done).toBeGreaterThan(winner.land + 1000);
    expect(c.done).toBeGreaterThanOrEqual(6000);
    expect(c.done).toBeLessThanOrEqual(8000);
  });

  it('is shorter for two players, and still ends on the winner', () => {
    const two = ceremonyFor(2, 'show');
    expect(two.beats.map((b) => b.place)).toEqual([1, 0]);
    expect(two.done).toBeLessThan(ceremonyFor(3, 'show').done);
    expect(ceremonyFor(7, 'show').beats).toHaveLength(3);
    expect(ceremonyFor(1, 'show').beats.map((b) => b.place)).toEqual([0]);
  });

  it('keeps a solo game\'s reveal to about a second and a half', () => {
    const c = ceremonyFor(3, 'brisk');
    expect(c.beats.map((b) => b.place)).toEqual([2, 1, 0]);
    expect(c.done).toBeLessThan(1600);
    expect(c.beats.map((b) => b.rise)).toEqual([150, 500, 900]);
  });

  it('says where it has got to at any moment, so a screen that opens late joins part-way', () => {
    const c = ceremonyFor(3, 'show');
    expect(stageAt(c, 0)).toEqual({ risen: 0, landed: 0, done: false });
    expect(stageAt(c, c.beats[0]!.rise)).toEqual({ risen: 1, landed: 0, done: false });
    expect(stageAt(c, c.beats[0]!.land)).toEqual({ risen: 1, landed: 1, done: false });
    expect(stageAt(c, c.beats[2]!.rise + 10)).toEqual({ risen: 3, landed: 2, done: false });
    expect(stageAt(c, winnerLands(c))).toEqual({ risen: 3, landed: 3, done: false });
    expect(stageAt(c, c.done)).toEqual({ risen: 3, landed: 3, done: true });
    expect(overStage(c)).toEqual({ risen: 3, landed: 3, done: true });
    expect(overStage(null)).toEqual({ risen: 0, landed: 0, done: true });
  });

  it('knows when a player\'s own place lands, and that fourth is not on the podium', () => {
    const c = ceremonyFor(3, 'show');
    expect(placeLands(c, 2)).toBe(c.beats[0]!.land);
    expect(placeLands(c, 0)).toBe(winnerLands(c));
    expect(placeLands(c, 3)).toBeNull();
    expect(placeLands(ceremonyFor(2, 'show'), 2)).toBeNull();
  });

  it('gives a room the ceremony, a solo game the quick reveal, and co-op games, lone players and modes with their own ending neither', () => {
    expect(ceremonyPace(ended(5))).toBe('show');
    expect(ceremonyPace(ended(2))).toBe('show');
    expect(ceremonyPace(ended(4, {}, true))).toBe('brisk');
    expect(ceremonyPace(ended(1))).toBeNull();
    expect(ceremonyPace(ended(5, { outcome: 'coop-win' }))).toBeNull();
    expect(ceremonyPace(ended(5, { outcome: 'coop-loss' }))).toBeNull();
    expect(ceremonyPace(ended(5), true)).toBeNull();
    expect(ceremonyPace({ room: { solo: false }, results: null })).toBeNull();
  });

  it('times itself from the server\'s clock, whatever this device\'s clock says', () => {
    // The view said "it is 50,000 on the server" and arrived when this device's clock read 1,000,000.
    const room = ended(3, { endedAt: 48_000 });
    expect(sinceEnd(room, 1_000_000, 1_000_000)).toBe(2000);
    expect(sinceEnd(room, 1_000_000, 1_003_000)).toBe(5000);
    // A server that does not say when the game ended: the ceremony starts as the screen opens.
    expect(sinceEnd(ended(3), 1_000_000, 1_003_000)).toBe(0);
    // Never negative, should the clocks disagree by a hair.
    expect(sinceEnd(ended(3, { endedAt: 50_500 }), 1_000_000, 1_000_000)).toBe(0);
  });

  it('holds the results music until the fanfare, which the big screen keeps for the winner', () => {
    const room = ended(3, { endedAt: 48_000 });
    expect(roomMusic(room, 'host', false, true)).toBeNull();
    expect(roomMusic(room, 'host', false, false)).toBe('results');
    expect(roomMusic(room, 'player', false, true)).toBeNull();
    const key = endingKey(room);
    expect(key).toBe('123456|48000');
    expect(hasFanfareStarted(key)).toBe(false);
    fanfareStarted(key);
    expect(hasFanfareStarted(key)).toBe(true);
    // Another game in the same room is another ending.
    expect(hasFanfareStarted(endingKey(ended(3, { endedAt: 99_000 })))).toBe(false);
  });
});
