import { describe, expect, it } from 'vitest';
import { ChaosSim, type ChaosSimOptions } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { allCheats } from '../src/chaos/registry.ts';

/* Exact behaviour of the Flashcard Study pack. The test plays the student itself: flip, then grade. */

const ID = (slug: string) => `flashcard-study.${slug}`;

function game(opts: Partial<ChaosSimOptions> = {}) {
  const sim = new ChaosSim({ modeId: 'flashcard-study', questions: MIXED_SET, players: 1, seed: 3, ...opts });
  sim.idle.add('p1');
  return sim;
}

const st = (sim: ChaosSim) => sim.state().students.p1;
const cast = (sim: ChaosSim, cheat: string) => sim.cast('p1', { cheatId: ID(cheat) });

function grade(sim: ChaosSim, knew: boolean) {
  const iid = st(sim).card.iid;
  expect(sim.rt.act('p1', { type: 'flip', iid }).ok).toBe(true);
  expect(sim.rt.act('p1', { type: 'grade', iid, knew }).ok).toBe(true);
  sim.run(300);
}

/** Grade until the card on the table is in `box`. */
function untilBox(sim: ChaosSim, box: number) {
  for (let i = 0; i < 80 && (st(sim).boxes[st(sim).card.qid] ?? 1) !== box; i++) grade(sim, true);
  expect(st(sim).boxes[st(sim).card.qid]).toBe(box);
}

describe('flashcard-study pack', () => {
  it('has a handful of self-only cheats', () => {
    const mine = allCheats().filter((c) => c.id.startsWith('flashcard-study.'));
    expect(mine.length).toBe(5);
    for (const c of mine) expect([c.target, c.modes]).toEqual(['self', ['flashcard-study']]);
  });

  it('Slip It Under the Pile deals the next card and brings this one back two cards later', () => {
    const sim = game();
    const s = st(sim);
    const qid = s.card.qid;
    expect(cast(sim, 'slip-card').ok).toBe(true);
    const after = st(sim);
    expect(after.card.qid).not.toBe(qid);
    expect(after.card.iid).not.toBe(s.card.iid);
    expect(after.due[qid]).toBe(s.step + 2);
    expect(after.step).toBe(s.step);
    expect(sim.rt.answerLog()).toHaveLength(0);
  });

  it('Lucky Promotion moves the card up a box without counting an answer', () => {
    const sim = game();
    const qid = st(sim).card.qid;
    expect(cast(sim, 'box-boost').ok).toBe(true);
    expect(st(sim).boxes[qid]).toBe(2);
    expect(st(sim).due[qid]).toBe(st(sim).step + 5);
    expect([st(sim).knew, sim.rt.answerLog().length]).toEqual([0, 0]);
    const quick = game({ variantId: 'flashcard-study-quick' });
    const q2 = st(quick).card.qid;
    expect(cast(quick, 'box-boost').ok).toBe(true);
    expect(st(quick).boxes[q2]).toBe(3);
    expect(st(quick).mastered).toBe(1);
  });

  it('never masters the last card, and the session never ends from chaos', () => {
    const sim = game({ variantId: 'flashcard-study-quick', common: { questionLimit: 2 } });
    expect(cast(sim, 'box-boost').ok).toBe(true);
    sim.run(46_000);
    expect(st(sim).mastered).toBe(1);
    const r = cast(sim, 'box-boost');
    expect(r.ok).toBe(false);
    expect(cast(sim, 'slip-card').ok).toBe(false);
    expect(sim.rt.status).toBe('running');
  });

  it('Cram Session puts every box 2 card ahead of the rest', () => {
    const sim = game();
    for (let i = 0; i < 4; i++) grade(sim, true);
    const box2 = Object.entries(st(sim).boxes).filter(([q, b]) => b === 2 && q !== st(sim).card.qid).map(([q]) => q);
    expect(box2.length).toBeGreaterThan(0);
    expect(cast(sim, 'cram').ok).toBe(true);
    const s = st(sim);
    const others = s.order.filter((q: string) => s.boxes[q] < 3 && !box2.includes(q) && q !== s.card.qid);
    for (const q of box2) for (const o of others) expect(s.due[q]).toBeLessThan(s.due[o]);
    grade(sim, false);
    expect(box2).toContain(st(sim).card.qid);
  });

  it('Quick Recall masters a card you knew at once; not in a Quick review session', () => {
    const sim = game();
    expect(cast(sim, 'quick-recall').ok).toBe(true);
    const qid = st(sim).card.qid;
    grade(sim, true);
    expect(st(sim).boxes[qid]).toBe(3);
    expect(st(sim).mastered).toBe(1);
    expect(st(sim).last).toMatchObject({ knew: true, box: 3, mastered: true });
    expect(game({ variantId: 'flashcard-study-quick' }).cast('p1', { cheatId: ID('quick-recall') }).ok).toBe(false);
  });

  it('Safety Net keeps a missed card in its box', () => {
    const sim = game();
    untilBox(sim, 2);
    expect(cast(sim, 'safety-net').ok).toBe(true);
    const qid = st(sim).card.qid;
    grade(sim, false);
    expect(st(sim).boxes[qid]).toBe(2);
    expect(st(sim).due[qid]).toBe(st(sim).step + 5);
    // A box 1 card that is missed simply stays in box 1.
    untilBox(sim, 1);
    const one = st(sim).card.qid;
    grade(sim, false);
    expect(st(sim).boxes[one]).toBe(1);
  });
});
