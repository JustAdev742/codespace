import { describe, expect, it } from 'vitest';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { chaosAdapterFor } from '../src/chaos/adapters/index.ts';
import { paradeTarget, paydayFor } from '../src/modes/festival-workshop/index.ts';
import { MARKET, PARADE, PRANK_MS } from '../src/modes/festival-workshop/meta.ts';

/* Exact behaviour of the Festival Workshop cheat pack and its adapter: amounts, limits, refusals, expiry. */

function fair(settings: Record<string, unknown> = {}, warm = 30_000, common: Record<string, unknown> = {}) {
  const sim = new ChaosSim({ modeId: 'festival-workshop', questions: MIXED_SET, players: 4, seed: 11, settings, common });
  sim.run(warm);
  return sim;
}

const w = (sim: ChaosSim, id: string): any => sim.state().workshops[id];
/** What the player's own screen says (projected to now, as the mode shows it). */
const you = (sim: ChaosSim, id: string): any => (sim.rt.view({ kind: 'player', playerId: id }) as any).you;
const cast = (sim: ChaosSim, by: string, cheat: string, target?: string, params?: Record<string, unknown>) =>
  sim.cast(by, { cheatId: `festival-workshop.${cheat}`, target: target ?? null, ...(params ? { params } : {}) });
const timers = (sim: ChaosSim): Map<string, number> => (sim.rt as any).timers;
const meter = (sim: ChaosSim, key: string, id: string) =>
  chaosAdapterFor('festival-workshop')!.meters.find((m) => m.key === key)!.get(sim.state(), id, { settings: sim.rt.settings, now: () => sim.now } as never);

function until(sim: ChaosSim, pred: () => boolean, maxMs = 200_000) {
  for (let t = 0; t < maxMs && !pred() && sim.rt.status === 'running'; t += 250) sim.run(250);
  if (!pred()) throw new Error('the situation never came up');
}

const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);
const stations = (sim: ChaosSim, id: string) => w(sim, id).slots.map((st: any) => (st ? `${st.kind}${st.level}` : null));

describe('festival-workshop adapter', () => {
  it('reads takings and coins as the mode projects them now, not as last settled', () => {
    const sim = fair();
    for (const id of sim.ids) {
      near(meter(sim, 'score', id), you(sim, id).takings);
      near(meter(sim, 'currency', id), you(sim, id).coins);
    }
    // Stored takings lag behind for a workshop that has not been settled for a while.
    sim.idle.add('p1');
    sim.run(5000);
    expect(meter(sim, 'score', 'p1')).toBeGreaterThan(w(sim, 'p1').takings);
  });

  it('lets universal score cheats move exact projected amounts (a swap swaps what the screens show)', () => {
    const sim = fair();
    const a = you(sim, 'p1').takings;
    const b = you(sim, 'p2').takings;
    expect(sim.cast('p1', { cheatId: 'score.swap', target: 'p2' }).ok).toBe(true);
    near(you(sim, 'p1').takings, b, 1e-3);
    near(you(sim, 'p2').takings, a, 1e-3);
    // The earnings breakdown never shows a negative part after takings are lowered.
    for (const id of ['p1', 'p2']) for (const v of Object.values(you(sim, id).from) as number[]) expect(v).toBeGreaterThanOrEqual(0);
    expect(sim.errors).toEqual([]);
  });

  it('stops chaos a coin short of a takings goal', () => {
    const sim = fair({ goal: 5000 }, 20_000);
    for (let i = 0; i < 4; i++) {
      cast(sim, 'p1', 'payday-advance');
      sim.cast('p1', { cheatId: 'score.leapfrog' });
      expect(meter(sim, 'score', 'p1')).toBeLessThanOrEqual(4999);
      sim.run(1000);
    }
    expect(sim.errors).toEqual([]);
  });
});

