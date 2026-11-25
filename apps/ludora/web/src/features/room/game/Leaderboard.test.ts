import { describe, expect, it } from 'vitest';
import { placesClimbed, type LeaderRow } from './Leaderboard.tsx';

const row = (playerId: string, rank: number, score: number, gain = 0): LeaderRow => ({ playerId, name: playerId, rank, score, gain, teamId: null });

describe('the leaderboard between rounds', () => {
  it('counts the places a player climbed from last round\'s totals', () => {
    // Before: a 1,000, b 900, c 500. This round c gained 1,000 and went top.
    const rows = [row('c', 1, 1500, 1000), row('a', 2, 1000), row('b', 3, 900)];
    expect(placesClimbed(rows[0]!, rows)).toBe(2);
    expect(placesClimbed(rows[1]!, rows)).toBe(0);
    expect(placesClimbed(rows[2]!, rows)).toBe(0);
  });

  it('says nothing of a player who scored but held their place, or slipped', () => {
    // Before: a 1,000, b 900. Both scored; b gained less and stayed second.
    const held = [row('a', 1, 1900, 900), row('b', 2, 1400, 500)];
    expect(placesClimbed(held[0]!, held)).toBe(0);
    expect(placesClimbed(held[1]!, held)).toBe(0);
    // Before: a 1,000, b 990, c 0. a gained 10 and was passed by b: no climb for a, one for b.
    const passed = [row('b', 1, 1990, 1000), row('a', 2, 1010, 10), row('c', 3, 0)];
    expect(placesClimbed(passed[1]!, passed)).toBe(0);
    expect(placesClimbed(passed[0]!, passed)).toBe(1);
  });

  it('treats a first round, with everyone level before it, as no climb for the leader', () => {
    const first = [row('a', 1, 950, 950), row('b', 2, 900, 900), row('c', 3, 0)];
    expect(placesClimbed(first[0]!, first)).toBe(0);
    expect(placesClimbed(first[1]!, first)).toBe(0);
  });
});
