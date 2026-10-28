import { allCheats, defineCheats, isHostile } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';
import { buffPool } from './advantage.ts';
import { odds, randomCast, RANDOM_META, rollOdds, roulettePool, SCORE, share, standings, target, transfer } from './kit.ts';

/*
 * Category G: random and absurd. Every random outcome is rolled on the
 * server with the chaos random stream and every cheat states its odds, so
 * what a player reads in the menu is what can happen. Cheats that pick
 * another cheat at random only pick ones that work in this game.
 */

const S = SCORE;

/** Spawn a random cheat from a pool on a fitting target. Returns the cheat's name, or an error. */
function fireRandom(api: ChaosApi, caster: string, pool: CheatDef[], aim?: (d: CheatDef) => string[] | null): string | { error: string } {
  const order = api.rng.shuffle(pool);
  for (const def of order) {
    const input = randomCast(api, def, caster);
    if (!input) continue;
    const targets = aim?.(def);
    if (targets) input.targets = targets;
    const r = api.spawn(def.id, input);
    if (typeof r === 'string') return def.name;
  }
  return { error: 'Nothing in the pool could be cast right now.' };
}

const tame = (d: CheatDef) => d.category === 'visual' || (d.durationMs !== undefined && d.cost <= 30);

const pickers: CheatDef[] = [
  {
    id: 'random.roulette',
    name: 'Chaos Roulette',
    category: 'random',
    description: 'Casts one random cheat that works in this game (any category, chosen with equal odds among them) on a random fitting target. It might be you.',
    target: 'room',
    hostile: true,
    cost: 25,
    cooldownMs: 30_000,
    tags: [RANDOM_META],
    undoable: false,
    apply: (api, c) => {
      const r = fireRandom(api, c.caster, roulettePool(api, () => true, allCheats));
      if (typeof r !== 'string') return r;
      api.feed(`Chaos Roulette landed on ${r}.`, 'big');
    },
  },
  {
    id: 'random.mystery-buff',
    name: 'Mystery Box',
    category: 'random',
    description: 'Gives you one random helpful lasting cheat that works in this game, each equally likely.',
    target: 'self',
    cost: 20,
    cooldownMs: 30_000,
    tags: [RANDOM_META],
    undoable: false,
    apply: (api, c) => {
      const pool = roulettePool(api, (d) => buffPool().includes(d), allCheats);
      const r = fireRandom(api, c.caster, pool, () => [c.caster]);
      if (typeof r !== 'string') return r;
      api.feed(`Mystery Box: ${api.name(c.caster)} got ${r}.`, 'good');
    },
  },
  {
    id: 'random.mystery-curse',
    name: 'Cursed Gift',
    category: 'random',
    description: 'Sends an opponent one random harmful lasting cheat that works in this game, each equally likely.',
    target: 'opponent',
    cost: 25,
    cooldownMs: 30_000,
    tags: [RANDOM_META],
    undoable: false,
    apply: (api, c) => {
      const pool = roulettePool(api, (d) => isHostile(d) && d.target === 'opponent' && d.durationMs !== undefined && tame(d), allCheats);
      const r = fireRandom(api, c.caster, pool, () => [target(c)]);
      if (typeof r !== 'string') return r;
      api.feed(`Cursed Gift: ${api.name(target(c))} unwrapped ${r}.`, 'bad');
    },
  },
  {
    id: 'random.chaos-storm',
    name: 'Chaos Storm',
    category: 'random',
    description: 'For 15 seconds, every 3 seconds a random mild cheat (a lasting one costing 30 or less, or a visual one) hits a random player.',
    target: 'room',
    hostile: true,
    cost: 45,
    cooldownMs: 90_000,
    durationMs: 15_000,
    tickMs: 3_000,
    tags: [RANDOM_META],
    stacking: 'reject',
    hooks: {
      tick: (api, fx) => {
        const victim = api.rng.pick(api.ids());
        const pool = roulettePool(api, (d) => tame(d) && (d.target === 'opponent' || d.target === 'self'), allCheats);
        const r = fireRandom(api, fx.caster, pool, () => [victim]);
        if (typeof r === 'string') api.feed(`The chaos storm hit ${api.name(victim)} with ${r}.`, 'info');
      },
    },
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'Chaos storm', tone: 'info' }),
  },
];

