import { defineCheats } from '../registry.ts';
import type { ChaosApi, CheatDef } from '../types.ts';
import { inBottomHalf, inGame, nothingToTake, odds, rollOdds, scaleGain, SCORE, share, splitEvenly, standings, target, transfer } from './kit.ts';

/*
 * Category A: score. Instant cheats move score between players once (and
 * can be undone for 20 seconds); lasting ones bend every score change the
 * mode makes while they run.
 */

const S = SCORE;

/** Swap two players' scores. */
function swap(api: ChaosApi, a: string, b: string) {
  const va = api.score(a);
  const vb = api.score(b);
  api.setScore(a, vb);
  api.setScore(b, va);
}

const instant: CheatDef[] = [
  {
    id: 'score.pickpocket',
    name: 'Pickpocket',
    category: 'score',
    description: 'Take 10% of an opponent\'s score and add it to yours.',
    target: 'opponent',
    needs: S,
    cost: 20,
    cooldownMs: 15_000,
    apply: (api, c) => nothingToTake(api, target(c)) ?? void transfer(api, 'score', target(c), c.caster, share(api.score(target(c)), 10)),
  },
  {
    id: 'score.grand-heist',
    name: 'Grand Heist',
    category: 'score',
    description: `Try to take 30% of an opponent's score. Odds: ${odds([['it works', 60], ['you are caught and pay them 10% of yours (or, if you have nothing, they get a 5% reward)', 40]])}.`,
    target: 'opponent',
    needs: S,
    cost: 30,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const t = target(c);
      const no = nothingToTake(api, t);
      if (no) return no;
      if (rollOdds(api, [[true, 60], [false, 40]])) {
        const got = transfer(api, 'score', t, c.caster, share(api.score(t), 30));
        api.feed(`Grand Heist: ${api.name(c.caster)} got away with ${got} from ${api.name(t)}.`, 'big');
      } else {
        const paid = transfer(api, 'score', c.caster, t, share(api.score(c.caster), 10));
        const reward = paid ? 0 : api.addScore(t, share(api.score(t), 5));
        api.feed(`Grand Heist: ${api.name(c.caster)} was caught. ${api.name(t)} got ${paid || reward}.`, 'bad');
      }
    },
  },
  {
    id: 'score.swap',
    name: 'Score Swap',
    category: 'score',
    description: 'Trade your whole score for an opponent\'s.',
    target: 'opponent',
    needs: S,
    cost: 45,
    cooldownMs: 60_000,
    apply: (api, c) => {
      if (api.score(c.caster) === api.score(target(c))) return { error: 'You already have the same score.' };
      swap(api, c.caster, target(c));
    },
  },
  {
    id: 'score.leader-tax',
    name: 'Leader Tax',
    category: 'score',
    description: 'Whoever is in first place pays you 15% of their score.',
    target: 'room',
    hostile: true,
    needs: S,
    cost: 25,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const lead = api.leader();
      if (!lead || lead === c.caster) return { error: 'You are the leader. There is nobody above you to tax.' };
      return nothingToTake(api, lead) ?? void transfer(api, 'score', lead, c.caster, share(api.score(lead), 15));
    },
  },
  {
    id: 'score.robin-hood',
    name: 'Robin Hood',
    category: 'score',
    description: 'Moves 20% of the leader\'s score to whoever is in last place.',
    target: 'room',
    hostile: true,
    needs: S,
    cost: 25,
    cooldownMs: 30_000,
    apply: (api) => {
      const lead = api.leader();
      const last = api.last();
      if (!lead || !last || lead === last || api.score(lead) === api.score(last)) return { error: 'Everyone is level, so there is nobody to rob for.' };
      transfer(api, 'score', lead, last, share(api.score(lead), 20));
    },
  },
  {
    id: 'score.shuffle',
    name: 'Scoreboard Shuffle',
    category: 'score',
    description: 'Every score in the game is dealt out again to a random player.',
    target: 'room',
    hostile: true,
    needs: S,
    cost: 60,
    cooldownMs: 90_000,
    apply: (api) => {
      const ids = api.ids();
      if (ids.length < 2) return { error: 'Shuffling needs at least two players.' };
      const values = ids.map((id) => api.score(id));
      if (new Set(values).size < 2) return { error: 'Every score is the same, so shuffling would change nothing.' };
      let dealt = api.rng.shuffle(values);
      // A shuffle that lands everyone back on their own score is dealt again.
      for (let i = 0; i < 20 && dealt.every((v, k) => v === values[k]); i++) dealt = api.rng.shuffle(values);
      if (dealt.every((v, k) => v === values[k])) dealt = [...values.slice(1), values[0]!];
      ids.forEach((id, i) => api.setScore(id, dealt[i]!));
    },
  },
  {
    id: 'score.upside-down-board',
    name: 'Topsy-Turvy Board',
    category: 'score',
    description: 'Flips the leaderboard: first place gets last place\'s score, second gets second-to-last\'s, and so on.',
    target: 'room',
    hostile: true,
    needs: S,
    cost: 70,
    cooldownMs: 120_000,
    apply: (api) => {
      const rows = standings(api);
      if (rows.length < 2 || rows[0]!.v === rows.at(-1)!.v) return { error: 'Everyone is level, so flipping would change nothing.' };
      rows.forEach((r, i) => api.setScore(r.id, rows[rows.length - 1 - i]!.v));
    },
  },
  {
    id: 'score.equalizer',
    name: 'Great Equalizer',
    category: 'score',
    description: 'Sets every player\'s score to the average score.',
    target: 'room',
    hostile: true,
    needs: S,
    cost: 65,
    cooldownMs: 120_000,
    apply: (api) => {
      const ids = api.ids();
      const avg = Math.round(ids.reduce((n, id) => n + api.score(id), 0) / Math.max(1, ids.length));
      if (ids.every((id) => api.score(id) === avg)) return { error: 'Everyone already has the average.' };
      for (const id of ids) api.setScore(id, avg);
    },
  },
  {
    id: 'score.split-difference',
    name: 'Split the Difference',
    category: 'score',
    description: 'You and another player both end up on the average of your two scores.',
    target: 'opponent',
    needs: S,
    cost: 30,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const t = target(c);
      const avg = Math.round((api.score(c.caster) + api.score(t)) / 2);
      if (api.score(c.caster) === api.score(t)) return { error: 'Your scores are already level.' };
      api.setScore(c.caster, avg);
      api.setScore(t, avg);
    },
  },
  {
    id: 'score.halve-leader',
    name: 'Cut Down to Size',
    category: 'score',
    description: 'The leader loses half their score. Nobody gets it.',
    target: 'room',
    hostile: true,
    needs: S,
    cost: 55,
    cooldownMs: 90_000,
    apply: (api, c) => {
      const lead = api.leader();
      if (!lead || lead === c.caster) return { error: 'You are the leader.' };
      const no = nothingToTake(api, lead);
      if (no) return no;
      api.addScore(lead, -Math.ceil(api.score(lead) / 2));
    },
  },
  {
    id: 'score.double-or-nothing',
    name: 'Double or Nothing',
    category: 'score',
    description: `Gamble your own score. Odds: ${odds([['it doubles', 45], ['it halves', 55]])}.`,
    target: 'self',
    needs: S,
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const v = api.score(c.caster);
      if (v <= 0) return { error: 'You need some points to gamble.' };
      const won = rollOdds(api, [[true, 45], [false, 55]]);
      api.setScore(c.caster, won ? v * 2 : Math.floor(v / 2));
      api.feed(won ? `${api.name(c.caster)} doubled up!` : `${api.name(c.caster)} lost half on a gamble.`, won ? 'good' : 'bad');
    },
  },
  {
    id: 'score.lucky-dip',
    name: 'Lucky Dip',
    category: 'score',
    description: `Win a bonus of your own score. Odds: ${odds([['+5%', 50], ['+15%', 35], ['+40%', 15]])}.`,
    target: 'self',
    needs: S,
    cost: 20,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const pct = rollOdds(api, [[5, 50], [15, 35], [40, 15]]);
      const v = api.score(c.caster);
      api.addScore(c.caster, v > 0 ? share(v, pct) : 1);
      api.feed(`Lucky Dip: ${api.name(c.caster)} pulled out +${pct}%.`, 'good');
    },
  },
  {
    id: 'score.round-up',
    name: 'Round It Up',
    category: 'score',
    description: 'Rounds your score up to the next round number (the next 10, 100 or 1,000, depending on its size).',
    target: 'self',
    needs: S,
    cost: 15,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const v = api.score(c.caster);
      const step = v >= 10_000 ? 1000 : v >= 1000 ? 100 : 10;
      const up = Math.floor(v / step) * step + step;
      api.setScore(c.caster, up);
    },
  },
  {
    id: 'score.gift',
    name: 'Generous Gift',
    category: 'score',
    description: 'Give 10% of your own score to any player you choose.',
    target: 'player',
    hostile: false,
    needs: S,
    cost: 5,
    cooldownMs: 10_000,
    apply: (api, c) => {
      if (target(c) === c.caster) return { error: 'Pick someone other than yourself.' };
      return nothingToTake(api, c.caster) ?? void transfer(api, 'score', c.caster, target(c), share(api.score(c.caster), 10));
    },
  },
  {
    id: 'score.tithe',
    name: 'Tithe',
    category: 'score',
    description: 'Every other player pays you 3% of their score.',
    target: 'everyone-else',
    needs: S,
    cost: 40,
    cooldownMs: 60_000,
    apply: (api, c) => {
      let got = 0;
      for (const t of c.targets) got += transfer(api, 'score', t, c.caster, share(api.score(t), 3));
      if (!got) return { error: 'Nobody has anything to pay.' };
    },
  },
  {
    id: 'score.mutual-ruin',
    name: 'Mutual Ruin',
    category: 'score',
    description: 'An opponent loses 30% of their score, and you lose 10% of yours for doing it.',
    target: 'opponent',
    needs: S,
    cost: 25,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const t = target(c);
      const no = nothingToTake(api, t);
      if (no) return no;
      api.addScore(t, -share(api.score(t), 30));
      api.addScore(c.caster, -share(api.score(c.caster), 10));
    },
  },
  {
    id: 'score.copycat',
    name: 'Copycat',
    category: 'score',
    description: 'Your score becomes the score of the player one place above you.',
    target: 'self',
    needs: S,
    cost: 35,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const order = api.ranked();
      const i = order.indexOf(c.caster);
      const above = order.slice(0, i).reverse().find((id) => api.score(id) > api.score(c.caster));
      if (!above) return { error: 'Nobody is above you.' };
      api.setScore(c.caster, api.score(above));
    },
  },
  {
    id: 'score.leapfrog',
    name: 'Leapfrog',
    category: 'score',
    description: 'Swap scores with the player one place above you.',
    target: 'self',
    needs: S,
    cost: 30,
    cooldownMs: 45_000,
    hostile: false,
    apply: (api, c) => {
      const order = api.ranked();
      const above = order.slice(0, order.indexOf(c.caster)).reverse().find((id) => api.score(id) > api.score(c.caster));
      if (!above) return { error: 'Nobody is above you.' };
      swap(api, c.caster, above);
    },
  },
  {
    id: 'score.trapdoor',
    name: 'Trapdoor',
    category: 'score',
    description: 'An opponent swaps scores with the player one place below them.',
    target: 'opponent',
    needs: S,
    cost: 30,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const order = api.ranked();
      const t = target(c);
      const below = order.slice(order.indexOf(t) + 1).find((id) => api.score(id) < api.score(t));
      if (!below) return { error: `${api.name(t)} is already in last place.` };
      swap(api, t, below);
    },
  },
  {
    id: 'score.lifeline',
    name: 'Lifeline',
    category: 'score',
    description: 'Whoever is in last place gets a fifth of the leader\'s score, from nowhere.',
    target: 'room',
    hostile: false,
    needs: S,
    cost: 20,
    cooldownMs: 45_000,
    apply: (api) => {
      const lead = api.leader();
      const last = api.last();
      if (!lead || !last || lead === last || api.score(lead) <= 0) return { error: 'Nobody has scored yet.' };
      api.addScore(last, share(api.score(lead), 20));
    },
  },
  {
    id: 'score.coin-toss-everyone',
    name: 'Everybody Flips',
    category: 'score',
    description: `Each other player flips a coin. Odds for each: ${odds([['lose 10%', 50], ['win 5%', 50]])}.`,
    target: 'everyone-else',
    needs: S,
    cost: 35,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const scored = c.targets.filter((t) => api.score(t) > 0);
      if (!scored.length) return { error: 'Nobody else has any points to flip for.' };
      const losers: string[] = [];
      for (const t of scored) {
        if (api.rng.chance(0.5)) {
          api.addScore(t, -share(api.score(t), 10));
          losers.push(api.name(t));
        } else api.addScore(t, share(api.score(t), 5));
      }
      api.feed(losers.length ? `Coins flipped: ${losers.join(', ')} lost 10%; the rest won 5%.` : 'Coins flipped: everyone won 5%.', 'info');
    },
  },
  {
    id: 'score.pyramid',
    name: 'Pyramid Scheme',
    category: 'score',
    description: 'Everyone pays 5% of their score to the player ranked just above them.',
    target: 'room',
    hostile: true,
    needs: S,
    cost: 40,
    cooldownMs: 60_000,
    apply: (api) => {
      const rows = standings(api);
      if (rows.length < 2 || rows.every((r) => r.v <= 0)) return { error: 'Nobody has any points to pass up the pyramid.' };
      const pay = rows.map((r) => share(r.v, 5));
      for (let i = rows.length - 1; i >= 1; i--) transfer(api, 'score', rows[i]!.id, rows[i - 1]!.id, pay[i]!);
    },
  },
  {
    id: 'score.revenge',
    name: 'Sweet Revenge',
    category: 'score',
    description: 'Every player who has cast a cheat on you this game pays you 8% of their score.',
    target: 'self',
    needs: S,
    cost: 30,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const culprits = new Set(
        api
          .log()
          .filter((l) => l.kind === 'cast' && l.caster && l.caster !== c.caster && l.targets?.includes(c.caster))
          .map((l) => l.caster!),
      );
      const here = [...culprits].filter((id) => inGame(api, id));
      if (!here.length) return { error: 'Nobody here has cheated against you yet.' };
      let paid = 0;
      for (const id of here) paid += transfer(api, 'score', id, c.caster, share(api.score(id), 8));
      if (paid <= 0) return { error: 'Nobody who cheated against you has anything to pay.' };
    },
  },
  {
    id: 'score.wipeout',
    name: 'Wipeout',
    category: 'score',
    description: 'An opponent\'s score drops to zero. It costs you half of yours.',
    target: 'opponent',
    needs: S,
    cost: 90,
    cooldownMs: 180_000,
    apply: (api, c) => {
      const t = target(c);
      const no = nothingToTake(api, t);
      if (no) return no;
      api.setScore(t, 0);
      api.addScore(c.caster, -Math.ceil(api.score(c.caster) / 2));
    },
  },
  {
    id: 'score.big-bang',
    name: 'Big Bang',
    category: 'score',
    description: 'All the points in the game are pooled and dealt out again in random amounts. The total stays the same.',
    target: 'room',
    hostile: true,
    needs: S,
    cost: 80,
    cooldownMs: 180_000,
    apply: (api) => {
      const ids = api.ids();
      const total = ids.reduce((n, id) => n + api.score(id), 0);
      if (ids.length < 2 || total <= 0) return { error: 'There are no points to scatter yet.' };
      const old = ids.map((id) => api.score(id));
      const weights = ids.map(() => api.rng.next() + 0.05);
      const sum = weights.reduce((a, b) => a + b, 0);
      let left = total;
      ids.forEach((id, i) => {
        const v = i === ids.length - 1 ? left : Math.floor((total * weights[i]!) / sum);
        left -= v;
        api.setScore(id, v);
      });
      // Landing on exactly the same scores counts as no change: rotate them instead.
      if (ids.every((id, i) => api.score(id) === old[i])) ids.forEach((id, i) => api.setScore(id, old[(i + 1) % ids.length]!));
    },
  },
  {
    id: 'score.duel-coin',
    name: 'Coin Duel',
    category: 'score',
    description: `You and an opponent flip for it. Odds: ${odds([['you win 15% of theirs', 50], ['they win 15% of yours', 50]])}. A winner whose opponent has nothing gets a 5% bonus instead.`,
    target: 'opponent',
    needs: S,
    cost: 15,
    cooldownMs: 20_000,
    apply: (api, c) => {
      const t = target(c);
      const won = api.rng.chance(0.5);
      const [from, to] = won ? [t, c.caster] : [c.caster, t];
      if (api.score(from) <= 0 && api.score(to) <= 0) return { error: 'Neither of you has any points to duel for.' };
      const moved = transfer(api, 'score', from, to, share(api.score(from), 15)) || api.addScore(to, share(api.score(to), 5));
      api.feed(`Coin Duel: ${api.name(to)} won ${moved}.`, 'info');
    },
  },
];

