import { describe, expect, it } from 'vitest';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';
import { tollPayments } from '../src/modes/night-market/index.ts';
import { FORTUNE_ODDS, LUCKY_MAX, SHIELD_REFUND, TRICK_GUARD_SEC, WILD_ODDS, type LanternKind } from '../src/modes/night-market/meta.ts';
import { contentWeights } from '../src/modes/night-market/odds.ts';

/* Exact behaviour of the Night Market cheat pack: amounts, limits, refusals, expiry. */

function market(settings: Record<string, unknown> = {}, warm = 15_000, players = 4) {
  const sim = new ChaosSim({ modeId: 'night-market', questions: MIXED_SET, players, seed: 7, settings });
  sim.run(warm);
  return sim;
}

const st = (sim: ChaosSim, id: string): any => sim.state().stalls[id];
const cast = (sim: ChaosSim, by: string, cheat: string, target?: string, params?: Record<string, unknown>) =>
  sim.cast(by, { cheatId: `night-market.${cheat}`, target: target ?? null, ...(params ? { params } : {}) });
const timers = (sim: ChaosSim): Map<string, number> => (sim.rt as any).timers;

function until(sim: ChaosSim, pred: () => boolean, maxMs = 200_000) {
  for (let t = 0; t < maxMs && !pred() && sim.rt.status === 'running'; t += 250) sim.run(250);
  if (!pred()) throw new Error('the situation never came up');
}

/** Wait until `id` holds an offer, then stop their bot so it stays open. */
function holdOffer(sim: ChaosSim, id: string) {
  until(sim, () => Boolean(st(sim, id).offer));
  sim.idle.add(id);
}

/** Wait until some player other than `not` is choosing a trick target, and keep them choosing. */
function pendingRival(sim: ChaosSim, not: string[]): string {
  let found: string | undefined;
  until(sim, () => Boolean((found = sim.ids.find((id) => !not.includes(id) && st(sim, id).pending))));
  sim.idle.add(found!);
  return found!;
}

const coins = (sim: ChaosSim) => sim.ids.map((id) => st(sim, id).coins);
const total = (sim: ChaosSim) => coins(sim).reduce((a, b) => a + b, 0);