describe('festival-workshop pack: stations', () => {
  it('Workshop Tangle stops the best station for 15 seconds, or breaks a lock instead', () => {
    const sim = fair();
    sim.idle.add('p2');
    if (w(sim, 'p2').lock) {
      expect(cast(sim, 'p1', 'tangle', 'p2').ok).toBe(true);
      expect(w(sim, 'p2').lock).toBe(false);
      expect(w(sim, 'p2').pranked.blocked).toBe(true);
      sim.run(46_000);
    }
    const rate = you(sim, 'p2').rate;
    expect(cast(sim, 'p1', 'tangle', 'p2').ok).toBe(true);
    const slot = w(sim, 'p2').pranked.slot;
    expect(w(sim, 'p2').slots[slot].stoppedUntil).toBe(sim.now + PRANK_MS);
    expect(you(sim, 'p2').rate).toBeLessThan(rate);
    expect(timers(sim).get('wake:p2')).toBe(sim.now + PRANK_MS);
    sim.run(PRANK_MS + 500);
    // The wake timer settled the workshop at the moment the tangle ran out.
    expect(w(sim, 'p2').slots[slot].stoppedUntil).toBeNull();
    expect(w(sim, 'p2').wakeAt).toBeNull();
    expect(you(sim, 'p2').stations[slot].stoppedUntil).toBeNull();
    expect(sim.errors).toEqual([]);
  });

  it('Stop the Workshop Line stops every station for 10 seconds: no income meanwhile, then it comes back', () => {
    const sim = fair();
    sim.idle.add('p2');
    expect(cast(sim, 'p1', 'stop-line', 'p2', { kind: 'all' }).ok).toBe(true);
    expect(you(sim, 'p2').rate).toBe(0);
    const t0 = you(sim, 'p2').takings;
    sim.run(9000);
    near(you(sim, 'p2').takings, t0, 1e-6);
    sim.run(1500);
    expect(you(sim, 'p2').rate).toBeGreaterThan(0);
    // A kind they do not have is refused.
    const missing = ['folder', 'loom', 'press', 'lab', 'helpers'].find((k) => !w(sim, 'p3').slots.some((st: any) => st?.kind === k));
    if (missing) expect(cast(sim, 'p4', 'stop-line', 'p3', { kind: missing }).ok).toBe(false);
  });

  it('Workshop Quick Fix restarts stopped stations at once', () => {
    const sim = fair();
    sim.idle.add('p2');
    expect(cast(sim, 'p2', 'untangle').ok).toBe(false);
    cast(sim, 'p1', 'stop-line', 'p2', { kind: 'all' });
    expect(cast(sim, 'p2', 'untangle').ok).toBe(true);
    expect(w(sim, 'p2').slots.every((st: any) => !st || st.stoppedUntil === null)).toBe(true);
    expect(you(sim, 'p2').rate).toBeGreaterThan(0);
  });

  it('Workshop Station Swap trades the caster’s weakest station for the target’s best', () => {
    const sim = fair({}, 60_000);
    sim.idle.add('p1');
    sim.idle.add('p2');
    const mine = stations(sim, 'p1');
    const theirs = stations(sim, 'p2');
    expect(cast(sim, 'p1', 'station-swap', 'p2').ok).toBe(true);
    const after1 = stations(sim, 'p1');
    const after2 = stations(sim, 'p2');
    const i = after1.findIndex((x: string | null, k: number) => x !== mine[k]);
    const j = after2.findIndex((x: string | null, k: number) => x !== theirs[k]);
    expect(after1[i]).toBe(theirs[j]);
    expect(after2[j]).toBe(mine[i]);
    expect(sim.errors).toEqual([]);
  });

  it('Workshop Rust drops the highest level by one; Workshop Elbow Grease lifts the lowest by one', () => {
    const sim = fair({}, 90_000);
    sim.idle.add('p2');
    const levels = () => w(sim, 'p2').slots.filter(Boolean).map((st: any) => st.level);
    const top = Math.max(...levels());
    const sum = levels().reduce((a: number, b: number) => a + b, 0);
    if (top > 1) {
      expect(cast(sim, 'p1', 'rust', 'p2').ok).toBe(true);
      expect(levels().reduce((a: number, b: number) => a + b, 0)).toBe(sum - 1);
    } else expect(cast(sim, 'p1', 'rust', 'p2').ok).toBe(false);
    const low = Math.min(...levels());
    const lowCount = levels().filter((l: number) => l === low).length;
    expect(cast(sim, 'p2', 'elbow-grease').ok).toBe(low < 5);
    if (low < 5) expect(levels().filter((l: number) => l === low).length).toBe(lowCount - 1);
  });

  it('Workshop Blueprint Theft builds a level 1 copy in a free slot; Workshop Station Poach moves the station itself', () => {
    const sim = fair({}, 20_000);
    for (const id of sim.ids) sim.idle.add(id);
    const free = w(sim, 'p1').slots.indexOf(null);
    expect(free).toBeGreaterThanOrEqual(0);
    const before = stations(sim, 'p2');
    expect(cast(sim, 'p1', 'blueprint-theft', 'p2').ok).toBe(true);
    expect(w(sim, 'p1').slots[free].level).toBe(1);
    expect(stations(sim, 'p2')).toEqual(before);
    if (w(sim, 'p2').slots.filter(Boolean).length >= 2 && w(sim, 'p1').slots.includes(null)) {
      const count = w(sim, 'p2').slots.filter(Boolean).length;
      sim.run(20_000); // chaos energy refills
      expect(cast(sim, 'p1', 'poach-station', 'p2').ok).toBe(true);
      expect(w(sim, 'p2').slots.filter(Boolean).length).toBe(count - 1);
    }
  });

  it('Workshop Station Poach is refused against a workshop with a single station', () => {
    const sim = new ChaosSim({ modeId: 'festival-workshop', questions: MIXED_SET, players: 3, seed: 3 });
    until(sim, () => sim.ids.some((id) => w(sim, id).slots.filter(Boolean).length === 1));
    const lone = sim.ids.find((id) => w(sim, id).slots.filter(Boolean).length === 1)!;
    const caster = sim.ids.find((id) => id !== lone)!;
    expect(cast(sim, caster, 'poach-station', lone).ok).toBe(false);
  });

  it('Festival Night Shift pays a second of income every second for 20 seconds', () => {
    // Two identical games; the cheat is cast in one. The difference is the bonus.
    const a = fair({}, 30_000);
    const b = fair({}, 30_000);
    for (const s of [a, b]) for (const id of s.ids) s.idle.add(id);
    const t0 = you(a, 'p1').takings;
    expect(cast(a, 'p1', 'night-shift').ok).toBe(true);
    const rates: number[] = [];
    for (let i = 0; i < 22; i++) {
      a.run(1000);
      b.run(1000);
      rates.push(you(b, 'p1').rate);
    }
    const bonus = you(a, 'p1').takings - you(b, 'p1').takings;
    // Twenty bonus seconds, each at the rate of that moment (the market can move it between seconds).
    expect(bonus).toBeGreaterThanOrEqual(20 * Math.min(...rates) - 1e-6);
    expect(bonus).toBeLessThanOrEqual(20 * Math.max(...rates) + 1e-6);
    near(you(a, 'p1').coins - you(b, 'p1').coins, bonus, 1e-6);
    expect(you(a, 'p1').takings).toBeGreaterThan(t0);
  });

  it('Festival Overtime Heist moves the running boosts with their time left', () => {
    const sim = fair({}, 20_000);
    let victim: string | undefined;
    until(sim, () => Boolean((victim = sim.ids.find((id) => id !== 'p1' && (w(sim, id).overtimeUntil ?? 0) > sim.now + 5000))));
    sim.idle.add(victim!);
    const until0 = w(sim, victim!).overtimeUntil;
    const mine = w(sim, 'p1').overtimeUntil;
    expect(cast(sim, 'p1', 'boost-heist', victim!).ok).toBe(true);
    expect(w(sim, victim!).overtimeUntil).toBeNull();
    expect(w(sim, 'p1').overtimeUntil).toBe(Math.max(mine ?? sim.now, sim.now) + (until0 - sim.now));
  });

  it('Workshop Red Tape refuses building and upgrading for 20 seconds', () => {
    const sim = fair({}, 20_000);
    sim.idle.add('p2');
    expect(cast(sim, 'p1', 'red-tape', 'p2').ok).toBe(true);
    const r = sim.rt.act('p2', { type: 'upgrade', slot: 0 });
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.message).toContain('Red Tape');
    sim.run(20_500);
    const again = sim.rt.act('p2', { type: 'upgrade', slot: 0 });
    expect(again.ok ? '' : again.message).not.toContain('Red Tape');
  });

  it('Pocket Festival Sparks gives at most 3 free upgrades, one per right answer, then ends', () => {
    const sim = fair({}, 20_000);
    const levels = () => w(sim, 'p1').slots.filter(Boolean).reduce((n: number, st: any) => n + st.level, 0);
    const before = levels();
    const correct = w(sim, 'p1').stream.correct;
    expect(cast(sim, 'p1', 'pocket-sparks').ok).toBe(true);
    sim.run(41_000);
    const answers = w(sim, 'p1').stream.correct - correct;
    // Bought upgrades also raise levels, so count the sparks from the feed.
    const sparks = sim.feed.filter((f) => f.startsWith('Pocket Festival Sparks:')).length;
    expect(sparks).toBe(Math.min(3, answers));
    expect(levels()).toBeGreaterThanOrEqual(before + sparks);
  });
});

