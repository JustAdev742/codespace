import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';

/* Exact behaviour of the Lantern Out cheat pack. Every bot is kept idle and answers are made by hand. */

type Opts = { players?: number; settings?: Record<string, unknown>; seed?: number };

function game(o: Opts = {}) {
  const sim = new ChaosSim({ modeId: 'lantern-out', questions: MIXED_SET, players: o.players ?? 4, seed: o.seed ?? 31, settings: o.settings ?? {} });
  for (const id of sim.ids) sim.idle.add(id);
  return sim;
}

const st = (sim: ChaosSim) => sim.state();
const lit = (sim: ChaosSim) => ({ ...st(sim).lanterns }) as Record<string, number>;

function untilQuestion(sim: ChaosSim) {
  for (let t = 0; t < 120_000; t += 100) {
    const s = st(sim).sync;
    if (s.phase === 'question' && s.deadline - sim.now > 5000) return;
    sim.run(100);
  }
  throw new Error('no question opened');
}

function untilClosed(sim: ChaosSim) {
  for (let t = 0; t < 60_000 && st(sim).sync.phase === 'question'; t += 100) sim.run(100);
}

function right(sim: ChaosSim, id: string) {
  const a = sim.rt.botAction(id, 1, createRng(3));
  expect(a).not.toBeNull();
  expect(sim.rt.act(id, a).ok).toBe(true);
}

/** Play one question: everyone who can answers right except `miss`, who do not answer. Optionally act in the middle. */
function question(sim: ChaosSim, miss: string[] = [], during?: () => void) {
  untilQuestion(sim);
  during?.();
  const revival = st(sim).revival.on && st(sim).revival.round === st(sim).sync.round;
  for (const id of sim.ids) {
    const out = (st(sim).lanterns[id] ?? 0) <= 0;
    if (!miss.includes(id) && out === revival && !st(sim).sync.answers[id] && st(sim).sync.phase === 'question') right(sim, id);
  }
  untilClosed(sim);
}

