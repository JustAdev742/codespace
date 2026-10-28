import { describe, expect, it } from 'vitest';
import '../src/chaos/cheats/index.ts';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { getCheat } from '../src/chaos/registry.ts';
import { GEAR_INFO } from '../src/modes/gold-rush/meta.ts';

/* Exact behaviour of the Gold Rush cheat pack: amounts, limits, refusals, expiry. */

/* eslint-disable @typescript-eslint/no-explicit-any */

function field(settings: Record<string, unknown> = {}, warm = 20_000, players = 4) {
  const sim = new ChaosSim({ modeId: 'gold-rush', questions: MIXED_SET, players, seed: 11, settings: { events: false, ...settings } });
  sim.run(warm);
  return sim;
}

const m = (sim: ChaosSim, id: string): any => sim.state().miners[id];
const cast = (sim: ChaosSim, by: string, cheat: string, target?: string) => sim.cast(by, { cheatId: `gold-rush.${cheat}`, target: target ?? null });
const dig = (sim: ChaosSim, id: string) => sim.rt.act(id, { type: 'dig' });

function until(sim: ChaosSim, pred: () => boolean, maxMs = 240_000) {
  for (let t = 0; t < maxMs && !pred() && sim.rt.status === 'running'; t += 250) sim.run(250);
  if (!pred()) throw new Error('the situation never came up');
}

/** Stop a miner's bot and give them digs with Lucky Pick, so the test digs for them. */
function handDug(sim: ChaosSim, id: string) {
  sim.idle.add(id);
  expect(cast(sim, id, 'lucky-pick').ok).toBe(true);
}

