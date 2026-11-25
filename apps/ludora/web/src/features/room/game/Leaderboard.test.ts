import { describe, expect, it } from 'vitest';
import { placesClimbed, standingLine, type LeaderRow } from './Leaderboard.tsx';

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

describe('where a player stands, in words', () => {
  const rows = [row('a', 1, 3010), row('b', 2, 1980), row('c', 3, 1850), row('d', 4, 900), row('e', 5, 900)];

  it('tells the leader how far ahead they are', () => {
    expect(standingLine(rows, rows[0]!)).toBe('1,030 ahead of 2nd.');
  });

  it('tells everyone else how many points would reach the next place up', () => {
    expect(standingLine(rows, rows[1]!)).toBe('1,030 more to reach 1st.');
    expect(standingLine(rows, rows[2]!)).toBe('130 more to reach 2nd.');
    // Two players level in fourth: the next place up is third for both.
    expect(standingLine(rows, rows[3]!)).toBe('950 more to reach 3rd.');
    expect(standingLine(rows, rows[4]!)).toBe('950 more to reach 3rd.');
  });

  it('tells a player below the rows shown how to get onto them', () => {
    expect(standingLine(rows, row('z', 9, 400))).toBe('500 more to reach the top 5.');
  });

  it('says nothing when there is nothing true to say', () => {
    expect(standingLine(rows, null)).toBeNull();
    expect(standingLine([row('a', 1, 500)], row('a', 1, 500))).toBeNull();
    // Level at the top: nobody is ahead.
    const level = [row('a', 1, 500), row('b', 1, 500)];
    expect(standingLine(level, level[0]!)).toBeNull();
    expect(standingLine(level, level[1]!)).toBeNull();
  });
});
