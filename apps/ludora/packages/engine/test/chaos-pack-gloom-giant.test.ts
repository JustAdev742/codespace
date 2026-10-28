import { describe, expect, it } from 'vitest';
import { createRng } from '@ludora/shared';
import { ChaosSim } from '../src/testing/chaos.ts';
import { MIXED_SET } from '../src/testing/fixtures.ts';

/*
 * Exact behaviour of the gloom-giant cheats. Every bot is idle, so the giant
 * and the shield only change when a test makes someone answer. Swift Strikes
 * is on, so an answer given straight away is always a critical hit: a plain
 * correct answer deals 2, and 3 on a streak of three or more.
 * Four players: the giant has 48 health and the shield starts at 17.
 */

const rng = createRng(5);

function game(settings: Record<string, unknown> = {}) {
  const sim = new ChaosSim({ modeId: 'gloom-giant', questions: MIXED_SET, players: 4, seed: 21, settings: { swift: true, ...settings } });
  for (const id of sim.ids) sim.idle.add(id);
  sim.run(1000);
  return sim;
}

const st = (sim: ChaosSim) => sim.state();
const dmg = (sim: ChaosSim, id: string) => st(sim).fighters[id].damage as number;

function right(sim: ChaosSim, id: string) {
  expect(sim.rt.act(id, sim.rt.botAction(id, 1, rng)).ok).toBe(true);
}

function wrong(sim: ChaosSim, id: string) {
  const iid = st(sim).fighters[id].stream.iid;
  expect(sim.rt.act(id, { type: 'answer', iid, answer: { type: 'flashcard', knew: false } }).ok).toBe(true);
}

function cast(sim: ChaosSim, caster: string, cheatId: string, target?: string) {
  return sim.cast(caster, { cheatId: `gloom-giant.${cheatId}`, target: target ?? null });
}

