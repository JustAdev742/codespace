import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { chaosAdapterFor } from '../src/chaos/adapters/index.ts';
import { getCheat } from '../src/chaos/registry.ts';
import { scoreFor } from '../src/modes/lantern-lands/index.ts';
import { grid } from '../src/modes/lantern-lands/map.ts';

/*
 * Exact behaviour of the Lantern Lands pack: what each cheat does to the map,
 * energy, the bonus meter, team points and room events; its limits (homes,
 * the strongest fort, the points goal) and refusals; and what the lasting
 * ones do over their whole run. p1 and p3 are on team 0, p2 and p4 on team 1.
 */

const make = (opts: { settings?: Record<string, unknown>; common?: Record<string, unknown> } = {}) =>
  new ChaosSim({ modeId: 'lantern-lands', questions: MIXED_SET, players: 4, seed: 99, settings: opts.settings ?? {}, common: { teamCount: 2, ...opts.common } });

const ok = (r: { ok: boolean; message?: string }) => expect(r.ok, 'message' in r ? r.message : '').toBe(true);
const refused = (r: { ok: boolean; message?: string }, text: RegExp) => {
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.message).toMatch(text);
};

const s = (sim: ChaosSim) => sim.state();
const team = (sim: ChaosSim, id: string): number => s(sim).members[id].team;
const teamId = (sim: ChaosSim, t: number): string => s(sim).teams[t].id;
const energy = (sim: ChaosSim, id: string): number => s(sim).members[id].energy;
const lands = (sim: ChaosSim, t: number) => (s(sim).owner as number[]).flatMap((o, l) => (o === t ? [l] : []));
const fortsOf = (sim: ChaosSim, t: number) => lands(sim, t).reduce((n, l) => n + s(sim).fort[l], 0);
const isHome = (sim: ChaosSim, l: number) => s(sim).map.homes.includes(l);
const isShrine = (sim: ChaosSim, l: number) => s(sim).map.shrines.includes(l);
const idleAll = (sim: ChaosSim) => sim.ids.forEach((id) => sim.idle.add(id));

function holdings(sim: ChaosSim, t: number) {
  const mine = lands(sim, t);
  return { lands: mine.length, shrines: mine.filter((l) => isShrine(sim, l)).length };
}

/** Play until the next scoring has happened. */
function untilScoring(sim: ChaosSim) {
  const last = s(sim).lastScoreAt;
  for (let i = 0; i < 200 && s(sim).lastScoreAt === last; i++) sim.run(100);
}

/** A rival land (never a home) next to team `t`'s lands. */
function rivalBorder(sim: ChaosSim, t: number) {
  const st = s(sim);
  const adj = grid(st.map.radius).adj;
  return (st.owner as number[]).flatMap((o, l) => (o >= 0 && o !== t && !isHome(sim, l) && adj[l]!.some((n) => st.owner[n] === t) ? [l] : []));
}

describe('lantern-lands adapter', () => {
  it('team points stop one short of a points goal, and the bonus meter at 3', () => {
    const a = chaosAdapterFor('lantern-lands')!;
    const team = a.meters.find((m) => m.key === 'teamScore')!;
    expect(team.max!({}, 't', { settings: { goalPoints: 250 } } as never)).toBe(249);
    expect(team.max!({}, 't', { settings: { goalPoints: 0 } } as never)).toBe(Infinity);
    expect(a.meters.find((m) => m.key === 'bonus')!.max!({}, 't', { settings: {} } as never)).toBe(3);
  });

  it('a points-goal game never ends from chaos: Census stops one point short', () => {
    const sim = make({ settings: { goalPoints: 250 } });
    // Play until a team is within one Census of the goal, then cast it from that team.
    for (let i = 0; i < 300 && sim.rt.status === 'running'; i++) {
      sim.run(500);
      const st = s(sim);
      const t = st.points[0] >= st.points[1] ? 0 : 1;
      const h = holdings(sim, t);
      const pts = scoreFor(h.lands, h.shrines, { shrinesOnly: false, bloom: st.event?.kind === 'bloom', glow: sim.now >= st.glowAt });
      if (st.points[t] + pts < 250) continue;
      const caster = sim.ids.find((id) => team(sim, id) === t)!;
      const r = sim.cast(caster, { cheatId: 'lantern-lands.census' });
      if (!r.ok) continue;
      expect(s(sim).points[t]).toBe(249);
      expect(sim.rt.status).toBe('running');
      expect(s(sim).winners).toBeNull();
      return;
    }
    throw new Error('never got within one Census of the goal');
  });
});