describe('festival-workshop pack: money', () => {
  it('Festival Payday Freeze cancels paydays, coins and takings both, and says so on the card', () => {
    const sim = fair();
    const paid = w(sim, 'p2').fromPaydays;
    const correct = w(sim, 'p2').stream.correct;
    expect(cast(sim, 'p1', 'payday-freeze', 'p2').ok).toBe(true);
    until(sim, () => w(sim, 'p2').stream.correct > correct, 20_000);
    expect(w(sim, 'p2').payday.amount).toBe(0);
    expect(w(sim, 'p2').payday.notes.join(' ')).toContain('frozen');
    near(w(sim, 'p2').fromPaydays, paid);
  });

  it('Festival Payday Advance pays the next payday by the mode’s own formula', () => {
    const sim = fair();
    sim.idle.add('p1');
    const v = you(sim, 'p1');
    const s = sim.state();
    const pay = paydayFor(v.rate, w(sim, 'p1').stream.streak + 1, { rush: s.event?.kind === 'rush', finale: s.finale });
    expect(cast(sim, 'p1', 'payday-advance').ok).toBe(true);
    near(you(sim, 'p1').takings - v.takings, pay.amount, 1e-3);
    near(you(sim, 'p1').coins - v.coins, pay.amount, 1e-3);
  });

  it('Workshop Streak Snap resets a streak and can be undone', () => {
    const sim = fair();
    let t: string | undefined;
    until(sim, () => Boolean((t = sim.ids.find((id) => id !== 'p1' && w(sim, id).stream.streak >= 2))));
    sim.idle.add(t!);
    const streak = w(sim, t!).stream.streak;
    const r = cast(sim, 'p1', 'streak-snap', t);
    expect(r.ok).toBe(true);
    expect(w(sim, t!).stream.streak).toBe(0);
    expect(sim.rt.undoCast('p1', r.ok ? r.castId : '').ok).toBe(true);
    expect(w(sim, t!).stream.streak).toBe(streak);
  });

  it('Workshop Cash Box Raid and Workshop Purse Swap move coins only, never takings', () => {
    const sim = fair();
    sim.idle.add('p1');
    sim.idle.add('p2');
    until(sim, () => you(sim, 'p2').coins >= 10);
    const c2 = you(sim, 'p2').coins;
    const t1 = you(sim, 'p1').takings;
    const t2 = you(sim, 'p2').takings;
    expect(cast(sim, 'p1', 'cash-box-raid', 'p2').ok).toBe(true);
    near(you(sim, 'p2').coins, c2 - Math.max(1, Math.round(c2 * 0.2)), 1e-6);
    near(you(sim, 'p1').takings, t1, 1e-6);
    near(you(sim, 'p2').takings, t2, 1e-6);
    const a = you(sim, 'p1').coins;
    const b = you(sim, 'p2').coins;
    expect(cast(sim, 'p1', 'purse-swap', 'p2').ok).toBe(true);
    near(you(sim, 'p1').coins, b, 1e-6);
    near(you(sim, 'p2').coins, a, 1e-6);
  });

  it('Workshop Ground Rent charges every rival 5 seconds of income', () => {
    const sim = fair();
    for (const id of sim.ids) sim.idle.add(id);
    const due = ['p2', 'p3', 'p4'].reduce((n, id) => n + Math.min(you(sim, id).coins, you(sim, id).rate * 5), 0);
    const c1 = you(sim, 'p1').coins;
    expect(cast(sim, 'p1', 'ground-rent').ok).toBe(true);
    near(you(sim, 'p1').coins - c1, due, 1e-6);
  });

  it('Festival Discount gives half of a purchase back; Workshop Price Gouging charges half again', () => {
    const sim = fair({}, 5000);
    for (const id of sim.ids) sim.idle.add(id);
    until(sim, () => you(sim, 'p1').coins >= 60 && you(sim, 'p2').coins >= 60 && w(sim, 'p1').slots.includes(null) && w(sim, 'p2').slots.includes(null));
    expect(cast(sim, 'p1', 'discount').ok).toBe(true);
    let c = you(sim, 'p1').coins;
    expect(sim.rt.act('p1', { type: 'build', slot: w(sim, 'p1').slots.indexOf(null), station: 'folder' }).ok).toBe(true);
    near(c - you(sim, 'p1').coins, 10, 1e-6);
    expect(cast(sim, 'p3', 'price-gouging', 'p2').ok).toBe(true);
    c = you(sim, 'p2').coins;
    expect(sim.rt.act('p2', { type: 'build', slot: w(sim, 'p2').slots.indexOf(null), station: 'folder' }).ok).toBe(true);
    near(c - you(sim, 'p2').coins, 30, 1e-6);
  });
});

