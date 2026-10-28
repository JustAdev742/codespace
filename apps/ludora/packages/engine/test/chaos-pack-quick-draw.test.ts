import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';

/* Exact behaviour of the Quick Draw cheat pack. Every bot is kept idle and answers are made by hand. */

type Opts = { players?: number; settings?: Record<string, unknown>; common?: Record<string, unknown> };

function game(o: Opts = {}) {
  const sim = new ChaosSim({ modeId: 'quick-draw', questions: MIXED_SET, players: o.players ?? 4, seed: 5, settings: o.settings ?? {}, common: o.common ?? {} });
  for (const id of sim.ids) sim.idle.add(id);
  return sim;
}

const st = (sim: ChaosSim) => sim.state();

function untilQuestion(sim: ChaosSim) {
  for (let t = 0; t < 120_000; t += 100) {
    const s = st(sim).sync;
    if (s.phase === 'question' && s.deadline - sim.now > 5000) return;
    sim.run(100);
  }
  throw new Error('no question opened');
}

const rightAction = (sim: ChaosSim, id: string) => sim.rt.botAction(id, 1, createRng(3));
function right(sim: ChaosSim, id: string) {
  const a = rightAction(sim, id);
  expect(a).not.toBeNull();
  expect(sim.rt.act(id, a).ok).toBe(true);
}
const wrongAction = (sim: ChaosSim) => ({ type: 'answer', iid: st(sim).sync.iid, answer: { type: 'short', text: 'nope nope' } });
const wrong = (sim: ChaosSim, id: string) => expect(sim.rt.act(id, wrongAction(sim)).ok).toBe(true);

describe('quick-draw pack', () => {
  it('Reholster takes back your wrong answer so you can try again', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'quick-draw.reholster' })).toMatchObject({ ok: false });
    wrong(sim, 'p1');
    expect(sim.rt.act('p1', wrongAction(sim)).ok).toBe(false);
    expect(sim.cast('p1', { cheatId: 'quick-draw.reholster' }).ok).toBe(true);
    expect(st(sim).sync.answers.p1).toBeUndefined();
    right(sim, 'p1');
    expect(st(sim).sync.scores.p1).toBe(1);
    expect(st(sim).wins.at(-1).playerId).toBe('p1');
  });

  it('Posse Pardon lifts a One Voice lockout for the rest of the team, but not for the teammate who missed', () => {
    const sim = game({ settings: { teamTry: true }, common: { teamCount: 2 } });
    const team = (id: string) => sim.rt.playerList().find((p) => p.id === id)!.teamId;
    const mate = sim.ids.find((id) => id !== 'p1' && team(id) === team('p1'))!;
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'quick-draw.posse-pardon', target: mate })).toMatchObject({ ok: false });
    wrong(sim, mate);
    expect(sim.rt.act('p1', wrongAction(sim)).ok).toBe(false);
    expect(sim.cast('p1', { cheatId: 'quick-draw.posse-pardon', target: mate }).ok).toBe(true);
    const again = sim.rt.act(mate, wrongAction(sim));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.message).toMatch(/Posse Pardon/);
    right(sim, 'p1');
    expect(st(sim).sync.scores.p1).toBe(1);
  });

  it('Duel at Dawn lets only the two duelists answer, and needs three players', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'quick-draw.duel-at-dawn', params: { duelist: 'p2' } }).ok).toBe(true);
    const blocked = sim.rt.act('p3', wrongAction(sim));
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.message).toMatch(/only Bot 1 and Bot 2/);
    right(sim, 'p2');
    expect(st(sim).sync.scores.p2).toBe(1);
    const two = game({ players: 2 });
    expect(two.cast('p1', { cheatId: 'quick-draw.duel-at-dawn', params: { duelist: 'p2' } })).toMatchObject({ ok: false });
  });

  it('Shaky Trigger Finger makes a miss cost a point, never below 0', () => {
    const sim = game();
    untilQuestion(sim);
    right(sim, 'p2');
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'quick-draw.shaky-trigger', target: 'p2' }).ok).toBe(true);
    wrong(sim, 'p2');
    expect(st(sim).sync.scores.p2).toBe(0);
    right(sim, 'p3');
    untilQuestion(sim);
    wrong(sim, 'p2');
    expect(st(sim).sync.scores.p2).toBe(0);
  });

  it('Buzzard\'s Bounty pays a point per miss, but never the point that reaches the target', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'quick-draw.buzzard-bounty', target: 'p2' }).ok).toBe(true);
    wrong(sim, 'p2');
    expect(st(sim).sync.scores.p1).toBe(1);

    const capped = game({ settings: { target: 2 } });
    untilQuestion(capped);
    right(capped, 'p1');
    untilQuestion(capped);
    expect(capped.cast('p1', { cheatId: 'quick-draw.buzzard-bounty', target: 'p2' }).ok).toBe(true);
    wrong(capped, 'p2');
    expect(st(capped).sync.scores.p1).toBe(1);
    expect(capped.rt.status).toBe('running');
  });

  it('Wanted Poster: whoever else wins a round takes a point from the target, while they have one', () => {
    const sim = game();
    untilQuestion(sim);
    right(sim, 'p2');
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: 'quick-draw.wanted-poster', target: 'p2' }).ok).toBe(true);
    right(sim, 'p3');
    expect(st(sim).sync.scores).toMatchObject({ p2: 0, p3: 2 });
    untilQuestion(sim);
    right(sim, 'p4');
    expect(st(sim).sync.scores).toMatchObject({ p2: 0, p4: 1 });
    const broke = game();
    untilQuestion(broke);
    expect(broke.cast('p1', { cheatId: 'quick-draw.wanted-poster', target: 'p2' })).toMatchObject({ ok: false });
  });
});

