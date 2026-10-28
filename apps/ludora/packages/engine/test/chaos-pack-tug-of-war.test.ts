import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';

/*
 * Exact behaviour of the tug-of-war cheats. Every bot is idle, so the knot
 * only moves when a test makes someone answer. p1 and p3 pull left (towards
 * negative positions), p2 and p4 pull right; with two a side every correct
 * answer pulls exactly 1 space.
 */

const rng = createRng(7);

function game(settings: Record<string, unknown> = {}) {
  const sim = new ChaosSim({ modeId: 'tug-of-war', questions: MIXED_SET, players: 4, seed: 11, settings, common: { teamCount: 2 } });
  for (const id of sim.ids) sim.idle.add(id);
  sim.run(1000);
  return sim;
}

const pos = (sim: ChaosSim) => sim.state().pos as number;
const team = (sim: ChaosSim, id: string) => sim.rt.playerList().find((p) => p.id === id)!.teamId!;

function right(sim: ChaosSim, id: string) {
  const r = sim.rt.act(id, sim.rt.botAction(id, 1, rng));
  expect(r.ok).toBe(true);
}

function wrong(sim: ChaosSim, id: string) {
  const iid = sim.state().pullers[id].stream.iid;
  const r = sim.rt.act(id, { type: 'answer', iid, answer: { type: 'flashcard', knew: false } });
  expect(r.ok).toBe(true);
}

function cast(sim: ChaosSim, caster: string, cheatId: string, target?: string, params?: Record<string, unknown>) {
  return sim.cast(caster, { cheatId: `tug-of-war.${cheatId}`, target: target ?? null, ...(params ? { params } : {}) });
}

describe('tug-of-war pack: moving the knot', () => {
  it('Rope Yank moves the knot the chosen spaces and stops one short of the line', () => {
    const sim = game({ ropeLength: 8 });
    expect(cast(sim, 'p1', 'yank', undefined, { spaces: 3 }).ok).toBe(true);
    expect(pos(sim)).toBe(-3);
    expect(cast(sim, 'p3', 'yank', undefined, { spaces: 3 }).ok).toBe(true);
    expect(pos(sim)).toBe(-6);
    sim.run(31_000);
    expect(cast(sim, 'p1', 'yank', undefined, { spaces: 3 }).ok).toBe(true);
    expect(pos(sim)).toBe(-7);
    const r = cast(sim, 'p3', 'yank', undefined, { spaces: 1 });
    expect(r).toMatchObject({ ok: false });
    expect(sim.rt.status).toBe('running');
  });

  it('Knot Reset and Mirror Knot only work for the side that is behind', () => {
    const sim = game();
    cast(sim, 'p2', 'yank', undefined, { spaces: 3 });
    expect(pos(sim)).toBe(3);
    expect(cast(sim, 'p2', 'mirror')).toMatchObject({ ok: false });
    expect(cast(sim, 'p1', 'mirror').ok).toBe(true);
    expect(pos(sim)).toBe(-3);
    expect(cast(sim, 'p3', 'reset')).toMatchObject({ ok: false });
    expect(cast(sim, 'p4', 'reset').ok).toBe(true);
    expect(pos(sim)).toBe(0);
  });

  it('Knot Gamble refuses against a stop and otherwise moves the knot by one of its stated amounts', () => {
    const sim = game({ ropeLength: 8 });
    cast(sim, 'p1', 'yank', undefined, { spaces: 3 });
    cast(sim, 'p3', 'yank', undefined, { spaces: 3 });
    sim.run(31_000);
    cast(sim, 'p1', 'yank', undefined, { spaces: 3 });
    expect(pos(sim)).toBe(-7);
    expect(cast(sim, 'p3', 'gamble')).toMatchObject({ ok: false });
    expect(cast(sim, 'p2', 'gamble')).toMatchObject({ ok: false });
    const fresh = game();
    expect(cast(fresh, 'p1', 'gamble').ok).toBe(true);
    expect([-3, -1, 2]).toContain(pos(fresh));
  });

  it('Rope Current drifts the knot half a space every 3 seconds while it lasts', () => {
    const sim = game();
    expect(cast(sim, 'p2', 'current', team(sim, 'p2')).ok).toBe(true);
    sim.run(3_100);
    expect(pos(sim)).toBe(0.5);
    sim.run(13_000);
    // Ticks at 3, 6, 9 and 12 seconds; the effect ends at 15.
    expect(pos(sim)).toBe(2);
  });

  it('Overtime Knot adds 20 seconds, only for the side that is not ahead', () => {
    const sim = game();
    const end = sim.state().endsAt;
    cast(sim, 'p1', 'yank', undefined, { spaces: 1 });
    expect(cast(sim, 'p3', 'overtime')).toMatchObject({ ok: false });
    expect(cast(sim, 'p2', 'overtime').ok).toBe(true);
    expect(sim.state().endsAt).toBe(end + 20_000);
    expect(sim.rt.nextTimerAt()).toBeLessThanOrEqual(end + 20_000);
  });
});

