import { describe, expect, it } from 'vitest';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { allCheats, allCombos, chaosCatalog, cheatAvailability, getCheat } from '../src/chaos/registry.ts';
import { PILE_ON_LIMIT } from '../src/chaos/engine.ts';

/*
 * Exact behaviour of the universal cheats and the engine rules around them:
 * what the catalogue suite cannot see by comparing two games.
 */

const classic = (extra: Partial<ConstructorParameters<typeof ChaosSim>[0]> = {}) => new ChaosSim({ modeId: 'classic', questions: MIXED_SET, players: 4, seed: 31, ...extra });
const scores = (sim: ChaosSim) => ({ ...sim.state().sync.scores }) as Record<string, number>;
const energy = (sim: ChaosSim, id: string) => sim.view(id).me!.energy;

/** A classic game where everyone has some points. */
function scored(extra: Partial<ConstructorParameters<typeof ChaosSim>[0]> = {}) {
  const sim = classic(extra);
  for (let i = 0; i < 20 && Object.values(scores(sim)).some((v) => v === 0); i++) sim.run(5000);
  for (const id of sim.ids) if (scores(sim)[id] === 0) sim.cast(id === 'p1' ? 'p2' : 'p1', { cheatId: 'score.gift', target: id });
  return sim;
}

describe('defences', () => {
  it('a shield blocks one harmful cheat, then is gone', () => {
    const sim = scored();
    expect(sim.cast('p2', { cheatId: 'adv.shield' }).ok).toBe(true);
    const before = scores(sim).p2;
    const r = sim.cast('p1', { cheatId: 'score.pickpocket', target: 'p2' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toMatch(/blocked/);
    expect(scores(sim).p2).toBe(before);
    expect(sim.chaos().effects.some((e) => e.cheatId === 'adv.shield')).toBe(false);
    expect(sim.cast('p3', { cheatId: 'score.pickpocket', target: 'p2' }).ok).toBe(true);
    expect(scores(sim).p2).toBeLessThan(before);
  });

  it('a mirror bounces the cheat back onto its caster', () => {
    const sim = scored();
    sim.cast('p2', { cheatId: 'adv.mirror' });
    sim.cast('p1', { cheatId: 'score.freeze-score', target: 'p2' });
    const freeze = sim.chaos().effects.find((e) => e.cheatId === 'score.freeze-score')!;
    expect(freeze.targets).toEqual(['p1']);
  });

  it('a bodyguard takes the hit for the player they protect', () => {
    const sim = scored();
    sim.cast('p3', { cheatId: 'adv.bodyguard', target: 'p2' });
    sim.cast('p1', { cheatId: 'score.freeze-score', target: 'p2' });
    expect(sim.chaos().effects.find((e) => e.cheatId === 'score.freeze-score')!.targets).toEqual(['p3']);
  });

  it('a decoy sends the next curse to a third player and is used up', () => {
    const sim = scored();
    sim.cast('p2', { cheatId: 'adv.decoy' });
    sim.cast('p1', { cheatId: 'score.freeze-score', target: 'p2' });
    const t = sim.chaos().effects.find((e) => e.cheatId === 'score.freeze-score')!.targets[0];
    expect(['p3', 'p4']).toContain(t);
    expect(sim.chaos().effects.some((e) => e.cheatId === 'adv.decoy')).toBe(false);
  });

  it('a fortress cannot be touched and cannot cast', () => {
    const sim = scored();
    sim.cast('p2', { cheatId: 'adv.fortress' });
    const before = scores(sim).p2;
    sim.cast('p1', { cheatId: 'score.pickpocket', target: 'p2' });
    sim.cast('p3', { cheatId: 'score.pickpocket', target: 'p2' });
    expect(scores(sim).p2).toBe(before);
    expect(sim.cast('p2', { cheatId: 'score.lucky-dip' })).toMatchObject({ ok: false });
  });

  it('cleanse frees only you from a curse on several players', () => {
    const sim = scored();
    sim.cast('p1', { cheatId: 'score.tax-collector' });
    expect(sim.cast('p2', { cheatId: 'adv.cleanse' }).ok).toBe(true);
    expect(sim.chaos().effects.find((e) => e.cheatId === 'score.tax-collector')!.targets.sort()).toEqual(['p3', 'p4']);
  });

  it('refuses to pile more than the limit of curses on one player', () => {
    const sim = scored();
    const curses = ['score.freeze-score', 'look.upside-down', 'look.snow', 'troll.slowpoke', 'look.comic-font'];
    const casters = ['p1', 'p3', 'p4', 'p1', 'p3'];
    const results = curses.map((id, i) => sim.cast(casters[i]!, { cheatId: id, target: 'p2' }));
    expect(sim.chaos().effects.filter((e) => e.hostile && e.targets.includes('p2'))).toHaveLength(PILE_ON_LIMIT);
    expect(results.at(-1)!.ok && results.at(-1)!.text).toMatch(/already has/);
  });
});

describe('room rules', () => {
  it('karma turns curses back on whoever casts them', () => {
    const sim = scored();
    sim.cast('p4', { cheatId: 'random.karma' });
    sim.cast('p1', { cheatId: 'score.freeze-score', target: 'p2' });
    expect(sim.chaos().effects.find((e) => e.cheatId === 'score.freeze-score')!.targets).toEqual(['p1']);
  });

  it('a peace zone refuses harmful casts but allows helpful ones', () => {
    const sim = scored();
    sim.cast('p4', { cheatId: 'random.peace-zone' });
    expect(sim.cast('p1', { cheatId: 'score.pickpocket', target: 'p2' })).toMatchObject({ ok: false });
    expect(sim.cast('p1', { cheatId: 'adv.shield' }).ok).toBe(true);
  });

  it('mayhem and bargain hunting halve costs, and stack', () => {
    const sim = scored();
    sim.cast('p4', { cheatId: 'random.mayhem' });
    const e0 = energy(sim, 'p1');
    sim.cast('p1', { cheatId: 'score.lucky-dip' }); // 20 → 10
    expect(e0 - energy(sim, 'p1')).toBe(10);
    sim.cast('p2', { cheatId: 'adv.thrift' }); // 15 → 8
    const e1 = energy(sim, 'p2');
    sim.cast('p2', { cheatId: 'score.lucky-dip' }); // 20 → 5
    expect(e1 - energy(sim, 'p2')).toBe(5);
  });

  it('silence stops a player casting', () => {
    const sim = scored();
    sim.cast('p1', { cheatId: 'troll.silence', target: 'p2' });
    const r = sim.cast('p2', { cheatId: 'adv.shield' });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.message).toMatch(/silenced/);
  });
});

describe('gates refuse real moves', () => {
  it('a frozen player\'s answers are refused, then accepted after it thaws', () => {
    const sim = classic();
    sim.idle.add('p2');
    sim.run(4500);
    expect(sim.state().sync.phase).toBe('question');
    sim.cast('p1', { cheatId: 'troll.freeze', target: 'p2' });
    const iid = sim.state().sync.iid;
    const refused = sim.rt.act('p2', { type: 'answer', iid, answer: { type: 'short', text: 'x' } });
    expect(refused).toMatchObject({ ok: false, message: 'You are frozen!' });
    expect(sim.state().sync.answers.p2).toBeUndefined();
    sim.run(5100);
    if (sim.state().sync.phase === 'question' && sim.state().sync.iid === iid) {
      expect(sim.rt.act('p2', { type: 'answer', iid, answer: { type: 'short', text: 'x' } }).ok).toBe(true);
    }
  });

  it('snooze wakes after four tries', () => {
    const sim = classic();
    sim.idle.add('p2');
    sim.run(4500);
    sim.cast('p1', { cheatId: 'troll.snooze', target: 'p2' });
    const iid = sim.state().sync.iid;
    const act = () => sim.rt.act('p2', { type: 'answer', iid, answer: { type: 'short', text: 'x' } });
    for (let i = 0; i < 4; i++) expect(act().ok).toBe(false);
    expect(act().ok).toBe(true);
  });
});

describe('information cheats tell the truth', () => {
  it('peek shows the server\'s own answer for the question on screen', () => {
    const sim = classic();
    sim.idle.add('p1');
    for (let i = 0; i < 40 && sim.state().sync.phase !== 'question'; i++) sim.run(250);
    expect(sim.cast('p1', { cheatId: 'adv.peek' }).ok).toBe(true);
    const o = sim.view('p1').overlays.find((x) => x.kind === 'peek')!;
    const iid = sim.state().sync.iid;
    expect(o.iid).toBe(iid);
    expect(o.reveal).toEqual(sim.rt.debugReveal(iid));
    // Nobody else sees it.
    expect(sim.view('p2').overlays.some((x) => x.kind === 'peek')).toBe(false);
  });
});

describe('rounds', () => {
  it('rush hour moves the real deadline and the mode closes the question on it', () => {
    const sim = classic();
    sim.ids.forEach((id) => sim.idle.add(id));
    sim.run(4500);
    const sync = sim.state().sync;
    expect(sync.phase).toBe('question');
    expect(sim.cast('p1', { cheatId: 'round.rush' }).ok).toBe(true);
    expect(sim.state().sync.deadline).toBe(sim.now + 5000);
    sim.run(6000);
    expect(sim.state().sync.phase).not.toBe('question');
  });

  it('a double round doubles that round only', () => {
    const a = classic({ seed: 8 });
    const b = classic({ seed: 8 });
    a.run(3000);
    b.run(3000);
    expect(a.cast('p1', { cheatId: 'round.double-round' }).ok).toBe(true);
    // Play until the first question has closed.
    for (let i = 0; i < 100 && !(b.state().sync.round === 0 && b.state().sync.phase === 'reveal'); i++) {
      a.run(250);
      b.run(250);
    }
    a.run(500);
    b.run(500);
    for (const id of a.ids) expect(scores(a)[id]).toBe(scores(b)[id]! * 2);
    expect(a.chaos().effects.some((e) => e.cheatId === 'round.double-round')).toBe(false);
  });
});

describe('combinations', () => {
  it('smash and grab steals the extra share on top of both cheats', () => {
    const a = scored();
    const b = scored();
    const ra = a.cast('p1', { cheatId: 'troll.freeze', target: 'p2' }, { cheatId: 'score.pickpocket', target: 'p2' });
    b.cast('p1', { cheatId: 'troll.freeze', target: 'p2' });
    b.cast('p3', { cheatId: 'score.pickpocket', target: 'p2' });
    expect(ra.ok && ra.combo).toBe('Smash and Grab');
    expect(scores(a).p2).toBeLessThan(scores(b).p2!);
  });

  it('every combo names cheats that exist', () => {
    for (const c of allCombos()) for (const id of c.cheats) expect(getCheat(id), `${c.id} uses ${id}`).toBeDefined();
  });
});

describe('undo and conflicts', () => {
  it('refuses a cheat that conflicts with one already on the target', () => {
    const sim = scored();
    sim.cast('p1', { cheatId: 'score.freeze-score', target: 'p2' });
    const r = sim.cast('p3', { cheatId: 'score.reverse-gains', target: 'p2' });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.message).toMatch(/conflicts/);
  });

  it('a look in the same group replaces the old one', () => {
    const sim = scored();
    sim.cast('p1', { cheatId: 'look.upside-down', target: 'p2' });
    sim.cast('p3', { cheatId: 'look.mirror', target: 'p2' });
    const looks = sim.view('p2').overlays.filter((o) => o.kind === 'look').map((o) => o.look);
    expect(looks).toEqual(['mirror']);
  });

  it('casting the same lasting cheat again renews it instead of stacking', () => {
    const sim = scored();
    sim.cast('p1', { cheatId: 'look.snow', target: 'p2' });
    sim.run(5000);
    sim.cast('p3', { cheatId: 'look.snow', target: 'p2' });
    const snows = sim.chaos().effects.filter((e) => e.cheatId === 'look.snow');
    expect(snows).toHaveLength(1);
    expect(snows[0]!.endsAt).toBe(sim.now + 15_000);
  });
});

describe('the catalogue', () => {
  it('states odds in every random cheat that rolls dice', () => {
    for (const d of allCheats()) {
      const src = String(d.apply ?? '') + String(d.hooks?.delta ? Object.values(d.hooks.delta).join() : '') + String(d.hooks?.tick ?? '');
      if (/rollOdds|rng\.chance/.test(src)) expect(d.description, d.id).toMatch(/\d+%|equally likely|random/i);
    }
  });

  it('exposes metadata only (no functions) to the menu', () => {
    const json = JSON.stringify(chaosCatalog());
    expect(JSON.parse(json)).toHaveLength(chaosCatalog().length);
  });

  it('reports which cheats a game cannot use, and why', () => {
    const peek = getCheat('adv.peek')!;
    expect(cheatAvailability({ modes: null, needs: peek.needs ?? [] }, 'glimgo', ['mode:glimgo'])).toMatch(/question/);
  });
});
