import { describe, expect, it } from 'vitest';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { scaleGain } from '../src/chaos/cheats/kit.ts';
import type { Duel, Pairing } from '../src/modes/glim-duels/index.ts';

/*
 * Exact behaviour of the Glim Duels pack: amounts, limits (chaos never knocks
 * a Glim out), refusals, expiry, and how the lasting cheats bend a hit. The
 * lasting ones are checked against a twin game that is the same in every way
 * except the cast, at the first reveal where the cheat had something to bend.
 */

const make = (opts: { settings?: Record<string, unknown>; players?: number; common?: Record<string, unknown> } = {}) =>
  new ChaosSim({ modeId: 'glim-duels', questions: MIXED_SET, players: opts.players ?? 4, seed: 99, settings: opts.settings ?? {}, common: opts.common ?? {} });

function seat(sim: ChaosSim, id: string) {
  const s = sim.state();
  const d: Duel = s.duels.find((x: Duel) => x.id === s.fighters[id]?.duel);
  const i = d.sides[0].id === id ? 0 : 1;
  return { d, i, me: d.sides[i], rival: d.sides[1 - i]! };
}

const health = (sim: ChaosSim, id: string) => seat(sim, id).me.health;
const charge = (sim: ChaosSim, id: string): number => sim.state().fighters[id].charge;
const ok = (r: { ok: boolean; message?: string }) => expect(r.ok, 'message' in r ? r.message : '').toBe(true);
const refused = (r: { ok: boolean; message?: string }, text: RegExp) => {
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.message).toMatch(text);
};

function untilPhase(sim: ChaosSim, phase: string) {
  for (let i = 0; i < 200 && sim.rt.status === 'running' && sim.state().sync.phase !== phase; i++) sim.run(250);
}

/** Two identical games; `cast` runs in the first only. */
function twins(at = 12_000) {
  const a = make();
  const b = make();
  a.run(at);
  b.run(at);
  return { a, b };
}

/**
 * Step both games until a round closes in which `acted(b)` says the cheat had something to bend (judged on
 * the untouched twin), then hand both over. Returns false if that never happened.
 */
function untilBent(a: ChaosSim, b: ChaosSim, acted: (b: ChaosSim) => boolean): boolean {
  let played = b.state().sync.roundsPlayed;
  for (let i = 0; i < 400 && b.rt.status === 'running'; i++) {
    a.run(250);
    b.run(250);
    if (b.state().sync.roundsPlayed === played) continue;
    played = b.state().sync.roundsPlayed;
    if (acted(b)) return true;
  }
  return false;
}

/** The hit `id` landed on the question that just closed, if any. */
function hitBy(sim: ChaosSim, id: string) {
  const { d, i } = seat(sim, id);
  return d.last && d.last.at === sim.state().sync.round ? d.last.hits[i] : null;
}