describe('tug-of-war pack: bending pulls', () => {
  it('Greased Rope halves pulls towards the greased side only', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'greased-rope', team(sim, 'p2')).ok).toBe(true);
    right(sim, 'p2');
    expect(pos(sim)).toBe(0.5);
    right(sim, 'p1');
    expect(pos(sim)).toBe(-0.5);
  });

  it('Iron Grip makes your side pull 1.5 spaces', () => {
    const sim = game();
    cast(sim, 'p1', 'iron-grip', team(sim, 'p1'));
    right(sim, 'p3');
    expect(pos(sim)).toBe(-1.5);
    right(sim, 'p2');
    expect(pos(sim)).toBe(-0.5);
  });

  it('Tangled Rope turns the other side\'s pulls towards your end', () => {
    const sim = game();
    cast(sim, 'p1', 'tangled-rope', team(sim, 'p2'));
    right(sim, 'p4');
    expect(pos(sim)).toBe(-1);
  });

  it('Rope Anchor stops all movement towards the other end, but not yours', () => {
    const sim = game();
    cast(sim, 'p1', 'anchor', team(sim, 'p1'));
    right(sim, 'p2');
    expect(pos(sim)).toBe(0);
    right(sim, 'p1');
    expect(pos(sim)).toBe(-1);
    sim.run(8_500);
    right(sim, 'p2');
    expect(pos(sim)).toBe(0);
  });

  it('Rope Frenzy doubles every movement either way', () => {
    const sim = game();
    cast(sim, 'p1', 'frenzy');
    right(sim, 'p1');
    expect(pos(sim)).toBe(-2);
    right(sim, 'p2');
    expect(pos(sim)).toBe(0);
  });

  it('Rope Burn: the target\'s pulls count but do not move the knot; their teammates still pull', () => {
    const sim = game();
    cast(sim, 'p1', 'rope-burn', 'p2');
    right(sim, 'p2');
    expect(pos(sim)).toBe(0);
    expect(sim.state().pullers.p2.pulls).toBe(1);
    right(sim, 'p4');
    expect(pos(sim)).toBe(1);
  });

  it('Rope Momentum adds a quarter space per pull in a row, and the chain breaks on a pull the other way', () => {
    const sim = game();
    cast(sim, 'p1', 'momentum', team(sim, 'p1'));
    right(sim, 'p1');
    right(sim, 'p3');
    right(sim, 'p1');
    expect(pos(sim)).toBe(-3.75);
    right(sim, 'p2');
    right(sim, 'p3');
    expect(pos(sim)).toBe(-3.75);
  });

  it('Last Stand doubles your pulls only while the knot leans the other way, and refuses otherwise', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'last-stand', team(sim, 'p1'))).toMatchObject({ ok: false });
    cast(sim, 'p2', 'yank', undefined, { spaces: 3 });
    expect(cast(sim, 'p1', 'last-stand', team(sim, 'p1')).ok).toBe(true);
    right(sim, 'p1');
    expect(pos(sim)).toBe(1);
    right(sim, 'p3');
    // From +1 the knot still leaned right before the pull: doubled to -1.
    expect(pos(sim)).toBe(-1);
    right(sim, 'p1');
    expect(pos(sim)).toBe(-2);
  });

  it('Rope Butterfingers: each wrong answer by the target slips the knot one space towards the caster', () => {
    const sim = game();
    cast(sim, 'p1', 'butterfingers', 'p2');
    wrong(sim, 'p2');
    expect(pos(sim)).toBe(-1);
    wrong(sim, 'p4');
    expect(pos(sim)).toBe(-1);
  });

  it('Tug Wager pays 2 spaces when the side gained ground and costs 2 when it did not', () => {
    const won = game();
    cast(won, 'p1', 'wager', team(won, 'p1'));
    right(won, 'p1');
    won.run(15_500);
    expect(pos(won)).toBe(-3);
    const lost = game();
    cast(lost, 'p1', 'wager', team(lost, 'p1'));
    lost.run(15_500);
    expect(pos(lost)).toBe(2);
  });

  it('Elastic Rope springs back to where it was when the other side gained ground', () => {
    const sim = game();
    cast(sim, 'p1', 'elastic', team(sim, 'p1'));
    right(sim, 'p2');
    right(sim, 'p4');
    expect(pos(sim)).toBe(2);
    sim.run(12_500);
    expect(pos(sim)).toBe(0);
  });

  it('Rope Tangle refuses the target\'s answers for 6 seconds', () => {
    const sim = game();
    cast(sim, 'p1', 'tangle', 'p2');
    expect(sim.rt.act('p2', sim.rt.botAction('p2', 1, rng))).toMatchObject({ ok: false });
    sim.run(6_500);
    right(sim, 'p2');
    expect(pos(sim)).toBe(1);
  });
});