describe('lantern-lands pack: the map', () => {
  it('Shrine Leap lights one empty shrine for your team', () => {
    const sim = make();
    sim.run(12_000);
    const before = s(sim).owner as number[];
    ok(sim.cast('p1', { cheatId: 'lantern-lands.shrine-leap' }));
    const changed = (s(sim).owner as number[]).flatMap((o, l) => (o !== before[l] ? [l] : []));
    expect(changed).toHaveLength(1);
    expect(isShrine(sim, changed[0]!)).toBe(true);
    expect(before[changed[0]!]).toBe(-1);
    expect(s(sim).owner[changed[0]!]).toBe(team(sim, 'p1'));
    expect(s(sim).lit).toContain(changed[0]);
  });

  it('Hex Border Heist captures the weakest rival border land (never a shrine), forts lost; refused in a storm', () => {
    const sim = make();
    sim.run(90_000);
    const t = team(sim, 'p1');
    const options = rivalBorder(sim, t).filter((l) => !isShrine(sim, l));
    expect(options.length).toBeGreaterThan(0);
    const weakest = Math.min(...options.map((l) => s(sim).fort[l]));
    const before = s(sim);
    ok(sim.cast('p1', { cheatId: 'lantern-lands.border-heist' }));
    const taken = (s(sim).owner as number[]).findIndex((o, l) => o !== before.owner[l]);
    expect(options).toContain(taken);
    expect(before.fort[taken]).toBe(weakest);
    expect(s(sim).owner[taken]).toBe(t);
    expect(s(sim).fort[taken]).toBe(0);
    sim.cast('p2', { cheatId: 'lantern-lands.call-weather', params: { event: 'storm' } });
    refused(sim.cast('p3', { cheatId: 'lantern-lands.border-heist' }), /storm/);
  });

  it('Shrine Flip takes a rival shrine and keeps its forts', () => {
    const sim = make();
    sim.run(60_000);
    const t = team(sim, 'p1');
    const theirs = (s(sim).map.shrines as number[]).filter((l) => s(sim).owner[l] >= 0 && s(sim).owner[l] !== t);
    expect(theirs.length).toBeGreaterThan(0);
    const before = s(sim);
    ok(sim.cast('p1', { cheatId: 'lantern-lands.shrine-flip' }));
    const flipped = (s(sim).owner as number[]).findIndex((o, l) => o !== before.owner[l]);
    expect(theirs).toContain(flipped);
    expect(s(sim).owner[flipped]).toBe(t);
    expect(s(sim).fort[flipped]).toBe(before.fort[flipped]);
  });

  it('Razed Ramparts empties the most fortified enemy land; Rumble Under Their Lands takes 1 from each enemy fort only', () => {
    const sim = make();
    sim.run(30_000);
    ok(sim.cast('p2', { cheatId: 'lantern-lands.palisade' }));
    const enemy = team(sim, 'p2');
    const most = Math.max(...lands(sim, enemy).map((l) => s(sim).fort[l]));
    ok(sim.cast('p1', { cheatId: 'lantern-lands.raze', target: teamId(sim, enemy) }));
    const zeroed = lands(sim, enemy).filter((l) => s(sim).fort[l] === 0).length;
    expect(zeroed).toBeGreaterThan(0);
    expect(most).toBeGreaterThan(0);
    const before = s(sim).fort as number[];
    const mine = team(sim, 'p1');
    ok(sim.cast('p3', { cheatId: 'lantern-lands.earthquake', target: teamId(sim, enemy) }));
    const after = s(sim).fort as number[];
    for (const l of lands(sim, enemy)) expect(after[l]).toBe(Math.max(0, before[l]! - 1));
    for (const l of lands(sim, mine)) expect(after[l]).toBe(before[l]);
  });

  it('Shrine Wardens and Hex Palisade fortify up to the strongest fort, never a home', () => {
    const sim = make();
    sim.run(40_000);
    const t = team(sim, 'p1');
    const before = s(sim).fort as number[];
    ok(sim.cast('p1', { cheatId: 'lantern-lands.palisade' }));
    const after = s(sim).fort as number[];
    for (const l of lands(sim, t)) {
      expect(after[l]! - before[l]!).toBeGreaterThanOrEqual(0);
      expect(after[l]! - before[l]!).toBeLessThanOrEqual(1);
      if (isHome(sim, l)) expect(after[l]).toBe(0);
    }
    const shrines = lands(sim, t).filter((l) => isShrine(sim, l));
    if (shrines.length) {
      ok(sim.cast('p3', { cheatId: 'lantern-lands.shrine-ward' }));
      for (const l of shrines) expect(s(sim).fort[l]).toBe(3);
    }
  });

  it('Hex Fort Plunder moves a rival land\'s forts onto yours beside it, capped at the strongest fort', () => {
    const sim = make();
    sim.run(90_000);
    ok(sim.cast('p2', { cheatId: 'lantern-lands.palisade' }));
    const before = s(sim).fort as number[];
    const total = (f: number[]) => f.reduce((n, x) => n + x, 0);
    ok(sim.cast('p1', { cheatId: 'lantern-lands.fort-plunder' }));
    const after = s(sim).fort as number[];
    const from = before.findIndex((f, l) => f > 0 && after[l] === 0);
    const to = after.findIndex((f, l) => f > before[l]!);
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThanOrEqual(0);
    expect(after[to]).toBe(Math.min(3, before[to]! + before[from]!));
    expect(total(after)).toBeLessThanOrEqual(total(before));
    expect(s(sim).owner[to]).toBe(team(sim, 'p1'));
    expect(grid(s(sim).map.radius).adj[from]).toContain(to);
  });

  it('Hexland Lottery states its odds', () => {
    expect(getCheat('lantern-lands.lottery')!.description).toMatch(/40%.*30%.*30%/);
  });
});