describe('glim-duels pack: health', () => {
  it('health taken by chaos stops at 1: no knockout, and the duel goes on', () => {
    const sim = make();
    sim.run(40_000);
    untilPhase(sim, 'question');
    for (const caster of ['p1', 'p3', 'p4']) sim.cast(caster, { cheatId: 'glim-duels.hex-bolt', target: 'p2' });
    expect(health(sim, 'p2')).toBeGreaterThanOrEqual(1);
    expect(seat(sim, 'p2').d.over).toBe(false);
    if (health(sim, 'p2') === 1) refused(sim.cast('p1', { cheatId: 'glim-duels.rot', target: 'p2' }), /down to 1 health/);
  });

  it('Hex Bolt takes 25% of the starting health', () => {
    const sim = make();
    sim.run(12_000);
    ok(sim.cast('p1', { cheatId: 'glim-duels.hex-bolt', target: 'p2' }));
    expect(health(sim, 'p2')).toBe(75);
    // Undo puts it back (it goes through the health meter).
    const cast = sim.chaos().casts.at(-1)!;
    expect(sim.rt.undoCast('p1', cast.castId).ok).toBe(true);
    expect(health(sim, 'p2')).toBe(100);
  });

  it('Second Wind refills to full and is refused at full health', () => {
    const sim = make();
    sim.run(12_000);
    refused(sim.cast('p1', { cheatId: 'glim-duels.second-wind' }), /full health/);
    sim.cast('p3', { cheatId: 'glim-duels.hex-bolt', target: 'p1' });
    ok(sim.cast('p1', { cheatId: 'glim-duels.second-wind' }));
    expect(health(sim, 'p1')).toBe(100);
  });

  it('Duelling Leech drains 20% from the rival and heals only what fits', () => {
    const sim = make();
    sim.run(12_000);
    const me = 'p1';
    const rival = seat(sim, me).rival.id!;
    ok(sim.cast(me, { cheatId: 'glim-duels.duel-leech' }));
    expect(health(sim, rival)).toBe(80);
    expect(health(sim, me)).toBe(100);
  });

  it('Duel Health Swap is refused unless the rival has more, then swaps exactly', () => {
    const sim = make();
    sim.run(12_000);
    const rival = seat(sim, 'p1').rival.id!;
    refused(sim.cast('p1', { cheatId: 'glim-duels.health-swap' }), /does not have more/);
    const other = sim.ids.find((x) => x !== 'p1' && x !== rival)!;
    sim.cast(other, { cheatId: 'glim-duels.hex-bolt', target: 'p1' });
    ok(sim.cast('p1', { cheatId: 'glim-duels.health-swap' }));
    expect(health(sim, 'p1')).toBe(100);
    expect(health(sim, rival)).toBe(75);
  });

  it('Duelling Regen heals 4% every 2 seconds; Duelling Rot takes 4% every 2 seconds', () => {
    const sim = make();
    sim.run(12_000);
    untilPhase(sim, 'question');
    sim.cast('p3', { cheatId: 'glim-duels.hex-bolt', target: 'p1' });
    const rival = seat(sim, 'p1').rival.id!;
    ok(sim.cast('p1', { cheatId: 'glim-duels.regen' }));
    const other = sim.ids.find((x) => x !== 'p1' && x !== rival && x !== 'p3')!;
    ok(sim.cast(other, { cheatId: 'glim-duels.rot', target: rival }));
    const [h1, h2] = [health(sim, 'p1'), health(sim, rival)];
    sim.run(2_050);
    // No question closed in between (both started in a question with time left), so only the effects moved health.
    if (sim.state().sync.phase === 'question') {
      expect(health(sim, 'p1')).toBe(Math.min(100, h1 + 4));
      expect(health(sim, rival)).toBe(Math.max(1, h2 - 4));
    }
  });
});

