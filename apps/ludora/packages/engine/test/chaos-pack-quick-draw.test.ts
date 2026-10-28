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