describe('tug-of-war pack: heaves, slips and grips', () => {
  it('Heave Primer makes the next ordinary pull a heave, once', () => {
    const sim = game({ heave: true });
    expect(cast(sim, 'p1', 'heave-primer').ok).toBe(true);
    right(sim, 'p1');
    expect(pos(sim)).toBe(-2);
    right(sim, 'p1');
    expect(pos(sim)).toBe(-3);
  });

  it('Heave Primer is not used up by a heave that was due anyway', () => {
    const sim = game({ heave: true });
    right(sim, 'p1');
    right(sim, 'p1');
    cast(sim, 'p1', 'heave-primer');
    right(sim, 'p1');
    expect(pos(sim)).toBe(-4);
    right(sim, 'p1');
    expect(pos(sim)).toBe(-6);
  });

  it('Mighty Heave makes heaves pull three times as far', () => {
    const sim = game({ heave: true });
    cast(sim, 'p1', 'mighty-heave');
    right(sim, 'p1');
    right(sim, 'p1');
    right(sim, 'p1');
    expect(pos(sim)).toBe(-5);
  });

  it('Broken Rope Rhythm resets a streak and refuses an empty one', () => {
    const sim = game({ heave: true });
    expect(cast(sim, 'p1', 'broken-rhythm', 'p2')).toMatchObject({ ok: false });
    right(sim, 'p2');
    expect(cast(sim, 'p1', 'broken-rhythm', 'p2').ok).toBe(true);
    expect(sim.state().pullers.p2.stream.streak).toBe(0);
  });

  it('Heave Breaker turns the other side\'s heaves into ordinary pulls', () => {
    const sim = game({ heave: true });
    cast(sim, 'p1', 'heave-breaker', team(sim, 'p2'));
    right(sim, 'p2');
    right(sim, 'p2');
    right(sim, 'p2');
    expect(pos(sim)).toBe(3);
  });

  it('Rosin Grip stops your side\'s slips and leaves the other side\'s alone', () => {
    const sim = game({ slack: true });
    cast(sim, 'p1', 'rosin-grip', team(sim, 'p1'));
    wrong(sim, 'p1');
    expect(pos(sim)).toBe(0);
    expect(sim.state().pullers.p1.slips).toBe(0);
    wrong(sim, 'p2');
    expect(pos(sim)).toBe(-0.5);
  });

  it('Topsy-Turvy Grip hands the underdog grip to the side that is ahead', () => {
    const sim = game({ underdog: true });
    cast(sim, 'p2', 'yank', undefined, { spaces: 2 });
    cast(sim, 'p1', 'topsy-grip');
    // Left trails: normally 1.5 a pull, now 1. Right leads: normally 1, now 1.5.
    right(sim, 'p1');
    expect(pos(sim)).toBe(1);
    right(sim, 'p2');
    expect(pos(sim)).toBe(2.5);
  });

  it('cheats that need a rule are unavailable without it', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'mighty-heave')).toMatchObject({ ok: false });
    expect(cast(sim, 'p1', 'rosin-grip', team(sim, 'p1'))).toMatchObject({ ok: false });
    expect(cast(sim, 'p1', 'topsy-grip')).toMatchObject({ ok: false });
  });

  it('Knot Wobble jumps the knot half a space every 2 seconds', () => {
    const sim = game();
    cast(sim, 'p1', 'wobble');
    sim.run(2_100);
    expect(Math.abs(pos(sim))).toBe(0.5);
    expect(sim.errors).toEqual([]);
  });
});