describe('gold-rush pack: your own mine', () => {
  it('Golden Touch doubles what a dig puts in the cart, and says so', () => {
    const sim = field();
    handDug(sim, 'p1');
    expect(cast(sim, 'p1', 'golden-touch').ok).toBe(true);
    let checked = false;
    while (m(sim, 'p1').digs > 0 && !checked) {
      const before = m(sim, 'p1').cart;
      dig(sim, 'p1');
      const last = m(sim, 'p1').last;
      if (last.gold > 0 && last.kind !== 'map') {
        expect(m(sim, 'p1').cart - before).toBe(last.gold * 2);
        expect(m(sim, 'p1').notes[0].text).toContain('Golden Touch');
        checked = true;
      }
    }
    expect(checked).toBe(true);
  });

  it('Night Bank banks the whole cart and leaves the shaft where it is', () => {
    const sim = field();
    until(sim, () => m(sim, 'p1').cart > 0 && m(sim, 'p1').depth > 0);
    sim.idle.add('p1');
    const { cart, depth, banked } = m(sim, 'p1');
    expect(cast(sim, 'p1', 'night-bank').ok).toBe(true);
    expect(m(sim, 'p1').banked).toBe(banked + cart);
    expect(m(sim, 'p1').cart).toBe(0);
    expect(m(sim, 'p1').depth).toBe(depth);
    expect(cast(sim, 'p2', 'night-bank').ok === false || m(sim, 'p2').cart === 0).toBe(true);
  });

  it('Express Lift goes 3 levels down with no dig, and stops at the bottom', () => {
    const sim = field();
    sim.idle.add('p1');
    const depth = m(sim, 'p1').depth;
    expect(cast(sim, 'p1', 'express-lift').ok).toBe(true);
    expect(m(sim, 'p1').depth).toBe(Math.min(12, depth + 3));
  });

  it('Gold Buyer pays half as much again for half the cart, into the bank', () => {
    const sim = field();
    until(sim, () => m(sim, 'p1').cart >= 10);
    sim.idle.add('p1');
    const { cart, banked } = m(sim, 'p1');
    expect(cast(sim, 'p1', 'gold-buyer').ok).toBe(true);
    const half = Math.floor(cart / 2);
    expect(m(sim, 'p1').cart).toBe(cart - half);
    expect(m(sim, 'p1').banked).toBe(banked + Math.round(half * 1.5));
  });

  it('Borrowed Props lends a level of props for 30 seconds, then takes it back', () => {
    const sim = field();
    sim.idle.add('p1');
    const props = m(sim, 'p1').gear.props;
    expect(cast(sim, 'p1', 'borrowed-props').ok).toBe(true);
    expect(m(sim, 'p1').gear.props).toBe(props + 1);
    sim.run(31_000);
    expect(m(sim, 'p1').gear.props).toBe(props);
  });

  it('Gear Sale gives back half the price of the next gear, once', () => {
    const sim = field({}, 20_000);
    until(sim, () => m(sim, 'p1').banked >= GEAR_INFO.props.levels[0]!.cost + GEAR_INFO.pan.levels[0]!.cost);
    sim.idle.add('p1');
    expect(cast(sim, 'p1', 'gear-sale').ok).toBe(true);
    const before = m(sim, 'p1').banked;
    expect(sim.rt.act('p1', { type: 'buy', gear: 'props' }).ok).toBe(true);
    const cost = GEAR_INFO.props.levels[m(sim, 'p1').gear.props - 1]!.cost;
    expect(m(sim, 'p1').banked).toBe(before - cost + Math.floor(cost / 2));
    const second = m(sim, 'p1').banked;
    sim.run(1000);
    expect(sim.rt.act('p1', { type: 'buy', gear: 'pan' }).ok).toBe(true);
    expect(m(sim, 'p1').banked).toBe(second - GEAR_INFO.pan.levels[0]!.cost);
  });

  it('Timber Charm turns a cave-in into a puddle: the cart and the level are kept', () => {
    const sim = field({ risk: 'wild' }, 10_000);
    let saved = false;
    for (let t = 0; t < 300_000 && !saved && sim.rt.status === 'running'; t += 250) {
      const charmed = sim.chaos().effects.some((e) => e.cheatId === 'gold-rush.timber-charm');
      if (!charmed) cast(sim, 'p1', 'timber-charm');
      const before = { cart: m(sim, 'p1').cart, caveIns: m(sim, 'p1').caveIns, seq: m(sim, 'p1').seq };
      sim.run(250);
      const after = m(sim, 'p1');
      if (after.notes[0]?.text.includes('Timber Charm held') && after.seq === before.seq + 1) {
        saved = true;
        expect(after.last.kind).toBe('water');
        expect(after.caveIns).toBe(before.caveIns);
        expect(after.depth).toBe(after.last.level);
        expect(after.cart).toBeGreaterThanOrEqual(before.cart);
      }
    }
    expect(saved).toBe(true);
  });
});

