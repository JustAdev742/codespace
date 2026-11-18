import { describe, expect, it } from 'vitest';
import { ILLEGAL_MOVES_COUNT, IntegrityWatch, ONE_DEVICE_PLAYERS, REJECTION_WEIGHT, TOO_FAST_COUNT, TOO_FAST_MS, integrityEvent } from '../src/realtime/integrity.ts';

/*
 * The integrity detector on its own (no room, sockets or database): what it is told, what it
 * reports, and the line the server writes for a signal.
 */

/** `n` answers from one player, each `ms` after its question opened. Returns the signals. */
function answers(w: IntegrityWatch, playerId: string, n: number, ms: number, correct = true) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(w.answered(playerId, 1000 * i, 1000 * i + ms, correct));
  return out.filter(Boolean);
}

describe('answers faster than a person can read', () => {
  it('reports the right answers under the floor once there are enough of them, and only once', () => {
    const w = new IntegrityWatch();
    expect(answers(w, 'p1', TOO_FAST_COUNT - 1, 80)).toEqual([]);
    expect(w.answered('p1', 5000, 5080, true)).toEqual({ kind: 'too_fast', playerId: 'p1', count: TOO_FAST_COUNT });
    expect(answers(w, 'p1', 20, 80)).toEqual([]);
  });

  it('does not count an answer at the floor or slower, however many there are', () => {
    const w = new IntegrityWatch();
    expect(answers(w, 'p1', 50, TOO_FAST_MS)).toEqual([]);
    expect(answers(w, 'p1', 50, 900)).toEqual([]);
    // One millisecond under the floor counts.
    expect(answers(w, 'p1', TOO_FAST_COUNT, TOO_FAST_MS - 1)).toHaveLength(1);
  });

  it('counts each player on their own', () => {
    const w = new IntegrityWatch();
    answers(w, 'p1', TOO_FAST_COUNT - 1, 50);
    expect(answers(w, 'p2', TOO_FAST_COUNT - 1, 50)).toEqual([]);
    expect(w.answered('p2', 0, 50, true)).toMatchObject({ playerId: 'p2' });
    expect(w.answered('p1', 0, 50, true)).toMatchObject({ playerId: 'p1' });
  });

  it('does not report fast wrong answers, or a player whose fast answers are right only by chance', () => {
    const wrong = new IntegrityWatch();
    expect(answers(wrong, 'p1', 40, 50, false)).toEqual([]);
    // A key held down on true-or-false questions: as fast as a program, right about half the time.
    const held = new IntegrityWatch();
    const signals = [];
    for (let i = 0; i < 40; i++) signals.push(held.answered('p1', 0, 60, i % 2 === 0));
    expect(signals.filter(Boolean)).toEqual([]);
  });

  it('still reports a program that gets one wrong now and then', () => {
    const w = new IntegrityWatch();
    expect(w.answered('p1', 0, 40, false)).toBeNull();
    // One wrong among the first few holds it back until the right ones are at least nine in ten.
    expect(answers(w, 'p1', 8, 40)).toEqual([]);
    expect(w.answered('p1', 0, 40, true)).toEqual({ kind: 'too_fast', playerId: 'p1', count: 9 });
  });

  it('ignores an answer timed before its question opened', () => {
    const w = new IntegrityWatch();
    for (let i = 0; i < 20; i++) expect(w.answered('p1', 5000, 4000, true)).toBeNull();
  });
});

describe('moves the game does not allow', () => {
  it('reports malformed messages past the threshold, once', () => {
    const w = new IntegrityWatch();
    for (let i = 1; i < ILLEGAL_MOVES_COUNT; i++) expect(w.rejected('p1', 'malformed')).toBeNull();
    expect(w.rejected('p1', 'malformed')).toEqual({ kind: 'illegal_moves', playerId: 'p1', count: ILLEGAL_MOVES_COUNT });
    for (let i = 0; i < 50; i++) expect(w.rejected('p1', 'malformed')).toBeNull();
  });

  it('counts a host command from a player with them', () => {
    const w = new IntegrityWatch();
    for (let i = 0; i < ILLEGAL_MOVES_COUNT - 2; i++) w.rejected('p1', 'malformed');
    expect(w.rejected('p1', 'host_command')).toBeNull();
    expect(w.rejected('p1', 'host_command')).toMatchObject({ kind: 'illegal_moves', count: ILLEGAL_MOVES_COUNT });
  });

  it('never counts a move the game refused: a double tap, a late answer, a move while paused', () => {
    expect(REJECTION_WEIGHT.refused).toBe(0);
    const w = new IntegrityWatch();
    for (let i = 0; i < 500; i++) expect(w.rejected('p1', 'refused')).toBeNull();
    // And they do not bring a later count forward.
    for (let i = 1; i < ILLEGAL_MOVES_COUNT; i++) expect(w.rejected('p1', 'malformed')).toBeNull();
    expect(w.rejected('p1', 'malformed')).not.toBeNull();
  });

  it('counts each player on their own', () => {
    const w = new IntegrityWatch();
    for (let i = 1; i < ILLEGAL_MOVES_COUNT; i++) w.rejected('p1', 'malformed');
    for (let i = 1; i < ILLEGAL_MOVES_COUNT; i++) expect(w.rejected('p2', 'malformed')).toBeNull();
  });
});