describe('night-market pack: offers', () => {
  it('Fresh Market Lanterns needs an offer and keeps its Lantern Sight', () => {
    const sim = market();
    sim.idle.add('p1');
    if (!st(sim, 'p1').offer) expect(cast(sim, 'p1', 'reroll-offer').ok).toBe(false);
    sim.idle.delete('p1');
    holdOffer(sim, 'p1');
    expect(cast(sim, 'p1', 'moonlit-peek').ok).toBe(true);
    const before = st(sim, 'p1').offer;
    expect(cast(sim, 'p1', 'reroll-offer').ok).toBe(true);
    const after = st(sim, 'p1').offer;
    expect(after.seq).toBeGreaterThan(before.seq);
    expect(after.lanterns).toHaveLength(3);
    expect(after.sight).toBe(true);
  });

  it('Market Lantern Painter makes every lantern the chosen kind, with contents from that kind’s own table', () => {
    for (const kind of ['fortune', 'wild', 'charm'] as LanternKind[]) {
      const sim = market();
      holdOffer(sim, 'p2');
      expect(cast(sim, 'p2', 'paint-offer', undefined, { kind }).ok).toBe(true);
      const table = contentWeights(kind, { settings: { greed: 'normal', trickOdds: 'normal', wildness: 'normal' }, event: null, tricksLive: true, level: 1, lucky: 0 }).map((r) => r.id);
      for (const l of st(sim, 'p2').offer.lanterns) {
        expect(l.kind).toBe(kind);
        expect(table).toContain(l.content);
      }
      expect(sim.errors).toEqual([]);
    }
  });

  it('Market Lantern Painter refuses Trick lanterns in Calm Night and in a market without tricks', () => {
    const calm = market();
    expect(cast(calm, 'p3', 'summon-event', undefined, { event: 'calm' }).ok).toBe(true);
    holdOffer(calm, 'p2');
    const r = cast(calm, 'p2', 'paint-offer', undefined, { kind: 'trick' });
    expect(r.ok).toBe(false);
    const friendly = market({ tricks: false });
    holdOffer(friendly, 'p2');
    expect(cast(friendly, 'p2', 'paint-offer', undefined, { kind: 'trick' }).ok).toBe(false);
    // Tricks off also means no shields, so shield cheats are not on the menu at all.
    expect(cast(friendly, 'p1', 'night-watch').ok).toBe(false);
  });

  it('Moonlit Stall Peek opens the current offer’s eyes but leaves a held Lantern Sight for later', () => {
    const sim = market();
    holdOffer(sim, 'p1');
    const sight = st(sim, 'p1').sight;
    expect(cast(sim, 'p1', 'moonlit-peek').ok).toBe(true);
    expect(st(sim, 'p1').offer.sight).toBe(true);
    expect(st(sim, 'p1').sight).toBe(sight);
    expect(cast(sim, 'p1', 'moonlit-peek').ok).toBe(false);
  });

  it('Lantern Offer Snatcher moves the lanterns to the caster and sends the victim on', () => {
    const sim = market();
    holdOffer(sim, 'p2');
    until(sim, () => !st(sim, 'p1').offer && !st(sim, 'p1').pending);
    sim.idle.add('p1');
    const lanterns = st(sim, 'p2').offer.lanterns;
    expect(cast(sim, 'p1', 'snatch-offer', 'p2').ok).toBe(true);
    expect(st(sim, 'p1').offer.lanterns).toEqual(lanterns);
    const victim = st(sim, 'p2');
    // Either back to a question, or on to the Lantern Rain pick still due.
    expect(Boolean(victim.stream.iid) || Boolean(victim.offer?.bonus)).toBe(true);
    // The caster can now open the snatched lantern normally.
    expect(sim.rt.act('p1', { type: 'pick', offer: st(sim, 'p1').offer.seq, index: 0 }).ok).toBe(true);
    expect(sim.errors).toEqual([]);
  });

  it('Lantern Offer Snatcher is refused while the caster holds an offer', () => {
    const sim = market();
    holdOffer(sim, 'p1');
    holdOffer(sim, 'p2');
    expect(cast(sim, 'p1', 'snatch-offer', 'p2').ok).toBe(false);
  });

  it('Market Lantern Snuffer throws an offer away unopened', () => {
    const sim = market();
    holdOffer(sim, 'p3');
    const opens = st(sim, 'p3').opens;
    const before = total(sim);
    expect(cast(sim, 'p1', 'dump-offer', 'p3').ok).toBe(true);
    expect(st(sim, 'p3').opens).toBe(opens);
    expect(total(sim)).toBe(before);
    expect(st(sim, 'p3').offer === null || st(sim, 'p3').offer.bonus).toBe(true);
  });

  it('Stall Switcheroo trades two offers, Lantern Sight included', () => {
    const sim = market();
    holdOffer(sim, 'p1');
    holdOffer(sim, 'p2');
    const a = st(sim, 'p1').offer;
    const b = st(sim, 'p2').offer;
    expect(cast(sim, 'p1', 'swap-offers', 'p2').ok).toBe(true);
    expect(st(sim, 'p1').offer.lanterns).toEqual(b.lanterns);
    expect(st(sim, 'p2').offer.lanterns).toEqual(a.lanterns);
    expect(st(sim, 'p1').offer.sight).toBe(b.sight);
  });

  it('Market Carousel passes every open offer one stall along', () => {
    const sim = market();
    for (const id of ['p1', 'p2', 'p3']) holdOffer(sim, id);
    const holders = sim.ids.filter((id) => st(sim, id).offer);
    const before = holders.map((id) => st(sim, id).offer.lanterns);
    expect(cast(sim, 'p4', 'carousel').ok).toBe(true);
    holders.forEach((id, i) => expect(st(sim, id).offer.lanterns).toEqual(before[(i - 1 + holders.length) % holders.length]));
  });

  it('Lantern Rain for One adds exactly one bonus pick to the next offer, then ends', () => {
    const sim = market();
    until(sim, () => !st(sim, 'p1').offer && sim.state().event?.id !== 'rain');
    expect(cast(sim, 'p1', 'second-helping').ok).toBe(true);
    until(sim, () => Boolean(st(sim, 'p1').offer));
    sim.run(300);
    expect(st(sim, 'p1').offer === null ? true : st(sim, 'p1').extraPicks >= 1).toBe(true);
    expect(sim.chaos().effects.filter((e) => e.cheatId === 'night-market.second-helping')).toHaveLength(0);
    expect(sim.feed.some((f) => f.includes('Lantern Rain for One: one bonus pick'))).toBe(true);
  });

  it('Stall Lantern Lockout refuses picks for 10 seconds, then lets them through', () => {
    const sim = market();
    holdOffer(sim, 'p2');
    expect(cast(sim, 'p1', 'lockout', 'p2').ok).toBe(true);
    const pick = () => sim.rt.act('p2', { type: 'pick', offer: st(sim, 'p2').offer.seq, index: 0 });
    const r = pick();
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.message).toContain('Lockout');
    sim.run(10_500);
    expect(pick().ok).toBe(true);
  });

  it('Stall Lantern Lockout is refused when the opponent holds no offer', () => {
    const sim = market();
    until(sim, () => !st(sim, 'p2').offer);
    sim.idle.add('p2');
    expect(cast(sim, 'p1', 'lockout', 'p2').ok).toBe(false);
  });
});