describe('lantern-out pack: lanterns', () => {
  it('Gust of Wind blows out a lantern but never the last', () => {
    const sim = game();
    expect(sim.cast('p1', { cheatId: 'lantern-out.gust', target: 'p2' }).ok).toBe(true);
    expect(sim.cast('p3', { cheatId: 'lantern-out.gust', target: 'p2' }).ok).toBe(true);
    expect(lit(sim).p2).toBe(1);
    expect(sim.cast('p4', { cheatId: 'lantern-out.gust', target: 'p2' })).toMatchObject({ ok: false });
  });

  it('Borrow a Flame moves a lantern to you, only with room in your row', () => {
    const sim = game();
    expect(sim.cast('p1', { cheatId: 'lantern-out.borrow-flame', target: 'p2' })).toMatchObject({ ok: false });
    question(sim, ['p1']);
    expect(lit(sim)).toMatchObject({ p1: 2, p2: 3 });
    expect(sim.cast('p1', { cheatId: 'lantern-out.borrow-flame', target: 'p2' }).ok).toBe(true);
    expect(lit(sim)).toMatchObject({ p1: 3, p2: 2 });
  });

  it('Lend a Light gives a lantern away, and relights a player who is out only between questions', () => {
    const sim = game({ settings: { lives: 2 } });
    question(sim, ['p2']);
    question(sim, ['p2']);
    expect(lit(sim).p2).toBe(0);
    untilQuestion(sim);
    const mid = sim.cast('p1', { cheatId: 'lantern-out.lend-a-light', target: 'p2' });
    expect(mid.ok).toBe(false);
    if (!mid.ok) expect(mid.message).toMatch(/until this question closes/);
    question(sim);
    expect(lit(sim).p1).toBe(2);
    expect(sim.cast('p1', { cheatId: 'lantern-out.lend-a-light', target: 'p2' }).ok).toBe(true);
    expect(lit(sim)).toMatchObject({ p1: 1, p2: 1 });
    expect(st(sim).outAt.p2).toBeUndefined();
  });

  it('Lantern Swap trades rows, and refuses equal ones', () => {
    const sim = game();
    expect(sim.cast('p1', { cheatId: 'lantern-out.lantern-swap', target: 'p2' })).toMatchObject({ ok: false });
    question(sim, ['p2']);
    expect(sim.cast('p1', { cheatId: 'lantern-out.lantern-swap', target: 'p2' }).ok).toBe(true);
    expect(lit(sim)).toMatchObject({ p1: 2, p2: 3 });
  });

  it('Lamp Oil buys a lantern for half your points, rounded up', () => {
    const sim = game();
    question(sim, ['p1']);
    expect(sim.cast('p1', { cheatId: 'lantern-out.lamp-oil' })).toMatchObject({ ok: false });
    question(sim);
    const pts = st(sim).sync.scores.p1;
    expect(pts).toBeGreaterThan(0);
    expect(sim.cast('p1', { cheatId: 'lantern-out.lamp-oil' }).ok).toBe(true);
    expect(st(sim).sync.scores.p1).toBe(pts - Math.ceil(pts / 2));
    expect(lit(sim).p1).toBe(3);
  });

  it('Lantern Carousel moves every lit row on one place', () => {
    const sim = game();
    expect(sim.cast('p1', { cheatId: 'lantern-out.lantern-carousel' })).toMatchObject({ ok: false });
    question(sim, ['p2']);
    expect(sim.cast('p1', { cheatId: 'lantern-out.lantern-carousel' }).ok).toBe(true);
    expect(lit(sim)).toEqual({ p1: 3, p2: 3, p3: 2, p4: 3 });
  });

  it('Wandering Wisp does exactly one of its three things, and each happens', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const sim = game({ seed });
      question(sim, ['p1']);
      const before = lit(sim);
      expect(sim.cast('p1', { cheatId: 'lantern-out.will-o-wisp' }).ok).toBe(true);
      const after = lit(sim);
      const changed = sim.ids.filter((id) => after[id] !== before[id]);
      expect(changed).toHaveLength(1);
      const [id] = changed;
      seen.add(id === 'p1' ? (after.p1! > before.p1! ? 'relight' : 'backfire') : 'blow');
    }
    expect(seen).toEqual(new Set(['relight', 'blow', 'backfire']));
  });
});

describe('lantern-out pack: weather', () => {
  it('Windbreak keeps a player\'s lanterns lit and keeps the reveal honest', () => {
    const sim = game();
    question(sim, ['p2'], () => expect(sim.cast('p1', { cheatId: 'lantern-out.windbreak', target: 'p2' }).ok).toBe(true));
    expect(lit(sim).p2).toBe(3);
    expect(st(sim).last.blown).not.toContain('p2');
  });

  it('Windbreak stands aside when everyone else is out, so it never decides the game', () => {
    const sim = game({ players: 2, settings: { lives: 1 } });
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'lantern-out.windbreak', target: 'p1' }).ok).toBe(true);
    untilClosed(sim);
    expect(lit(sim)).toEqual({ p1: 0, p2: 0 });
  });

  it('Downdraft doubles a lost lantern, but never takes the last itself', () => {
    const sim = game();
    question(sim, ['p2'], () => expect(sim.cast('p1', { cheatId: 'lantern-out.downdraft', target: 'p2' }).ok).toBe(true));
    expect(lit(sim).p2).toBe(1);
    const other = game();
    question(other, ['p2']);
    question(other, ['p2'], () => expect(other.cast('p1', { cheatId: 'lantern-out.downdraft', target: 'p2' }).ok).toBe(true));
    expect(lit(other).p2).toBe(1);
  });

  it('Moth to the Flame relights one of yours whenever the target loses one', () => {
    const sim = game();
    question(sim, ['p1']);
    question(sim, ['p2'], () => expect(sim.cast('p1', { cheatId: 'lantern-out.moth-to-the-flame', target: 'p2' }).ok).toBe(true));
    expect(lit(sim)).toMatchObject({ p1: 3, p2: 2 });
  });

  it('Flicker Curse blows out a lantern of a right answer that was not the fastest', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'lantern-out.flicker-curse', target: 'p2' }).ok).toBe(true);
    right(sim, 'p3');
    sim.run(500);
    right(sim, 'p2');
    right(sim, 'p1');
    right(sim, 'p4');
    untilClosed(sim);
    expect(lit(sim)).toMatchObject({ p1: 3, p2: 2, p3: 3, p4: 3 });
    expect(st(sim).last.blown).toEqual(['p2']);
  });
});

