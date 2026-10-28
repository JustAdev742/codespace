import { describe, expect, it } from 'vitest';
import { ChaosSim, type ChaosSimOptions } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { SPACES } from '../src/modes/lantern-trail/board.ts';
import { STEPS } from '../src/modes/lantern-trail/index.ts';
import { allCheats } from '../src/chaos/registry.ts';

/* Exact behaviour of the Lantern Trail pack: amounts, limits, refusals and expiry. */

const ID = (slug: string) => `lantern-trail.${slug}`;

function game(opts: Partial<ChaosSimOptions> = {}) {
  return new ChaosSim({ modeId: 'lantern-trail', questions: MIXED_SET, players: 4, seed: 7, ...opts });
}

const W = (sim: ChaosSim, id: string) => sim.state().walkers[id];
const atRest = (w: any) => !w.pending && (!w.move || w.move.endedAt !== null);

/** Play on in small steps until `pred` holds. */
function until(sim: ChaosSim, pred: () => boolean, maxMs = 120_000, step = 250) {
  for (let t = 0; t < maxMs && !pred(); t += step) sim.run(step);
  expect(pred(), 'the situation the test needs never came up').toBe(true);
}

function cast(sim: ChaosSim, caster: string, cheat: string, target?: string, params?: Record<string, unknown>) {
  return sim.cast(caster, { cheatId: ID(cheat), target: target ?? null, ...(params ? { params } : {}) });
}

/** Everyone stops playing, so Glims stay where the test puts them. */
function freeze(sim: ChaosSim) {
  for (const id of sim.ids) sim.idle.add(id);
}

/** Steps forward from `a` to `b` the long way round (never the shortcut). */
function longSteps(a: number, b: number): number {
  let n = 0;
  for (let p = a; p !== b && n < 40; n++) p = SPACES[p]!.next[0]!;
  return n;
}