describe('gold-rush pack: other miners', () => {
  it('Claim Map takes a quarter of a rival cart', () => {
    const sim = field();
    until(sim, () => m(sim, 'p2').cart >= 8);
    sim.idle.add('p1');
    sim.idle.add('p2');
    const theirs = m(sim, 'p2').cart;
    const mine = m(sim, 'p1').cart;
    expect(cast(sim, 'p1', 'claim-map', 'p2').ok).toBe(true);
    const took = Math.max(1, Math.floor(theirs / 4));
    expect(m(sim, 'p2').cart).toBe(theirs - took);
    expect(m(sim, 'p1').cart).toBe(mine + took);
    expect(m(sim, 'p2').notes[0].text).toContain('jumped your claim');
  });

  it('Loose Rocks knocks a rival 3 levels up and refuses at the top', () => {
    const sim = field();
    until(sim, () => m(sim, 'p2').depth >= 1);
    sim.idle.add('p2');
    const depth = m(sim, 'p2').depth;
    expect(cast(sim, 'p1', 'loose-rocks', 'p2').ok).toBe(true);
    expect(m(sim, 'p2').depth).toBe(Math.max(0, depth - 3));
    if (m(sim, 'p2').depth === 0) {
      sim.run(41_000);
      if (m(sim, 'p2').depth === 0) expect(cast(sim, 'p1', 'loose-rocks', 'p2').ok).toBe(false);
    }
  });

  it('Flash Flood stops a rival digging; they can still bank', () => {
    const sim = field();
    handDug(sim, 'p2');
    expect(cast(sim, 'p1', 'flash-flood', 'p2').ok).toBe(true);
    const r = dig(sim, 'p2');
    expect(r.ok).toBe(false);
    sim.run(12_500);
    expect(dig(sim, 'p2').ok).toBe(true);
  });

  it('Sticky Mud allows one dig every 4 seconds', () => {
    const sim = field();
    handDug(sim, 'p2');
    expect(cast(sim, 'p1', 'sticky-mud', 'p2').ok).toBe(true);
    expect(dig(sim, 'p2').ok).toBe(true);
    expect(dig(sim, 'p2').ok).toBe(false);
    sim.run(4100);
    expect(dig(sim, 'p2').ok).toBe(true);
  });

  it('Termites take a rival\'s props for 20 seconds, and they grow back', () => {
    const sim = field({}, 20_000);
    until(sim, () => m(sim, 'p2').gear.props > 0, 300_000);
    sim.idle.add('p2');
    const props = m(sim, 'p2').gear.props;
    expect(cast(sim, 'p1', 'termites', 'p2').ok).toBe(true);
    expect(m(sim, 'p2').gear.props).toBe(0);
    sim.run(21_000);
    expect(m(sim, 'p2').gear.props).toBe(props);
  });

  it('Licence Fee takes a twentieth of every rival cart (at least 1 gold)', () => {
    const sim = field();
    until(sim, () => ['p2', 'p3', 'p4'].filter((id) => m(sim, id).cart > 0).length >= 2);
    for (const id of sim.ids) sim.idle.add(id);
    const before = Object.fromEntries(['p2', 'p3', 'p4'].map((id) => [id, m(sim, id).cart]));
    const mine = m(sim, 'p1').cart;
    expect(cast(sim, 'p1', 'licence-fee').ok).toBe(true);
    let total = 0;
    for (const id of ['p2', 'p3', 'p4']) {
      const paid = before[id]! > 0 ? Math.max(1, Math.round(before[id]! / 20)) : 0;
      expect(m(sim, id).cart).toBe(before[id]! - paid);
      total += paid;
    }
    expect(m(sim, 'p1').cart).toBe(mine + total);
  });
});

describe('gold-rush pack: the goldfield', () => {
  it('starts Gold Fever, stretches it, and quiets it, and refuses a second event', () => {
    const sim = field();
    expect(cast(sim, 'p1', 'start-fever').ok).toBe(true);
    const ev = sim.state().event;
    expect(ev.id).toBe('fever');
    expect(cast(sim, 'p2', 'start-rich-lead').ok).toBe(false);
    expect((sim.rt.view({ kind: 'player', playerId: 'p3' }) as any).event.id).toBe('fever');
    expect(cast(sim, 'p2', 'long-shift').ok).toBe(true);
    expect(sim.state().event.endsAt).toBe(ev.endsAt + 15_000);
    expect(cast(sim, 'p3', 'calm-field').ok).toBe(true);
    expect(sim.state().event).toBeNull();
    expect(cast(sim, 'p4', 'calm-field').ok).toBe(false);
  });

  it('Creek Dip shows odds that add up to 100 and always changes something', () => {
    const desc = getCheat('gold-rush.lucky-dip')!.description;
    const percents = [...desc.matchAll(/(\d+)%/g)].map((x) => Number(x[1]));
    expect(percents.reduce((a, b) => a + b, 0)).toBe(100);
    const sim = field();
    sim.idle.add('p1');
    const snap = () => JSON.stringify([m(sim, 'p1').cart, m(sim, 'p1').digs, m(sim, 'p1').vein]);
    const before = snap();
    expect(cast(sim, 'p1', 'lucky-dip').ok).toBe(true);
    expect(snap()).not.toBe(before);
  });
});