const fortunes: CheatDef[] = [
  {
    id: 'random.wheel-of-fortune',
    name: 'Wheel of Fortune',
    category: 'random',
    description: `Spin the wheel for your own score. Odds: ${odds([['+25%', 30], ['+10%', 30], ['swap with a random player', 15], ['-10%', 20], ['jackpot +75%', 5]])}.`,
    target: 'self',
    needs: S,
    cost: 20,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const v = api.score(c.caster);
      const spin = rollOdds(api, [['up25', 30], ['up10', 30], ['swap', 15], ['down10', 20], ['jackpot', 5]] as const);
      if (spin === 'swap') {
        const other = api.rng.pick(api.others(c.caster));
        if (!other) return { error: 'There is nobody to swap with.' };
        const o = api.score(other);
        if (o === v) return void api.addScore(c.caster, Math.max(1, share(v, 10)));
        api.setScore(other, v);
        api.setScore(c.caster, o);
        api.feed(`Wheel of Fortune: ${api.name(c.caster)} swapped scores with ${api.name(other)}.`, 'big');
        return;
      }
      const pct = spin === 'up25' ? 25 : spin === 'up10' ? 10 : spin === 'down10' ? -10 : 75;
      const d = pct > 0 ? Math.max(1, share(v, pct)) : -share(v, -pct);
      // Losing 10% of nothing is still a spin: it lands on +10% instead.
      if (!api.addScore(c.caster, d)) api.addScore(c.caster, 1);
      api.feed(`Wheel of Fortune: ${pct > 0 ? '+' : ''}${pct}% for ${api.name(c.caster)}.`, pct > 0 ? 'good' : 'bad');
    },
  },
  {
    id: 'random.lottery',
    name: 'Lottery',
    category: 'random',
    description: 'Every player puts 4% of their score in a pot, and one player (each equally likely, you included) wins all of it.',
    target: 'room',
    hostile: true,
    needs: S,
    cost: 30,
    cooldownMs: 60_000,
    apply: (api) => {
      let pot = 0;
      for (const id of api.ids()) pot -= api.addScore(id, -share(api.score(id), 4));
      if (!pot) return { error: 'Nobody has any points for the pot.' };
      const winner = api.rng.pick(api.ids());
      api.addScore(winner, pot);
      api.feed(`Lottery: ${api.name(winner)} won the pot of ${pot}!`, 'big');
    },
  },
  {
    id: 'random.meteor-shower',
    name: 'Meteor Shower',
    category: 'random',
    description: 'Three meteors each hit a random player (the same player can be hit twice, you included), knocking off 8% of their score per hit.',
    target: 'room',
    hostile: true,
    needs: S,
    cost: 35,
    cooldownMs: 60_000,
    apply: (api) => {
      const hits: string[] = [];
      for (let i = 0; i < 3; i++) {
        const v = api.rng.pick(api.ids());
        if (api.addScore(v, -share(api.score(v), 8))) hits.push(api.name(v));
      }
      if (!hits.length) return { error: 'The meteors found nobody with points to hit.' };
      api.feed(`Meteor shower! Hits on ${hits.join(', ')}.`, 'bad');
    },
  },
  {
    id: 'random.golden-goose',
    name: 'Golden Goose',
    category: 'random',
    description: 'For 20 seconds, every 4 seconds a golden egg lands on a random player (each equally likely) and adds 4% to their score (at least 1).',
    target: 'room',
    hostile: false,
    needs: S,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 20_000,
    tickMs: 4_000,
    stacking: 'reject',
    hooks: {
      tick: (api) => {
        const lucky = api.rng.pick(api.ids());
        api.addScore(lucky, Math.max(1, share(api.score(lucky), 4)));
      },
    },
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'Golden goose', tone: 'good' }),
  },
  {
    id: 'random.volcano',
    name: 'Volcano',
    category: 'random',
    description: 'For 15 seconds, every 3 seconds lava splashes a random player (each equally likely) and burns 3% of their score.',
    target: 'room',
    hostile: true,
    needs: S,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 15_000,
    tickMs: 3_000,
    stacking: 'reject',
    apply: (api) => (api.ids().some((id) => api.score(id) > 0) ? undefined : { error: 'Nobody has any points to burn.' }),
    hooks: {
      tick: (api) => {
        const pool = api.ids().filter((id) => api.score(id) > 0);
        if (pool.length) {
          const v = api.rng.pick(pool);
          api.addScore(v, -share(api.score(v), 3));
        }
      },
    },
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'Volcano!', tone: 'bad' }),
  },
  {
    id: 'random.identity-swap',
    name: 'Body Swap',
    category: 'random',
    description: 'Two random players (it could be you) swap scores and every cheat running on them.',
    target: 'room',
    hostile: true,
    needs: S,
    cost: 45,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api) => {
      if (api.ids().length < 2) return { error: 'A body swap needs two players.' };
      const [a, b] = api.rng.shuffle(api.ids()) as [string, string];
      const va = api.score(a);
      const vb = api.score(b);
      const moved = api.effects().filter((e) => e.targets.includes(a) !== e.targets.includes(b));
      if (va === vb && !moved.length) return { error: 'The two players picked were identical in every way. Try again.' };
      api.setScore(a, vb);
      api.setScore(b, va);
      for (const e of moved) e.targets = e.targets.map((x) => (x === a ? b : x === b ? a : x));
      api.feed(`Body swap! ${api.name(a)} and ${api.name(b)} traded places.`, 'big');
    },
  },
  {
    id: 'random.musical-chairs',
    name: 'Musical Chairs',
    category: 'random',
    description: 'When the music stops in 15 seconds, everyone takes the score of the player ranked just above them, and the leader takes last place\'s score.',
    target: 'room',
    hostile: true,
    needs: S,
    cost: 50,
    cooldownMs: 120_000,
    durationMs: 15_000,
    stacking: 'reject',
    apply: (api) => (standings(api).every((r, _i, all) => r.v === all[0]!.v) ? { error: 'Everyone has the same score, so the chairs would not move.' } : undefined),
    hooks: {
      end: (api, _fx, reason) => {
        if (reason !== 'expired') return;
        const rows = standings(api);
        rows.forEach((r, i) => api.setScore(r.id, rows[(i - 1 + rows.length) % rows.length]!.v));
        api.feed('The music stopped! Everyone moved up a chair.', 'big');
      },
    },
    overlayFor: 'all',
    overlay: (fx) => ({ kind: 'countdown', label: 'Musical chairs', until: fx.endsAt }),
  },
  {
    id: 'random.coin-flip-swap',
    name: 'Heads or Tails',
    category: 'random',
    description: `Flip a coin. Odds: ${odds([['heads: you swap scores with the leader', 50], ['tails: you swap scores with last place', 50]])}.`,
    target: 'self',
    needs: S,
    cost: 35,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const heads = api.rng.chance(0.5);
      const other = heads ? api.leader() : api.last();
      if (!other || other === c.caster || api.score(other) === api.score(c.caster)) {
        // Already the leader (or last): the coin lands on the other side instead.
        const alt = heads ? api.last() : api.leader();
        if (!alt || alt === c.caster || api.score(alt) === api.score(c.caster)) return { error: 'Everyone is level with you, so there is nothing to swap.' };
        return swapWith(api, c.caster, alt);
      }
      swapWith(api, c.caster, other);
    },
  },
  {
    id: 'random.dice-duel',
    name: 'Dice Duel',
    category: 'random',
    description: 'You and an opponent each roll a six-sided die. The higher roll takes 3% of the loser\'s score for every point of difference. A tie rerolls once, then it is a draw that costs you both 2%.',
    target: 'opponent',
    needs: S,
    cost: 20,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const t = target(c);
      let mine = api.rng.int(1, 6);
      let theirs = api.rng.int(1, 6);
      if (mine === theirs) {
        mine = api.rng.int(1, 6);
        theirs = api.rng.int(1, 6);
      }
      if (mine === theirs) {
        const lost = -api.addScore(c.caster, -share(api.score(c.caster), 2)) - api.addScore(t, -share(api.score(t), 2));
        if (!lost) return { error: 'A draw, and neither of you had points to lose. Roll again.' };
        api.feed(`Dice duel: a draw at ${mine}-${theirs}. Both lose 2%.`, 'info');
        return;
      }
      const [win, lose] = mine > theirs ? [c.caster, t] : [t, c.caster];
      const moved = transfer(api, 'score', lose, win, share(api.score(lose), 3 * Math.abs(mine - theirs)));
      if (!moved) return { error: `${api.name(lose)} rolled lower but had nothing to lose.` };
      api.feed(`Dice duel: ${api.name(c.caster)} ${mine}, ${api.name(t)} ${theirs}. ${api.name(win)} takes ${moved}.`, 'info');
    },
  },
  {
    id: 'random.secret-santa',
    name: 'Secret Santa',
    category: 'random',
    description: 'Every player gives 5% of their score to a random other player (pairings drawn by shuffling, like a secret santa). If the gifts would cancel out exactly, the richest player sends one more gift of 5% to someone at random.',
    target: 'room',
    hostile: false,
    needs: S,
    cost: 30,
    cooldownMs: 60_000,
    apply: (api) => {
      const ids = api.ids();
      if (ids.length < 2) return { error: 'Secret Santa needs at least two players.' };
      const order = api.rng.shuffle(ids);
      const gifts = order.map((id) => share(api.score(id), 5));
      if (gifts.every((g) => g === 0)) return { error: 'Nobody has any points to give.' };
      const before = ids.map((id) => api.score(id));
      order.forEach((id, i) => transfer(api, 'score', id, order[(i + 1) % order.length]!, gifts[i]!));
      // Equal gifts all the way round cancel out; then the richest player sends one extra gift.
      if (ids.every((id, i) => api.score(id) === before[i])) {
        const rich = api.leader()!;
        transfer(api, 'score', rich, api.rng.pick(ids.filter((id) => id !== rich)), share(api.score(rich), 5));
      }
    },
  },
  {
    id: 'random.butterfly',
    name: 'Butterfly Effect',
    category: 'random',
    description: 'Every player\'s score is nudged by a random amount between -4% and +4% (each whole percent equally likely, zero rerolled).',
    target: 'room',
    hostile: true,
    needs: S,
    cost: 25,
    cooldownMs: 45_000,
    apply: (api) => {
      let changed = 0;
      for (const id of api.ids()) {
        let pct = 0;
        while (pct === 0) pct = api.rng.int(-4, 4);
        const v = api.score(id);
        changed += Math.abs(api.addScore(id, pct > 0 ? share(v, pct) : -share(v, -pct)));
      }
      if (!changed) return { error: 'Nobody has any points to nudge.' };
    },
  },
  {
    id: 'random.jackpot-machine',
    name: 'Slot Machine',
    category: 'random',
    description: `Pull the lever for your own score. Odds: ${odds([['jackpot +100%', 2], ['three cherries +30%', 13], ['two cherries +8%', 40], ['lemons -6%', 45]])}.`,
    target: 'self',
    needs: S,
    cost: 15,
    cooldownMs: 20_000,
    apply: (api, c) => {
      const pct = rollOdds(api, [[100, 2], [30, 13], [8, 40], [-6, 45]]);
      const v = api.score(c.caster);
      const d = pct > 0 ? Math.max(1, share(v, pct)) : -share(v, -pct);
      if (!api.addScore(c.caster, d)) return { error: 'Lemons, but you had nothing to lose. Pull again.' };
      api.feed(`Slot machine: ${pct > 0 ? '+' : ''}${pct}% for ${api.name(c.caster)}.`, pct > 0 ? 'good' : 'bad');
    },
  },
];