describe('lantern-trail pack', () => {
  it('registers about forty distinct cheats, each only for Lantern Trail', () => {
    const mine = allCheats().filter((c) => c.id.startsWith('lantern-trail.'));
    expect(mine.length).toBeGreaterThanOrEqual(38);
    for (const c of mine) expect(c.modes).toEqual(['lantern-trail']);
  });

  it('Glim Skip walks forward the long way, never stops on a pier, and pays the Town Gate', () => {
    const sim = game();
    sim.run(30_000);
    freeze(sim);
    const p = sim.ids.find((id) => atRest(W(sim, id)))!;
    const before = W(sim, p);
    expect(cast(sim, p, 'glim-skip', undefined, { steps: 3 }).ok).toBe(true);
    const after = W(sim, p);
    expect(SPACES[after.pos]!.kind).not.toBe('ferry');
    const steps = longSteps(before.pos, after.pos);
    expect(steps === 3 || (steps === 4 && SPACES[[...Array(3)].reduce((x) => SPACES[x]!.next[0]!, before.pos)]!.kind === 'ferry')).toBe(true);
    const passedGate = [...Array(steps)].reduce((acc: { at: number; gate: boolean }) => {
      const at = SPACES[acc.at]!.next[0]!;
      return { at, gate: acc.gate || at === 0 };
    }, { at: before.pos, gate: false }).gate;
    expect(after.coins - before.coins).toBe(passedGate ? 5 : 0);
  });

  it('refuses to move a Glim in the middle of a move', () => {
    const sim = game();
    until(sim, () => sim.ids.some((id) => W(sim, id).pending));
    const busy = sim.ids.find((id) => W(sim, id).pending)!;
    sim.idle.add(busy);
    const r = cast(sim, busy, 'glim-skip');
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.message).toContain('Finish your move first');
  });

  it('Gust of Gloom blows a rival back along the way they came', () => {
    const sim = game();
    sim.run(30_000);
    freeze(sim);
    const t = sim.ids.find((id) => id !== 'p1' && atRest(W(sim, id)) && W(sim, id).pos > 3 && W(sim, id).pos < 32)!;
    const from = W(sim, t).pos;
    expect(cast(sim, 'p1', 'gust-of-gloom', t, { steps: 2 }).ok).toBe(true);
    const to = W(sim, t).pos;
    expect(SPACES[to]!.kind).not.toBe('ferry');
    expect([2, 3]).toContain(longSteps(to, from));
  });

  it('Ferryman’s Favour mirrors the Glim across the river, but not from the Town Gate', () => {
    const sim = game();
    // Everyone starts at the Town Gate, which has no other side.
    const r = cast(sim, 'p1', 'ferrymans-favour');
    expect(r.ok).toBe(false);
    sim.run(30_000);
    freeze(sim);
    const p = sim.ids.find((id) => {
      const pos = W(sim, id).pos;
      return atRest(W(sim, id)) && pos > 0 && pos < 32 && pos !== 16;
    })!;
    const from = W(sim, p).pos;
    expect(cast(sim, p, 'ferrymans-favour').ok).toBe(true);
    expect(W(sim, p).pos).toBe((32 - from) % 32);
  });

  it('Moonlit Trade swaps two Glims and tells the victim who did it; Kind Night has no tricks', () => {
    const sim = game();
    sim.run(30_000);
    freeze(sim);
    const [a, b] = sim.ids.filter((id) => atRest(W(sim, id)));
    if (W(sim, a!).pos === W(sim, b!).pos) cast(sim, a!, 'glim-skip');
    const pa = W(sim, a!).pos;
    const pb = W(sim, b!).pos;
    expect(cast(sim, a!, 'moonlit-trade', b).ok).toBe(true);
    expect(W(sim, a!).pos).toBe(pb);
    expect(W(sim, b!).pos).toBe(pa);
    expect(W(sim, b!).hit).toMatchObject({ kind: 'trade', name: 'Bot ' + a!.slice(1), to: pa });

    const kind = game({ variantId: 'lantern-trail-kind-night' });
    const r = kind.cast('p1', { cheatId: ID('moonlit-trade'), target: 'p2' });
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.message).toContain('does not work here');
  });

  it('Stall Sniffer lands just behind the nearest stall, never on a pier', () => {
    // No room events, so no parade moves the stall while the test waits.
    const sim = game({ settings: { events: false } });
    sim.run(20_000);
    freeze(sim);
    const p = sim.ids.find((id) => atRest(W(sim, id)))!;
    expect(cast(sim, p, 'stall-sniffer').ok).toBe(true);
    const pos = W(sim, p).pos;
    expect(SPACES[pos]!.kind).not.toBe('ferry');
    const nearest = Math.min(...sim.state().stalls.map((s: any) => STEPS[pos]![s.pos]!));
    expect(nearest === 1 || (nearest === 2 && SPACES[SPACES[pos]!.next[0]!]!.kind === 'ferry')).toBe(true);
    // Already right behind it: refused.
    sim.run(80_000);
    expect(cast(sim, p, 'stall-sniffer').ok).toBe(false);
  });

  it('Puddle Splash drops a rival on the nearest puddle behind and takes the puddle’s toll', () => {
    const sim = game();
    sim.run(30_000);
    freeze(sim);
    const t = sim.ids.find((id) => id !== 'p1' && atRest(W(sim, id)) && W(sim, id).coins >= 3)!;
    const before = W(sim, t);
    expect(cast(sim, 'p1', 'puddle-splash', t).ok).toBe(true);
    const after = W(sim, t);
    expect(SPACES[after.pos]!.kind).toBe('gloom');
    const toll = sim.state().event?.kind === 'gloomy' ? 6 : 3;
    expect(before.coins - after.coins).toBe(Math.min(toll, before.coins));
  });

  it('Glim Scramble changes where the Glims stand, never their coins', () => {
    const sim = game();
    sim.run(30_000);
    freeze(sim);
    const before = sim.ids.map((id) => [W(sim, id).pos, W(sim, id).coins]);
    expect(cast(sim, 'p1', 'glim-scramble').ok).toBe(true);
    const after = sim.ids.map((id) => [W(sim, id).pos, W(sim, id).coins]);
    expect(after.map((x) => x[1])).toEqual(before.map((x) => x[1]));
    expect(after.map((x) => x[0])).not.toEqual(before.map((x) => x[0]));
    expect(after.map((x) => x[0]).sort()).toEqual(before.map((x) => x[0]).sort());
  });

  it('Golden tickets: forge up to three, snatch one', () => {
    const sim = game();
    freeze(sim);
    for (let i = 0; i < 3; i++) {
      expect(cast(sim, 'p2', 'forged-ticket').ok).toBe(true);
      sim.run(60_000);
    }
    expect(W(sim, 'p2').tickets).toBe(3);
    expect(cast(sim, 'p2', 'forged-ticket').ok).toBe(false);
    expect(cast(sim, 'p1', 'ticket-snatch', 'p3').ok).toBe(false);
    expect(cast(sim, 'p1', 'ticket-snatch', 'p2').ok).toBe(true);
    expect([W(sim, 'p1').tickets, W(sim, 'p2').tickets]).toEqual([1, 2]);
  });

  it('Lantern Delivery charges the stall price, moves the stall on, and never wins the game', () => {
    const sim = game();
    sim.run(20_000);
    freeze(sim);
    const p = sim.ids.find((id) => W(sim, id).coins >= 20)!;
    const before = W(sim, p);
    const stallsBefore = sim.state().stalls.map((s: any) => s.pos);
    expect(cast(sim, p, 'lantern-delivery').ok).toBe(true);
    const after = W(sim, p);
    expect(after.lanterns).toBe(before.lanterns + 1);
    expect(before.coins - after.coins).toBe(20);
    const moved = sim.state().stalls.find((s: any, i: number) => s.pos !== stallsBefore[i]);
    expect(moved).toBeTruthy();
    expect(STEPS[after.pos]![moved.pos]).toBeGreaterThanOrEqual(8);

    const goal = game({ settings: { goalLanterns: 1 } });
    freeze(goal);
    expect(goal.cast('p1', { cheatId: ID('coin-shower') }).ok).toBe(true);
    const r = goal.cast('p1', { cheatId: ID('lantern-delivery') });
    expect(r.ok).toBe(false);
    expect(W(goal, 'p1').lanterns).toBe(0);
  });

  it('Lantern Lottery costs 8 coins and needs them', () => {
    const sim = game();
    freeze(sim);
    const before = W(sim, 'p1');
    expect(cast(sim, 'p1', 'lantern-lottery').ok).toBe(true);
    const after = W(sim, 'p1');
    const won = after.lanterns - before.lanterns + after.tickets - before.tickets;
    expect(before.coins - after.coins).toBe(8);
    expect([0, 1]).toContain(won);
    expect(allCheats().find((c) => c.id === ID('lantern-lottery'))!.description).toContain('a Golden Lantern 15%');
  });

  it('Pickpocket Glim takes up to 5 coins and marks the victim; Coin Shower pays 3 each and 6 to you', () => {
    const sim = game();
    freeze(sim);
    expect(cast(sim, 'p1', 'pickpocket-glim', 'p2').ok).toBe(true);
    expect([W(sim, 'p1').coins, W(sim, 'p2').coins]).toEqual([20, 10]);
    expect(W(sim, 'p2').hit).toMatchObject({ kind: 'pickpocket', coins: 5 });
    expect(cast(sim, 'p3', 'coin-shower').ok).toBe(true);
    expect(sim.ids.map((id) => W(sim, id).coins)).toEqual([23, 13, 21, 18]);
  });

  it('Hot Coals lights a hot streak; Bucket of Cold Water puts it out', () => {
    const sim = game();
    freeze(sim);
    expect(cast(sim, 'p1', 'hot-coals').ok).toBe(true);
    expect(W(sim, 'p1').stream.streak).toBe(3);
    expect(cast(sim, 'p1', 'hot-coals').ok).toBe(false);
    expect(cast(sim, 'p2', 'cold-water', 'p1').ok).toBe(true);
    expect(W(sim, 'p1').stream.streak).toBe(0);
    expect(cast(sim, 'p3', 'cold-water', 'p1').ok).toBe(false);
  });

  it('Tailwind carries the Glim 2 more spaces after its move ends', () => {
    const sim = game({ skill: 1 });
    sim.run(10_000);
    expect(cast(sim, 'p1', 'tailwind').ok).toBe(true);
    const seq = W(sim, 'p1').move?.seq ?? 0;
    until(sim, () => (W(sim, 'p1').move?.seq ?? 0) > seq && atRest(W(sim, 'p1')) && W(sim, 'p1').pos !== W(sim, 'p1').move.path.at(-1));
    const w = W(sim, 'p1');
    expect([2, 3]).toContain(longSteps(w.move.path.at(-1), w.pos));
  });

  it('Hitch a Ride puts you where your rival’s move ended', () => {
    const sim = game({ skill: 1 });
    sim.run(10_000);
    sim.idle.add('p1');
    until(sim, () => atRest(W(sim, 'p1')));
    expect(cast(sim, 'p1', 'hitch-a-ride', 'p2').ok).toBe(true);
    const seq = W(sim, 'p2').move?.seq ?? 0;
    until(sim, () => (W(sim, 'p2').move?.seq ?? 0) > seq && atRest(W(sim, 'p2')));
    sim.run(500);
    expect(W(sim, 'p1').pos).toBe(W(sim, 'p2').pos);
  });

  it('Snap Decision needs an open choice; Old Bridge Closed refuses the shortcut and takes the long way', () => {
    const sim = game();
    freeze(sim);
    expect(cast(sim, 'p1', 'snap-decision', 'p2').ok).toBe(false);

    const road = game({ seed: 11 });
    road.cast('p1', { cheatId: ID('bridge-closed') });
    until(road, () => road.ids.some((id) => id !== 'p1' && W(road, id).pending?.kind === 'fork'), 200_000, 50);
    const t = road.ids.find((id) => id !== 'p1' && W(road, id).pending?.kind === 'fork')!;
    const r = road.rt.act(t, { type: 'fork', route: 'short' });
    expect(r.ok).toBe(false);
    road.run(300);
    const notes = W(road, t).move.notes.filter((n: any) => n.k === 'route');
    expect(notes.at(-1)).toMatchObject({ route: 'long', auto: true });
  });

  it('Shutters Down refuses a purchase and holds the offer until 5 seconds after it lifts', () => {
    const sim = game();
    sim.run(20_000);
    const t = sim.ids.find((id) => id !== 'p1')!;
    sim.cast(t, { cheatId: ID('coin-shower') });
    expect(cast(sim, 'p1', 'shutters-down', t).ok).toBe(true);
    const ends = sim.chaos().effects.find((e) => e.cheatId === ID('shutters-down'))!.endsAt;
    sim.cast(t, { cheatId: ID('stall-sniffer') });
    until(sim, () => W(sim, t).pending?.kind === 'buy', 15_000, 50);
    sim.idle.add(t);
    expect(sim.rt.act(t, { type: 'buy', buy: true }).ok).toBe(false);
    sim.run(300);
    expect(W(sim, t).pending.deadline).toBeGreaterThanOrEqual(ends + 5000);
  });

  it('Festival Herald starts the chosen event, Encore stretches it, Rain on the Parade ends it', () => {
    const sim = game();
    freeze(sim);
    const now = sim.now;
    expect(cast(sim, 'p1', 'festival-herald', undefined, { event: 'sale' }).ok).toBe(true);
    expect(sim.state().event).toMatchObject({ kind: 'sale', startsAt: now, endsAt: now + 30_000 });
    expect(sim.state().nextEventAt).toBeNull();
    expect(sim.view('p1', false)).toBeTruthy();
    expect(cast(sim, 'p2', 'festival-herald').ok).toBe(false);
    expect(cast(sim, 'p2', 'encore').ok).toBe(true);
    expect(sim.state().event.endsAt).toBe(now + 50_000);
    expect(cast(sim, 'p3', 'rain-on-the-parade').ok).toBe(true);
    expect(sim.state().event).toBeNull();
    expect(sim.state().nextEventAt).toBe(now + 90_000);
    sim.run(91_000);
    expect(sim.state().event).not.toBeNull();
  });

  it('Pop-up Stall adds a second stall for 40 seconds; not in a two-stall game', () => {
    const sim = game();
    freeze(sim);
    expect(cast(sim, 'p1', 'popup-stall').ok).toBe(true);
    expect(sim.state().stalls).toHaveLength(2);
    sim.run(41_000);
    expect(sim.state().stalls).toHaveLength(1);
    const two = game({ variantId: 'lantern-trail-two-stalls' });
    expect(two.cast('p1', { cheatId: ID('popup-stall') }).ok).toBe(false);
  });

  it('Nailed Down puts a parading stall back and blocks stall cheats while it lasts', () => {
    const sim = game();
    freeze(sim);
    expect(cast(sim, 'p1', 'festival-herald', undefined, { event: 'parade' }).ok).toBe(true);
    expect(cast(sim, 'p2', 'nailed-down').ok).toBe(true);
    const pos = sim.state().stalls[0].pos;
    expect(cast(sim, 'p3', 'whispered-rumour').ok).toBe(false);
    sim.run(10_500);
    expect(sim.state().stalls[0].pos).toBe(pos);
    sim.run(25_000);
    expect(sim.chaos().effects.some((e) => e.cheatId === ID('nailed-down'))).toBe(false);
  });

  it('Whispered Rumour brings the nearest stall 3 steps closer', () => {
    const sim = game();
    freeze(sim);
    const stall = sim.state().stalls[0].pos;
    const d = (pos: number) => Math.min(STEPS[0]![pos]!, STEPS[pos]![0]!);
    expect(cast(sim, 'p1', 'whispered-rumour').ok).toBe(true);
    expect(d(stall) - d(sim.state().stalls[0].pos)).toBeGreaterThanOrEqual(2);
  });

  it('Bumper Luck doubles what coin spaces and fairs pay (and nothing else)', () => {
    const sim = game({ skill: 1 });
    sim.run(5_000);
    expect(cast(sim, 'p1', 'bumper-luck').ok).toBe(true);
    let checked = 0;
    for (let t = 0; t < 30_000; t += 50) {
      const before = W(sim, 'p1');
      sim.run(50);
      const after = W(sim, 'p1');
      if (after.move?.seq === before.move?.seq && after.move?.notes.length === before.move?.notes.length) continue;
      const fresh = after.move.seq === before.move?.seq ? after.move.notes.slice(before.move.notes.length) : after.move.notes;
      // Only simple moves: one paying space and nothing else that moves coins.
      const pays = fresh.filter((n: any) => n.k === 'space' && n.kind !== 'gloom');
      const other = fresh.filter((n: any) => ['gate', 'card', 'buy', 'steal'].includes(n.k) || (n.k === 'space' && n.kind === 'gloom'));
      if (pays.length !== 1 || other.length || sim.state().walkers.p1.hit?.at === sim.now) continue;
      expect(after.coins - before.coins).toBe(2 * pays[0].coins);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('every random cheat states its odds', () => {
    for (const c of allCheats().filter((x) => x.id.startsWith('lantern-trail.') && x.category === 'random' && x.id !== ID('glim-scramble') && x.id !== ID('stall-shuffle'))) {
      expect(c.description).toMatch(/\d+%/);
    }
  });
});