/** Play on until the open question has closed (by its clock, when nobody answers it right). */
function untilClosed(sim: ChaosSim) {
  for (let t = 0; t < 60_000 && st(sim).sync.phase === 'question'; t += 100) sim.run(100);
  expect(st(sim).sync.phase).not.toBe('question');
}

function refused(sim: ChaosSim, id: string, why: RegExp) {
  const r = sim.rt.act(id, wrongAction(sim));
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.message).toMatch(why);
}

const cheat = (slug: string) => `quick-draw.${slug}`;
const running = (sim: ChaosSim, slug: string) => sim.chaos().effects.some((e) => e.cheatId === cheat(slug));

describe('quick-draw pack: who may answer', () => {
  it('Turnabout gives everyone who missed another try and locks out the rest', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: cheat('turnabout') })).toMatchObject({ ok: false });
    wrong(sim, 'p2');
    expect(sim.cast('p1', { cheatId: cheat('turnabout') }).ok).toBe(true);
    expect(st(sim).sync.answers.p2).toBeUndefined();
    refused(sim, 'p3', /Turnabout/);
    refused(sim, 'p4', /Turnabout/);
    right(sim, 'p2');
    expect(st(sim).sync.scores.p2).toBe(1);
    // The lock is for that question only.
    untilQuestion(sim);
    right(sim, 'p3');
    expect(st(sim).sync.scores.p3).toBe(1);

    const allIn = game();
    untilQuestion(allIn);
    for (const id of ['p2', 'p3', 'p4']) wrong(allIn, id);
    expect(allIn.cast('p1', { cheatId: cheat('turnabout') })).toMatchObject({ ok: false });
  });

  it('Lasso stops an opponent answering until someone else has answered wrong', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: cheat('lasso'), target: 'p2' }).ok).toBe(true);
    refused(sim, 'p2', /Lassoed/);
    wrong(sim, 'p3');
    right(sim, 'p2');
    expect(st(sim).sync.scores.p2).toBe(1);
  });

  it('Saddle Sore makes a miss cost the next question too, then wears off', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: cheat('saddle-sore'), target: 'p2' }).ok).toBe(true);
    wrong(sim, 'p2');
    right(sim, 'p3');
    untilQuestion(sim);
    refused(sim, 'p2', /Saddle sore/);
    right(sim, 'p4');
    untilQuestion(sim);
    right(sim, 'p2');
    expect(st(sim).sync.scores).toMatchObject({ p2: 1, p3: 1, p4: 1 });
    sim.run(46_000);
    expect(running(sim, 'saddle-sore')).toBe(false);
  });

  it('Saddle Sore waits for the question after a late miss, even past its 45 seconds', () => {
    const sim = game({ settings: { autoAdvance: false } });
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: cheat('saddle-sore'), target: 'p2' }).ok).toBe(true);
    sim.run(10_000);
    wrong(sim, 'p2');
    right(sim, 'p3');
    // The host keeps the reveal up past the effect's own 45 seconds.
    sim.run(40_000);
    expect(running(sim, 'saddle-sore')).toBe(true);
    sim.rt.hostNext();
    untilQuestion(sim);
    refused(sim, 'p2', /Saddle sore/);
  });

  it('Rookie Round lets only players without a round win answer the next question', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: cheat('rookie-round') })).toMatchObject({ ok: false });
    right(sim, 'p2');
    expect(sim.cast('p1', { cheatId: cheat('rookie-round') }).ok).toBe(true);
    untilQuestion(sim);
    refused(sim, 'p2', /Rookie round/);
    right(sim, 'p3');
    untilQuestion(sim);
    right(sim, 'p2');
    expect(st(sim).sync.scores).toMatchObject({ p2: 2, p3: 1 });
  });
});