describe('lantern-out pack: revival rounds', () => {
  it('Call a Revival makes the next question a revival round', () => {
    const sim = game({ settings: { lives: 1 } });
    question(sim, ['p4']);
    expect(lit(sim).p4).toBe(0);
    expect(sim.cast('p1', { cheatId: 'lantern-out.call-revival' }).ok).toBe(true);
    untilQuestion(sim);
    expect(st(sim).revival).toEqual({ round: st(sim).sync.round, on: true });
    const lit1 = sim.rt.act('p1', { type: 'answer', iid: st(sim).sync.iid, answer: { type: 'short', text: 'x' } });
    expect(lit1.ok).toBe(false);
    right(sim, 'p4');
    untilClosed(sim);
    expect(lit(sim).p4).toBe(1);
  });

  it('Call a Revival refuses when the next question is already a revival round', () => {
    const sim = game({ settings: { lives: 1, reviveEvery: 2 } });
    question(sim, ['p4']);
    expect(sim.cast('p1', { cheatId: 'lantern-out.call-revival' })).toMatchObject({ ok: false });
  });

  it('Snuff the Revival turns the next revival round into a normal question', () => {
    const sim = game({ settings: { lives: 1, reviveEvery: 2 } });
    question(sim, ['p4']);
    expect(sim.cast('p1', { cheatId: 'lantern-out.snuff-revival' }).ok).toBe(true);
    untilQuestion(sim);
    expect(st(sim).revival.on).toBe(false);
    expect(sim.rt.act('p4', { type: 'answer', iid: st(sim).sync.iid, answer: { type: 'short', text: 'x' } }).ok).toBe(false);
    right(sim, 'p1');
  });

  it('Dry Tinder sets your streak so the next right answer kindles a lantern', () => {
    const sim = game({ settings: { kindling: true } });
    question(sim, ['p1']);
    question(sim);
    expect(st(sim).sync.streaks.p1).toBe(1);
    expect(lit(sim).p1).toBe(2);
    expect(sim.cast('p1', { cheatId: 'lantern-out.dry-tinder' }).ok).toBe(true);
    expect(st(sim).sync.streaks.p1).toBe(2);
    expect(sim.cast('p2', { cheatId: 'lantern-out.dry-tinder' })).toMatchObject({ ok: false });
    question(sim);
    expect(lit(sim).p1).toBe(3);
  });
});

function wrong(sim: ChaosSim, id: string) {
  expect(sim.rt.act(id, { type: 'answer', iid: st(sim).sync.iid, answer: { type: 'short', text: 'nope nope' } }).ok).toBe(true);
}