describe('gloom-giant pack: the giant and the shield', () => {
  it('starts from the numbers these tests assume', () => {
    const sim = game();
    expect(st(sim)).toMatchObject({ hp: 48, maxHp: 48, shield: 17, shieldMax: 17, enraged: false });
    right(sim, 'p1');
    expect(st(sim).hp).toBe(46);
  });

  it('Giant Sunbeam Burst deals 6% of full health, credited to the caster, and never lands the final blow', () => {
    const sim = game({ hpPerPlayer: 4 });
    expect(cast(sim, 'p1', 'ballista').ok).toBe(true);
    expect(st(sim).hp).toBe(15);
    expect(dmg(sim, 'p1')).toBe(1);
    // Hits of 2, with a miss after every second one so there is no streak bonus: 15 → 1.
    for (let i = 0; i < 3; i++) {
      right(sim, 'p2');
      right(sim, 'p2');
      wrong(sim, 'p2');
    }
    right(sim, 'p2');
    expect(st(sim).hp).toBe(1);
    expect(cast(sim, 'p3', 'ballista')).toMatchObject({ ok: false });
    expect(cast(sim, 'p3', 'reckless-charge')).toMatchObject({ ok: false });
    expect(sim.rt.status).toBe('running');
  });

  it('wounding the giant below half health enrages it, as a hit would', () => {
    const sim = game({ hpPerPlayer: 4 });
    right(sim, 'p2');
    right(sim, 'p2');
    wrong(sim, 'p2');
    right(sim, 'p2');
    right(sim, 'p2');
    expect(st(sim)).toMatchObject({ hp: 8, enraged: false });
    cast(sim, 'p1', 'ballista');
    expect(st(sim)).toMatchObject({ hp: 7, enraged: true });
  });

  it('Gloom Shield Crack and Glim Shield Patch move the shield by 2 within its limits', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'shield-patch')).toMatchObject({ ok: false });
    expect(cast(sim, 'p1', 'shield-crack').ok).toBe(true);
    expect(st(sim).shield).toBe(15);
    expect(cast(sim, 'p2', 'shield-patch').ok).toBe(true);
    expect(st(sim).shield).toBe(17);
  });

  it('the shield never breaks to a cheat', () => {
    const sim = game({ shieldBase: 1, shieldPerPlayer: 'half' });
    expect(st(sim).shield).toBe(3);
    cast(sim, 'p1', 'shield-crack');
    expect(st(sim).shield).toBe(1);
    expect(cast(sim, 'p2', 'shield-crack')).toMatchObject({ ok: false });
    expect(sim.rt.status).toBe('running');
  });

  it('Giant\'s Feast heals 8% of full health and refuses at full health', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'feast')).toMatchObject({ ok: false });
    // 2 + 2 + 3 + 3: the third hit in a row gets the streak bonus.
    for (let i = 0; i < 4; i++) right(sim, 'p2');
    expect(st(sim).hp).toBe(38);
    expect(cast(sim, 'p1', 'feast').ok).toBe(true);
    expect(st(sim).hp).toBe(42);
  });

  it('Poke the Giant enrages it, so wrong answers cost 2, and refuses once it is enraged', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'poke').ok).toBe(true);
    expect(st(sim).enraged).toBe(true);
    wrong(sim, 'p2');
    expect(st(sim).shield).toBe(15);
    expect(cast(sim, 'p3', 'poke')).toMatchObject({ ok: false });
  });

  it('Glim Sacrifice trades 15% of the caster\'s damage for 2 shield', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'sacrifice')).toMatchObject({ ok: false });
    wrong(sim, 'p2');
    wrong(sim, 'p2');
    expect(cast(sim, 'p1', 'sacrifice')).toMatchObject({ ok: false });
    for (let i = 0; i < 4; i++) right(sim, 'p1');
    expect(dmg(sim, 'p1')).toBe(10);
    expect(cast(sim, 'p1', 'sacrifice').ok).toBe(true);
    expect(dmg(sim, 'p1')).toBe(8);
    expect(st(sim).shield).toBe(17);
  });

  it('Reckless Giant Charge costs 2 shield and deals 10% of full health', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'reckless-charge').ok).toBe(true);
    expect(st(sim)).toMatchObject({ shield: 15, hp: 43 });
    expect(dmg(sim, 'p1')).toBe(5);
  });

  it('Giant\'s Hourglass adds 20 seconds', () => {
    const sim = game();
    const end = st(sim).endsAt;
    expect(cast(sim, 'p1', 'hourglass').ok).toBe(true);
    expect(st(sim).endsAt).toBe(end + 20_000);
  });

  it('Gloom Roulette and Giant Wild Swing only ever land one of their stated outcomes', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const sim = new ChaosSim({ modeId: 'gloom-giant', questions: MIXED_SET, players: 4, seed, settings: { swift: true } });
      for (const id of sim.ids) sim.idle.add(id);
      sim.run(1000);
      right(sim, 'p2');
      right(sim, 'p2');
      const before = { hp: st(sim).hp, shield: st(sim).shield };
      expect(cast(sim, 'p1', 'roulette').ok).toBe(true);
      const moved = { hp: st(sim).hp - before.hp, shield: st(sim).shield - before.shield };
      expect([{ hp: -3, shield: 0 }, { hp: 3, shield: 0 }, { hp: 0, shield: 0 }, { hp: 0, shield: -1 }]).toContainEqual(moved);
      const hp = st(sim).hp;
      expect(cast(sim, 'p3', 'wild-swing').ok).toBe(true);
      const swing = st(sim).hp - hp;
      // A heal of 2 can be cut short by full health.
      expect([-5, -2].includes(swing) || (swing > 0 && swing <= 2)).toBe(true);
    }
  });
});

describe('gloom-giant pack: streaks', () => {
  it('Giant Rally Drums raises streaks to 2, never past a player\'s correct answers', () => {
    const sim = game();
    right(sim, 'p1');
    right(sim, 'p1');
    wrong(sim, 'p1');
    expect(cast(sim, 'p2', 'war-drums').ok).toBe(true);
    expect(st(sim).fighters.p1.stream.streak).toBe(2);
    expect(st(sim).fighters.p3.stream.streak).toBe(0);
    const before = dmg(sim, 'p1');
    right(sim, 'p1');
    expect(dmg(sim, 'p1') - before).toBe(3);
    expect(cast(sim, 'p3', 'war-drums')).toMatchObject({ ok: false });
  });

  it('Giant\'s Stagger resets a streak and refuses an empty one', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'stagger', 'p2')).toMatchObject({ ok: false });
    right(sim, 'p2');
    expect(cast(sim, 'p1', 'stagger', 'p2').ok).toBe(true);
    expect(st(sim).fighters.p2.stream.streak).toBe(0);
  });
});