describe('tug-of-war pack: streaks, trades and tiebreaks', () => {
  it('Rope Rhythm Thief moves an opponent\'s streak onto yours, as far as your correct answers allow', () => {
    const sim = game({ heave: true });
    expect(cast(sim, 'p1', 'rhythm-thief', 'p2')).toMatchObject({ ok: false });
    right(sim, 'p1');
    right(sim, 'p1');
    wrong(sim, 'p1');
    for (let i = 0; i < 3; i++) right(sim, 'p2');
    // -1 -1, then +1 +1 and a heave of +2.
    expect(pos(sim)).toBe(2);
    expect(cast(sim, 'p1', 'rhythm-thief', 'p2').ok).toBe(true);
    expect(sim.state().pullers.p2.stream.streak).toBe(0);
    // p1 has 2 correct answers, so keeps 2 of the 3.
    expect(sim.state().pullers.p1.stream.streak).toBe(2);
    right(sim, 'p1');
    expect(pos(sim)).toBe(0);
  });

  it('Rope Rhythm Thief is refused when you could keep none of the streak', () => {
    const sim = game({ heave: true });
    right(sim, 'p1');
    right(sim, 'p2');
    const r = cast(sim, 'p1', 'rhythm-thief', 'p2');
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.message).toMatch(/could not keep/);
  });

  it('Selfless Heave trades a quarter of your pulls for 2 spaces, and stops short of the line', () => {
    const sim = game({ ropeLength: 8 });
    expect(cast(sim, 'p1', 'selfless-heave')).toMatchObject({ ok: false });
    for (let i = 0; i < 4; i++) right(sim, 'p1');
    expect(cast(sim, 'p1', 'selfless-heave').ok).toBe(true);
    expect(pos(sim)).toBe(-6);
    expect(sim.state().pullers.p1.pulls).toBe(3);
    sim.run(31_000);
    expect(cast(sim, 'p1', 'selfless-heave').ok).toBe(true);
    expect(pos(sim)).toBe(-7);
    expect(sim.state().pullers.p1.pulls).toBe(2);
    sim.run(31_000);
    expect(cast(sim, 'p1', 'selfless-heave')).toMatchObject({ ok: false });
    expect(sim.state().pullers.p1.pulls).toBe(2);
  });

  it('Knot Tiebreaker moves the knot 2 spaces towards the side with more pulls, only near the middle', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'tiebreaker')).toMatchObject({ ok: false });
    right(sim, 'p2');
    // Cast by the left side, it still helps the right, which has made more pulls.
    expect(cast(sim, 'p1', 'tiebreaker').ok).toBe(true);
    expect(pos(sim)).toBe(3);
    sim.run(61_000);
    expect(cast(sim, 'p1', 'tiebreaker')).toMatchObject({ ok: false });
  });
});