describe('lantern-out pack: duels', () => {
  it('Flame Duel: the faster right answer takes a lantern from the other', () => {
    const sim = game();
    question(sim, ['p1']);
    expect(lit(sim)).toMatchObject({ p1: 2, p2: 3 });
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'lantern-out.flame-duel', target: 'p2' }).ok).toBe(true);
    right(sim, 'p1');
    sim.run(500);
    for (const id of ['p2', 'p3', 'p4']) right(sim, id);
    untilClosed(sim);
    expect(lit(sim)).toMatchObject({ p1: 3, p2: 2, p3: 3, p4: 3 });
    expect(st(sim).last.blown).toEqual(['p2']);
    expect(sim.chaos().effects).toHaveLength(0);
  });

  it('Flame Duel: a wrong answer loses to a right one, and two wrong answers are a draw', () => {
    const sim = game();
    question(sim, ['p2']);
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'lantern-out.flame-duel', target: 'p2' }).ok).toBe(true);
    wrong(sim, 'p1');
    right(sim, 'p2');
    for (const id of ['p3', 'p4']) right(sim, id);
    untilClosed(sim);
    // p1 lost one to the miss and one to the duel; p2 won it back to three.
    expect(lit(sim)).toMatchObject({ p1: 1, p2: 3 });
    const draw = game();
    untilQuestion(draw);
    expect(draw.cast('p1', { cheatId: 'lantern-out.flame-duel', target: 'p2' }).ok).toBe(true);
    wrong(draw, 'p1');
    wrong(draw, 'p2');
    untilClosed(draw);
    expect(lit(draw)).toMatchObject({ p1: 2, p2: 2 });
  });

  it('Flame Duel never takes a last lantern, and needs both duellists still to answer', () => {
    const sim = game({ settings: { lives: 2 } });
    question(sim, ['p2']);
    question(sim, ['p1']);
    expect(lit(sim)).toMatchObject({ p1: 1, p2: 1 });
    untilQuestion(sim);
    right(sim, 'p3');
    expect(sim.cast('p1', { cheatId: 'lantern-out.flame-duel', target: 'p3' })).toMatchObject({ ok: false });
    expect(sim.cast('p1', { cheatId: 'lantern-out.flame-duel', target: 'p2' }).ok).toBe(true);
    right(sim, 'p1');
    sim.run(500);
    right(sim, 'p2');
    right(sim, 'p4');
    untilClosed(sim);
    expect(lit(sim)).toMatchObject({ p1: 1, p2: 1 });
  });

  it('Double Wick relights two lanterns for a player who comes back in a revival round', () => {
    const sim = game({ settings: { lives: 2, reviveEvery: 3 } });
    expect(sim.cast('p4', { cheatId: 'lantern-out.double-wick' })).toMatchObject({ ok: false });
    question(sim, ['p4']);
    question(sim, ['p4']);
    expect(lit(sim).p4).toBe(0);
    expect(sim.cast('p4', { cheatId: 'lantern-out.double-wick' }).ok).toBe(true);
    question(sim);
    expect(lit(sim).p4).toBe(2);
    expect(st(sim).last.relit).toEqual(['p4']);
    expect(sim.chaos().effects).toHaveLength(0);
  });

  it('Double Wick is refused with one lantern each', () => {
    const sim = game({ settings: { lives: 1 } });
    question(sim, ['p4']);
    expect(sim.cast('p4', { cheatId: 'lantern-out.double-wick' })).toMatchObject({ ok: false });
  });
});