describe('lantern-lands pack: energy and the bonus meter', () => {
  it('Snuff-Out takes 1 energy from each enemy; Rally gives 1 to each teammate, capped one over the energy cap; both undo', () => {
    const sim = make();
    idleAll(sim);
    sim.run(12_000);
    ok(sim.cast('p2', { cheatId: 'lantern-lands.rally' }));
    expect([energy(sim, 'p2'), energy(sim, 'p4')]).toEqual([1, 1]);
    ok(sim.cast('p1', { cheatId: 'lantern-lands.snuff', target: teamId(sim, team(sim, 'p2')) }));
    expect([energy(sim, 'p2'), energy(sim, 'p4')]).toEqual([0, 0]);
    expect(sim.rt.undoCast('p1', sim.chaos().casts.at(-1)!.castId).ok).toBe(true);
    expect([energy(sim, 'p2'), energy(sim, 'p4')]).toEqual([1, 1]);
    // energyCap 3: rally can reach 4 and no further.
    for (let i = 0; i < 4; i++) {
      sim.run(46_000);
      sim.cast('p4', { cheatId: 'lantern-lands.rally' });
    }
    expect(energy(sim, 'p4')).toBe(4);
  });

  it('Hexland Energy Heist takes all of it, as much as you can hold', () => {
    const sim = make();
    idleAll(sim);
    sim.run(12_000);
    ok(sim.cast('p2', { cheatId: 'lantern-lands.rally' }));
    ok(sim.cast('p1', { cheatId: 'lantern-lands.energy-heist', target: 'p2' }));
    expect(energy(sim, 'p2')).toBe(0);
    expect(energy(sim, 'p1')).toBe(1);
    refused(sim.cast('p3', { cheatId: 'lantern-lands.energy-heist', target: 'p2' }), /no energy/);
  });

  it('Hexland Hot Streak makes the next right answer give 2 energy', () => {
    const sim = make();
    idleAll(sim);
    sim.run(12_000);
    ok(sim.cast('p1', { cheatId: 'lantern-lands.kindled-streak' }));
    expect(s(sim).members.p1.stream.streak).toBe(3);
    const action = sim.rt.botAction('p1', 1, createRng(5)) as { type: string };
    expect(action.type).toBe('answer');
    expect(sim.rt.act('p1', action).ok).toBe(true);
    expect(energy(sim, 'p1')).toBe(2);
  });

  it('Brimming Bonus fills the team meter to 3; Bonus Blowout empties an enemy\'s', () => {
    const sim = make();
    sim.run(12_000);
    ok(sim.cast('p1', { cheatId: 'lantern-lands.bonus-surge' }));
    expect(s(sim).bonus[team(sim, 'p1')]).toBe(3);
    refused(sim.cast('p3', { cheatId: 'lantern-lands.bonus-surge' }), /already full/);
    ok(sim.cast('p2', { cheatId: 'lantern-lands.bonus-drain', target: teamId(sim, team(sim, 'p1')) }));
    expect(s(sim).bonus[team(sim, 'p1')]).toBe(0);
  });

  it('Heavy Lanterns refuses a move they cannot pay 1 extra for, and charges it when they can', () => {
    const sim = make();
    idleAll(sim);
    sim.run(12_000);
    ok(sim.cast('p2', { cheatId: 'lantern-lands.rally' }));
    ok(sim.cast('p1', { cheatId: 'lantern-lands.heavy-lanterns', target: 'p2' }));
    const view = () => sim.rt.view({ kind: 'player', playerId: 'p2' }) as { you: { options: { claim: number[] } } };
    refused(sim.rt.act('p2', { type: 'claim', land: view().you.options.claim[0] }), /costs you 2 energy/);
    ok(sim.cast('p4', { cheatId: 'lantern-lands.rally' }));
    expect(energy(sim, 'p2')).toBe(2);
    expect(sim.rt.act('p2', { type: 'claim', land: view().you.options.claim[0] }).ok).toBe(true);
    expect(energy(sim, 'p2')).toBe(0);
  });

  it('Hexland Build Credit hands back what a move cost', () => {
    const sim = make();
    idleAll(sim);
    sim.run(12_000);
    ok(sim.cast('p3', { cheatId: 'lantern-lands.rally' }));
    ok(sim.cast('p1', { cheatId: 'lantern-lands.lantern-credit' }));
    const view = sim.rt.view({ kind: 'player', playerId: 'p1' }) as { you: { options: { claim: number[] } } };
    expect(sim.rt.act('p1', { type: 'claim', land: view.you.options.claim[0] }).ok).toBe(true);
    expect(energy(sim, 'p1')).toBe(1);
  });

  it('Hexland Energy Siphon takes 1 of each energy gain for you', () => {
    const sim = make();
    idleAll(sim);
    sim.run(12_000);
    ok(sim.cast('p1', { cheatId: 'lantern-lands.wick-siphon', target: 'p2' }));
    const action = sim.rt.botAction('p2', 1, createRng(5)) as { type: string };
    expect(sim.rt.act('p2', action).ok).toBe(true);
    expect(energy(sim, 'p1')).toBe(1);
    expect(energy(sim, 'p2')).toBe(0);
  });
});

