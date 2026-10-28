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
    expect(mine.length).toBe(11);
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

const question = (qid: string) => MIXED_SET.find((q) => q.id === qid)!;
const view = (sim: ChaosSim) => sim.rt.view({ kind: 'player', playerId: 'p1' }) as { you: { card: { q: { prompt: string }; back?: string } } };

/** Grade "Knew it" until the card on the table is one `ok` accepts. */
function untilCard(sim: ChaosSim, ok: (qid: string) => boolean) {
  for (let i = 0; i < 80 && !ok(st(sim).card.qid); i++) grade(sim, true);
  expect(ok(st(sim).card.qid)).toBe(true);
}

describe('flashcard-study pack: the newer cheats', () => {
  it('Rapid Review brings a graded card back after one other card instead of two or five', () => {
    const sim = game();
    expect(cast(sim, 'rapid-review').ok).toBe(true);
    const missed = st(sim).card.qid;
    grade(sim, false);
    expect(st(sim).boxes[missed]).toBe(1);
    expect(st(sim).due[missed]).toBe(st(sim).step + 1);
    untilBox(sim, 1);
    const known = st(sim).card.qid;
    grade(sim, true);
    expect(st(sim).boxes[known]).toBe(2);
    expect(st(sim).due[known]).toBe(st(sim).step + 1);
    // Once it has worn off, the mode's own gaps apply again.
    sim.run(46_000);
    const later = st(sim).card.qid;
    grade(sim, false);
    expect(st(sim).due[later]).toBe(st(sim).step + 2);
  });

  it('Study Lottery either promotes the card or sends it back to box 1, deals the next card and records nothing', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const sim = game({ seed });
      untilBox(sim, 2);
      const s = st(sim);
      const qid = s.card.qid;
      const answers = sim.rt.answerLog().length;
      expect(cast(sim, 'lottery').ok).toBe(true);
      const after = st(sim);
      expect(after.card.qid).not.toBe(qid);
      expect([after.step, sim.rt.answerLog().length]).toEqual([s.step, answers]);
      if (after.boxes[qid] === 3) {
        seen.add('up');
        expect(after.mastered).toBe(s.mastered + 1);
      } else {
        seen.add('down');
        expect(after.boxes[qid]).toBe(1);
        expect(after.due[qid]).toBe(s.step + 2);
      }
    }
    expect([...seen].sort()).toEqual(['down', 'up']);
    const last = game({ variantId: 'flashcard-study-quick', common: { questionLimit: 1 } });
    expect(cast(last, 'lottery')).toMatchObject({ ok: false });
  });

  it('Pop Quiz brings a mastered card back into box 2, straight after the card on the table', () => {
    const sim = game({ variantId: 'flashcard-study-quick' });
    expect(cast(sim, 'pop-quiz')).toMatchObject({ ok: false });
    const first = st(sim).card.qid;
    grade(sim, true);
    expect([st(sim).boxes[first], st(sim).mastered]).toEqual([3, 1]);
    expect(cast(sim, 'pop-quiz').ok).toBe(true);
    expect([st(sim).boxes[first], st(sim).mastered]).toEqual([2, 0]);
    grade(sim, false);
    expect(st(sim).card.qid).toBe(first);
    grade(sim, true);
    expect([st(sim).boxes[first], st(sim).mastered]).toEqual([3, 1]);
    expect(sim.rt.status).toBe('running');
  });

  it('Turn the Card Around shows the answer first, only for a face-down card with one written answer', () => {
    const sim = game();
    untilCard(sim, (q) => question(q).type === 'truefalse');
    expect(cast(sim, 'turn-around')).toMatchObject({ ok: false });
    untilCard(sim, (q) => question(q).type === 'short');
    const q = question(st(sim).card.qid) as { prompt: string; accepted: string[] };
    expect(cast(sim, 'turn-around').ok).toBe(true);
    expect(st(sim).card.reversed).toBe(true);
    expect(view(sim).you.card.q.prompt).toBe(q.accepted[0]);
    sim.run(21_000);
    expect(cast(sim, 'turn-around').ok).toBe(true);
    expect(st(sim).card.reversed).toBeUndefined();
    expect(view(sim).you.card.q.prompt).toBe(q.prompt);
    expect(sim.rt.act('p1', { type: 'flip', iid: st(sim).card.iid }).ok).toBe(true);
    sim.run(21_000);
    expect(cast(sim, 'turn-around')).toMatchObject({ ok: false });
  });

  it('Tip of the Tongue shows the first letter of each word on the back until the card is turned', () => {
    const sim = game();
    untilCard(sim, (q) => question(q).type === 'truefalse');
    expect(cast(sim, 'tip-of-the-tongue')).toMatchObject({ ok: false });
    untilCard(sim, (q) => q === 'q8');
    expect(cast(sim, 'tip-of-the-tongue').ok).toBe(true);
    expect(sim.view('p1').overlays).toEqual([expect.objectContaining({ kind: 'badge', text: 'On the tip of your tongue: H… p… t… l… i… f…' })]);
    // The back itself stays out of the view until the card is turned.
    expect(view(sim).you.card.back).toBeUndefined();
    expect(sim.rt.act('p1', { type: 'flip', iid: st(sim).card.iid }).ok).toBe(true);
    sim.run(300);
    expect(sim.view('p1').overlays).toEqual([]);
  });

  it('Study Overtime puts up to 2 minutes back, never more than the full session', () => {
    const sim = game();
    const full = sim.state().endsAt;
    expect(cast(sim, 'overtime')).toMatchObject({ ok: false });
    sim.run(50_000);
    expect(cast(sim, 'overtime').ok).toBe(true);
    expect(sim.state().endsAt).toBe(full + 50_000);
    sim.run(300_000);
    const before = sim.state().endsAt;
    expect(cast(sim, 'overtime').ok).toBe(true);
    expect(sim.state().endsAt).toBe(before + 120_000);
    sim.run(before + 120_000 - sim.now - 1000);
    expect(sim.rt.status).toBe('running');
    sim.run(2000);
    expect(sim.rt.status).toBe('ended');
  });
});