describe('lantern-out pack: kindling', () => {
  it('Damp Kindling stops an opponent\'s three in a row relighting a lantern', () => {
    const play = (damp: boolean) => {
      const sim = game({ settings: { kindling: true } });
      question(sim, ['p2']);
      question(sim);
      question(sim);
      question(sim, [], () => {
        if (damp) expect(sim.cast('p1', { cheatId: 'lantern-out.damp-kindling', target: 'p2' }).ok).toBe(true);
      });
      return sim;
    };
    expect(lit(play(false)).p2).toBe(3);
    const sim = play(true);
    expect(st(sim).sync.streaks.p2).toBe(3);
    expect(lit(sim).p2).toBe(2);
    expect(st(sim).last.kindled).not.toContain('p2');
  });

  it('Pocket Tinderbox gives you Kindling\'s rule in a game without it', () => {
    const sim = game();
    question(sim, ['p1']);
    expect(sim.cast('p1', { cheatId: 'lantern-out.tinderbox' }).ok).toBe(true);
    question(sim);
    question(sim);
    expect(lit(sim).p1).toBe(2);
    question(sim);
    expect(lit(sim)).toMatchObject({ p1: 3, p2: 3 });
    expect(st(sim).last.kindled).toEqual(['p1']);
  });

  it('Pocket Tinderbox is refused when Kindling is on for everyone', () => {
    const sim = game({ settings: { kindling: true } });
    const r = sim.cast('p1', { cheatId: 'lantern-out.tinderbox' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/already on/);
  });
});

describe('lantern-out pack: sheltering and sharing', () => {
  it('Shelter the Flame moves a player\'s lost lanterns to your row, never your last', () => {
    /** One quick question: p2 answers wrong and everyone else right, so it closes at once. */
    const p2Wrong = () => {
      untilQuestion(sim);
      wrong(sim, 'p2');
      for (const id of ['p1', 'p3', 'p4']) right(sim, id);
      untilClosed(sim);
    };
    const sim = game();
    expect(sim.cast('p1', { cheatId: 'lantern-out.shelter', target: 'p1' })).toMatchObject({ ok: false });
    question(sim, ['p1']);
    expect(lit(sim).p1).toBe(2);
    expect(sim.cast('p1', { cheatId: 'lantern-out.shelter', target: 'p2' }).ok).toBe(true);
    p2Wrong();
    expect(lit(sim)).toMatchObject({ p1: 1, p2: 3 });
    expect(st(sim).last.blown).toEqual(['p1']);
    // Down to their last lantern: the sheltered player loses their own again.
    p2Wrong();
    expect(lit(sim)).toMatchObject({ p1: 1, p2: 2 });
    expect(st(sim).last.blown).toEqual(['p2']);
  });

  it('Shelter the Flame needs two lanterns and covers one player at a time', () => {
    const sim = game();
    expect(sim.cast('p1', { cheatId: 'lantern-out.shelter', target: 'p2' }).ok).toBe(true);
    const r = sim.cast('p1', { cheatId: 'lantern-out.shelter', target: 'p3' });
    expect(r.ok).toBe(false);
    const low = game({ settings: { lives: 1 } });
    expect(low.cast('p1', { cheatId: 'lantern-out.shelter', target: 'p2' })).toMatchObject({ ok: false });
  });

  it('Ripple of Wind blows out one opponent\'s lantern for each one you lose', () => {
    const sim = game();
    expect(sim.cast('p1', { cheatId: 'lantern-out.ripple' }).ok).toBe(true);
    question(sim, ['p1']);
    const after = lit(sim);
    expect(after.p1).toBe(2);
    expect(after.p2! + after.p3! + after.p4!).toBe(8);
    const hit = ['p2', 'p3', 'p4'].find((id) => after[id] === 2)!;
    expect([...st(sim).last.blown].sort()).toEqual(['p1', hit].sort());
  });

  it('Ripple of Wind never takes a last lantern, nor one behind a Windbreak', () => {
    const sim = game({ settings: { lives: 2 } });
    question(sim, ['p2', 'p3']);
    expect(sim.cast('p4', { cheatId: 'lantern-out.windbreak', target: 'p4' }).ok).toBe(true);
    expect(sim.cast('p1', { cheatId: 'lantern-out.ripple' }).ok).toBe(true);
    question(sim, ['p1']);
    expect(lit(sim)).toEqual({ p1: 1, p2: 1, p3: 1, p4: 2 });
  });

  it('Even Glow shares the lit lanterns out evenly and leaves players who are out alone', () => {
    const sim = game({ settings: { lives: 3 } });
    expect(sim.cast('p1', { cheatId: 'lantern-out.even-glow' })).toMatchObject({ ok: false });
    question(sim, ['p2']);
    question(sim, ['p2']);
    expect(lit(sim)).toMatchObject({ p1: 3, p2: 1, p3: 3, p4: 3 });
    expect(sim.cast('p1', { cheatId: 'lantern-out.even-glow' }).ok).toBe(true);
    const after = Object.values(lit(sim)).sort();
    expect(after).toEqual([2, 2, 3, 3]);
    const out = game({ settings: { lives: 3, reviveEvery: 0 } });
    question(out, ['p4']);
    question(out, ['p4']);
    question(out, ['p4']);
    question(out, ['p2']);
    question(out, ['p2']);
    expect(lit(out)).toMatchObject({ p2: 1, p4: 0 });
    expect(out.cast('p1', { cheatId: 'lantern-out.even-glow' }).ok).toBe(true);
    expect(lit(out).p4).toBe(0);
    expect(Object.values(lit(out)).reduce((n, v) => n + v, 0)).toBe(7);
  });
});
