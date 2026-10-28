import { describe, expect, it } from 'vitest';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';

/*
 * Exact behaviour of the lantern-match cheats. Every bot is idle, so boards
 * only change when a test flips cards. Boards have 4 pairs (8 cards).
 */

interface Card {
  qid: string;
  side: 'question' | 'answer';
}

function game(settings: Record<string, unknown> = {}, seed = 41) {
  const sim = new ChaosSim({ modeId: 'lantern-match', questions: MIXED_SET, players: 4, seed, settings: { pairs: 4, ...settings } });
  for (const id of sim.ids) sim.idle.add(id);
  sim.run(1000);
  return sim;
}

const pl = (sim: ChaosSim, id: string) => sim.state().players[id];
const board = (sim: ChaosSim, id: string) => pl(sim, id).board as { cards: Card[]; matched: boolean[]; up: number[]; no: number };

function partner(sim: ChaosSim, id: string, i: number): number {
  const cards = board(sim, id).cards;
  return cards.findIndex((c, k) => k !== i && c.qid === cards[i]!.qid && c.side !== cards[i]!.side);
}

/** The first unmatched pair on a board, skipping cards in `avoid`. */
function openPair(sim: ChaosSim, id: string, avoid: number[] = []): [number, number] {
  const b = board(sim, id);
  const i = b.cards.findIndex((c, k) => c.side === 'question' && !b.matched[k] && !avoid.includes(k) && !avoid.includes(partner(sim, id, k)));
  return [i, partner(sim, id, i)];
}

function flip(sim: ChaosSim, id: string, index: number) {
  return sim.rt.act(id, { type: 'flip', index });
}

function match(sim: ChaosSim, id: string) {
  const [i, j] = openPair(sim, id);
  expect(flip(sim, id, i).ok).toBe(true);
  expect(flip(sim, id, j).ok).toBe(true);
}

/** Turn over a question card and an answer card that do not belong together. */
function miss(sim: ChaosSim, id: string): [number, number] {
  const b = board(sim, id);
  const i = b.cards.findIndex((c, k) => c.side === 'question' && !b.matched[k]);
  const j = b.cards.findIndex((c, k) => c.side === 'answer' && !b.matched[k] && c.qid !== b.cards[i]!.qid);
  expect(flip(sim, id, i).ok).toBe(true);
  expect(flip(sim, id, j).ok).toBe(true);
  return [i, j];
}

function cast(sim: ChaosSim, caster: string, cheatId: string, target?: string, params?: Record<string, unknown>) {
  return sim.cast(caster, { cheatId: `lantern-match.${cheatId}`, target: target ?? null, ...(params ? { params } : {}) });
}

const matchedCount = (sim: ChaosSim, id: string) => board(sim, id).matched.filter(Boolean).length;

describe('lantern-match pack: boards', () => {
  it('Lantern Guide matches one pair and never the last pair of a board', () => {
    const sim = game();
    match(sim, 'p1');
    expect(cast(sim, 'p1', 'guide').ok).toBe(true);
    expect(pl(sim, 'p1').pairs).toBe(2);
    expect(matchedCount(sim, 'p1')).toBe(4);
    match(sim, 'p1');
    expect(matchedCount(sim, 'p1')).toBe(6);
    sim.run(46_000);
    expect(cast(sim, 'p1', 'guide')).toMatchObject({ ok: false });
    expect(board(sim, 'p1').no).toBe(1);
  });

  it('Lantern Guide leaves the card the player has turned over alone', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = game({}, seed);
      const [i] = openPair(sim, 'p1');
      flip(sim, 'p1', i);
      expect(cast(sim, 'p1', 'guide').ok).toBe(true);
      const b = board(sim, 'p1');
      expect(b.up).toEqual([i]);
      expect(b.matched[i]).toBe(false);
      expect(b.matched[partner(sim, 'p1', i)]).toBe(false);
    }
  });

  it('Lantern Whirlwind moves only face-down cards', () => {
    const sim = game();
    match(sim, 'p2');
    const [first] = openPair(sim, 'p2');
    flip(sim, 'p2', first);
    const before = board(sim, 'p2');
    expect(cast(sim, 'p1', 'whirlwind', 'p2').ok).toBe(true);
    const after = board(sim, 'p2');
    after.cards.forEach((c, k) => {
      if (before.matched[k] || k === first) expect(c).toEqual(before.cards[k]);
    });
    expect(after.cards).not.toEqual(before.cards);
    expect([...after.cards].sort((a, b) => (a.qid + a.side).localeCompare(b.qid + b.side))).toEqual([...before.cards].sort((a, b) => (a.qid + a.side).localeCompare(b.qid + b.side)));
  });

  it('Lantern Gust turns a matched pair face down and takes the pair away', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'gust', 'p2')).toMatchObject({ ok: false });
    match(sim, 'p2');
    expect(cast(sim, 'p1', 'gust', 'p2').ok).toBe(true);
    expect(pl(sim, 'p2').pairs).toBe(0);
    expect(matchedCount(sim, 'p2')).toBe(0);
    expect(pl(sim, 'p2').lastPair).toBe(null);
  });

  it('Lantern Board Swap exchanges boards and keeps pairs with their finders', () => {
    const sim = game();
    match(sim, 'p2');
    const mine = board(sim, 'p1');
    const theirs = board(sim, 'p2');
    expect(cast(sim, 'p1', 'board-swap', 'p2').ok).toBe(true);
    expect(board(sim, 'p1')).toEqual(theirs);
    expect(board(sim, 'p2')).toEqual(mine);
    expect([pl(sim, 'p1').pairs, pl(sim, 'p2').pairs]).toEqual([0, 1]);
  });

  it('Extra Moonlight adds 20 seconds', () => {
    const sim = game();
    const end = sim.state().endsAt;
    expect(cast(sim, 'p1', 'extra-moonlight').ok).toBe(true);
    expect(sim.state().endsAt).toBe(end + 20_000);
  });

  it('Lantern Lottery always lands one of its outcomes', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const sim = game({}, seed);
      const before = JSON.stringify(sim.state().players);
      expect(cast(sim, 'p1', 'lottery').ok).toBe(true);
      expect(JSON.stringify(sim.state().players)).not.toBe(before);
    }
  });
});