describe('gloom-giant pack: lasting effects on hits', () => {
  it('Giant Mega Bonk triples the next hit only', () => {
    const sim = game();
    cast(sim, 'p1', 'haymaker');
    right(sim, 'p1');
    expect(dmg(sim, 'p1')).toBe(6);
    expect(st(sim).hp).toBe(42);
    right(sim, 'p1');
    expect(dmg(sim, 'p1')).toBe(8);
  });

  it('Giant Sparkle Charm turns every ordinary hit into a critical hit', () => {
    const sim = game({ swift: false });
    cast(sim, 'p1', 'giantsbane-edge');
    for (let i = 0; i < 2; i++) right(sim, 'p1');
    expect(dmg(sim, 'p1')).toBe(4);
    expect(st(sim).fighters.p1.crits).toBe(2);
    expect(st(sim).log.every((b: { kind: string }) => b.kind === 'crit')).toBe(true);
  });

  it('Gloom Soft Swing caps the target\'s hits at 1 and gives the rest back to the giant', () => {
    const sim = game();
    cast(sim, 'p1', 'blunted-blade', 'p2');
    right(sim, 'p2');
    expect(dmg(sim, 'p2')).toBe(1);
    expect(st(sim).hp).toBe(47);
    expect(st(sim).fighters.p2.crits).toBe(0);
    right(sim, 'p3');
    expect(st(sim).hp).toBe(45);
  });

  it('Thick Gloom Hide takes 1 off every hit', () => {
    const sim = game();
    cast(sim, 'p1', 'thick-hide');
    right(sim, 'p2');
    right(sim, 'p3');
    expect(st(sim).hp).toBe(46);
    expect(dmg(sim, 'p2') + dmg(sim, 'p3')).toBe(2);
  });

  it('Glim Mender mends the shield on each of the caster\'s hits and refuses a full shield', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'mender')).toMatchObject({ ok: false });
    wrong(sim, 'p2');
    wrong(sim, 'p2');
    expect(cast(sim, 'p1', 'mender').ok).toBe(true);
    right(sim, 'p1');
    expect(st(sim).shield).toBe(16);
    right(sim, 'p3');
    expect(st(sim).shield).toBe(16);
  });

  it('Giant\'s Grudge takes 1 damage from the target and heals the giant 1 every 4 seconds', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'grudge', 'p2')).toMatchObject({ ok: false });
    right(sim, 'p2');
    right(sim, 'p2');
    cast(sim, 'p1', 'grudge', 'p2');
    sim.run(8_500);
    expect(dmg(sim, 'p2')).toBe(2);
    expect(st(sim).hp).toBe(46);
  });

  it('Giant Stomp refuses the target\'s answers for 6 seconds', () => {
    const sim = game();
    cast(sim, 'p1', 'stomp', 'p2');
    expect(sim.rt.act('p2', sim.rt.botAction('p2', 1, rng))).toMatchObject({ ok: false });
    sim.run(6_500);
    expect(sim.rt.act('p2', sim.rt.botAction('p2', 1, rng)).ok).toBe(true);
  });
});

describe('gloom-giant pack: lasting effects on strikes', () => {
  it('Glim Ward turns the caster\'s strikes aside, not other players\'', () => {
    const sim = game();
    cast(sim, 'p1', 'ward');
    wrong(sim, 'p1');
    expect(st(sim).shield).toBe(17);
    expect(st(sim).fighters.p1.misses).toBe(1);
    wrong(sim, 'p2');
    expect(st(sim).shield).toBe(16);
  });

  it('Giant Lullaby needs an enraged giant and makes its strikes cost 1', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'lullaby')).toMatchObject({ ok: false });
    cast(sim, 'p2', 'poke');
    expect(cast(sim, 'p1', 'lullaby').ok).toBe(true);
    wrong(sim, 'p3');
    expect(st(sim).shield).toBe(16);
  });

  it('Gloom Jinx doubles the target\'s strikes', () => {
    const sim = game();
    cast(sim, 'p1', 'jinx', 'p2');
    wrong(sim, 'p2');
    expect(st(sim).shield).toBe(15);
    wrong(sim, 'p3');
    expect(st(sim).shield).toBe(14);
  });

  it('Thorned Glim Shield hits the giant back for each strike, credited to whoever missed', () => {
    const sim = game();
    cast(sim, 'p1', 'thorns');
    wrong(sim, 'p2');
    expect(st(sim)).toMatchObject({ shield: 16, hp: 47 });
    expect(dmg(sim, 'p2')).toBe(1);
  });

  it('Vampire Giant heals 1 for every point of shield its strikes break', () => {
    const sim = game();
    right(sim, 'p2');
    cast(sim, 'p1', 'vampire');
    wrong(sim, 'p3');
    expect(st(sim)).toMatchObject({ shield: 16, hp: 47 });
  });

  it('Glim Decoy pays 2 of the caster\'s damage per shield point instead of the shield', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'decoy')).toMatchObject({ ok: false });
    right(sim, 'p1');
    right(sim, 'p1');
    expect(cast(sim, 'p1', 'decoy').ok).toBe(true);
    wrong(sim, 'p2');
    expect(st(sim).shield).toBe(17);
    expect(dmg(sim, 'p1')).toBe(2);
    wrong(sim, 'p2');
    wrong(sim, 'p2');
    // With 0 damage left the decoy cannot pay, so the shield takes the strike.
    expect(st(sim).shield).toBe(16);
  });

  it('Giant Healing Freeze stops the healing giant from healing', () => {
    const sim = game({ regen: true });
    expect(cast(sim, 'p1', 'poisoned-wounds')).toMatchObject({ ok: false });
    for (let i = 0; i < 3; i++) right(sim, 'p2');
    const hp = st(sim).hp;
    expect(cast(sim, 'p1', 'poisoned-wounds').ok).toBe(true);
    sim.run(14_500);
    expect(st(sim).hp).toBe(hp);
    const clean = game({ regen: true });
    for (let i = 0; i < 3; i++) right(clean, 'p2');
    clean.run(14_500);
    expect(st(clean).hp).toBe(hp + 4);
  });
});