describe('glim-duels pack: shields, strikes and charge', () => {
  it('Duel Aegis raises a shield once, and needs powers on', () => {
    const sim = make();
    sim.run(12_000);
    ok(sim.cast('p1', { cheatId: 'glim-duels.aegis' }));
    expect(seat(sim, 'p1').me.shield).toBe(true);
    const pure = make({ settings: { powers: false } });
    pure.run(12_000);
    refused(pure.cast('p1', { cheatId: 'glim-duels.aegis' }), /does not work here/);
  });

  it('Shield Shatter breaks a raised shield and is refused when there is none', () => {
    const sim = make();
    sim.run(12_000);
    refused(sim.cast('p1', { cheatId: 'glim-duels.shatter', target: 'p2' }), /no shield/);
    sim.cast('p2', { cheatId: 'glim-duels.aegis' });
    ok(sim.cast('p1', { cheatId: 'glim-duels.shatter', target: 'p2' }));
    expect(seat(sim, 'p2').me.shield).toBe(false);
  });

  it('Strike Thief moves a ready power strike from them to you', () => {
    const sim = make();
    sim.run(12_000);
    sim.cast('p2', { cheatId: 'glim-duels.overdrive' });
    ok(sim.cast('p1', { cheatId: 'glim-duels.strike-thief', target: 'p2' }));
    expect(seat(sim, 'p2').me.strike).toBe(false);
    expect(seat(sim, 'p1').me.strike).toBe(true);
  });

  it('Overcharge fills to 3; Charge Leech takes only what you can hold', () => {
    const sim = make();
    sim.run(32_000);
    ok(sim.cast('p1', { cheatId: 'glim-duels.overcharge' }));
    expect(charge(sim, 'p1')).toBe(3);
    refused(sim.cast('p1', { cheatId: 'glim-duels.charge-leech', target: 'p2' }), /already full|no charge/);
    const before = charge(sim, 'p2');
    ok(sim.cast('p3', { cheatId: 'glim-duels.charge-leech', target: 'p2' }));
    expect(charge(sim, 'p2') + charge(sim, 'p3')).toBeLessThanOrEqual(3 + before);
    expect(charge(sim, 'p3')).toBeLessThanOrEqual(3);
  });

  it('Short Circuit refuses powers; Spark Refund hands 1 charge back per power', () => {
    const sim = make();
    sim.idle.add('p1');
    sim.idle.add('p2');
    sim.run(12_000);
    untilPhase(sim, 'question');
    sim.cast('p1', { cheatId: 'glim-duels.overcharge' });
    sim.cast('p2', { cheatId: 'glim-duels.overcharge' });
    ok(sim.cast('p3', { cheatId: 'glim-duels.short-circuit', target: 'p2' }));
    const iid = sim.state().sync.iid;
    refused(sim.rt.act('p2', { type: 'power', iid, power: 'shield' }), /Short circuit/);
    ok(sim.cast('p1', { cheatId: 'glim-duels.spark-refund' }));
    expect(sim.rt.act('p1', { type: 'power', iid, power: 'shield' }).ok).toBe(true);
    // A shield costs 1; the refund gives it back.
    expect(charge(sim, 'p1')).toBe(3);
  });

  it('Everlasting Aegis puts the shield back within a second after it is broken', () => {
    const sim = make();
    sim.run(12_000);
    ok(sim.cast('p1', { cheatId: 'glim-duels.ever-shield' }));
    expect(seat(sim, 'p1').me.shield).toBe(true);
    ok(sim.cast('p2', { cheatId: 'glim-duels.shatter', target: 'p1' }));
    expect(seat(sim, 'p1').me.shield).toBe(false);
    sim.run(1_000);
    if (!seat(sim, 'p1').d.over) expect(seat(sim, 'p1').me.shield).toBe(true);
  });

  it('Duel Roulette states its odds and needs your shield down', async () => {
    const { getCheat } = await import('../src/chaos/registry.ts');
    expect(getCheat('glim-duels.roulette')!.description).toMatch(/30%.*30%.*25%.*15%/);
    const sim = make();
    sim.run(12_000);
    sim.cast('p1', { cheatId: 'glim-duels.aegis' });
    refused(sim.cast('p1', { cheatId: 'glim-duels.roulette' }), /shield down/);
  });
});

