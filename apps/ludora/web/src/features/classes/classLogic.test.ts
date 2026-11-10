import { describe, expect, it } from 'vitest';
import { csvCells, makeTeams, monthGrid, parseNames, pickNext, studentWork } from './classLogic.ts';

describe('roster import', () => {
  it('reads one name per line', () => {
    expect(parseNames('Amira\n\n  Ben \r\nChloé\n')).toEqual(['Amira', 'Ben', 'Chloé']);
  });
  it('reads the first-name column of a school export', () => {
    expect(parseNames('﻿Surname,First name,Year\nSmith,Jo,5\n"O\'Neil, Jr",Sam,5\n')).toEqual(['Jo', 'Sam']);
  });
  it('keeps the first word of a full name column', () => {
    expect(parseNames('Name;Class\nAva Patel;5B\n"Lee, Kai";5B')).toEqual(['Ava', 'Kai']);
  });
  it('treats a CSV with no header as names in the first column', () => {
    expect(parseNames('Mia Jones,5\nNoah,5')).toEqual(['Mia', 'Noah']);
  });
  it('splits quoted cells', () => {
    expect(csvCells('"a, b",c,"say ""hi"""')).toEqual(['a, b', 'c', 'say "hi"']);
  });
});

describe('fair picker', () => {
  it('picks everyone once before anyone twice, and never the same person twice in a row', () => {
    const everyone = ['a', 'b', 'c', 'd'];
    let pool: string[] = [];
    let last: string | null = null;
    const seen: string[] = [];
    for (let i = 0; i < 400; i++) {
      const r = pickNext(pool, everyone, last);
      expect(r.picked).not.toBe(last);
      seen.push(r.picked!);
      pool = r.pool;
      last = r.picked;
    }
    // The first round is everyone exactly once.
    expect(new Set(seen.slice(0, 4)).size).toBe(4);
    // Every round of four is everyone once, so over 400 picks each person is picked 100 times.
    for (let r = 0; r < 100; r++) expect(new Set(seen.slice(r * 4, r * 4 + 4)).size).toBe(4);
    expect(everyone.map((id) => seen.filter((s) => s === id).length)).toEqual([100, 100, 100, 100]);
  });
  it('copes with an empty class and with one student', () => {
    expect(pickNext([], [], null).picked).toBeNull();
    expect(pickNext([], ['a'], 'a').picked).toBe('a');
  });
});

describe('team maker', () => {
  it('makes even teams', () => {
    const teams = makeTeams(
      Array.from({ length: 11 }, (_, i) => i),
      3,
    );
    expect(teams.map((t) => t.length).sort()).toEqual([3, 4, 4]);
    expect(teams.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 11 }, (_, i) => i));
  });
  it('never makes more teams than people', () => {
    expect(makeTeams(['a', 'b'], 5)).toHaveLength(2);
  });
});

describe('calendar and status', () => {
  it('lays a month out in whole weeks starting on Monday', () => {
    const weeks = monthGrid(2026, 1); // February 2026 starts on a Sunday
    expect(weeks[0]![0]!.key).toBe('2026-01-26');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(28);
  });
  it('says where a student stands with an assignment', () => {
    const now = Date.parse('2026-03-04T12:00:00Z');
    const base = {
      dueAt: null,
      closesAt: null,
      blocked: null,
      mine: null,
      maxAttempts: null,
    };
    expect(studentWork(base, now)).toBe('todo');
    expect(studentWork({ ...base, dueAt: '2026-03-05T09:00:00Z' }, now)).toBe('dueSoon');
    expect(studentWork({ ...base, dueAt: '2026-03-03T09:00:00Z' }, now)).toBe('overdue');
    expect(studentWork({ ...base, mine: { plays: 1 } }, now)).toBe('done');
    expect(studentWork({ ...base, mine: { plays: 1 }, maxAttempts: 1 }, now)).toBe('used');
    expect(studentWork({ ...base, closesAt: '2026-03-04T00:00:00Z' }, now)).toBe('closed');
  });
});