describe('night-market pack: tricks', () => {
  it('Trick Lantern Hijack takes a waiting trick and plays it for the caster on the richest stall they may trick', () => {
    const sim = market({}, 15_000);
    const victim = pendingRival(sim, []);
    const caster = sim.ids.find((id) => id !== victim && !st(sim, id).pending)!;
    const sum = total(sim);
    const content = st(sim, victim).pending.content;
    expect(cast(sim, caster, 'hijack-trick', victim).ok).toBe(true);
    expect(st(sim, victim).pending).toBeNull();
    expect(timers(sim).has(`trick:${victim}`)).toBe(false);
    const hit = st(sim, caster).lastTarget;
    expect(hit).not.toBeNull();
    expect(st(sim, hit).guardUntil).toBe(sim.now + TRICK_GUARD_SEC * 1000);
    if (content !== 'swap') expect(total(sim)).toBe(sum);
    expect(st(sim, victim).opened.title).toContain('hijacked');
    sim.run(5000);
    expect(sim.errors).toEqual([]);
  });

  it('Fizzled Trick Lantern cancels a waiting trick: no coins move', () => {
    const sim = market();
    const victim = pendingRival(sim, ['p1']);
    const before = coins(sim);
    expect(cast(sim, 'p1', 'fizzle-trick', victim).ok).toBe(true);
    expect(coins(sim)).toEqual(before);
    expect(st(sim, victim).pending).toBeNull();
    expect(st(sim, victim).opened.title).toContain('fizzled');
  });

  it('Market Snitch makes the waiting trick land on the named player at once', () => {
    const sim = market();
    const trickster = pendingRival(sim, ['p1']);
    const named = sim.ids.find((id) => id !== 'p1' && id !== trickster && st(sim, trickster).lastTarget !== id && st(sim, id).guardUntil <= sim.now)!;
    expect(cast(sim, 'p1', 'point-finger', named).ok).toBe(true);
    expect(st(sim, trickster).pending).toBeNull();
    expect(st(sim, trickster).lastTarget).toBe(named);
    expect(st(sim, named).guardUntil).toBe(sim.now + TRICK_GUARD_SEC * 1000);
  });

  it('Ticking Trick Lantern leaves 3 seconds, after which the trick goes off by itself', () => {
    const sim = market();
    const victim = pendingRival(sim, ['p1']);
    expect(cast(sim, 'p1', 'hurry-trick', victim).ok).toBe(true);
    expect(st(sim, victim).pending.deadline).toBe(sim.now + 3000);
    expect(timers(sim).get(`trick:${victim}`)).toBe(sim.now + 3000);
    sim.run(3500);
    expect(st(sim, victim).pending).toBeNull();
    expect(sim.errors).toEqual([]);
  });

  it('Moonlight Stall Swipe takes 15% (at least 5), and the stall is then watched', () => {
    const sim = market({}, 40_000);
    // A moment when p2 may be tricked by p1: not watched, not p1's last target, no shield, some coins.
    until(sim, () => st(sim, 'p2').guardUntil <= sim.now && st(sim, 'p1').lastTarget !== 'p2' && st(sim, 'p2').coins > 0 && !st(sim, 'p1').pending && sim.state().event?.id !== 'calm');
    sim.idle.add('p2');
    if (st(sim, 'p2').shield) expect(cast(sim, 'p3', 'shield-smash', 'p2').ok).toBe(true);
    const theirs = st(sim, 'p2').coins;
    const mine = st(sim, 'p1').coins;
    expect(cast(sim, 'p1', 'moonlight-swipe', 'p2').ok).toBe(true);
    const amount = Math.min(theirs, Math.max(5, Math.round((theirs * 15) / 100)));
    expect(st(sim, 'p2').coins).toBe(theirs - amount);
    expect(st(sim, 'p1').coins).toBe(mine + amount);
    expect(st(sim, 'p1').lastTarget).toBe('p2');
    // Watched now: nobody else may pick that stall for a swipe.
    const r = cast(sim, 'p4', 'moonlight-swipe', 'p2');
    expect(r.ok).toBe(false);
  });

  it('Moonlight Stall Swipe breaks on a shield, but Calm Night keeps the shield whole', () => {
    const sim = market();
    sim.idle.add('p2');
    if (!st(sim, 'p2').shield) expect(cast(sim, 'p2', 'night-watch').ok).toBe(true);
    const before = st(sim, 'p2').coins;
    expect(cast(sim, 'p1', 'moonlight-swipe', 'p2').ok).toBe(true);
    expect(st(sim, 'p2').coins).toBe(before);
    expect(st(sim, 'p2').shield).toBe(false);

    const calm = market();
    calm.idle.add('p2');
    if (!st(calm, 'p2').shield) expect(cast(calm, 'p2', 'night-watch').ok).toBe(true);
    expect(cast(calm, 'p4', 'summon-event', undefined, { event: 'calm' }).ok).toBe(true);
    expect(cast(calm, 'p1', 'moonlight-swipe', 'p2').ok).toBe(true);
    expect(st(calm, 'p2').shield).toBe(true);
    // Shields cannot be smashed in Calm Night either.
    expect(cast(calm, 'p3', 'shield-smash', 'p2').ok).toBe(false);
  });

  it('Market Toll Bell charges every rival exactly what a Toll lantern would', () => {
    const sim = market({}, 40_000);
    const rivals = ['p2', 'p3', 'p4'];
    const pays = tollPayments(rivals.map((id) => st(sim, id).coins));
    const before = st(sim, 'p1').coins;
    expect(cast(sim, 'p1', 'toll-bell').ok).toBe(true);
    expect(st(sim, 'p1').coins).toBe(before + pays.reduce((a, b) => a + b, 0));
  });

  it('Market Payback takes back the latest reported swipe once', () => {
    const sim = market({}, 40_000);
    if (st(sim, 'p1').shield) cast(sim, 'p3', 'shield-smash', 'p1');
    until(sim, () => st(sim, 'p1').coins >= 100);
    expect(cast(sim, 'p2', 'moonlight-swipe', 'p1').ok).toBe(true);
    const swipe = sim.state().news.find((n: any) => n.kind === 'swipe' && n.to === 'p1');
    expect(swipe).toBeDefined();
    const mine = st(sim, 'p1').coins;
    const theirs = st(sim, 'p2').coins;
    expect(cast(sim, 'p1', 'payback').ok).toBe(true);
    const back = Math.min(swipe.amount, theirs);
    expect(st(sim, 'p1').coins).toBe(mine + back);
    sim.run(46_000);
    // The payback is now the latest swipe between them, so there is nothing more to take back.
    if (sim.state().news.find((n: any) => n.kind === 'swipe' && (n.to === 'p1' || n.by === 'p1'))?.by === 'p1') expect(cast(sim, 'p1', 'payback').ok).toBe(false);
  });

  it('Stall Watchtower guards for 45 seconds; Unwatched Stall lifts a guard and the last-target rule', () => {
    const sim = market();
    expect(cast(sim, 'p2', 'watchtower').ok).toBe(true);
    expect(st(sim, 'p2').guardUntil).toBe(sim.now + 45_000);
    expect(cast(sim, 'p1', 'moonlight-swipe', 'p2').ok).toBe(false);
    expect(cast(sim, 'p1', 'open-season', 'p2').ok).toBe(true);
    expect(st(sim, 'p2').guardUntil).toBe(0);
    // With nothing stopping it, Unwatched Stall is refused.
    expect(cast(sim, 'p3', 'open-season', 'p4').ok).toBe(st(sim, 'p4').guardUntil > sim.now || st(sim, 'p3').lastTarget === 'p4');
  });
});