describe('glim-duels pack: bending hits (against a twin game)', () => {
  it('Duel Fury adds half again to your hit, never past 1 health', () => {
    const { a, b } = twins();
    ok(a.cast('p1', { cheatId: 'glim-duels.fury' }));
    const hit = (s: ChaosSim) => (hitBy(s, 'p1')?.dmg ?? 0) > 0 && !seat(s, 'p1').d.over;
    expect(untilBent(a, b, hit)).toBe(true);
    const dmg = hitBy(b, 'p1')!.dmg;
    const rival = seat(b, 'p1').rival;
    const extra = Math.min(scaleGain(dmg, 1.5) - dmg, rival.health - 1);
    expect(seat(a, 'p1').rival.health).toBe(rival.health - extra);
    expect(a.state().fighters.p1.dealt).toBe(b.state().fighters.p1.dealt + extra);
    expect(seat(a, 'p1').me.dealt).toBe(seat(b, 'p1').me.dealt + extra);
  });

  it('Jinxed Duellist hands half of an opponent\'s hit back to the Glim it hit', () => {
    const { a, b } = twins();
    ok(a.cast('p1', { cheatId: 'glim-duels.jinx', target: 'p2' }));
    expect(untilBent(a, b, (s) => (hitBy(s, 'p2')?.dmg ?? 0) > 0 && !seat(s, 'p2').d.over)).toBe(true);
    const dmg = hitBy(b, 'p2')!.dmg;
    const back = dmg - scaleGain(dmg, 0.5);
    expect(seat(a, 'p2').rival.health).toBe(seat(b, 'p2').rival.health + back);
    expect(a.state().fighters.p2.dealt).toBe(b.state().fighters.p2.dealt - back);
  });

  it('Vampire Duellist heals half of each hit you land', () => {
    const { a, b } = twins();
    ok(a.cast('p1', { cheatId: 'glim-duels.vampire' }));
    expect(untilBent(a, b, (s) => (hitBy(s, 'p1')?.dmg ?? 0) > 0 && !seat(s, 'p1').d.over)).toBe(true);
    const dmg = hitBy(b, 'p1')!.dmg;
    expect(health(a, 'p1')).toBe(Math.min(100, health(b, 'p1') + Math.max(1, Math.floor(dmg / 2))));
  });

  it('Thorned Duellist sends half of the damage you take back to your rival', () => {
    const { a, b } = twins();
    ok(a.cast('p1', { cheatId: 'glim-duels.thorns' }));
    const rivalOf = (s: ChaosSim) => seat(s, 'p1').rival.id!;
    expect(untilBent(a, b, (s) => (hitBy(s, rivalOf(s))?.dmg ?? 0) > 0 && !seat(s, 'p1').d.over)).toBe(true);
    const took = hitBy(b, rivalOf(b))!.dmg;
    const r = seat(b, 'p1').rival.health;
    expect(seat(a, 'p1').rival.health).toBe(Math.max(1, r - Math.ceil(took / 2)));
  });

  it('Lightning Reflexes makes a hit land with the full speed bonus', () => {
    const { a, b } = twins();
    ok(a.cast('p1', { cheatId: 'glim-duels.lightning' }));
    expect(untilBent(a, b, (s) => (hitBy(s, 'p1')?.dmg ?? 0) > 0 && !seat(s, 'p1').d.over)).toBe(true);
    const h = hitBy(b, 'p1')!;
    // The fastest possible unboosted hit is 32 (18 + the whole 14 speed bonus), doubled by a strike.
    const full = Math.round(32 * (h.partial ? 0.5 : 1) * (h.strike ? 2 : 1));
    expect(a.state().fighters.p1.dealt - b.state().fighters.p1.dealt).toBeLessThanOrEqual(full - h.raw);
    expect(a.state().fighters.p1.dealt).toBeGreaterThanOrEqual(b.state().fighters.p1.dealt);
  });

  it('Spark Tax moves the opponent\'s new charge to you', () => {
    const { a, b } = twins();
    ok(a.cast('p1', { cheatId: 'glim-duels.spark-tax', target: 'p2' }));
    const before = { p1: charge(b, 'p1'), p2: charge(b, 'p2') };
    expect(untilBent(a, b, (s) => charge(s, 'p2') > before.p2)).toBe(true);
    const gained = charge(b, 'p2') - before.p2;
    expect(charge(a, 'p2')).toBe(charge(b, 'p2') - Math.min(gained, 3 - charge(b, 'p1')));
    expect(charge(a, 'p1')).toBe(Math.min(3, charge(b, 'p1') + gained));
  });

  it('Static Shock takes 1 charge from the Glim you hit', () => {
    let bent = 0;
    // Try a few moments: the shock needs a hit inside its 20 seconds on a Glim that has charge.
    for (const at of [12_000, 32_000, 52_000, 110_000, 130_000]) {
      const { a, b } = twins(at);
      // Cast by the rival of the player holding the most charge, so the hits land on a Glim with charge to lose.
      const charged = a.ids.filter((x) => !seat(a, x).d.over && seat(a, x).rival.id).sort((x, y) => charge(a, y) - charge(a, x))[0];
      if (!charged) continue;
      const caster = seat(a, charged).rival.id!;
      if (!a.cast(caster, { cheatId: 'glim-duels.static-shock' }).ok) continue;
      const live = () => a.chaos().effects.some((e) => e.cheatId === 'glim-duels.static-shock');
      if (!untilBent(a, b, (s) => live() && (hitBy(s, caster)?.dmg ?? 0) > 0 && seat(s, caster).rival.id === charged && charge(s, charged) > 0)) continue;
      expect(charge(a, charged)).toBe(charge(b, charged) - 1);
      bent++;
    }
    expect(bent).toBeGreaterThan(0);
  });
});

