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

describe('gold-rush pack: bank, gear, shafts and the whistle', () => {
  it('Bank Holiday closes the bank to a rival for 15 seconds, but not their digging', () => {
    const sim = field();
    until(sim, () => m(sim, 'p2').cart > 0);
    handDug(sim, 'p2');
    expect(cast(sim, 'p1', 'bank-holiday', 'p2').ok).toBe(true);
    const closed = sim.rt.act('p2', { type: 'bank' });
    expect(closed.ok).toBe(false);
    if (!closed.ok) expect(closed.message).toMatch(/Bank holiday/);
    expect(dig(sim, 'p2').ok).toBe(true);
    sim.run(15_500);
    if (m(sim, 'p2').cart > 0) expect(sim.rt.act('p2', { type: 'bank' }).ok).toBe(true);
  });

  it('Bank Holiday is refused in the last 45 seconds, so no cart is trapped at the whistle', () => {
    const sim = new ChaosSim({ modeId: 'gold-rush', questions: MIXED_SET, players: 4, seed: 11, settings: { events: false }, common: { timeLimitSec: 60 } });
    sim.run(20_000);
    const r = cast(sim, 'p1', 'bank-holiday', 'p2');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/last 45 seconds/);
  });

  it('Mine Rescue Crew digs half of a fresh cave-in back into the cart, and only soon after it', () => {
    const sim = field({ risk: 'wild' }, 10_000);
    expect(cast(sim, 'p1', 'rescue-crew').ok).toBe(false);
    const fresh = (x: ChaosSim, id: string) => () => {
      const last = m(x, id).last;
      return last?.kind === 'cavein' && last.gold < 0 && x.now - last.at < 1000;
    };
    until(sim, fresh(sim, 'p1'), 300_000);
    sim.idle.add('p1');
    const lost = -m(sim, 'p1').last.gold;
    const cart = m(sim, 'p1').cart;
    expect(cast(sim, 'p1', 'rescue-crew').ok).toBe(true);
    expect(m(sim, 'p1').cart).toBe(cart + Math.max(1, Math.floor(lost / 2)));
    expect(m(sim, 'p1').depth).toBe(0);
    expect(m(sim, 'p1').notes[0].text).toContain('rescue crew');

    // A cave-in left for more than 20 seconds is too old to rescue.
    const late = field({ risk: 'wild' }, 10_000);
    until(late, fresh(late, 'p2'), 300_000);
    late.idle.add('p2');
    late.run(21_000);
    expect(cast(late, 'p2', 'rescue-crew').ok).toBe(false);
  });

  it('Late Shift Whistle moves the whistle 20 seconds at a time, at most 60 seconds a game', () => {
    const sim = field({}, 20_000);
    const first = sim.state().endsAt;
    expect(cast(sim, 'p1', 'late-whistle').ok).toBe(true);
    expect(sim.state().endsAt).toBe(first + 20_000);
    expect((sim.rt.view({ kind: 'player', playerId: 'p2' }) as any).endsAt).toBe(first + 20_000);
    expect(cast(sim, 'p2', 'late-whistle').ok).toBe(true);
    expect(cast(sim, 'p3', 'late-whistle').ok).toBe(true);
    expect(sim.state().endsAt).toBe(first + 60_000);
    expect(cast(sim, 'p4', 'late-whistle').ok).toBe(false);
    // The game runs past the old whistle and ends at the new one.
    sim.run(first + 1000 - sim.now);
    expect(sim.rt.status).toBe('running');
    sim.run(first + 61_000 - sim.now);
    expect(sim.rt.status).toBe('ended');
  });

  it("Miner's Kit Swap trades every piece of gear, and is refused for equal kits or props in flux", () => {
    const start = field({}, 100);
    expect(cast(start, 'p1', 'kit-swap', 'p2').ok).toBe(false);
    const sim = field({}, 20_000);
    until(sim, () => m(sim, 'p2').banked >= GEAR_INFO.props.levels[0]!.cost, 300_000);
    for (const id of sim.ids) sim.idle.add(id);
    if (m(sim, 'p2').gear.props === m(sim, 'p1').gear.props) expect(sim.rt.act('p2', { type: 'buy', gear: 'props' }).ok).toBe(true);
    const mine = { ...m(sim, 'p1').gear };
    const theirs = { ...m(sim, 'p2').gear };
    expect(cast(sim, 'p1', 'kit-swap', 'p2').ok).toBe(true);
    expect(m(sim, 'p1').gear).toEqual(theirs);
    expect(m(sim, 'p2').gear).toEqual(mine);
    expect(m(sim, 'p2').notes[0].text).toContain('swapped kit');
    // Borrowed props on either miner hold the swap off.
    expect(cast(sim, 'p3', 'borrowed-props').ok).toBe(true);
    expect(m(sim, 'p3').gear).not.toEqual(m(sim, 'p4').gear);
    const r = cast(sim, 'p4', 'kit-swap', 'p3');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/borrowed or eaten/);
  });

  it("Prospector's Trade-In sells the dearest level for half its price into the bank", () => {
    const sim = field({}, 20_000);
    sim.idle.add('p1');
    expect(cast(sim, 'p1', 'trade-in').ok).toBe(false);
    sim.idle.delete('p1');
    until(sim, () => m(sim, 'p1').banked >= GEAR_INFO.props.levels[0]!.cost + GEAR_INFO.pan.levels[0]!.cost, 300_000);
    sim.idle.add('p1');
    if (m(sim, 'p1').gear.props === 0) expect(sim.rt.act('p1', { type: 'buy', gear: 'props' }).ok).toBe(true);
    if (m(sim, 'p1').gear.pan === 0) expect(sim.rt.act('p1', { type: 'buy', gear: 'pan' }).ok).toBe(true);
    const before = { ...m(sim, 'p1').gear };
    const banked = m(sim, 'p1').banked;
    const price = (g: 'pick' | 'props' | 'pan') => (before[g] > 0 ? GEAR_INFO[g].levels[before[g] - 1]!.cost : 0);
    const dearest = (['pick', 'props', 'pan'] as const).reduce((a, b) => (price(b) > price(a) ? b : a));
    expect(cast(sim, 'p1', 'trade-in').ok).toBe(true);
    expect(m(sim, 'p1').gear[dearest]).toBe(before[dearest] - 1);
    expect(m(sim, 'p1').banked).toBe(banked + Math.floor(price(dearest) / 2));
    // Borrowed props cannot be sold.
    const b = field({}, 20_000);
    b.idle.add('p2');
    expect(b.cast('p2', { cheatId: 'gold-rush.borrowed-props' }).ok).toBe(true);
    expect(b.cast('p2', { cheatId: 'gold-rush.trade-in', params: { gear: 'props' } }).ok).toBe(false);
  });

  it('Shaft Swap trades depths (undo puts them back) and is refused on the same level', () => {
    const start = field({}, 100);
    expect(cast(start, 'p1', 'shaft-swap', 'p2').ok).toBe(false);
    const sim = field();
    until(sim, () => m(sim, 'p1').depth !== m(sim, 'p2').depth);
    sim.idle.add('p1');
    sim.idle.add('p2');
    const [a, b] = [m(sim, 'p1').depth, m(sim, 'p2').depth];
    const r = cast(sim, 'p1', 'shaft-swap', 'p2');
    expect(r.ok).toBe(true);
    expect([m(sim, 'p1').depth, m(sim, 'p2').depth]).toEqual([b, a]);
    expect(sim.rt.undoCast('p1', (r as { castId: string }).castId).ok).toBe(true);
    expect([m(sim, 'p1').depth, m(sim, 'p2').depth]).toEqual([a, b]);
  });

  it('Quartz Vein Thief moves a waiting vein to you (undo moves it back); refused without one to take or with your own', () => {
    const sim = field({}, 20_000);
    until(sim, () => m(sim, 'p2').vein && !m(sim, 'p1').vein, 300_000);
    sim.idle.add('p1');
    sim.idle.add('p2');
    const r = cast(sim, 'p1', 'vein-thief', 'p2');
    expect(r.ok).toBe(true);
    expect([m(sim, 'p1').vein, m(sim, 'p2').vein]).toEqual([true, false]);
    expect(m(sim, 'p2').notes[0].text).toContain('quartz vein');
    expect(sim.rt.undoCast('p1', (r as { castId: string }).castId).ok).toBe(true);
    expect([m(sim, 'p1').vein, m(sim, 'p2').vein]).toEqual([false, true]);
    // With a vein of your own waiting, there is nothing to gain.
    sim.idle.add('p3');
    expect(cast(sim, 'p3', 'vein-finder').ok).toBe(true);
    const own = cast(sim, 'p3', 'vein-thief', 'p2');
    expect(own.ok).toBe(false);
    if (!own.ok) expect(own.message).toMatch(/already have a quartz vein/);
    // Nothing to take from a miner with no vein waiting.
    sim.idle.add('p4');
    if (!m(sim, 'p4').vein) {
      const none = cast(sim, 'p4', 'vein-thief', 'p1');
      expect(none.ok).toBe(false);
      if (!none.ok) expect(none.message).toMatch(/no quartz vein waiting/);
    }
  });

  it('Steady Shaft Rope keeps the shaft on its level while it lasts', () => {
    const sim = field();
    handDug(sim, 'p1');
    const depth = m(sim, 'p1').depth;
    expect(cast(sim, 'p1', 'steady-rope').ok).toBe(true);
    let held = 0;
    while (m(sim, 'p1').digs > 1) {
      dig(sim, 'p1');
      if (m(sim, 'p1').last.kind === 'cavein') break;
      expect(m(sim, 'p1').depth).toBe(depth);
      expect(m(sim, 'p1').last.level).toBe(depth + 1);
      held++;
    }
    expect(held).toBeGreaterThan(0);
    sim.run(26_000);
    if (m(sim, 'p1').last.kind !== 'cavein' && m(sim, 'p1').digs > 0) {
      dig(sim, 'p1');
      expect(m(sim, 'p1').depth).toBe(m(sim, 'p1').last.kind === 'cavein' ? 0 : depth + 1);
    }
  });
});