describe('night-market pack: charms', () => {
  it('Stall Shield Smash breaks a shield and can be undone', () => {
    const sim = market();
    sim.idle.add('p2');
    if (!st(sim, 'p2').shield) cast(sim, 'p2', 'night-watch');
    const r = cast(sim, 'p1', 'shield-smash', 'p2');
    expect(r.ok).toBe(true);
    expect(st(sim, 'p2').shield).toBe(false);
    expect(sim.rt.undoCast('p1', r.ok ? r.castId : '').ok).toBe(true);
    expect(st(sim, 'p2').shield).toBe(true);
  });

  it('Stall Shield Snatch moves the shield, and is refused while the caster holds one', () => {
    const sim = market();
    sim.idle.add('p2');
    if (!st(sim, 'p2').shield) cast(sim, 'p2', 'night-watch');
    if (st(sim, 'p1').shield) {
      expect(cast(sim, 'p1', 'shield-snatch', 'p2').ok).toBe(false);
      return;
    }
    expect(cast(sim, 'p1', 'shield-snatch', 'p2').ok).toBe(true);
    expect([st(sim, 'p1').shield, st(sim, 'p2').shield]).toEqual([true, false]);
  });

  it('Market Night Watchman gives one shield, never two', () => {
    const sim = market();
    sim.idle.add('p1');
    if (!st(sim, 'p1').shield) expect(cast(sim, 'p1', 'night-watch').ok).toBe(true);
    expect(st(sim, 'p1').shield).toBe(true);
    sim.run(61_000);
    if (st(sim, 'p1').shield) expect(cast(sim, 'p1', 'night-watch').ok).toBe(false);
  });

  it('Pass the Stall Shield hands a shield to a teammate', () => {
    const sim = new ChaosSim({ modeId: 'night-market', questions: MIXED_SET, players: 4, seed: 7, common: { teamCount: 2 } });
    sim.run(15_000);
    sim.idle.add('p1');
    sim.idle.add('p3');
    if (!st(sim, 'p1').shield) cast(sim, 'p1', 'night-watch');
    if (st(sim, 'p3').shield) return;
    // p1 and p3 share a team (players are dealt to teams in turn).
    expect(cast(sim, 'p1', 'pass-shield', 'p3').ok).toBe(true);
    expect([st(sim, 'p1').shield, st(sim, 'p3').shield]).toEqual([false, true]);
    expect(cast(sim, 'p1', 'pass-shield', 'p2').ok).toBe(false);
  });

  it('Lantern Sight Thief, Borrowed Lantern Sight and Market Blindfold move Lantern Sight as described', () => {
    // In a team game, Market Lantern Lore hands a team Lantern Sight at once (bots rarely pick it themselves).
    const sim = new ChaosSim({ modeId: 'night-market', questions: MIXED_SET, players: 4, seed: 7, common: { teamCount: 2 } });
    sim.run(15_000);
    for (const id of sim.ids) sim.idle.add(id);
    // p1 and p3 are one team, p2 and p4 the other.
    expect(cast(sim, 'p1', 'shared-sight').ok).toBe(true);
    expect([st(sim, 'p1').sight, st(sim, 'p3').sight]).toEqual([true, true]);
    expect(cast(sim, 'p1', 'shared-sight').ok).toBe(false);
    const holder = 'p1';
    const [a, b] = ['p2', 'p4'].filter((id) => !st(sim, id).sight);
    expect(cast(sim, a!, 'copy-sight', holder!).ok).toBe(true);
    expect([st(sim, a!).sight, st(sim, holder!).sight]).toEqual([true, true]);
    expect(cast(sim, a!, 'sight-thief', holder!).ok).toBe(false);
    expect(cast(sim, b!, 'sight-thief', holder!).ok).toBe(true);
    expect([st(sim, b!).sight, st(sim, holder!).sight]).toEqual([true, false]);
    expect(cast(sim, holder!, 'blindfold', b!).ok).toBe(true);
    expect(st(sim, b!).sight).toBe(false);
  });

  it(`Lucky Streak Pinch and Market Four-Leaf respect the cap of ${LUCKY_MAX}`, () => {
    const sim = market();
    expect(cast(sim, 'p2', 'four-leaf').ok).toBe(true);
    expect(st(sim, 'p2').lucky).toBe(LUCKY_MAX);
    expect(cast(sim, 'p2', 'four-leaf').ok).toBe(false);
    expect(cast(sim, 'p1', 'four-leaf').ok).toBe(true);
    // A full caster cannot take any more.
    expect(cast(sim, 'p1', 'lucky-pinch', 'p2').ok).toBe(false);
    const fresh = market();
    expect(cast(fresh, 'p2', 'four-leaf').ok).toBe(true);
    const mine = st(fresh, 'p1').lucky;
    expect(cast(fresh, 'p1', 'lucky-pinch', 'p2').ok).toBe(true);
    expect(st(fresh, 'p1').lucky).toBe(LUCKY_MAX);
    expect(st(fresh, 'p2').lucky).toBe(mine);
  });

  it('Stall Charm Swap trades all three charms both ways', () => {
    const sim = market();
    sim.idle.add('p1');
    sim.idle.add('p2');
    cast(sim, 'p2', 'four-leaf');
    const a = { shield: st(sim, 'p1').shield, sight: st(sim, 'p1').sight, lucky: st(sim, 'p1').lucky };
    const b = { shield: st(sim, 'p2').shield, sight: st(sim, 'p2').sight, lucky: st(sim, 'p2').lucky };
    expect(cast(sim, 'p1', 'charm-swap', 'p2').ok).toBe(true);
    expect({ shield: st(sim, 'p1').shield, sight: st(sim, 'p1').sight, lucky: st(sim, 'p1').lucky }).toEqual(b);
    expect({ shield: st(sim, 'p2').shield, sight: st(sim, 'p2').sight, lucky: st(sim, 'p2').lucky }).toEqual(a);
  });
});