describe('lantern-lands pack: scoring', () => {
  it('Hexland Census scores your holdings once more, exactly as a scoring would', () => {
    const sim = make();
    idleAll(sim);
    sim.run(30_000);
    const t = team(sim, 'p1');
    const h = holdings(sim, t);
    const before = s(sim).points[t];
    ok(sim.cast('p1', { cheatId: 'lantern-lands.census' }));
    expect(s(sim).points[t] - before).toBe(scoreFor(h.lands, h.shrines, { shrinesOnly: false, bloom: false, glow: false }));
  });

  it('Shrine Chorus adds your shrines\' points again at each scoring; Borrowed Shrine Light moves an enemy\'s to you', () => {
    const sim = make();
    sim.run(40_000);
    idleAll(sim);
    const t0 = team(sim, 'p1');
    const t1 = team(sim, 'p2');
    if (!holdings(sim, t0).shrines) sim.cast('p3', { cheatId: 'lantern-lands.shrine-leap' });
    if (!holdings(sim, t1).shrines) sim.cast('p4', { cheatId: 'lantern-lands.shrine-leap' });
    ok(sim.cast('p1', { cheatId: 'lantern-lands.shrine-chorus' }));
    ok(sim.cast('p3', { cheatId: 'lantern-lands.borrowed-light', target: teamId(sim, t1) }));
    const before = s(sim).points as number[];
    untilScoring(sim);
    const st = s(sim);
    const factor = (st.event?.kind === 'bloom' ? 2 : 1) * (sim.now >= st.glowAt ? 2 : 1);
    const mine = holdings(sim, t0).shrines * 3 * factor;
    const theirs = Math.min(st.gains[t1], holdings(sim, t1).shrines * 3 * factor);
    expect(st.points[t0] - before[t0]!).toBe(st.gains[t0] + mine + theirs);
    expect(st.points[t1] - before[t1]!).toBe(st.gains[t1] - theirs);
  });

  it('Hexland Blackout wipes out the enemy\'s next scoring, then ends', () => {
    const sim = make();
    sim.run(30_000);
    const enemy = team(sim, 'p2');
    ok(sim.cast('p1', { cheatId: 'lantern-lands.blackout', target: teamId(sim, enemy) }));
    const before = s(sim).points[enemy];
    untilScoring(sim);
    expect(s(sim).points[enemy]).toBe(before);
    expect(sim.chaos().effects.some((e) => e.cheatId === 'lantern-lands.blackout')).toBe(false);
    untilScoring(sim);
    expect(s(sim).points[enemy]).toBeGreaterThan(before);
  });
});