function swapWith(api: ChaosApi, a: string, b: string) {
  const va = api.score(a);
  api.setScore(a, api.score(b));
  api.setScore(b, va);
  api.feed(`${api.name(a)} swapped scores with ${api.name(b)}.`, 'big');
}

const rules: CheatDef[] = [
  {
    id: 'random.karma',
    name: 'Karma',
    category: 'random',
    description: 'For 20 seconds, every harmful cheat anyone casts at another player bounces straight back onto whoever cast it.',
    target: 'room',
    hostile: false,
    cost: 35,
    cooldownMs: 90_000,
    durationMs: 20_000,
    tags: ['karma', 'room-rule'],
    conflicts: ['room-rule'],
    stacking: 'reject',
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'Karma: curses bounce back', tone: 'info' }),
  },
  {
    id: 'random.peace-zone',
    name: 'Peace Zone',
    category: 'random',
    description: 'For 20 seconds, nobody can cast harmful cheats.',
    target: 'room',
    hostile: false,
    cost: 30,
    cooldownMs: 90_000,
    durationMs: 20_000,
    tags: ['pacifist', 'room-rule'],
    conflicts: ['room-rule'],
    stacking: 'reject',
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'Peace zone', tone: 'info' }),
  },
  {
    id: 'random.mayhem',
    name: 'Mayhem Hour',
    category: 'random',
    description: 'For 20 seconds, every cheat costs everyone half the usual energy.',
    target: 'room',
    hostile: false,
    cost: 30,
    cooldownMs: 120_000,
    durationMs: 20_000,
    tags: ['mayhem', 'room-rule'],
    conflicts: ['room-rule'],
    stacking: 'reject',
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'Mayhem: half-price chaos', tone: 'info' }),
  },
  {
    id: 'random.gravity-flip',
    name: 'Gravity Flip',
    category: 'random',
    description: 'For 10 seconds, every player\'s screen (yours too) turns upside down.',
    target: 'everyone',
    hostile: true,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 10_000,
    tags: ['x:look-transform', 'look'],
    overlay: () => ({ kind: 'look', look: 'upside-down' }),
  },
  {
    id: 'random.name-shuffle',
    name: 'Name Tag Mix-Up',
    category: 'random',
    description: 'For 20 seconds, every player\'s leaderboard shows the names shuffled onto the wrong scores (the same shuffle for everyone).',
    target: 'room',
    hostile: true,
    cost: 20,
    cooldownMs: 60_000,
    durationMs: 20_000,
    stacking: 'reject',
    apply: (api, _c, fx) => {
      const ids = api.ids();
      if (ids.length < 2) return { error: 'Shuffling names needs two players.' };
      let order = api.rng.shuffle(ids);
      if (order.every((id, i) => id === ids[i])) order = [...ids.slice(1), ids[0]!];
      fx!.data.map = Object.fromEntries(ids.map((id, i) => [id, order[i]!]));
    },
    overlayFor: 'all',
    overlay: (fx: ActiveEffect) => ({ kind: 'swap-names', map: fx.data.map }),
  },
];

defineCheats([...pickers, ...fortunes, ...rules]);