describe('festival-workshop pack: locks and favours', () => {
  it('Spare Workshop Lock, Workshop Lock Pick and Pass the Workshop Lock move one lock at a time', () => {
    const sim = fair({}, 20_000, { teamCount: 2 });
    for (const id of sim.ids) sim.idle.add(id);
    if (!w(sim, 'p1').lock) expect(cast(sim, 'p1', 'spare-lock').ok).toBe(true);
    expect(cast(sim, 'p1', 'spare-lock').ok).toBe(false);
    if (!w(sim, 'p3').lock) {
      expect(cast(sim, 'p1', 'pass-lock', 'p3').ok).toBe(true);
      expect([w(sim, 'p1').lock, w(sim, 'p3').lock]).toEqual([false, true]);
    }
    expect(cast(sim, 'p2', 'lock-pick', 'p3').ok).toBe(true);
    expect(w(sim, 'p3').lock).toBe(false);
    // Friendly Fair: no pranks, so no locks.
    const friendly = fair({ pranks: false }, 5000);
    expect(cast(friendly, 'p1', 'spare-lock').ok).toBe(false);
  });

  it('Festival Favour Owed opens two different cards for 20 seconds, and the question waits', () => {
    const sim = fair();
    until(sim, () => !w(sim, 'p1').offer && Boolean(w(sim, 'p1').stream.iid));
    sim.idle.add('p1');
    const iid = w(sim, 'p1').stream.iid;
    expect(cast(sim, 'p1', 'favour-owed').ok).toBe(true);
    const o = w(sim, 'p1').offer;
    expect(new Set(o.cards).size).toBe(2);
    for (const k of o.cards) expect(o.deck).toContain(k);
    expect(timers(sim).get('offer:p1')).toBe(sim.now + 20_000);
    const card = o.cards.find((k: string) => k !== 'prank') ?? 'prank';
    const target = card === 'prank' ? sim.ids.find((id) => id !== 'p1') : undefined;
    expect(sim.rt.act('p1', { type: 'favour', card, ...(target ? { target } : {}) }).ok).toBe(true);
    expect(w(sim, 'p1').offer).toBeNull();
    expect(w(sim, 'p1').stream.iid).toBe(iid);
  });

  it('Reshuffled Festival Favours, Favour Card Snatch, Festival Favour Deadline and Torn Favour Cards act on open cards', () => {
    const sim = fair();
    for (const id of ['p1', 'p2', 'p3']) {
      until(sim, () => !w(sim, id).offer);
      sim.idle.add(id);
    }
    expect(cast(sim, 'p1', 'torn-cards', 'p2').ok).toBe(false);
    expect(cast(sim, 'p2', 'favour-owed').ok).toBe(true);
    const cards = w(sim, 'p2').offer.cards;
    expect(cast(sim, 'p1', 'card-snatch', 'p2').ok).toBe(true);
    expect(w(sim, 'p1').offer.cards).toEqual(cards);
    expect(w(sim, 'p2').offer).toBeNull();
    expect(w(sim, 'p2').stream.iid).not.toBeNull();
    const r = cast(sim, 'p1', 'reshuffle-favours');
    if (r.ok) expect([...w(sim, 'p1').offer.cards].sort()).not.toEqual([...cards].sort());
    expect(cast(sim, 'p3', 'hurry-favour', 'p1').ok).toBe(true);
    expect(w(sim, 'p1').offer.until).toBe(sim.now + 3000);
    sim.run(3500);
    // Time ran out: the first card was taken for them, as usual.
    expect(w(sim, 'p1').offer).toBeNull();
    expect(w(sim, 'p1').favour.auto).toBe(true);
    sim.run(61_000);
    expect(cast(sim, 'p3', 'favour-owed').ok).toBe(true);
    expect(cast(sim, 'p4', 'torn-cards', 'p3').ok).toBe(true);
    expect(w(sim, 'p3').offer).toBeNull();
    expect(sim.errors).toEqual([]);
  });
});