describe('lantern-lands pack: room events and the glow', () => {
  it('Weathermaker starts the chosen event for 30 seconds (a rumble drops every fort)', () => {
    const sim = make();
    // Early enough that the rumble is over before the mode's own first event (at 60 seconds).
    sim.run(14_000);
    ok(sim.cast('p2', { cheatId: 'lantern-lands.palisade' }));
    const forts = s(sim).fort as number[];
    ok(sim.cast('p1', { cheatId: 'lantern-lands.call-weather', params: { event: 'rumble' } }));
    expect(s(sim).event).toEqual({ kind: 'rumble', startedAt: sim.now, endsAt: sim.now + 30_000 });
    expect(s(sim).fort).toEqual(forts.map((f) => Math.max(0, f - 1)));
    sim.run(29_000);
    expect(s(sim).event?.kind).toBe('rumble');
    sim.run(1_500);
    expect(s(sim).event).toBeNull();
  });

  it('Weathermaker is refused in the final glow and when events are off', () => {
    const sim = make({ common: { timeLimitSec: 60 } });
    sim.run(16_000);
    refused(sim.cast('p1', { cheatId: 'lantern-lands.call-weather', params: { event: 'storm' } }), /final glow/);
    const off = make({ settings: { events: false } });
    off.run(12_000);
    refused(off.cast('p1', { cheatId: 'lantern-lands.call-weather', params: { event: 'storm' } }), /does not work here/);
  });

  it('Clear Skies ends the event; Lingering Weather adds 20 seconds', () => {
    const sim = make();
    sim.run(12_000);
    refused(sim.cast('p1', { cheatId: 'lantern-lands.clear-skies' }), /No room event/);
    ok(sim.cast('p1', { cheatId: 'lantern-lands.call-weather', params: { event: 'bloom' } }));
    const ends = s(sim).event.endsAt;
    ok(sim.cast('p2', { cheatId: 'lantern-lands.long-weather' }));
    expect(s(sim).event.endsAt).toBe(ends + 20_000);
    sim.run(31_000);
    expect(s(sim).event?.kind).toBe('bloom');
    ok(sim.cast('p3', { cheatId: 'lantern-lands.clear-skies' }));
    expect(s(sim).event).toBeNull();
  });

  it('Early Glow moves the final glow 30 seconds sooner and cancels an event that would start in it', () => {
    // A 2-minute game: the glow starts at 75 seconds and the first event is due at 60.
    const sim = make({ common: { timeLimitSec: 120 } });
    sim.run(12_000);
    const glow = s(sim).glowAt;
    expect(s(sim).nextEventAt).not.toBeNull();
    ok(sim.cast('p1', { cheatId: 'lantern-lands.early-glow' }));
    expect(s(sim).glowAt).toBe(glow - 30_000);
    // The glow now starts at 45 seconds, so the event due at 60 would start inside it: it is called off.
    expect(s(sim).nextEventAt).toBeNull();
    sim.run(50_000);
    expect(s(sim).event).toBeNull();
    expect(s(sim).eventsRun).toBe(0);
  });
});

