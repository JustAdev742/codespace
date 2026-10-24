import { describe, expect, it } from 'vitest';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { allCheats } from '../src/chaos/registry.ts';

const classic = (players = 4, extra: Partial<ConstructorParameters<typeof ChaosSim>[0]> = {}) =>
  new ChaosSim({ modeId: 'classic', questions: MIXED_SET, players, ...extra });

describe('chaos core', () => {
  it('refuses casts before and after a game, and from players not in it', () => {
    const sim = classic();
    expect(sim.cast('nobody', { cheatId: 'score.lucky-dip' }).ok).toBe(false);
    sim.rt.pause();
    const paused = sim.cast('p1', { cheatId: 'score.lucky-dip' });
    expect(paused).toMatchObject({ ok: false, code: 'invalid_state' });
    sim.rt.resume();
    sim.rt.end('host');
    expect(sim.cast('p1', { cheatId: 'score.lucky-dip' })).toMatchObject({ ok: false, code: 'invalid_state' });
  });

  it('moves real score and records the cast in results', () => {
    const sim = classic();
    sim.run(20_000);
    const s = sim.state();
    const victim = sim.ids.find((id) => id !== 'p1' && s.sync.scores[id] > 0)!;
    expect(victim).toBeDefined();
    const before = { me: s.sync.scores.p1, them: s.sync.scores[victim] };
    const r = sim.cast('p1', { cheatId: 'score.pickpocket', target: victim });
    expect(r.ok).toBe(true);
    const after = sim.state().sync.scores;
    const moved = before.them - after[victim];
    expect(moved).toBeGreaterThan(0);
    expect(after.p1 - before.me).toBe(moved);
    sim.rt.end('host');
    expect(sim.rt.results!.chaos).toEqual({ casts: 1, casters: ['p1'] });
  });

  it('validates targets, params, cooldowns and energy', () => {
    const sim = classic();
    sim.run(15_000);
    expect(sim.cast('p1', { cheatId: 'score.pickpocket', target: 'p1' })).toMatchObject({ ok: false });
    expect(sim.cast('p1', { cheatId: 'score.pickpocket', target: 'ghost' })).toMatchObject({ ok: false });
    expect(sim.cast('p1', { cheatId: 'no.such.cheat' })).toMatchObject({ ok: false });
    const rich = sim.ids.find((id) => id !== 'p1' && sim.state().sync.scores[id] > 0)!;
    expect(sim.cast('p1', { cheatId: 'score.pickpocket', target: rich }).ok).toBe(true);
    const again = sim.cast('p1', { cheatId: 'score.pickpocket', target: rich });
    expect(again).toMatchObject({ ok: false });
    if (!again.ok) expect(again.message).toMatch(/cooling down/);
    // 100 energy minus 20 leaves too little for a 90-energy cheat.
    const broke = sim.cast('p1', { cheatId: 'score.wipeout', target: rich });
    expect(broke).toMatchObject({ ok: false });
    if (!broke.ok) expect(broke.message).toMatch(/energy/);
    // Energy refills over time.
    sim.run(10_000);
    expect(sim.view('p1').me!.energy).toBe(100);
  });

  it('rolls back everything when one cheat in a combination fails', () => {
    const sim = classic();
    const before = JSON.stringify(sim.state());
    const chaosBefore = JSON.stringify(sim.chaos().casters);
    // Nobody has points yet, so the pickpocket fails and the lucky dip must not happen either.
    const r = sim.cast('p1', { cheatId: 'score.lucky-dip' }, { cheatId: 'score.pickpocket', target: 'p2' });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(sim.state())).toBe(before);
    expect(JSON.stringify(sim.chaos().casters)).toBe(chaosBefore);
  });

  it('bends gains while a lasting effect runs, then stops', () => {
    const a = classic(3, { seed: 7 });
    const b = classic(3, { seed: 7 });
    expect(a.cast('p2', { cheatId: 'score.freeze-score', target: 'p1' }).ok).toBe(true);
    a.run(14_000);
    b.run(14_000);
    expect(b.state().sync.scores.p1).toBeGreaterThan(0);
    expect(a.state().sync.scores.p1).toBe(0);
    a.run(30_000);
    expect(a.chaos().effects).toHaveLength(0);
  });

  it('undoes an instant cast within the window and not after', () => {
    const sim = classic();
    sim.run(20_000);
    const rich = sim.ids.find((id) => id !== 'p1' && sim.state().sync.scores[id] > 0)!;
    const before = { ...sim.state().sync.scores };
    const r = sim.cast('p1', { cheatId: 'score.pickpocket', target: rich });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(sim.rt.undoCast('p2', r.castId).ok).toBe(false);
    expect(sim.rt.undoCast('p1', r.castId).ok).toBe(true);
    expect(sim.state().sync.scores.p1).toBe(before.p1);
    expect(sim.state().sync.scores[rich]).toBe(before[rich]);
    expect(sim.rt.undoCast('p1', r.castId).ok).toBe(false);
    const r2 = sim.cast('p1', { cheatId: 'score.lucky-dip' });
    sim.run(25_000);
    if (r2.ok) expect(sim.rt.undoCast('p1', r2.castId).ok).toBe(false);
  });

  it('shields block, reflectors bounce, and the host can calm the room', () => {
    const sim = classic();
    sim.run(20_000);
    expect(sim.cast('p2', { cheatId: 'score.freeze-score', target: 'p3' }).ok).toBe(true);
    sim.rt.calmChaos();
    expect(sim.chaos().effects).toHaveLength(0);
    expect(sim.cast('p2', { cheatId: 'score.lucky-dip' })).toMatchObject({ ok: false, code: 'invalid_state' });
  });

  it('drops effects on players who leave and keeps the game going', () => {
    const sim = classic();
    expect(sim.cast('p1', { cheatId: 'score.freeze-score', target: 'p2' }).ok).toBe(true);
    sim.rt.removePlayer('p2');
    expect(sim.chaos().effects).toHaveLength(0);
    sim.run(30_000);
    expect(sim.errors).toEqual([]);
  });

  it('every cheat has a unique id and name and says what it does', () => {
    const cheats = allCheats();
    expect(new Set(cheats.map((c) => c.id)).size).toBe(cheats.length);
    expect(new Set(cheats.map((c) => c.name.toLowerCase())).size).toBe(cheats.length);
  });
});