describe('glim-duels pack: pairings and the Shadow Glim', () => {
  it('Duel Call-Out pairs you with your pick next round, and your old rivals with each other', () => {
    const sim = make();
    for (let i = 0; i < 400 && !sim.state().next; i++) sim.run(500);
    const next = sim.state().next as [string, string | null][];
    const mine = next.find((p) => p.includes('p1'))!;
    const pick = sim.ids.find((x) => !mine.includes(x))!;
    ok(sim.cast('p1', { cheatId: 'glim-duels.call-out', target: pick }));
    const now = sim.state().next as [string, string | null][];
    expect(now.some((p) => p.includes('p1') && p.includes(pick))).toBe(true);
    const left = sim.ids.filter((x) => x !== 'p1' && x !== pick);
    expect(now.some((p) => left.every((x) => p.includes(x)))).toBe(true);
    untilPhase(sim, 'question');
    expect(seat(sim, 'p1').rival.id).toBe(pick);
    refused(sim.cast('p2', { cheatId: 'glim-duels.call-out', target: 'p3' }), /not out yet/);
  });

  it('Duel Seat Swap swaps players between duels; the Glims stay where they are', () => {
    const sim = make();
    sim.run(12_000);
    const myRival = seat(sim, 'p1').rival.id!;
    const other = sim.ids.find((x) => x !== 'p1' && x !== myRival)!;
    sim.cast(myRival, { cheatId: 'glim-duels.hex-bolt', target: 'p1' });
    const [mine, theirs] = [seat(sim, 'p1'), seat(sim, other)];
    ok(sim.cast('p1', { cheatId: 'glim-duels.seat-swap', target: other }));
    expect(seat(sim, 'p1').d.id).toBe(theirs.d.id);
    expect(seat(sim, other).d.id).toBe(mine.d.id);
    expect(health(sim, 'p1')).toBe(theirs.me.health);
    expect(health(sim, other)).toBe(mine.me.health);
    expect(sim.state().fighters.p1.faced).toContain(theirs.rival.id);
    refused(sim.cast(other, { cheatId: 'glim-duels.seat-swap', target: myRival }), /own rival|cooling|swap/);
  });

  it('Seat Swap is refused in Team Clash', () => {
    const sim = make({ settings: { teamClash: true }, common: { teamCount: 2 } });
    sim.run(12_000);
    const foe = sim.ids.find((x) => sim.rt.playerList().find((p) => p.id === x)!.teamId !== sim.rt.playerList()[0]!.teamId)!;
    refused(sim.cast('p1', { cheatId: 'glim-duels.seat-swap', target: foe }), /Team Clash/);
  });

  it('Shadow Fumble makes the Shadow miss; Shadow Surge makes it answer right at once in other Shadow duels', () => {
    const sim = make({ players: 3 });
    sim.run(6_000);
    untilPhase(sim, 'question');
    const lone = sim.state().duels.find((d: Duel) => d.sides[1].id === null).sides[0].id as string;
    const other = sim.ids.find((x) => x !== lone)!;
    refused(sim.cast(other, { cheatId: 'glim-duels.shadow-fumble' }), /not duelling the Shadow/);
    refused(sim.cast(lone, { cheatId: 'glim-duels.shadow-surge' }), /Nobody else/);
    ok(sim.cast(other, { cheatId: 'glim-duels.shadow-surge' }));
    const sh = seat(sim, lone).d.shadow!;
    expect(sh.correct).toBe(true);
    expect(sh.answered).toBe(true);
    ok(sim.cast(lone, { cheatId: 'glim-duels.shadow-fumble' }));
    expect(seat(sim, lone).d.shadow!.correct).toBe(false);
  });

  const pairKey = (ps: readonly (readonly [string, string | null])[]) =>
    ps
      .map((p) => [p[0], p[1] ?? ''].sort().join('+'))
      .sort()
      .join('|');

  it('Duel Pairing Scramble draws the next round again, and the round starts with the new pairs', () => {
    const sim = make({ players: 6 });
    // The first round's pairings are planned before it starts.
    expect(sim.state().next).not.toBeNull();
    const before = sim.state().next as Pairing[];
    ok(sim.cast('p1', { cheatId: 'glim-duels.pairing-scramble' }));
    const after = sim.state().next as Pairing[];
    expect(pairKey(after)).not.toBe(pairKey(before));
    expect(after.flat().filter(Boolean).sort()).toEqual(sim.ids.slice().sort());
    untilPhase(sim, 'question');
    for (const [x, y] of after) expect(seat(sim, x).rival.id).toBe(y);
    refused(sim.cast('p2', { cheatId: 'glim-duels.pairing-scramble' }), /not out yet/);
    expect(sim.errors).toEqual([]);
  });

  it('Duel Pairing Scramble avoids rematches and keeps Team Clash duels between teams', () => {
    const sim = make({ players: 6, settings: { teamClash: true }, common: { teamCount: 2 } });
    const team = (id: string) => sim.rt.playerList().find((p) => p.id === id)!.teamId;
    // Play the first round, so everyone has a rival to avoid.
    untilPhase(sim, 'question');
    for (let i = 0; i < 800 && (sim.state().round < 0 || !sim.state().roundOver); i++) sim.run(250);
    expect(sim.state().next).not.toBeNull();
    ok(sim.cast('p1', { cheatId: 'glim-duels.pairing-scramble' }));
    const fighters = sim.state().fighters;
    for (const [x, y] of sim.state().next as Pairing[]) {
      if (!y) continue;
      expect(team(x)).not.toBe(team(y));
      expect(fighters[x].faced).not.toContain(y);
    }
  });
});