/* ------------------------------- lasting -------------------------------- */

const lasting: CheatDef[] = [
  {
    id: 'score.double-points',
    name: 'Double Points',
    category: 'score',
    description: 'For 20 seconds, everything you score counts twice.',
    target: 'self',
    needs: S,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    tags: ['multiplier'],
    priority: 20,
    hooks: { delta: { score: (_api, fx, d) => void ((d[fx.caster] ?? 0) > 0 && (d[fx.caster]! *= 2)) } },
    overlay: () => ({ kind: 'badge', text: '×2', tone: 'good' }),
  },
  {
    id: 'score.triple-next',
    name: 'Triple Shot',
    category: 'score',
    description: 'The next points you score (within 45 seconds) count three times.',
    target: 'self',
    needs: S,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 45_000,
    tags: ['multiplier'],
    priority: 20,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          if ((d[fx.caster] ?? 0) <= 0) return;
          d[fx.caster]! *= 3;
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: '×3 next', tone: 'good' }),
  },
  {
    id: 'score.siphon',
    name: 'Siphon',
    category: 'score',
    description: 'For 20 seconds, 30% of everything an opponent scores flows to you instead.',
    target: 'opponent',
    needs: S,
    cost: 30,
    cooldownMs: 40_000,
    durationMs: 20_000,
    priority: 10,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) <= 0 || !inGame(api, fx.caster)) return;
          const cut = share(d[t]!, 30);
          d[t]! -= cut;
          d[fx.caster] = (d[fx.caster] ?? 0) + cut;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Siphoned', tone: 'bad' }),
  },
  {
    id: 'score.leech',
    name: 'Leech',
    category: 'score',
    description: 'For 20 seconds, whenever an opponent scores, you score the same amount. They keep theirs.',
    target: 'opponent',
    needs: S,
    cost: 35,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 15,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) > 0 && inGame(api, fx.caster)) d[fx.caster] = (d[fx.caster] ?? 0) + d[t]!;
        },
      },
    },
  },
  {
    id: 'score.reverse-gains',
    name: 'Reverse Polarity',
    category: 'score',
    description: 'For 12 seconds, anything an opponent scores is taken off their score instead.',
    target: 'opponent',
    needs: S,
    cost: 40,
    cooldownMs: 60_000,
    durationMs: 12_000,
    priority: 30,
    tags: ['gain-control'],
    conflicts: ['gain-control'],
    hooks: { delta: { score: (_api, fx, d) => void ((d[target(fx)] ?? 0) > 0 && (d[target(fx)] = -d[target(fx)]!)) } },
    overlay: () => ({ kind: 'badge', text: 'Reversed', tone: 'bad' }),
  },
  {
    id: 'score.freeze-score',
    name: 'Score Freeze',
    category: 'score',
    description: 'For 15 seconds, an opponent cannot score at all.',
    target: 'opponent',
    needs: S,
    cost: 35,
    cooldownMs: 45_000,
    durationMs: 15_000,
    priority: 40,
    tags: ['gain-control'],
    conflicts: ['gain-control'],
    hooks: { delta: { score: (_api, fx, d) => void ((d[target(fx)] ?? 0) > 0 && (d[target(fx)] = 0)) } },
    overlay: () => ({ kind: 'badge', text: 'Score frozen', tone: 'bad' }),
  },
  {
    id: 'score.lock',
    name: 'Iron Vault',
    category: 'score',
    description: 'For 30 seconds, your score cannot go down: penalties and losses from the game do not touch it.',
    target: 'self',
    needs: [...S, 'losses'],
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 30_000,
    priority: 50,
    hooks: { delta: { score: (_api, fx, d) => void ((d[fx.caster] ?? 0) < 0 && (d[fx.caster] = 0)) } },
    overlay: () => ({ kind: 'badge', text: 'Vault', tone: 'good' }),
  },
  {
    id: 'score.compound-interest',
    name: 'Compound Interest',
    category: 'score',
    description: 'For 30 seconds, your score grows by 4% every 5 seconds.',
    target: 'self',
    needs: S,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 30_000,
    tickMs: 5_000,
    apply: (api, c) => (api.score(c.caster) > 0 ? undefined : { error: 'You need some points before they can earn interest.' }),
    hooks: { tick: (api, fx) => void api.addScore(fx.caster, share(api.score(fx.caster), 4)) },
    overlay: () => ({ kind: 'badge', text: 'Interest', tone: 'good' }),
  },
  {
    id: 'score.drain',
    name: 'Slow Drain',
    category: 'score',
    description: 'For 20 seconds, an opponent loses 2% of their score every 2 seconds. It just disappears.',
    target: 'opponent',
    needs: S,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    tickMs: 2_000,
    apply: (api, c) => nothingToTake(api, target(c)) ?? undefined,
    hooks: { tick: (api, fx) => void api.addScore(target(fx), -share(api.score(target(fx)), 2)) },
    overlay: () => ({ kind: 'badge', text: 'Draining', tone: 'bad' }),
  },
  {
    id: 'score.bleed',
    name: 'Sneaky Straw',
    category: 'score',
    description: 'For 20 seconds, every 2 seconds you take 1% of an opponent\'s score.',
    target: 'opponent',
    needs: S,
    cost: 35,
    cooldownMs: 45_000,
    durationMs: 20_000,
    tickMs: 2_000,
    apply: (api, c) => nothingToTake(api, target(c)) ?? undefined,
    hooks: { tick: (api, fx) => void (inGame(api, fx.caster) && transfer(api, 'score', target(fx), fx.caster, share(api.score(target(fx)), 1))) },
  },
  {
    id: 'score.echo',
    name: 'Echo',
    category: 'score',
    description: 'For 25 seconds, whatever you score, a player you choose scores too.',
    target: 'player',
    hostile: false,
    needs: S,
    cost: 20,
    cooldownMs: 40_000,
    durationMs: 25_000,
    priority: 15,
    apply: (_api, c) => (target(c) === c.caster ? { error: 'Pick someone other than yourself.' } : undefined),
    hooks: {
      delta: {
        score: (_api, fx, d) => {
          const t = target(fx);
          if ((d[fx.caster] ?? 0) > 0) d[t] = (d[t] ?? 0) + d[fx.caster]!;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Echo', tone: 'good' }),
  },
  {
    id: 'score.magnet',
    name: 'Point Magnet',
    category: 'score',
    description: 'For 20 seconds, whenever anyone else scores, you get a bonus of 10% of it.',
    target: 'self',
    needs: S,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 15,
    hooks: {
      delta: {
        score: (_api, fx, d) => {
          let bonus = 0;
          for (const [id, v] of Object.entries(d)) if (id !== fx.caster && v > 0) bonus += share(v, 10);
          if (bonus) d[fx.caster] = (d[fx.caster] ?? 0) + bonus;
        },
      },
    },
  },
  {
    id: 'score.tax-collector',
    name: 'Tax Collector',
    category: 'score',
    description: 'For 20 seconds, 10% of everything anyone else scores is taken from them and paid to you.',
    target: 'everyone-else',
    needs: S,
    cost: 40,
    cooldownMs: 60_000,
    durationMs: 20_000,
    priority: 10,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          if (!inGame(api, fx.caster)) return;
          for (const id of fx.targets) {
            if ((d[id] ?? 0) <= 0) continue;
            const cut = share(d[id]!, 10);
            d[id]! -= cut;
            d[fx.caster] = (d[fx.caster] ?? 0) + cut;
          }
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Taxed', tone: 'bad' }),
  },
  {
    id: 'score.halve-gains',
    name: 'Half Measures',
    category: 'score',
    description: 'For 20 seconds, an opponent scores only half of what they earn.',
    target: 'opponent',
    needs: S,
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 20_000,
    priority: 20,
    hooks: { delta: { score: (_api, fx, d) => void ((d[target(fx)] ?? 0) > 0 && (d[target(fx)] = scaleGain(d[target(fx)]!, 0.5))) } },
    overlay: () => ({ kind: 'badge', text: '×½', tone: 'bad' }),
  },
  {
    id: 'score.insurance',
    name: 'Insurance Policy',
    category: 'score',
    description: 'The next time the game takes points off you (within 40 seconds), you get them all back.',
    target: 'self',
    needs: [...S, 'losses'],
    cost: 15,
    cooldownMs: 40_000,
    durationMs: 40_000,
    priority: 50,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          if ((d[fx.caster] ?? 0) >= 0) return;
          api.feed(`${api.name(fx.caster)}'s insurance paid out ${-d[fx.caster]!}.`, 'good');
          d[fx.caster] = 0;
          api.endEffect(fx.eid, 'used');
        },
      },
    },
  },
  {
    id: 'score.bounty',
    name: 'Bounty Hunter',
    category: 'score',
    description: 'Put a bounty on an opponent ahead of you. Overtake them within 40 seconds to claim 20% of their score.',
    target: 'opponent',
    needs: S,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 40_000,
    tickMs: 500,
    apply: (api, c) => (api.score(c.caster) >= api.score(target(c)) ? { error: `You are already ahead of ${api.name(target(c))}.` } : undefined),
    hooks: {
      tick: (api, fx) => {
        const t = target(fx);
        if (!inGame(api, fx.caster) || api.score(fx.caster) <= api.score(t)) return;
        const prize = transfer(api, 'score', t, fx.caster, share(api.score(t), 20));
        api.feed(`${api.name(fx.caster)} claimed the bounty on ${api.name(t)}: ${prize}.`, 'big');
        api.endEffect(fx.eid, 'used');
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Bounty on you', tone: 'bad' }),
  },
  {
    id: 'score.comeback-surge',
    name: 'Comeback Surge',
    category: 'score',
    description: 'For 30 seconds, while you are in the bottom half of the standings, your points are worth 1.5 times as much.',
    target: 'self',
    needs: S,
    cost: 20,
    cooldownMs: 45_000,
    durationMs: 30_000,
    tags: ['multiplier'],
    priority: 20,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          if ((d[fx.caster] ?? 0) > 0 && inBottomHalf(api, fx.caster)) d[fx.caster] = scaleGain(d[fx.caster]!, 1.5);
        },
      },
    },
  },
  {
    id: 'score.delayed-gains',
    name: 'Sealed Envelope',
    category: 'score',
    description: 'For 15 seconds, an opponent\'s points are held back. They get them all at once when it ends.',
    target: 'opponent',
    needs: S,
    cost: 20,
    cooldownMs: 30_000,
    durationMs: 15_000,
    priority: 45,
    tags: ['gain-control'],
    conflicts: ['gain-control'],
    hooks: {
      delta: {
        score: (_api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) <= 0) return;
          fx.data.held = Number(fx.data.held ?? 0) + d[t]!;
          d[t] = 0;
        },
      },
      end: (api, fx, reason) => {
        const held = Number(fx.data.held ?? 0);
        if (held > 0 && reason !== 'left') api.addScore(target(fx), held);
      },
    },
    overlay: (fx) => ({ kind: 'badge', text: `Held: ${Number(fx.data.held ?? 0)}`, tone: 'bad' }),
  },
  {
    id: 'score.share-the-wealth',
    name: 'Share the Wealth',
    category: 'score',
    description: 'For 15 seconds, everything an opponent scores is split evenly between every player.',
    target: 'opponent',
    needs: S,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 15_000,
    priority: 12,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) <= 0) return;
          // Leftover units go to the others, so even a 1-point gain leaves the scorer.
          const others = api.ids().filter((id) => id !== t);
          const each = Math.floor(d[t]! / (others.length + 1));
          const parts = splitEvenly(api, d[t]! - each, others.length);
          others.forEach((id, i) => (d[id] = (d[id] ?? 0) + parts[i]!));
          d[t] = each;
        },
      },
    },
  },
  {
    id: 'score.wild-multiplier',
    name: 'Wild Multiplier',
    category: 'score',
    description: `For 20 seconds, each time you score it is multiplied at random. Odds each time: ${odds([['×0', 15], ['×0.5', 20], ['×1', 20], ['×2', 30], ['×3', 15]])}.`,
    target: 'self',
    needs: S,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    tags: ['multiplier'],
    priority: 25,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          if ((d[fx.caster] ?? 0) <= 0) return;
          const m = rollOdds(api, [[0, 15], [0.5, 20], [1, 20], [2, 30], [3, 15]]);
          d[fx.caster] = Math.round(d[fx.caster]! * m);
          api.feed(`Wild Multiplier: ×${m}`, m >= 2 ? 'good' : 'info', [fx.caster]);
        },
      },
    },
  },
  {
    id: 'score.inflation',
    name: 'Inflation',
    category: 'score',
    description: 'For 20 seconds, every player scores double.',
    target: 'room',
    hostile: false,
    needs: S,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 20_000,
    tags: ['economy-room'],
    conflicts: ['economy-room'],
    priority: 20,
    hooks: { delta: { score: (_api, _fx, d) => void Object.keys(d).forEach((id) => d[id]! > 0 && (d[id] = d[id]! * 2)) } },
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'Inflation ×2', tone: 'info' }),
  },
  {
    id: 'score.deflation',
    name: 'Deflation',
    category: 'score',
    description: 'For 20 seconds, every player scores only half.',
    target: 'room',
    hostile: true,
    needs: S,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 20_000,
    tags: ['economy-room'],
    conflicts: ['economy-room'],
    priority: 20,
    hooks: { delta: { score: (_api, _fx, d) => void Object.keys(d).forEach((id) => d[id]! > 0 && (d[id] = scaleGain(d[id]!, 0.5))) } },
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'Deflation ×½', tone: 'info' }),
  },
  {
    id: 'score.underdog-rules',
    name: 'Underdog Rules',
    category: 'score',
    description: 'For 25 seconds, the top three score half and everyone else scores one and a half times as much.',
    target: 'room',
    hostile: true,
    needs: S,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 25_000,
    tags: ['economy-room'],
    conflicts: ['economy-room'],
    priority: 20,
    hooks: {
      delta: {
        score: (api, _fx, d) => {
          const top = new Set(api.ranked().slice(0, 3));
          for (const id of Object.keys(d)) if (d[id]! > 0) d[id] = scaleGain(d[id]!, top.has(id) ? 0.5 : 1.5);
        },
      },
    },
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'Underdog rules', tone: 'info' }),
  },
  {
    id: 'score.toll-booth',
    name: 'Toll Booth',
    category: 'score',
    description: 'The next points an opponent scores (within 30 seconds) go to you instead.',
    target: 'opponent',
    needs: S,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 30_000,
    priority: 11,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) <= 0 || !inGame(api, fx.caster)) return;
          d[fx.caster] = (d[fx.caster] ?? 0) + d[t]!;
          api.feed(`${api.name(t)} paid ${d[t]} at ${api.name(fx.caster)}'s toll booth.`, 'info');
          d[t] = 0;
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Toll ahead', tone: 'bad' }),
  },
  {
    id: 'score.gamblers-curse',
    name: 'Gambler\'s Curse',
    category: 'score',
    description: 'For 20 seconds, an opponent scores double, but loses triple whenever the game takes points off them.',
    target: 'opponent',
    needs: S,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 22,
    hooks: {
      delta: {
        score: (_api, fx, d) => {
          const t = target(fx);
          if (d[t] === undefined) return;
          d[t] = d[t]! > 0 ? d[t]! * 2 : d[t]! * 3;
        },
      },
    },
  },
  {
    id: 'score.time-bomb',
    name: 'Pop Timer',
    category: 'score',
    description: 'An opponent has 12 seconds to score something. If they do not, the timer pops and takes 20% of their score.',
    target: 'opponent',
    needs: S,
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 12_000,
    priority: 60,
    apply: (api, c) => nothingToTake(api, target(c)) ?? undefined,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          if ((d[target(fx)] ?? 0) <= 0) return;
          fx.data.defused = true;
          api.feed(`${api.name(target(fx))} stopped the pop timer.`, 'good');
          api.endEffect(fx.eid, 'used');
        },
      },
      end: (api, fx, reason) => {
        if (reason !== 'expired' || fx.data.defused) return;
        const t = target(fx);
        api.addScore(t, -share(api.score(t), 20));
        api.feed(`Pop! ${api.name(t)}'s timer ran out.`, 'bad');
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Pop timer: score to stop it', until: fx.endsAt }),
  },
  {
    id: 'score.hot-potato',
    name: 'Hot Potato',
    category: 'score',
    description: 'A hot potato lands on an opponent and jumps to a random player with points every 3 seconds. Whoever holds it after 12 seconds loses 15%.',
    target: 'opponent',
    needs: S,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 12_000,
    tickMs: 3_000,
    stacking: 'reject',
    apply: (api, c) => nothingToTake(api, target(c)) ?? undefined,
    hooks: {
      tick: (api, fx) => {
        const pool = api.ids().filter((id) => id !== fx.targets[0] && api.score(id) > 0);
        if (pool.length) fx.targets = [api.rng.pick(pool)];
      },
      end: (api, fx, reason) => {
        if (reason !== 'expired' || !fx.targets[0]) return;
        const t = fx.targets[0];
        api.addScore(t, -share(api.score(t), 15));
        api.feed(`${api.name(t)} was left holding the hot potato.`, 'bad');
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Hot potato! It will jump soon', until: fx.endsAt }),
  },
  {
    id: 'score.contagion',
    name: 'Contagion',
    category: 'score',
    description: 'An opponent catches a bug that halves their points. Every 4 seconds it spreads to another player (never you) for 20 seconds.',
    target: 'opponent',
    needs: S,
    cost: 40,
    cooldownMs: 60_000,
    durationMs: 20_000,
    tickMs: 4_000,
    priority: 20,
    hooks: {
      tick: (api, fx) => {
        const healthy = api.ids().filter((id) => id !== fx.caster && !fx.targets.includes(id));
        if (healthy.length) fx.targets.push(api.rng.pick(healthy));
      },
      delta: {
        score: (_api, fx, d) => {
          for (const t of fx.targets) if ((d[t] ?? 0) > 0) d[t] = scaleGain(d[t]!, 0.5);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Infected ×½', tone: 'bad' }),
  },
];

const teams: CheatDef[] = [
  {
    id: 'score.team-rally',
    name: 'Team Rally',
    category: 'score',
    description: 'For 20 seconds, everyone on your team scores 25% more.',
    target: 'my-team',
    needs: [...S, 'teams'],
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 20_000,
    priority: 20,
    hooks: { delta: { score: (_api, fx, d) => void fx.targets.forEach((t) => (d[t] ?? 0) > 0 && (d[t] = scaleGain(d[t]!, 1.25))) } },
    overlay: () => ({ kind: 'badge', text: 'Rally +25%', tone: 'good' }),
  },
  {
    id: 'score.team-raid',
    name: 'Team Raid',
    category: 'score',
    description: 'Take 6% from every player on another team and share it out across your own team.',
    target: 'enemy-team',
    needs: [...S, 'teams'],
    cost: 45,
    cooldownMs: 75_000,
    apply: (api, c) => {
      const mine = api.teamOf(c.caster) ? api.members(api.teamOf(c.caster)!) : [c.caster];
      let pot = 0;
      for (const t of c.targets) pot -= api.addScore(t, -share(api.score(t), 6));
      if (!pot) return { error: 'That team has nothing to take.' };
      const each = Math.floor(pot / mine.length);
      mine.forEach((m, i) => api.addScore(m, each + (i === 0 ? pot - each * mine.length : 0)));
    },
  },
  {
    id: 'score.spread-thin',
    name: 'Spread Thin',
    category: 'score',
    description: 'For 20 seconds, whatever anyone on another team scores is split evenly across that whole team.',
    target: 'enemy-team',
    needs: [...S, 'teams'],
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 12,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const total = fx.targets.reduce((n, t) => n + Math.max(0, d[t] ?? 0), 0);
          if (!total) return;
          // Whoever scored keeps only their even share; leftovers land on random teammates, never on the scorer.
          const scorers = new Set(fx.targets.filter((t) => (d[t] ?? 0) > 0));
          const each = Math.floor(total / fx.targets.length);
          const rest = total - each * fx.targets.length;
          const pool = fx.targets.filter((t) => !scorers.has(t));
          for (const t of fx.targets) d[t] = Math.min(0, d[t] ?? 0) + each;
          for (let i = 0; i < rest; i++) {
            const t = pool.length ? pool[api.rng.int(0, pool.length - 1)]! : fx.targets[i % fx.targets.length]!;
            d[t]! += 1;
          }
        },
      },
    },
  },
  {
    id: 'score.team-swap',
    name: 'Changing Rooms',
    category: 'score',
    description: 'Your team and another team swap scores, best player for best player, down the line.',
    target: 'enemy-team',
    needs: [...S, 'teams'],
    cost: 75,
    cooldownMs: 150_000,
    apply: (api, c) => {
      const mineId = api.teamOf(c.caster);
      if (!mineId) return { error: 'You are not on a team.' };
      const mine = api.ranked().filter((id) => api.teamOf(id) === mineId);
      const theirs = api.ranked().filter((id) => c.targets.includes(id));
      const n = Math.min(mine.length, theirs.length);
      if (Array.from({ length: n }, (_, i) => api.score(mine[i]!) === api.score(theirs[i]!)).every(Boolean)) return { error: 'The two teams have the same scores, so swapping would change nothing.' };
      for (let i = 0; i < n; i++) swap(api, mine[i]!, theirs[i]!);
    },
  },
];

defineCheats([...instant, ...lasting, ...teams]);