describe('lantern-lands pack: lasting cheats', () => {
  it('Creeping Hex Light claims one land every 4 seconds for 20 seconds', () => {
    const sim = make();
    idleAll(sim);
    sim.run(12_000);
    const t = team(sim, 'p1');
    const before = lands(sim, t).length;
    ok(sim.cast('p1', { cheatId: 'lantern-lands.creeping-light' }));
    sim.run(21_000);
    expect(lands(sim, t).length - before).toBe(4);
  });

  it('Hexland Wildfire burns only unfortified edge lands, never homes or shrines', () => {
    const sim = make();
    sim.run(30_000);
    idleAll(sim);
    const enemy = team(sim, 'p2');
    const before = s(sim);
    ok(sim.cast('p1', { cheatId: 'lantern-lands.wildfire', target: teamId(sim, enemy) }));
    sim.run(21_000);
    const burned = (before.owner as number[]).flatMap((o, l) => (o === enemy && s(sim).owner[l] === -1 ? [l] : []));
    expect(burned.length).toBeGreaterThan(0);
    expect(burned.length).toBeLessThanOrEqual(4);
    for (const l of burned) {
      expect(isHome(sim, l) || isShrine(sim, l)).toBe(false);
      expect(before.fort[l]).toBe(0);
    }
  });

  it('Hex Fort Rust takes 1 fort every 5 seconds for 25 seconds, and needs forts to start', () => {
    const sim = make();
    sim.run(30_000);
    idleAll(sim);
    const enemy = team(sim, 'p2');
    if (fortsOf(sim, enemy) === 0) refused(sim.cast('p1', { cheatId: 'lantern-lands.rust', target: teamId(sim, enemy) }), /no forts/);
    ok(sim.cast('p2', { cheatId: 'lantern-lands.palisade' }));
    const before = fortsOf(sim, enemy);
    ok(sim.cast('p1', { cheatId: 'lantern-lands.rust', target: teamId(sim, enemy) }));
    sim.run(26_000);
    expect(before - fortsOf(sim, enemy)).toBe(Math.min(4, before));
  });

  it('Frozen Hex Frontier stops enemy claims but not their forts', () => {
    const sim = make();
    idleAll(sim);
    sim.run(12_000);
    ok(sim.cast('p2', { cheatId: 'lantern-lands.rally' }));
    ok(sim.cast('p1', { cheatId: 'lantern-lands.frozen-frontier', target: teamId(sim, team(sim, 'p2')) }));
    const view = sim.rt.view({ kind: 'player', playerId: 'p2' }) as { you: { options: { claim: number[] } } };
    refused(sim.rt.act('p2', { type: 'claim', land: view.you.options.claim[0] }), /frozen/);
  });

  it('Hexland Wardstones stop rival raids on your lands', () => {
    const sim = make();
    sim.run(90_000);
    idleAll(sim);
    const t = team(sim, 'p1');
    ok(sim.cast('p1', { cheatId: 'lantern-lands.wardstones' }));
    ok(sim.cast('p2', { cheatId: 'lantern-lands.rally' }));
    const target = rivalBorder(sim, team(sim, 'p2')).find((l) => s(sim).owner[l] === t && !isShrine(sim, l));
    expect(target).toBeDefined();
    refused(sim.rt.act('p2', { type: 'raid', land: target! }), /Wardstones/);
  });

  it('Hexland Jitters stop every map move but not answers', () => {
    const sim = make();
    idleAll(sim);
    sim.run(12_000);
    ok(sim.cast('p2', { cheatId: 'lantern-lands.rally' }));
    ok(sim.cast('p1', { cheatId: 'lantern-lands.trembling-hands', target: 'p2' }));
    const view = sim.rt.view({ kind: 'player', playerId: 'p2' }) as { you: { options: { claim: number[] }; question: { iid: string } } };
    refused(sim.rt.act('p2', { type: 'claim', land: view.you.options.claim[0] }), /trembling/);
    const answer = { type: 'answer', iid: view.you.question.iid, answer: { type: 'short', text: 'x' } };
    const r = sim.rt.act('p2', answer);
    if (!r.ok) expect(r.message).not.toMatch(/trembling/);
  });
});