describe('gloom-giant pack: streaks, echoes and itches', () => {
  it('Gloom Streak Cash-In deals damage equal to the streak and resets it', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'streak-cash-in')).toMatchObject({ ok: false });
    // 2 + 2 + 3: the third hit in a row gets the streak bonus.
    for (let i = 0; i < 3; i++) right(sim, 'p1');
    expect(st(sim).hp).toBe(41);
    expect(cast(sim, 'p1', 'streak-cash-in').ok).toBe(true);
    expect(st(sim).hp).toBe(38);
    expect(dmg(sim, 'p1')).toBe(10);
    expect(st(sim).fighters.p1.stream.streak).toBe(0);
    // The streak bonus is gone until it is built again.
    right(sim, 'p1');
    expect(dmg(sim, 'p1')).toBe(12);
  });

  it('Gloom Streak Cash-In leaves the giant on 1 health rather than landing the final blow', () => {
    const sim = game({ hpPerPlayer: 4 });
    // 2 + 2 + 3 + 3 + 3 = 13 of 16.
    for (let i = 0; i < 5; i++) right(sim, 'p2');
    expect(st(sim).hp).toBe(3);
    expect(cast(sim, 'p2', 'streak-cash-in').ok).toBe(true);
    expect(st(sim).hp).toBe(1);
    expect(dmg(sim, 'p2')).toBe(15);
    expect(sim.rt.status).toBe('running');
  });

  it('Gloom Encore Hit lands the most recent hit again, credited to whoever made it, within 10 seconds', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'encore-hit')).toMatchObject({ ok: false });
    right(sim, 'p2');
    expect(cast(sim, 'p1', 'encore-hit').ok).toBe(true);
    expect(st(sim).hp).toBe(44);
    expect(dmg(sim, 'p2')).toBe(4);
    expect(dmg(sim, 'p1')).toBe(0);
    sim.run(50_000);
    expect(cast(sim, 'p1', 'encore-hit')).toMatchObject({ ok: false });
  });

  it('Giant Itching Powder takes 1 health every 4 seconds, four times, credited to the caster', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'itching-powder').ok).toBe(true);
    sim.run(4_100);
    expect(st(sim).hp).toBe(47);
    expect(dmg(sim, 'p1')).toBe(1);
    sim.run(14_000);
    expect(st(sim).hp).toBe(44);
    expect(dmg(sim, 'p1')).toBe(4);
    expect(sim.chaos().effects.some((e) => e.cheatId === 'gloom-giant.itching-powder')).toBe(false);
  });

  it('Gloom Mending Melody mends the shield by 1 three times, 5 seconds apart, and refuses a full shield', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'mending-melody')).toMatchObject({ ok: false });
    for (let i = 0; i < 4; i++) wrong(sim, 'p2');
    expect(st(sim).shield).toBe(13);
    expect(cast(sim, 'p1', 'mending-melody').ok).toBe(true);
    sim.run(5_100);
    expect(st(sim).shield).toBe(14);
    sim.run(11_000);
    expect(st(sim).shield).toBe(16);
    expect(sim.chaos().effects.some((e) => e.cheatId === 'gloom-giant.mending-melody')).toBe(false);
  });
});