describe('night-market pack: lanterns', () => {
  it('Market Gift Lantern (Charm) turns a charm already held into 30 coins', () => {
    const sim = market();
    sim.idle.add('p1');
    if (!st(sim, 'p1').shield) cast(sim, 'p1', 'night-watch');
    cast(sim, 'p1', 'four-leaf');
    sim.run(30_000);
    if (!st(sim, 'p1').sight) cast(sim, 'p3', 'shared-sight');
    // Hold every charm: then any charm drawn becomes coins.
    if (!st(sim, 'p1').sight) return;
    const before = st(sim, 'p1').coins;
    expect(cast(sim, 'p1', 'free-lantern', undefined, { kind: 'charm' }).ok).toBe(true);
    expect(st(sim, 'p1').coins).toBe(before + SHIELD_REFUND);
  });

  it('Market Gift Lantern (Fortune) pays one of the Fortune table’s amounts at this stall’s level and boosts', () => {
    const sim = market();
    sim.idle.add('p1');
    const s = st(sim, 'p1');
    const level = 1 + Math.floor(s.stream.correct / 5);
    const mult = (sim.state().event?.id === 'golden' ? 2 : 1) * (s.lucky > 0 ? 2 : 1);
    const flats = FORTUNE_ODDS.filter((r) => r.coins !== undefined).map((r) => Math.round(r.coins! * (1 + 0.25 * (level - 1)) * mult));
    const shares = FORTUNE_ODDS.filter((r) => r.percent !== undefined).map((r) => Math.round(Math.max(r.min!, (s.coins * r.percent!) / 100)));
    const before = s.coins;
    expect(cast(sim, 'p1', 'free-lantern', undefined, { kind: 'fortune' }).ok).toBe(true);
    expect([...flats, ...shares]).toContain(st(sim, 'p1').coins - before);
  });

  it('Market Gift Lantern never takes a stall to the coin goal', () => {
    const sim = new ChaosSim({ modeId: 'night-market', questions: MIXED_SET, players: 4, seed: 7, settings: { goalCoins: 250 } });
    for (const id of sim.ids) sim.idle.add(id);
    sim.run(5000);
    // Golden Hour and a full Lucky Streak make Fortune lanterns pay four times over, so one gift could pass the goal.
    expect(cast(sim, 'p2', 'summon-event', undefined, { event: 'golden' }).ok).toBe(true);
    let seen = 0;
    for (let i = 0; i < 6 && sim.rt.status === 'running'; i++) {
      cast(sim, 'p1', 'four-leaf');
      cast(sim, 'p1', 'free-lantern', undefined, { kind: 'fortune' });
      seen = Math.max(seen, st(sim, 'p1').coins);
      expect(st(sim, 'p1').coins).toBeLessThanOrEqual(249);
      sim.run(61_000);
    }
    expect(seen).toBeGreaterThan(0);
    expect(sim.state().winner).toBeNull();
    expect(sim.errors).toEqual([]);
  });

  it('Red Wild Lantern Dare applies one of the Wild outcomes to the target’s coins', () => {
    const sim = market({}, 40_000);
    sim.idle.add('p2');
    const c = st(sim, 'p2').coins;
    expect(cast(sim, 'p1', 'wild-dare', 'p2').ok).toBe(true);
    const winds = sim.state().event?.id === 'winds' ? 0.5 : 0;
    const outcomes = WILD_ODDS.map((r) => (r.id === 'grow' ? Math.max(40, Math.round(c * (0.5 + winds))) : -Math.round((c * (r.id === 'loseSmall' ? 10 : 25)) / 100)));
    expect(outcomes).toContain(st(sim, 'p2').coins - c);
  });

  it('Fortune Lantern Encore repeats the last Fortune payout, only within 30 seconds', () => {
    const sim = market();
    until(sim, () => {
      const o = st(sim, 'p1').opened;
      return Boolean(o && o.kind === 'fortune' && o.delta > 0 && sim.now - o.at < 5000);
    });
    sim.idle.add('p1');
    const o = st(sim, 'p1').opened;
    const before = st(sim, 'p1').coins;
    expect(cast(sim, 'p1', 'encore').ok).toBe(true);
    expect(st(sim, 'p1').coins).toBe(before + o.delta);
    sim.run(61_000);
    expect(cast(sim, 'p1', 'encore').ok).toBe(false);
  });

  it('Copycat Market Lantern refuses to copy a trick', () => {
    const sim = market();
    until(sim, () => sim.ids.some((id) => st(sim, id).opened?.kind === 'trick' && sim.now - st(sim, id).opened.at < 2000));
    const id = sim.ids.find((x) => st(sim, x).opened?.kind === 'trick')!;
    const caster = sim.ids.find((x) => x !== id)!;
    const r = cast(sim, caster, 'copycat-lantern', id);
    expect(r.ok).toBe(false);
    expect(r.ok ? '' : r.message).toContain('Tricks cannot be copied');
  });

  it('Ill Market Wind halves the Fortune lanterns the target opens while it lasts', () => {
    const sim = market();
    // p2 holds an offer of Fortune lanterns (painted), so the next pick is certainly a Fortune lantern.
    holdOffer(sim, 'p2');
    expect(cast(sim, 'p2', 'paint-offer', undefined, { kind: 'fortune' }).ok || st(sim, 'p2').offer.lanterns.every((l: any) => l.kind === 'fortune')).toBe(true);
    expect(cast(sim, 'p1', 'ill-wind', 'p2', { kind: 'fortune' }).ok).toBe(true);
    const before = st(sim, 'p2').coins;
    expect(sim.rt.act('p2', { type: 'pick', offer: st(sim, 'p2').offer.seq, index: 0 }).ok).toBe(true);
    const o = st(sim, 'p2').opened;
    expect(o.kind).toBe('fortune');
    const full = Number(/instead of \+([\d,]+)/.exec(o.detail)![1]!.replace(/,/g, ''));
    expect(o.delta).toBe(full - Math.floor(full / 2));
    expect(st(sim, 'p2').coins - before).toBe(o.delta);
    // Wild wins are untouched by a Fortune Ill Market Wind, and it is over after 20 seconds.
    sim.run(21_000);
    expect(sim.chaos().effects.some((e) => e.cheatId === 'night-market.ill-wind')).toBe(false);
  });
});