describe('lantern-match pack: misses', () => {
  it('Clean Lantern Slate wipes misses; Lantern Ink Blot adds three', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'clean-slate')).toMatchObject({ ok: false });
    miss(sim, 'p1');
    expect(cast(sim, 'p1', 'clean-slate').ok).toBe(true);
    expect(pl(sim, 'p1').misses).toBe(0);
    expect(cast(sim, 'p1', 'ink-blot', 'p2').ok).toBe(true);
    expect(pl(sim, 'p2').misses).toBe(3);
  });

  it('Firefly Guide turns the next miss into a match of the first card', () => {
    const sim = game();
    cast(sim, 'p1', 'firefly');
    const [first] = miss(sim, 'p1');
    const p = pl(sim, 'p1');
    expect(p).toMatchObject({ pairs: 1, misses: 0, lastPair: [first, partner(sim, 'p1', first)] });
    expect(p.board.up).toEqual([]);
    expect(p.board.matched[first]).toBe(true);
    // Used up: the next miss counts.
    miss(sim, 'p1');
    expect(pl(sim, 'p1').misses).toBe(1);
  });

  it('Firefly Guide gives back a pair Careful Match took for the miss it corrected', () => {
    const sim = game({ missCost: 1 });
    match(sim, 'p1');
    cast(sim, 'p1', 'firefly');
    miss(sim, 'p1');
    expect(pl(sim, 'p1')).toMatchObject({ pairs: 2, misses: 0, lost: 0 });
  });

  it('Careless Lantern Curse makes each miss cost a pair, when there is one', () => {
    const sim = game();
    cast(sim, 'p1', 'careless-curse', 'p2');
    miss(sim, 'p2');
    expect(pl(sim, 'p2')).toMatchObject({ pairs: 0, misses: 1, lost: 0 });
    match(sim, 'p2');
    miss(sim, 'p2');
    expect(pl(sim, 'p2')).toMatchObject({ pairs: 0, misses: 2, lost: 1 });
  });

  it('Copycat Glim matches a pair on your board each time the copied player matches', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'copycat', undefined, { rival: 'p2' }).ok).toBe(true);
    match(sim, 'p2');
    expect(pl(sim, 'p1').pairs).toBe(1);
    miss(sim, 'p2');
    expect(pl(sim, 'p1').pairs).toBe(1);
  });
});

describe('lantern-match pack: flipping', () => {
  it('Lanterns Out refuses every flip for 8 seconds', () => {
    const sim = game();
    cast(sim, 'p1', 'lights-out', 'p2');
    expect(flip(sim, 'p2', 0)).toMatchObject({ ok: false });
    sim.run(8_500);
    expect(flip(sim, 'p2', 0).ok).toBe(true);
  });

  it('Heavy Lanterns allows one flip every 2 seconds', () => {
    const sim = game();
    cast(sim, 'p1', 'heavy-lanterns', 'p2');
    expect(flip(sim, 'p2', 0).ok).toBe(true);
    expect(flip(sim, 'p2', 1)).toMatchObject({ ok: false });
    sim.run(2_000);
    expect(flip(sim, 'p2', 1).ok).toBe(true);
  });

  it('Last Lantern Lock blocks only the flip that would clear the board', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'last-lantern-lock', 'p2')).toMatchObject({ ok: false });
    match(sim, 'p2');
    match(sim, 'p2');
    match(sim, 'p2');
    expect(cast(sim, 'p1', 'last-lantern-lock', 'p2').ok).toBe(true);
    const [i, j] = openPair(sim, 'p2');
    expect(flip(sim, 'p2', i).ok).toBe(true);
    expect(flip(sim, 'p2', j)).toMatchObject({ ok: false });
    sim.run(8_500);
    expect(flip(sim, 'p2', j).ok).toBe(true);
    expect(pl(sim, 'p2')).toMatchObject({ pairs: 4, cleared: 1 });
  });
});