describe('one device playing as many players', () => {
  it('reports a device once it holds enough connected players, naming the oldest seat', () => {
    const w = new IntegrityWatch();
    expect(w.sameDevice('d1', ['p1'])).toBeNull();
    expect(w.sameDevice('d1', ['p1', 'p2'].slice(0, ONE_DEVICE_PLAYERS - 1))).toBeNull();
    expect(w.sameDevice('d1', ['p1', 'p2', 'p3'])).toEqual({ kind: 'one_device_many_players', playerId: 'p1', count: 3, others: ['p2', 'p3'] });
  });

  it('reports each device once a game, however it grows, and other devices on their own', () => {
    const w = new IntegrityWatch();
    expect(w.sameDevice('d1', ['p1', 'p2', 'p3'])).not.toBeNull();
    expect(w.sameDevice('d1', ['p1', 'p2', 'p3', 'p4'])).toBeNull();
    expect(w.sameDevice('d1', ['p2', 'p3', 'p4'])).toBeNull();
    expect(w.sameDevice('d2', ['p7', 'p8', 'p9'])).toMatchObject({ playerId: 'p7', count: 3 });
  });
});

describe('one watch is one game', () => {
  it('a new watch starts from nothing', () => {
    const first = new IntegrityWatch();
    answers(first, 'p1', TOO_FAST_COUNT - 1, 50);
    for (let i = 1; i < ILLEGAL_MOVES_COUNT; i++) first.rejected('p1', 'malformed');
    const next = new IntegrityWatch();
    expect(next.answered('p1', 0, 50, true)).toBeNull();
    expect(next.rejected('p1', 'malformed')).toBeNull();
  });

  it('a signal of one kind does not use up another', () => {
    const w = new IntegrityWatch();
    expect(answers(w, 'p1', TOO_FAST_COUNT, 50)).toHaveLength(1);
    for (let i = 1; i < ILLEGAL_MOVES_COUNT; i++) w.rejected('p1', 'malformed');
    expect(w.rejected('p1', 'malformed')).toMatchObject({ kind: 'illegal_moves' });
    expect(w.sameDevice('p1', ['p1', 'p2', 'p3'])).toMatchObject({ kind: 'one_device_many_players' });
  });
});

describe('the log line', () => {
  const at = Date.UTC(2026, 10, 18, 9, 30, 5, 120);

  it('has exactly the fields the alert reader parses, for each kind', () => {
    expect(integrityEvent({ kind: 'too_fast', room: '482913', mode: 'classic', player: 'Sam R', count: 5, at })).toEqual({
      ludora_event: 'integrity',
      kind: 'too_fast',
      room: '482913',
      mode: 'classic',
      player: 'Sam R',
      count: 5,
      detail: 'Sam R gave 5 right answers, each less than a quarter of a second after the question appeared.',
      at: '2026-11-18T09:30:05.120Z',
    });
    expect(integrityEvent({ kind: 'illegal_moves', room: '482913', mode: 'gold-rush', player: 'Sam R', count: 5, at })).toEqual({
      ludora_event: 'integrity',
      kind: 'illegal_moves',
      room: '482913',
      mode: 'gold-rush',
      player: 'Sam R',
      count: 5,
      detail: "Sam R's device sent 5 messages that the game's own screens never send.",
      at: '2026-11-18T09:30:05.120Z',
    });
    expect(integrityEvent({ kind: 'one_device_many_players', room: '482913', mode: 'classic', player: 'Sam R', count: 3, others: ['Sam 2', 'Kit'], at: new Date(at) })).toEqual({
      ludora_event: 'integrity',
      kind: 'one_device_many_players',
      room: '482913',
      mode: 'classic',
      player: 'Sam R',
      count: 3,
      detail: '3 players are connected from one browser at the same time: Sam R, Sam 2 and Kit.',
      at: '2026-11-18T09:30:05.120Z',
    });
  });

  it('is one JSON line with a whole-number count and nothing that identifies a device or account', () => {
    const e = integrityEvent({ kind: 'too_fast', room: '482913', mode: 'classic', player: 'Sam R', count: 5, at });
    expect(Object.keys(e)).toEqual(['ludora_event', 'kind', 'room', 'mode', 'player', 'count', 'detail', 'at']);
    expect(Number.isInteger(e.count)).toBe(true);
    expect(JSON.stringify(e)).not.toContain('\n');
    expect(JSON.parse(JSON.stringify(e))).toEqual(e);
  });
});