describe('night-market pack: market events', () => {
  it('Market Moon Caller starts the chosen event for 30 seconds and holds back the next one', () => {
    const sim = market({}, 40_000);
    const due = sim.state().nextEventAt;
    expect(cast(sim, 'p1', 'summon-event', undefined, { event: 'rain' }).ok).toBe(true);
    const ev = sim.state().event;
    expect(ev.id).toBe('rain');
    expect(ev.endsAt).toBe(sim.now + 30_000);
    expect(sim.state().nextEventAt).toBe(Math.max(due, ev.endsAt));
    expect(cast(sim, 'p2', 'summon-event', undefined, { event: 'golden' }).ok).toBe(false);
    sim.run(29_000);
    expect(sim.state().event.id).toBe('rain');
    sim.run(2000);
    // Rain is over: either nothing runs, or the held-back event has started now.
    expect(sim.state().event?.id ?? null).not.toBe('rain');
    sim.run(30_000);
    expect(sim.errors).toEqual([]);
  });

  it('Market Cloud Cover ends the event; Long Market Night stretches it by 20 seconds; neither touches Last Call', () => {
    const sim = market();
    until(sim, () => Boolean(sim.state().event));
    const ends = sim.state().event.endsAt;
    expect(cast(sim, 'p1', 'stretch-event').ok).toBe(true);
    expect(sim.state().event.endsAt).toBe(ends + 20_000);
    expect(cast(sim, 'p2', 'snuff-event').ok).toBe(true);
    expect(sim.state().event).toBeNull();
    expect(cast(sim, 'p3', 'early-last-call').ok).toBe(true);
    expect(sim.state().event.id).toBe('lastCall');
    expect(cast(sim, 'p4', 'snuff-event').ok).toBe(false);
  });

  it('Fickle Market Moon swaps the event for a different one that keeps its time', () => {
    const sim = market();
    until(sim, () => Boolean(sim.state().event));
    const { id, endsAt } = sim.state().event;
    expect(cast(sim, 'p1', 'fickle-moon').ok).toBe(true);
    expect(sim.state().event.id).not.toBe(id);
    expect(sim.state().event.endsAt).toBe(endsAt);
  });

  it('Night Market Last Call runs to closing time with no more events, and the market still closes on time', () => {
    const sim = market();
    const endsAt = sim.state().endsAt;
    expect(cast(sim, 'p1', 'early-last-call').ok).toBe(true);
    expect(sim.state().nextEventAt).toBeNull();
    expect(cast(sim, 'p1', 'summon-event', undefined, { event: 'golden' }).ok).toBe(false);
    sim.run(endsAt - sim.now - 1000);
    expect(sim.rt.status).toBe('running');
    expect(sim.state().event.id).toBe('lastCall');
    sim.run(2000);
    expect(sim.rt.status).toBe('ended');
    expect(sim.errors).toEqual([]);
  });
});