describe('quick-draw pack: round wins', () => {
  it('Tumbleweed Jackpot rolls an unwon round into a jackpot for the next winner', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: cheat('tumbleweed-jackpot') }).ok).toBe(true);
    untilClosed(sim);
    sim.run(300);
    expect(sim.view('p2').overlays).toEqual([expect.objectContaining({ text: 'Tumbleweed jackpot: 1 point' })]);
    untilQuestion(sim);
    right(sim, 'p2');
    sim.run(300);
    expect(st(sim).sync.scores.p2).toBe(2);
    expect(sim.view('p2').overlays).toEqual([expect.objectContaining({ text: 'Tumbleweed jackpot: 0 points' })]);
  });

  it('Tumbleweed Jackpot never pays the point that would reach the target', () => {
    const sim = game({ settings: { target: 2 } });
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: cheat('tumbleweed-jackpot') }).ok).toBe(true);
    untilClosed(sim);
    untilQuestion(sim);
    right(sim, 'p2');
    sim.run(300);
    expect(st(sim).sync.scores.p2).toBe(1);
    expect(sim.rt.status).toBe('running');
  });

  it('Lightning Draw adds a point to a win inside the first quarter of the question, never past the target', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: cheat('lightning-draw') }).ok).toBe(true);
    right(sim, 'p1');
    expect(st(sim).sync.scores.p1).toBe(2);
    untilQuestion(sim);
    sim.run(6000);
    right(sim, 'p1');
    expect(st(sim).sync.scores.p1).toBe(3);

    const capped = game({ settings: { target: 2 } });
    untilQuestion(capped);
    expect(capped.cast('p1', { cheatId: cheat('lightning-draw') }).ok).toBe(true);
    right(capped, 'p1');
    expect(st(capped).sync.scores.p1).toBe(1);
    untilQuestion(capped);
    // The mode's own point reaches the target: the bonus never clips it, and the mode ends the game after the reveal.
    right(capped, 'p1');
    expect(st(capped).sync.scores.p1).toBe(2);
    capped.run(6000);
    expect(capped.rt.status).toBe('ended');
  });

  it('Winning Streak adds a point to a round won straight after another', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: cheat('winning-streak') }).ok).toBe(true);
    right(sim, 'p1');
    expect(st(sim).sync.scores.p1).toBe(1);
    untilQuestion(sim);
    right(sim, 'p1');
    expect(st(sim).sync.scores.p1).toBe(3);
    untilQuestion(sim);
    right(sim, 'p2');
    untilQuestion(sim);
    right(sim, 'p1');
    expect(st(sim).sync.scores.p1).toBe(4);
  });

  it('Bold Claim: a win scores 2, a wrong answer loses a point, and it is spent either way', () => {
    const sim = game();
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: cheat('bold-claim') }).ok).toBe(true);
    right(sim, 'p1');
    expect(st(sim).sync.scores.p1).toBe(2);
    expect(running(sim, 'bold-claim')).toBe(false);
    sim.run(46_000);
    untilQuestion(sim);
    expect(sim.cast('p1', { cheatId: cheat('bold-claim') }).ok).toBe(true);
    wrong(sim, 'p1');
    expect(st(sim).sync.scores.p1).toBe(1);
    expect(running(sim, 'bold-claim')).toBe(false);
    wrong(sim, 'p2');
    expect(sim.cast('p2', { cheatId: cheat('bold-claim') })).toMatchObject({ ok: false });

    const broke = game();
    untilQuestion(broke);
    expect(broke.cast('p1', { cheatId: cheat('bold-claim') }).ok).toBe(true);
    wrong(broke, 'p1');
    expect(st(broke).sync.scores.p1).toBe(0);
    expect(running(broke, 'bold-claim')).toBe(false);
  });
});