describe('glim-duels pack: mirrors, sponges, mends, stances and wagers', () => {
  const rivalOf = (s: ChaosSim, id: string) => seat(s, id).rival.id!;

  it('Duel Mirror Shield needs a raised shield, then bounces the first blocked hit back', () => {
    const { a, b } = twins();
    refused(a.cast('p1', { cheatId: 'glim-duels.mirror-shield' }), /Raise a shield/);
    for (const s of [a, b]) ok(s.cast('p1', { cheatId: 'glim-duels.aegis' }));
    ok(a.cast('p1', { cheatId: 'glim-duels.mirror-shield' }));
    expect(untilBent(a, b, (s) => Boolean(hitBy(s, rivalOf(s, 'p1'))?.blocked) && !seat(s, 'p1').d.over)).toBe(true);
    // The mirror looks at each reveal just after it lands.
    a.run(300);
    b.run(300);
    const raw = hitBy(b, rivalOf(b, 'p1'))!.raw;
    const r = seat(b, 'p1').rival.health;
    const back = Math.min(raw, r - 1);
    expect(seat(a, 'p1').rival.health).toBe(r - back);
    expect(a.state().fighters.p1.dealt).toBe(b.state().fighters.p1.dealt + back);
    expect(a.chaos().effects.some((e) => e.cheatId === 'glim-duels.mirror-shield')).toBe(false);
    expect(a.errors).toEqual([]);
  });

  it('Duel Spark Sponge turns a hit taken into 1 charge, and is refused on a full charge', () => {
    const { a, b } = twins();
    ok(a.cast('p1', { cheatId: 'glim-duels.spark-sponge' }));
    expect(untilBent(a, b, (s) => (hitBy(s, rivalOf(s, 'p1'))?.dmg ?? 0) > 0 && !seat(s, 'p1').d.over && charge(s, 'p1') < 3)).toBe(true);
    expect(charge(a, 'p1')).toBe(charge(b, 'p1') + 1);
    const full = make();
    full.run(12_000);
    full.cast('p2', { cheatId: 'glim-duels.overcharge' });
    refused(full.cast('p2', { cheatId: 'glim-duels.spark-sponge' }), /already full/);
  });

  it(`Duel Golden Mend makes a mend heal ${2 * 30}, at the usual charge`, () => {
    const sim = make();
    sim.idle.add('p1');
    sim.run(12_000);
    untilPhase(sim, 'question');
    for (const o of sim.ids.filter((x) => x !== 'p1')) sim.cast(o, { cheatId: 'glim-duels.hex-bolt', target: 'p1' });
    expect(health(sim, 'p1')).toBe(25);
    sim.cast('p1', { cheatId: 'glim-duels.overcharge' });
    ok(sim.cast('p1', { cheatId: 'glim-duels.golden-mend' }));
    expect(sim.rt.act('p1', { type: 'power', iid: sim.state().sync.iid, power: 'mend' }).ok).toBe(true);
    expect(health(sim, 'p1')).toBe(85);
    expect(charge(sim, 'p1')).toBe(1);
    expect(sim.errors).toEqual([]);
  });

  it('Duel Daredevil Stance doubles your hits and the hits on you, never past 1 health', () => {
    const { a, b } = twins();
    ok(a.cast('p1', { cheatId: 'glim-duels.daredevil' }));
    const landed = (s: ChaosSim, id: string) => hitBy(s, id)?.dmg ?? 0;
    expect(untilBent(a, b, (s) => (landed(s, 'p1') > 0 || landed(s, rivalOf(s, 'p1')) > 0) && !seat(s, 'p1').d.over)).toBe(true);
    const mine = landed(b, 'p1');
    const theirs = landed(b, rivalOf(b, 'p1'));
    const r = seat(b, 'p1').rival.health;
    expect(seat(a, 'p1').rival.health).toBe(Math.max(1, r - mine));
    expect(health(a, 'p1')).toBe(Math.max(1, health(b, 'p1') - theirs));
    expect(a.state().fighters.p1.dealt).toBe(b.state().fighters.p1.dealt + Math.min(mine, r - 1));
    expect(a.errors).toEqual([]);
  });

  it('Duel Wager pays the winner 2 and takes 1 from the loser when the duel ends', () => {
    const a = make();
    const b = make();
    // Into the second round, so both duellists have points to lose.
    for (let i = 0; i < 1200 && !(b.state().round >= 1 && b.state().sync.phase === 'question'); i++) {
      a.run(250);
      b.run(250);
    }
    const rival = rivalOf(a, 'p1');
    ok(a.cast('p1', { cheatId: 'glim-duels.wager' }));
    ok(a.cast(rival, { cheatId: 'glim-duels.wager' }));
    refused(a.cast('p1', { cheatId: 'glim-duels.wager' }), /cooling|already|running/i);
    for (let i = 0; i < 800 && !seat(b, 'p1').d.over; i++) {
      a.run(250);
      b.run(250);
    }
    a.run(600);
    b.run(600);
    const d = seat(b, 'p1').d;
    const gain = (id: string) => a.state().fighters[id].points - b.state().fighters[id].points;
    const side = seat(b, 'p1').i;
    if (d.winner === 'draw') expect([gain('p1'), gain(rival)]).toEqual([0, 0]);
    else {
      const [winner, loser] = d.winner === side ? ['p1', rival] : [rival, 'p1'];
      expect(gain(winner)).toBe(2);
      expect(gain(loser)).toBe(b.state().fighters[loser].points > 0 ? -1 : 0);
    }
    expect(a.chaos().effects.some((e) => e.cheatId === 'glim-duels.wager')).toBe(false);
    expect(a.errors).toEqual([]);
  });
});