describe('tug-of-war pack: contests, drums and borrowed rules', () => {
  it('Tug Snap Pull doubles only answers given within 4 seconds of the question appearing', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'snap-pull').ok).toBe(true);
    right(sim, 'p1');
    expect(pos(sim)).toBe(-2);
    sim.run(5_000);
    right(sim, 'p1');
    expect(pos(sim)).toBe(-3);
    right(sim, 'p3');
    expect(pos(sim)).toBe(-4);
  });

  it('Tug Pulling Contest moves the knot 2 spaces towards whoever answered more right, and nothing on a tie', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'pulling-contest', 'p3')).toMatchObject({ ok: false });
    expect(cast(sim, 'p1', 'pulling-contest', 'p2').ok).toBe(true);
    right(sim, 'p1');
    right(sim, 'p1');
    right(sim, 'p2');
    expect(pos(sim)).toBe(-1);
    sim.run(15_500);
    expect(pos(sim)).toBe(-3);
    const tie = game();
    cast(tie, 'p1', 'pulling-contest', 'p2');
    right(tie, 'p1');
    right(tie, 'p2');
    tie.run(15_500);
    expect(pos(tie)).toBe(0);
  });

  it('Tug Drumbeat beats four times and moves the knot 1 space towards the side that pulled more since the last beat', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'drumbeat').ok).toBe(true);
    right(sim, 'p1');
    sim.run(5_100);
    expect(pos(sim)).toBe(-2);
    right(sim, 'p2');
    right(sim, 'p4');
    expect(pos(sim)).toBe(0);
    sim.run(5_000);
    expect(pos(sim)).toBe(1);
    // No pulls before the third beat: the knot stays put.
    sim.run(5_000);
    expect(pos(sim)).toBe(1);
    right(sim, 'p3');
    sim.run(5_000);
    expect(pos(sim)).toBe(-1);
    // Four beats, then it is over: a pull after the last beat is not answered by one.
    right(sim, 'p1');
    sim.run(5_000);
    expect(pos(sim)).toBe(-2);
    expect(sim.chaos().effects.some((e) => e.cheatId === 'tug-of-war.drumbeat')).toBe(false);
  });

  it('Borrowed Heave makes every third correct answer in a row pull double, and is refused when Heave is on', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'borrowed-heave').ok).toBe(true);
    right(sim, 'p1');
    right(sim, 'p1');
    expect(pos(sim)).toBe(-2);
    right(sim, 'p1');
    expect(pos(sim)).toBe(-4);
    sim.run(20_500);
    for (let i = 0; i < 3; i++) right(sim, 'p2');
    expect(pos(sim)).toBe(-1);
    expect(cast(game({ heave: true }), 'p1', 'borrowed-heave')).toMatchObject({ ok: false });
  });

  it('Rope Domino Slip: a wrong answer on the other side breaks every streak on that side', () => {
    const sim = game({ heave: true });
    right(sim, 'p2');
    right(sim, 'p4');
    right(sim, 'p1');
    expect(cast(sim, 'p1', 'domino-slip', team(sim, 'p2')).ok).toBe(true);
    wrong(sim, 'p4');
    expect(sim.state().pullers.p2.stream.streak).toBe(0);
    expect(sim.state().pullers.p4.stream.streak).toBe(0);
    right(sim, 'p3');
    wrong(sim, 'p3');
    // The caster's own side is left alone.
    expect(sim.state().pullers.p1.stream.streak).toBe(1);
  });
});

describe('tug-of-war pack: Knot Guard', () => {
  it('refuses cheats that would drag the knot towards the other end, but not answers or your own side\'s cheats', () => {
    const sim = game();
    cast(sim, 'p1', 'yank', undefined, { spaces: 3 });
    expect(pos(sim)).toBe(-3);
    expect(cast(sim, 'p1', 'knot-guard', team(sim, 'p1')).ok).toBe(true);
    for (const id of ['yank', 'reset', 'mirror', 'gamble']) expect(cast(sim, 'p2', id)).toMatchObject({ ok: false });
    expect(cast(sim, 'p2', 'current', team(sim, 'p2'))).toMatchObject({ ok: false });
    expect(pos(sim)).toBe(-3);
    // Answers still move it, and the guarding side's own cheats still pull their way.
    right(sim, 'p2');
    expect(pos(sim)).toBe(-2);
    expect(cast(sim, 'p3', 'yank', undefined, { spaces: 1 }).ok).toBe(true);
    expect(pos(sim)).toBe(-3);
    sim.run(20_500);
    expect(cast(sim, 'p2', 'reset').ok).toBe(true);
    expect(pos(sim)).toBe(0);
  });

  it('holds back lasting cheats\' moves towards the other end while it lasts', () => {
    const sim = game();
    expect(cast(sim, 'p2', 'current', team(sim, 'p2')).ok).toBe(true);
    sim.run(3_100);
    expect(pos(sim)).toBe(0.5);
    expect(cast(sim, 'p1', 'knot-guard', team(sim, 'p1')).ok).toBe(true);
    sim.run(6_000);
    expect(pos(sim)).toBe(0.5);
    expect(sim.errors).toEqual([]);
  });
});