describe('festival-workshop pack: market and events', () => {
  it('Rig the Festival Market sets a price to the end of the range and recomputes income', () => {
    const sim = fair();
    expect(cast(sim, 'p1', 'rig-market', undefined, { goods: 'lanterns', way: 'up' }).ok).toBe(true);
    expect(sim.state().market.demand.lanterns).toBe(MARKET.normal.max);
    expect(cast(sim, 'p2', 'rig-market', undefined, { goods: 'lanterns', way: 'up' }).ok).toBe(false);
    expect(cast(sim, 'p2', 'rig-market', undefined, { goods: 'kites', way: 'down' }).ok).toBe(true);
    expect(sim.state().market.demand.kites).toBe(MARKET.normal.min);
    for (const id of sim.ids) near(w(sim, id).rate, you(sim, id).rate, 1e-9);
  });

  it('Festival Market Bell shifts now and Festival Price Freeze delays the next shift by 30 seconds', () => {
    const sim = fair();
    const shifts = sim.state().market.shifts;
    const next = sim.state().market.shiftAt;
    const r = cast(sim, 'p1', 'market-bell');
    if (r.ok) {
      expect(sim.state().market.shifts).toBe(shifts + 1);
      expect(sim.state().market.lastShiftAt).toBe(sim.now);
    }
    expect(sim.state().market.shiftAt).toBe(next);
    expect(cast(sim, 'p2', 'price-freeze').ok).toBe(true);
    expect(sim.state().market.shiftAt).toBe(next + 30_000);
    expect(timers(sim).get('shift')).toBe(next + 30_000);
  });

  it('Workshop Event Herald calls a parade order sized by the mode’s rule, and holds back the next event', () => {
    const sim = fair({}, 10_000);
    expect(cast(sim, 'p1', 'summon-event', undefined, { event: 'parade' }).ok).toBe(true);
    const ev = sim.state().event;
    expect(ev.kind).toBe('parade');
    expect(ev.target).toBe(paradeTarget(ev.goods, 4));
    expect(ev.endsAt).toBe(sim.now + 30_000);
    expect(timers(sim).get('eventEnd')).toBe(ev.endsAt);
    expect(sim.state().nextEventAt).toBeGreaterThanOrEqual(ev.endsAt);
    expect(cast(sim, 'p2', 'summon-event', undefined, { event: 'rush' }).ok).toBe(false);
    sim.run(31_000);
    expect(sim.state().parade?.at).toBe(ev.endsAt);
    expect(sim.errors).toEqual([]);
  });

  it('Workshop Event Herald respects Rush Orders and needs Glim Helpers for a tea break', () => {
    const rush = fair({ rushOrders: true }, 10_000);
    expect(cast(rush, 'p1', 'summon-event', undefined, { event: 'rush' }).ok).toBe(false);
    const early = fair({}, 3000);
    if (!Object.values(early.state().workshops).some((x: any) => x.slots.some((st: any) => st?.kind === 'helpers'))) {
      expect(cast(early, 'p1', 'summon-event', undefined, { event: 'tea' }).ok).toBe(false);
    }
  });

  it('Festival Early Bell judges a parade at once, paying the top makers 20 seconds of income', () => {
    const sim = fair({}, 10_000);
    expect(cast(sim, 'p1', 'summon-event', undefined, { event: 'parade' }).ok).toBe(true);
    sim.run(8000);
    for (const id of sim.ids) sim.idle.add(id);
    const rates = Object.fromEntries(sim.ids.map((id) => [id, you(sim, id).rate]));
    expect(cast(sim, 'p2', 'early-bell').ok).toBe(true);
    const p = sim.state().parade;
    expect(sim.state().event).toBeNull();
    expect(p.at).toBe(sim.now);
    for (const top of p.top) expect(top.bonus).toBe(Math.max(1, Math.round(rates[top.playerId]! * PARADE.bonusSeconds)));
    expect(p.top.length).toBeGreaterThan(0);
    expect(p.top.length).toBeLessThanOrEqual(PARADE.rewarded);
    expect(timers(sim).has('eventEnd')).toBe(false);
    sim.run(40_000);
    expect(sim.errors).toEqual([]);
  });

  it('Festival Encore adds 15 seconds; Shorter Parade Route cuts the target by a quarter; Parade Poach moves half', () => {
    const sim = fair({}, 10_000);
    expect(cast(sim, 'p1', 'summon-event', undefined, { event: 'parade' }).ok).toBe(true);
    const ev = sim.state().event;
    expect(cast(sim, 'p2', 'encore-hour').ok).toBe(true);
    expect(sim.state().event.endsAt).toBe(ev.endsAt + 15_000);
    expect(cast(sim, 'p3', 'short-parade').ok).toBe(true);
    expect(sim.state().event.target).toBe(Math.round(ev.target * 0.75));
    let maker: string | undefined;
    until(sim, () => Boolean((maker = sim.ids.find((id) => id !== 'p4' && meter(sim, 'parade', id) > 0))), 20_000);
    const theirs = meter(sim, 'parade', maker!);
    const mine = meter(sim, 'parade', 'p4');
    expect(cast(sim, 'p4', 'parade-poach', maker).ok).toBe(true);
    near(meter(sim, 'parade', maker!), theirs / 2, 1e-6);
    near(meter(sim, 'parade', 'p4'), mine + theirs / 2, 1e-6);
  });
});