describe('gloom-giant pack: more lasting effects on hits', () => {
  it('Gloom Teamwork Hits adds 1 to a hit that follows another fighter\'s within 2 seconds', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'teamwork').ok).toBe(true);
    right(sim, 'p1');
    right(sim, 'p2');
    expect(dmg(sim, 'p1')).toBe(2);
    expect(dmg(sim, 'p2')).toBe(3);
    expect(st(sim).hp).toBe(43);
    sim.run(2_500);
    right(sim, 'p3');
    expect(dmg(sim, 'p3')).toBe(2);
    // The same fighter hitting twice is not teamwork.
    right(sim, 'p3');
    expect(dmg(sim, 'p3')).toBe(4);
  });

  it('Giant\'s Short Temper needs an enraged giant, then adds 1 to every hit for 20 seconds', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'short-temper')).toMatchObject({ ok: false });
    cast(sim, 'p2', 'poke');
    expect(cast(sim, 'p1', 'short-temper').ok).toBe(true);
    right(sim, 'p3');
    expect(dmg(sim, 'p3')).toBe(3);
    sim.run(20_500);
    right(sim, 'p4');
    // A slow answer is a plain 1-damage hit (no swift strike); with the temper still on it would be 2.
    expect(dmg(sim, 'p4')).toBe(1);
  });

  it('Borrowed Swift Strikes makes quick answers critical hits, and is refused when Swift Strikes is on', () => {
    expect(cast(game(), 'p1', 'borrowed-swift')).toMatchObject({ ok: false });
    const sim = game({ swift: false });
    expect(cast(sim, 'p1', 'borrowed-swift').ok).toBe(true);
    right(sim, 'p1');
    expect(dmg(sim, 'p1')).toBe(2);
    expect(st(sim).fighters.p1.crits).toBe(1);
    expect(st(sim).log.at(-1).kind).toBe('crit');
    // Seven seconds is too slow for a swift strike.
    sim.run(7_000);
    right(sim, 'p2');
    const slow = st(sim).log.at(-1);
    expect(slow.amount).toBe(slow.kind === 'crit' ? 2 : 1);
    expect(st(sim).fighters.p2.crits).toBe(slow.kind === 'crit' ? 1 : 0);
  });
});

describe('gloom-giant pack: more lasting effects on strikes', () => {
  it('Gloom Make Amends gives the shield back a wrong answer\'s strike when the caster\'s next answer is right', () => {
    const sim = game();
    cast(sim, 'p1', 'make-amends');
    wrong(sim, 'p1');
    expect(st(sim).shield).toBe(16);
    right(sim, 'p1');
    expect(st(sim).shield).toBe(17);
    // Someone else's miss is not the caster's to make amends for.
    wrong(sim, 'p2');
    right(sim, 'p1');
    expect(st(sim).shield).toBe(16);
    // Two misses in a row: only the last one is made up for.
    cast(sim, 'p3', 'poke');
    wrong(sim, 'p1');
    wrong(sim, 'p1');
    expect(st(sim).shield).toBe(12);
    right(sim, 'p1');
    expect(st(sim).shield).toBe(14);
  });

  it('Gloom Bubble Barrier soaks up 3 points of strikes, even at full shield, then pops', () => {
    const sim = game();
    expect(cast(sim, 'p1', 'bubble').ok).toBe(true);
    wrong(sim, 'p2');
    expect(st(sim).shield).toBe(17);
    cast(sim, 'p3', 'poke');
    wrong(sim, 'p3');
    expect(st(sim).shield).toBe(17);
    expect(sim.chaos().effects.some((e) => e.cheatId === 'gloom-giant.bubble')).toBe(false);
    wrong(sim, 'p3');
    expect(st(sim).shield).toBe(15);
  });

  it('Gloom Silver Lining mends the shield by 2 when the healing giant heals', () => {
    const sim = game({ regen: true });
    expect(cast(sim, 'p1', 'silver-lining')).toMatchObject({ ok: false });
    wrong(sim, 'p2');
    wrong(sim, 'p2');
    for (let i = 0; i < 3; i++) right(sim, 'p3');
    expect(st(sim).shield).toBe(15);
    expect(cast(sim, 'p1', 'silver-lining').ok).toBe(true);
    sim.run(14_500);
    expect(st(sim).hp).toBe(45);
    expect(st(sim).shield).toBe(17);
  });

  it('Giant Growth Spurt doubles the healing giant\'s heals, never past full health', () => {
    const sim = game({ regen: true });
    expect(cast(sim, 'p1', 'growth-spurt')).toMatchObject({ ok: false });
    // 2 + 2 + 3 + 3 + 3 = 13.
    for (let i = 0; i < 5; i++) right(sim, 'p2');
    expect(st(sim).hp).toBe(35);
    expect(cast(sim, 'p1', 'growth-spurt').ok).toBe(true);
    sim.run(14_500);
    expect(st(sim).hp).toBe(43);
    const capped = game({ regen: true });
    right(capped, 'p2');
    right(capped, 'p2');
    cast(capped, 'p1', 'growth-spurt');
    capped.run(14_500);
    expect(st(capped).hp).toBe(48);
  });
});
