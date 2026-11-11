import { describe, expect, it } from 'vitest';
import { advanceKnockout, cappedPoints, classAccuracy, cupWinners, joinNames, knockoutBracket, rankTotals, roundRobin, roundRobinTable, schoolDay, schoolWeekday, tournamentWinner, weekStartDay } from '../src/modules/school/logic.ts';

describe('house points', () => {
  it('caps a day’s points per student', () => {
    expect(cappedPoints(6, 1, 0, 20)).toBe(6);
    expect(cappedPoints(30, 1, 6, 20)).toBe(14);
    expect(cappedPoints(5, 2, 20, 20)).toBe(0);
    expect(cappedPoints(-3, 1, 0, 20)).toBe(0);
  });

  it('ranks ties together and names joint winners', () => {
    const ranked = rankTotals([{ id: 'a', points: 5 }, { id: 'b', points: 9 }, { id: 'c', points: 5 }]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([['b', 1], ['a', 2], ['c', 2]]);
    expect(cupWinners([{ id: 'a', points: 0 }])).toEqual([]);
    expect(cupWinners([{ id: 'a', points: 4 }, { id: 'b', points: 4 }]).map((w) => w.id)).toEqual(['a', 'b']);
    expect(joinNames(['Ash', 'Oak', 'Elm'])).toBe('Ash, Oak and Elm');
  });

  it('follows the school’s own calendar', () => {
    const at = new Date('2027-03-01T15:00:00Z'); // Tuesday 2 March, 2am, in Sydney
    expect(schoolDay(at, 'Australia/Sydney')).toBe('2027-03-02');
    expect(schoolDay(at, 'Europe/London')).toBe('2027-03-01');
    expect(schoolWeekday(at, 'Australia/Sydney')).toBe(2);
    expect(weekStartDay('2027-03-07')).toBe('2027-03-01');
  });
});

describe('tournaments', () => {
  it('gives byes to the top seeds and never pairs two byes', () => {
    for (let n = 2; n <= 16; n++) {
      const b = knockoutBracket(n);
      const first = b.filter((m) => m.round === 1);
      expect(first.every((m) => m.a !== null || m.b !== null)).toBe(true);
      const entered = new Set(first.flatMap((m) => [m.a, m.b]).filter((x) => x !== null));
      expect(entered.size).toBe(n);
    }
    const five = knockoutBracket(5);
    const round2 = five.filter((m) => m.round === 2);
    expect(round2.flatMap((m) => [m.a, m.b]).filter((x) => x !== null).sort()).toEqual([0, 1, 2]);
  });

  it('carries winners to the final and names the champion', () => {
    let b = knockoutBracket(4);
    b = b.map((m) => (m.round === 1 ? { ...m, winner: m.a } : m));
    b = advanceKnockout(b);
    const final = b.find((m) => m.round === 2)!;
    expect([final.a, final.b].sort()).toEqual([0, 1]);
    expect(tournamentWinner('knockout', 4, b)).toBeNull();
    b = b.map((m) => (m.round === 2 ? { ...m, winner: 1 } : m));
    expect(tournamentWinner('knockout', 4, b)).toEqual([1]);
  });

  it('plays every pair once in a round robin, nobody twice in a round', () => {
    for (const n of [3, 4, 5, 8]) {
      const rr = roundRobin(n);
      expect(rr).toHaveLength((n * (n - 1)) / 2);
      expect(new Set(rr.map((m) => `${m.a}-${m.b}`)).size).toBe(rr.length);
      for (const r of new Set(rr.map((m) => m.round))) {
        const ids = rr.filter((m) => m.round === r).flatMap((m) => [m.a, m.b]);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
    const rr = roundRobin(3).map((m) => ({ ...m, winner: m.a === 0 || m.b === 0 ? 0 : -1 }));
    expect(roundRobinTable(3, rr)[0]).toMatchObject({ entrant: 0, won: 2, points: 6 });
    expect(tournamentWinner('round_robin', 3, rr)).toEqual([0]);
  });
});

describe('class challenges', () => {
  it('compares the mean of each student’s best accuracy, so class size does not matter', () => {
    const small = classAccuracy([{ userId: 'a', correct: 8, answered: 10 }, { userId: 'a', correct: 4, answered: 10 }]);
    expect(small).toEqual({ students: 1, accuracy: 0.8 });
    const big = classAccuracy([
      { userId: 'a', correct: 10, answered: 10 },
      { userId: 'b', correct: 5, answered: 10 },
      { userId: 'c', correct: 0, answered: 0 },
    ]);
    expect(big).toEqual({ students: 2, accuracy: 0.75 });
    expect(classAccuracy([]).accuracy).toBeNull();
  });
});
