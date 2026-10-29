import { afterEach, describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';

/*
 * Exact behaviour of the comet-dash pack. Bots stay idle so nothing moves
 * unless a test moves it; positions and streaks are set up by patching the
 * state between transactions.
 */

const sims: ChaosSim[] = [];
// No cheat may make the game log an error.
afterEach(() => {
  for (const sim of sims.splice(0)) expect(sim.errors).toEqual([]);
});

function race(settings: Record<string, unknown> = {}) {
  const sim = new ChaosSim({ modeId: 'comet-dash', questions: MIXED_SET, players: 4, seed: 5, settings: { slipstream: false, ...settings } });
  for (const id of sim.ids) sim.idle.add(id);
  sims.push(sim);
  return sim;
}

/** Change the committed state directly (tests only). */
function patch(sim: ChaosSim, fn: (s: any) => void) {
  const s = structuredClone(sim.state());
  fn(s);
  (sim.rt as unknown as { state: unknown }).state = s;
}

function place(sim: ChaosSim, pos: Record<string, number>, streak: Record<string, number> = {}) {
  patch(sim, (s) => {
    for (const [id, p] of Object.entries(pos)) s.racers[id].pos = p;
    for (const [id, k] of Object.entries(streak)) {
      s.racers[id].stream.streak = k;
      s.racers[id].stream.correct = Math.max(s.racers[id].stream.correct, k + 5);
    }
  });
}

function answer(sim: ChaosSim, id: string, right: boolean) {
  const a = sim.rt.botAction(id, right ? 1 : 0, createRng(3));
  expect(a).toBeTruthy();
  const r = sim.rt.act(id, a);
  expect(r.ok).toBe(true);
}

const pos = (sim: ChaosSim, id: string) => sim.state().racers[id].pos as number;
const streak = (sim: ChaosSim, id: string) => sim.state().racers[id].stream.streak as number;
const cast = (sim: ChaosSim, caster: string, cheat: string, target?: string) => sim.cast(caster, { cheatId: `comet-dash.${cheat}`, target: target ?? null });

describe('comet-dash pack: moving comets', () => {
  it('afterburner moves 2 spaces and always stops a space short of the line', () => {
    const sim = race();
    place(sim, { p1: 3 });
    expect(cast(sim, 'p1', 'afterburner').ok).toBe(true);
    expect(pos(sim, 'p1')).toBe(5);
    const near = race();
    place(near, { p1: 18 });
    expect(cast(near, 'p1', 'afterburner').ok).toBe(true);
    expect(pos(near, 'p1')).toBe(19);
    place(near, { p2: 19 });
    expect(cast(near, 'p2', 'afterburner')).toMatchObject({ ok: false });
    expect(near.state().racers.p2.place).toBeNull();
  });

  it('afterburner can be undone', () => {
    const sim = race();
    place(sim, { p1: 3 });
    const r = cast(sim, 'p1', 'afterburner');
    expect(r.ok && sim.rt.undoCast('p1', r.castId).ok).toBe(true);
    expect(pos(sim, 'p1')).toBe(3);
  });

  it('tractor beam drags 2 back, never behind the start, and refuses on the start line', () => {
    const sim = race();
    place(sim, { p2: 1 });
    expect(cast(sim, 'p1', 'tractor-beam', 'p2').ok).toBe(true);
    expect(pos(sim, 'p2')).toBe(0);
    expect(cast(sim, 'p3', 'tractor-beam', 'p2')).toMatchObject({ ok: false });
  });

  it('slingshot lands one space in front of the nearest comet up to 3 ahead', () => {
    const sim = race();
    place(sim, { p1: 5, p2: 7, p3: 8, p4: 0 });
    expect(cast(sim, 'p1', 'slingshot').ok).toBe(true);
    expect(pos(sim, 'p1')).toBe(8);
    const far = race();
    place(far, { p1: 5, p2: 9, p3: 0, p4: 0 });
    expect(cast(far, 'p1', 'slingshot')).toMatchObject({ ok: false });
  });

  it('gravity well pulls comets within 3 spaces onto yours and leaves the rest', () => {
    const sim = race();
    place(sim, { p1: 10, p2: 8, p3: 13, p4: 2 });
    expect(cast(sim, 'p1', 'gravity-well').ok).toBe(true);
    expect([pos(sim, 'p2'), pos(sim, 'p3'), pos(sim, 'p4')]).toEqual([10, 10, 2]);
  });

  it('supernova blasts comets within 2 spaces back 2', () => {
    const sim = race();
    place(sim, { p1: 10, p2: 9, p3: 12, p4: 5 });
    expect(cast(sim, 'p1', 'supernova').ok).toBe(true);
    expect([pos(sim, 'p1'), pos(sim, 'p2'), pos(sim, 'p3'), pos(sim, 'p4')]).toEqual([10, 7, 10, 5]);
  });

  it('solar flare moves every comet on the trail by one space', () => {
    const sim = race();
    place(sim, { p1: 5, p2: 5, p3: 5, p4: 5 });
    expect(cast(sim, 'p1', 'solar-flare').ok).toBe(true);
    for (const id of sim.ids) expect([4, 6]).toContain(pos(sim, id));
  });

  it('blind hyperjump lands on one of its three stated spaces', () => {
    const sim = race();
    place(sim, { p1: 4 });
    expect(cast(sim, 'p1', 'blind-jump').ok).toBe(true);
    expect([0, 10, 17]).toContain(pos(sim, 'p1'));
  });

  it('Comet Asteroid Patch bumps the target back to two spaces behind it when they reach it', () => {
    const sim = race();
    place(sim, { p2: 4 });
    expect(cast(sim, 'p1', 'space-mine', 'p2').ok).toBe(true);
    answer(sim, 'p2', true);
    expect(pos(sim, 'p2')).toBe(3);
    expect(sim.chaos().effects).toHaveLength(0);
  });
});

describe('comet-dash pack: streaks and boosts', () => {
  it('ignition primes the streak one short of the next boost, no longer than correct answers', () => {
    const sim = race();
    place(sim, { p1: 2 }, { p1: 1 });
    expect(cast(sim, 'p1', 'ignition').ok).toBe(true);
    expect(streak(sim, 'p1')).toBe(2);
    answer(sim, 'p1', true);
    expect(pos(sim, 'p1')).toBe(4);
    expect(sim.state().racers.p1.lastMove.notes).toContain('Boost');
    const fresh = race();
    expect(cast(fresh, 'p1', 'ignition')).toMatchObject({ ok: false });
  });

  it('ignition with momentum primes a streak of 2', () => {
    const sim = race({ momentum: true });
    place(sim, {}, { p1: 0 });
    expect(cast(sim, 'p1', 'ignition').ok).toBe(true);
    expect(streak(sim, 'p1')).toBe(2);
  });

  it('flameout zeroes an opponent streak and refuses when there is none', () => {
    const sim = race();
    place(sim, {}, { p2: 3 });
    expect(cast(sim, 'p1', 'flameout', 'p2').ok).toBe(true);
    expect(streak(sim, 'p2')).toBe(0);
    expect(cast(sim, 'p3', 'flameout', 'p2')).toMatchObject({ ok: false });
  });

  it('tail grab takes a longer streak, capped by your own correct answers', () => {
    const sim = race();
    patch(sim, (s) => {
      s.racers.p1.stream.streak = 0;
      s.racers.p1.stream.correct = 2;
      s.racers.p2.stream.streak = 4;
      s.racers.p2.stream.correct = 4;
    });
    expect(cast(sim, 'p1', 'tail-grab', 'p2').ok).toBe(true);
    expect([streak(sim, 'p1'), streak(sim, 'p2')]).toEqual([2, 0]);
  });

  it('hair trigger boosts the second answer of a streak', () => {
    const sim = race();
    place(sim, { p1: 0 }, { p1: 1 });
    expect(cast(sim, 'p1', 'hair-trigger').ok).toBe(true);
    answer(sim, 'p1', true);
    expect(pos(sim, 'p1')).toBe(2);
    answer(sim, 'p1', true);
    // Third in a row: the race's own boost (every 3), and no hair-trigger extra on an odd streak.
    expect(pos(sim, 'p1')).toBe(4);
  });

  it('full throttle moves 3 spaces on a streak of 1 with momentum', () => {
    const sim = race({ momentum: true });
    expect(cast(sim, 'p1', 'full-throttle').ok).toBe(true);
    answer(sim, 'p1', true);
    expect(pos(sim, 'p1')).toBe(3);
  });

  it('boost hijack moves the boost space to the caster', () => {
    const sim = race();
    place(sim, { p1: 0, p2: 5 }, { p2: 2 });
    expect(cast(sim, 'p1', 'boost-hijack', 'p2').ok).toBe(true);
    answer(sim, 'p2', true);
    expect([pos(sim, 'p1'), pos(sim, 'p2')]).toEqual([1, 6]);
  });

  it('streak stabiliser keeps the streak through one wrong answer', () => {
    const sim = race();
    place(sim, { p1: 3 }, { p1: 2 });
    expect(cast(sim, 'p1', 'streak-saver').ok).toBe(true);
    answer(sim, 'p1', false);
    sim.run(500);
    expect(streak(sim, 'p1')).toBe(2);
    expect(sim.chaos().effects).toHaveLength(0);
    answer(sim, 'p1', false);
    sim.run(500);
    expect(streak(sim, 'p1')).toBe(0);
  });
});

describe('comet-dash pack: slipstream and tailwind', () => {
  it('slipstream lock adds the slipstream space with nobody ahead', () => {
    const sim = race({ slipstream: true });
    place(sim, { p1: 10, p2: 0, p3: 0, p4: 0 });
    expect(cast(sim, 'p1', 'slipstream-lock').ok).toBe(true);
    answer(sim, 'p1', true);
    expect(pos(sim, 'p1')).toBe(12);
  });

  it('slipstream lock never gives slipstream twice', () => {
    const sim = race({ slipstream: true });
    place(sim, { p1: 5, p2: 7, p3: 0, p4: 0 });
    expect(cast(sim, 'p1', 'slipstream-lock').ok).toBe(true);
    answer(sim, 'p1', true);
    expect(pos(sim, 'p1')).toBe(7);
  });

  it('wake turbulence removes the slipstream space', () => {
    const sim = race({ slipstream: true });
    place(sim, { p1: 0, p2: 0, p3: 2, p4: 0 });
    expect(cast(sim, 'p1', 'wake-turbulence', 'p2').ok).toBe(true);
    answer(sim, 'p2', true);
    expect(pos(sim, 'p2')).toBe(1);
  });

  it('rubber band gives the back half an extra space, and refuses when the race has tailwind', () => {
    const sim = race();
    place(sim, { p1: 0, p2: 8, p3: 8, p4: 8 });
    expect(cast(sim, 'p2', 'rubber-band').ok).toBe(true);
    answer(sim, 'p1', true);
    expect(pos(sim, 'p1')).toBe(2);
    answer(sim, 'p3', true);
    expect(pos(sim, 'p3')).toBe(9);
    expect(cast(race({ tailwind: true }), 'p1', 'rubber-band')).toMatchObject({ ok: false });
  });
});

describe('comet-dash pack: wrong answers and setbacks', () => {
  it('meteor shower knocks a comet back a space for each wrong answer', () => {
    const sim = race();
    place(sim, { p2: 5 });
    expect(cast(sim, 'p1', 'meteor-shower', 'p2').ok).toBe(true);
    answer(sim, 'p2', false);
    sim.run(500);
    expect(pos(sim, 'p2')).toBe(4);
    answer(sim, 'p2', true);
    sim.run(500);
    expect(pos(sim, 'p2')).toBe(5);
  });

  it('trail rewind gives back the spaces the last answer lost, once', () => {
    const sim = race({ wrongSetback: true });
    place(sim, { p1: 4 });
    expect(cast(sim, 'p1', 'rewind')).toMatchObject({ ok: false });
    answer(sim, 'p1', false);
    expect(pos(sim, 'p1')).toBe(3);
    expect(cast(sim, 'p1', 'rewind').ok).toBe(true);
    expect(pos(sim, 'p1')).toBe(4);
    sim.run(41_000);
    expect(cast(sim, 'p1', 'rewind')).toMatchObject({ ok: false });
  });

  it('star gate anchor turns a fall to the gate into one space back', () => {
    const sim = race({ starGates: 5 });
    place(sim, { p1: 8 });
    expect(cast(sim, 'p1', 'gate-anchor').ok).toBe(true);
    answer(sim, 'p1', false);
    expect(pos(sim, 'p1')).toBe(7);
  });

  it('star gate collapse sends an opponent to their last gate, and refuses on a gate', () => {
    const sim = race({ starGates: 5 });
    place(sim, { p2: 8 });
    expect(cast(sim, 'p1', 'gate-collapse', 'p2').ok).toBe(true);
    expect(pos(sim, 'p2')).toBe(5);
    expect(cast(sim, 'p3', 'gate-collapse', 'p2')).toMatchObject({ ok: false });
  });

  it('star gate hop jumps to the next gate, but not to the finish line', () => {
    const sim = race({ starGates: 5 });
    place(sim, { p1: 6, p2: 16 });
    expect(cast(sim, 'p1', 'gate-hop').ok).toBe(true);
    expect(pos(sim, 'p1')).toBe(10);
    expect(cast(sim, 'p2', 'gate-hop')).toMatchObject({ ok: false });
  });

  it('setback cheats are only offered when the race has setbacks', () => {
    const sim = race();
    expect(cast(sim, 'p1', 'rewind')).toMatchObject({ ok: false });
    expect(cast(sim, 'p1', 'gate-hop')).toMatchObject({ ok: false });
  });
});

describe('comet-dash pack: wormholes', () => {
  it('wormhole seeder plants one 1 to 3 spaces ahead, in a space the mode could use', () => {
    const sim = race({ wormholes: true });
    patch(sim, (s) => {
      s.wormholes = [15];
      s.racers.p1.pos = 5;
    });
    expect(cast(sim, 'p1', 'plant-wormhole').ok).toBe(true);
    const holes: number[] = sim.state().wormholes;
    expect(holes).toHaveLength(2);
    expect([6, 7, 8]).toContain(holes[0]);
    // Planted wormholes work like the mode's own.
    patch(sim, (s) => (s.racers.p2.pos = holes[0]! - 1));
    answer(sim, 'p2', true);
    expect(pos(sim, 'p2')).toBe(holes[0]! + 3);
  });

  it('wormhole collapse removes the next one ahead but never the last', () => {
    const sim = race({ wormholes: true });
    patch(sim, (s) => {
      s.wormholes = [10, 15];
      s.racers.p2.pos = 9;
    });
    expect(cast(sim, 'p1', 'collapse-wormhole', 'p2').ok).toBe(true);
    expect(sim.state().wormholes).toEqual([15]);
    expect(cast(sim, 'p3', 'collapse-wormhole', 'p2')).toMatchObject({ ok: false });
  });

  it('wormhole dowsing stops one short of a wormhole 2 to 5 ahead', () => {
    const sim = race({ wormholes: true });
    patch(sim, (s) => {
      s.wormholes = [15];
      s.racers.p1.pos = 11;
      s.racers.p2.pos = 2;
    });
    expect(cast(sim, 'p1', 'wormhole-dowsing').ok).toBe(true);
    expect(pos(sim, 'p1')).toBe(14);
    expect(cast(sim, 'p2', 'wormhole-dowsing')).toMatchObject({ ok: false });
  });

  it('wormhole reshuffle keeps the count and the allowed spaces', () => {
    const sim = race({ wormholes: true });
    patch(sim, (s) => (s.wormholes = [3, 9, 12]));
    expect(cast(sim, 'p1', 'wormhole-shuffle').ok).toBe(true);
    const holes: number[] = sim.state().wormholes;
    expect(holes).toHaveLength(3);
    expect(holes.join()).not.toBe('3,9,12');
    for (const h of holes) expect(h >= 2 && h <= 16).toBe(true);
  });
});

describe('comet-dash pack: questions and the clock', () => {
  it('reroute swaps the question without moving or counting an answer', () => {
    const sim = race();
    const before = sim.state().racers.p1;
    expect(cast(sim, 'p1', 'reroute').ok).toBe(true);
    const after = sim.state().racers.p1;
    expect(after.stream.iid).not.toBe(before.stream.iid);
    expect([after.pos, after.stream.answered]).toEqual([before.pos, before.stream.answered]);
  });

  it('engine stall refuses answers for 8 seconds', () => {
    const sim = race();
    expect(cast(sim, 'p1', 'engine-stall', 'p2').ok).toBe(true);
    const a = sim.rt.botAction('p2', 1, createRng(3));
    expect(sim.rt.act('p2', a)).toMatchObject({ ok: false });
    sim.run(8_100);
    expect(sim.rt.act('p2', sim.rt.botAction('p2', 1, createRng(3))).ok).toBe(true);
  });

  it('time dilation adds up to 30 seconds, never more than the race started with', () => {
    const sim = race();
    expect(cast(sim, 'p1', 'time-dilation')).toMatchObject({ ok: false });
    sim.run(60_000);
    const before = sim.state().endsAt;
    expect(cast(sim, 'p1', 'time-dilation').ok).toBe(true);
    expect(sim.state().endsAt - before).toBe(30_000);
    expect(sim.rt.nextTimerAt()).toBeLessThanOrEqual(sim.state().endsAt);
  });
});

describe('comet-dash pack: more of the trail', () => {
  const text = (sim: ChaosSim, id: string) => sim.state().racers[id].stream.last?.text as string;

  it('Comet Star Chart shows the caster, and nobody else, the wormholes still ahead', () => {
    const sim = race({ wormholes: true });
    patch(sim, (s) => {
      s.wormholes = [4, 9, 13];
      s.racers.p1.pos = 5;
      s.racers.p2.pos = 15;
    });
    expect(cast(sim, 'p1', 'star-chart').ok).toBe(true);
    expect(sim.view('p1').overlays).toHaveLength(1);
    expect(sim.view('p1').overlays[0]).toMatchObject({ kind: 'badge', text: 'Star chart: wormholes at spaces 9 and 13', tone: 'info' });
    expect(sim.view('p2').overlays).toEqual([]);
    // The chart follows the trail: a wormhole that moves shows up within a second.
    patch(sim, (s) => (s.wormholes = [12]));
    sim.run(1_100);
    expect(sim.view('p1').overlays[0]).toMatchObject({ text: 'Star chart: wormholes at space 12' });
    expect(cast(sim, 'p2', 'star-chart')).toMatchObject({ ok: false });
    expect(cast(race(), 'p1', 'star-chart')).toMatchObject({ ok: false });
  });

  it('Comet Wormhole Magnet pulls in a comet that lands one space before or after a wormhole', () => {
    const before = race({ wormholes: true });
    patch(before, (s) => {
      s.wormholes = [8];
      s.racers.p1.pos = 6;
    });
    expect(cast(before, 'p1', 'wormhole-magnet').ok).toBe(true);
    answer(before, 'p1', true);
    expect(pos(before, 'p1')).toBe(11);
    expect(text(before, 'p1')).toBe('+5 spaces (Wormhole magnet)');
    // A boosted move of 2 overshoots the wormhole by one: pulled back in, then thrown 3 on from it.
    const after = race({ wormholes: true });
    patch(after, (s) => (s.wormholes = [8]));
    place(after, { p1: 7 }, { p1: 2 });
    expect(cast(after, 'p1', 'wormhole-magnet').ok).toBe(true);
    answer(after, 'p1', true);
    expect(pos(after, 'p1')).toBe(11);
    expect(text(after, 'p1')).toBe('+4 spaces (Boost, Wormhole magnet)');
  });

  it('Comet Wormhole Magnet leaves exact landings and far misses to the mode, and needs a wormhole ahead', () => {
    const sim = race({ wormholes: true });
    patch(sim, (s) => {
      s.wormholes = [8, 14];
      s.racers.p1.pos = 7;
      s.racers.p2.pos = 15;
    });
    expect(cast(sim, 'p1', 'wormhole-magnet').ok).toBe(true);
    answer(sim, 'p1', true);
    // The mode's own jump: 8 + 3.
    expect(pos(sim, 'p1')).toBe(11);
    answer(sim, 'p1', true);
    // 12 is two spaces from 14: no pull.
    expect(pos(sim, 'p1')).toBe(12);
    expect(cast(sim, 'p2', 'wormhole-magnet')).toMatchObject({ ok: false });
  });

  it('Comet Wormhole Backfire throws an opponent back instead of ahead, never behind the start', () => {
    const sim = race({ wormholes: true });
    patch(sim, (s) => {
      s.wormholes = [2, 8];
      s.racers.p2.pos = 7;
      s.racers.p3.pos = 1;
      s.racers.p4.pos = 12;
    });
    expect(cast(sim, 'p1', 'wormhole-backfire', 'p2').ok).toBe(true);
    answer(sim, 'p2', true);
    expect(pos(sim, 'p2')).toBe(5);
    expect(text(sim, 'p2')).toBe('Back 2 spaces (Wormhole, Backfire)');
    // Moves that miss the wormholes are left alone.
    answer(sim, 'p2', true);
    expect(pos(sim, 'p2')).toBe(6);
    expect(cast(sim, 'p4', 'wormhole-backfire', 'p3').ok).toBe(true);
    answer(sim, 'p3', true);
    expect(pos(sim, 'p3')).toBe(0);
    expect(cast(sim, 'p3', 'wormhole-backfire', 'p4')).toMatchObject({ ok: false });
  });

  it('Comet Star Gate Lock holds an opponent in front of the next gate until it ends', () => {
    const sim = race({ starGates: 5 });
    place(sim, { p2: 3, p3: 16 });
    expect(cast(sim, 'p1', 'gate-lock', 'p2').ok).toBe(true);
    answer(sim, 'p2', true);
    expect(pos(sim, 'p2')).toBe(4);
    answer(sim, 'p2', true);
    expect(pos(sim, 'p2')).toBe(4);
    expect(text(sim, 'p2')).toBe('No move (Gate locked)');
    sim.run(20_100);
    expect(sim.chaos().effects).toHaveLength(0);
    answer(sim, 'p2', true);
    // The third right answer in a row is a boost: through the gate and one beyond.
    expect(pos(sim, 'p2')).toBe(6);
    // Gate 20 is the finish line.
    expect(cast(sim, 'p4', 'gate-lock', 'p3')).toMatchObject({ ok: false });
  });

  it('Comet Bumper Cars bumps back each comet the caster passes, and nobody else', () => {
    const sim = race();
    place(sim, { p1: 4, p2: 6, p3: 4, p4: 5 }, { p1: 2 });
    expect(cast(sim, 'p1', 'bumper-cars').ok).toBe(true);
    // A boosted move of 2, from 4 to 6: p3 (level) and p4 (ahead) are passed; p2 is drawn level with, not passed.
    answer(sim, 'p1', true);
    expect([pos(sim, 'p1'), pos(sim, 'p2'), pos(sim, 'p3'), pos(sim, 'p4')]).toEqual([6, 6, 3, 4]);
    // Comets on the start line have nowhere to go back to.
    const start = race();
    expect(cast(start, 'p1', 'bumper-cars').ok).toBe(true);
    answer(start, 'p1', true);
    expect(start.ids.map((id) => pos(start, id))).toEqual([1, 0, 0, 0]);
  });

  it('Comet Constellation Tow tows every comet in Race Together until someone is home', () => {
    const sim = race({ together: true });
    expect(cast(sim, 'p1', 'constellation-tow').ok).toBe(true);
    answer(sim, 'p2', true);
    expect(pos(sim, 'p2')).toBe(2);
    expect(text(sim, 'p2')).toBe('+2 spaces (Towed)');
    sim.run(25_100);
    answer(sim, 'p2', true);
    expect(pos(sim, 'p2')).toBe(3);
    // Once someone is home, the mode tows everyone itself.
    patch(sim, (s) => {
      s.racers.p3.pos = 20;
      s.racers.p3.place = 1;
      s.finishOrder = ['p3'];
    });
    expect(cast(sim, 'p4', 'constellation-tow')).toMatchObject({ ok: false });
    expect(cast(race(), 'p1', 'constellation-tow')).toMatchObject({ ok: false });
  });

  it('Comet Clock Crunch takes 30 seconds off, never leaving less than 30', () => {
    const sim = race();
    const start = sim.state().endsAt as number;
    expect(cast(sim, 'p1', 'clock-crunch').ok).toBe(true);
    expect(sim.state().endsAt).toBe(start - 30_000);
    sim.run(start - 30_000 - sim.now - 45_000);
    expect(cast(sim, 'p2', 'clock-crunch').ok).toBe(true);
    expect(sim.state().endsAt - sim.now).toBe(30_000);
    expect(cast(sim, 'p3', 'clock-crunch')).toMatchObject({ ok: false });
    sim.run(29_000);
    expect(sim.rt.status).toBe('running');
    sim.run(1_500);
    expect(sim.rt.status).not.toBe('running');
    const open = new ChaosSim({ modeId: 'comet-dash', questions: MIXED_SET, players: 2, seed: 5, common: { timeLimitSec: 0 } });
    sims.push(open);
    expect(open.cast('p1', { cheatId: 'comet-dash.clock-crunch' })).toMatchObject({ ok: false });
  });
});
