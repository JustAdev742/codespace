import { defineCheats } from '../registry.ts';
import type { ChaosApi, CheatDef } from '../types.ts';
import { odds, rollOdds, share, target } from '../cheats/kit.ts';

/*
 * Cheats that only make sense in gloom-giant: they wound or heal the giant,
 * crack or mend the shield the room shares, calm or provoke its rage, and
 * tamper with hits, streaks and critical hits. Every cheat here has modes:
 * ['gloom-giant'] and an id starting with 'gloom-giant.'.
 *
 * The battle is co-operative. Chaos may help or hinder a player, the room or
 * the giant, but the adapter's meters keep the giant on at least 1 health and
 * the shield on at least 1, so a cheat never wins or loses the battle: the
 * final blow and the shattered shield are always the mode's own moments.
 * The score meter is each fighter's damage; a hit in the mode raises it,
 * and its delta hooks see who hit. The read-only 'misses' meter shows who
 * answered wrong (and let the giant strike).
 */

const MODE = 'gloom-giant';

interface Fighter {
  stream: { streak: number; correct: number; last: { text?: string } | null };
  damage: number;
  hits: number;
  crits: number;
  misses: number;
}

interface Blow {
  seq: number;
  playerId: string;
  kind: 'hit' | 'crit' | 'strike';
  amount: number;
  at: number;
}

const fighter = (api: ChaosApi, id: string): Fighter | undefined => api.s.fighters[id];
const over = (api: ChaosApi) => api.s.result !== null;
const hp = (api: ChaosApi) => api.get('giantHp', 'game');
const maxHp = (api: ChaosApi): number => api.s.maxHp;
const shield = (api: ChaosApi) => api.get('shield', 'game');
const shieldMax = (api: ChaosApi): number => api.s.shieldMax;

/** Wound the giant by up to `n` (it always keeps at least 1 health). Returns the damage dealt. */
function wound(api: ChaosApi, n: number): number {
  return -api.add('giantHp', 'game', -n);
}

/** Wound the giant and credit the damage dealt to a fighter. Not for use inside a score delta hook. */
function strike(api: ChaosApi, id: string, n: number): number {
  const dealt = wound(api, n);
  if (dealt) api.add('score', id, dealt);
  return dealt;
}

/** The blow the mode logged for this player in this transaction, if any. */
function blowNow(api: ChaosApi, id: string, kind?: Blow['kind']): Blow | null {
  const b = (api.s.log as Blow[]).at(-1);
  return b && b.playerId === id && b.at === api.now() && (!kind || (kind === 'strike') === (b.kind === 'strike')) ? b : null;
}

function note(api: ChaosApi, id: string, text: string) {
  const last = fighter(api, id)?.stream.last;
  if (last) last.text = last.text ? `${last.text} · ${text}` : text;
}

const noFinish = (api: ChaosApi) => (hp(api) <= 1 ? { error: 'The giant is barely standing. The final blow has to be a real answer.' } : null);

/** Weighted pick from the rows that can happen right now (weights need not sum to 100). */
function pickPossible<T>(api: ChaosApi, rows: readonly [T, number, boolean][]): T | null {
  const ok = rows.filter((r) => r[2]);
  const total = ok.reduce((n, r) => n + r[1], 0);
  if (!total) return null;
  let r = api.rng.next() * total;
  for (const [v, w] of ok) {
    if (r < w) return v;
    r -= w;
  }
  return ok[ok.length - 1]![0];
}

const GIANT = ['giant'] as const;

const instant: CheatDef[] = [
  {
    id: 'gloom-giant.ballista',
    name: 'Giant-Slayer Ballista',
    category: 'advantage',
    description: 'Fire a ballista bolt at the giant: it takes 6% of its full health in damage, credited to you. It never lands the final blow.',
    target: 'self',
    modes: [MODE],
    needs: GIANT,
    cost: 30,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const no = noFinish(api);
      if (no) return no;
      const dealt = strike(api, c.caster, share(maxHp(api), 6));
      api.feed(`${api.name(c.caster)}'s ballista bolt hit the Gloom Giant for ${dealt}.`, 'good');
    },
  },
  {
    id: 'gloom-giant.reckless-charge',
    name: 'Reckless Giant Charge',
    category: 'economy',
    description: 'Charge in without cover: the shield loses 2, and the giant takes 10% of its full health in damage, credited to you. Needs a shield of at least 3.',
    target: 'self',
    modes: [MODE],
    needs: GIANT,
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      if (shield(api) < 3) return { error: 'The shield is too weak to charge without it.' };
      const no = noFinish(api);
      if (no) return no;
      api.add('shield', 'game', -2);
      const dealt = strike(api, c.caster, share(maxHp(api), 10));
      api.feed(`${api.name(c.caster)} charged recklessly: the giant took ${dealt} damage and the shield lost 2.`, 'info');
    },
  },
  {
    id: 'gloom-giant.sacrifice',
    name: 'Gloomfight Sacrifice',
    category: 'economy',
    description: 'Give up 15% of your damage to mend the shared shield by up to 2.',
    target: 'self',
    hostile: false,
    modes: [MODE],
    needs: GIANT,
    cost: 15,
    cooldownMs: 30_000,
    apply: (api, c) => {
      if (shield(api) >= shieldMax(api)) return { error: 'The shield is already at full strength.' };
      const mine = api.score(c.caster);
      if (mine <= 0) return { error: 'You have no damage to give up yet.' };
      api.addScore(c.caster, -share(mine, 15));
      const mended = api.add('shield', 'game', 2);
      api.feed(`${api.name(c.caster)} gave up some glory to mend the shield by ${mended}.`, 'good');
    },
  },
  {
    id: 'gloom-giant.shield-patch',
    name: 'Gloom Shield Patch',
    category: 'advantage',
    description: 'Patch the shared shield: it mends by 2, up to the strength it started with.',
    target: 'room',
    modes: [MODE],
    needs: GIANT,
    cost: 30,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const mended = api.add('shield', 'game', 2);
      if (!mended) return { error: 'The shield is already at full strength.' };
      api.feed(`${api.name(c.caster)} patched the shield (+${mended}).`, 'good');
    },
  },
  {
    id: 'gloom-giant.shield-crack',
    name: 'Gloom Shield Crack',
    category: 'troll',
    description: 'Crack the shield the room shares: it loses 2 (it never breaks below 1).',
    target: 'room',
    hostile: true,
    modes: [MODE],
    needs: GIANT,
    cost: 30,
    cooldownMs: 45_000,
    apply: (api) => {
      const lost = -api.add('shield', 'game', -2);
      if (!lost) return { error: 'The shield is down to its last point. It cannot crack further.' };
      api.feed(`Something cracked the shield (−${lost}).`, 'bad');
    },
  },
  {
    id: 'gloom-giant.feast',
    name: 'Giant\'s Feast',
    category: 'troll',
    description: 'Feed the Gloom Giant: it heals 8% of its full health.',
    target: 'room',
    hostile: true,
    modes: [MODE],
    needs: GIANT,
    cost: 30,
    cooldownMs: 45_000,
    apply: (api) => {
      const healed = api.add('giantHp', 'game', share(maxHp(api), 8));
      if (!healed) return { error: 'The giant is already at full health.' };
      api.feed(`The Gloom Giant feasted and healed ${healed}.`, 'bad');
    },
  },
  {
    id: 'gloom-giant.poke',
    name: 'Poke the Giant',
    category: 'troll',
    description: 'Poke the Gloom Giant awake: it is enraged from now on, so every wrong answer costs 2 shield instead of 1. Only before it is already enraged.',
    target: 'room',
    hostile: true,
    modes: [MODE],
    needs: GIANT,
    undoable: false,
    cost: 35,
    cooldownMs: 90_000,
    apply: (api) => {
      if (api.s.enraged) return { error: 'The giant is already enraged.' };
      api.s.enraged = true;
      api.feed('Someone poked the Gloom Giant. It is enraged! Wrong answers now cost 2 shield.', 'bad');
    },
  },
  {
    id: 'gloom-giant.war-drums',
    name: 'Giant War Drums',
    category: 'advantage',
    description: 'Beat the war drums: every player\'s streak rises to at least 2, so their next correct answer gets the streak bonus (+1 damage). A streak never passes a player\'s correct answers.',
    target: 'everyone',
    modes: [MODE],
    needs: ['giant', 'meter:streak'],
    cost: 30,
    cooldownMs: 60_000,
    apply: (api) => {
      let raised = 0;
      for (const id of api.ids()) if (api.get('streak', id) < 2 && api.set('streak', id, 2) > 0) raised++;
      if (!raised) return { error: 'Every streak is already long enough (or nobody has answered enough yet).' };
      api.feed(`The war drums raised ${raised} ${raised === 1 ? 'streak' : 'streaks'}.`, 'good');
    },
  },
  {
    id: 'gloom-giant.stagger',
    name: 'Giant\'s Stagger',
    category: 'troll',
    description: 'Stagger another fighter: their streak drops to zero, so they lose the streak bonus until they build it again.',
    target: 'opponent',
    modes: [MODE],
    needs: ['giant', 'meter:streak'],
    cost: 15,
    cooldownMs: 25_000,
    apply: (api, c) => {
      const t = target(c);
      if (api.get('streak', t) === 0) return { error: `${api.name(t)} has no streak to break.` };
      api.set('streak', t, 0);
    },
  },
  {
    id: 'gloom-giant.hourglass',
    name: 'Giant\'s Hourglass',
    category: 'round',
    description: 'Turn the hourglass: the room gets 20 more seconds to bring the giant down.',
    target: 'room',
    modes: [MODE],
    needs: GIANT,
    undoable: false,
    cost: 35,
    cooldownMs: 90_000,
    apply: (api) => {
      const s = api.s;
      if (s.endsAt === null) return { error: 'This battle has no clock.' };
      s.endsAt += 20_000;
      api.ctx.setTimer('time', s.endsAt);
      api.feed('The hourglass turned: 20 more seconds to bring down the giant.', 'good');
    },
  },
  {
    id: 'gloom-giant.wild-swing',
    name: 'Giant Wild Swing',
    category: 'random',
    description: `Take a wild swing at the giant. Odds: ${odds([['a crushing blow for 10% of its full health', 25], ['a hit for 4%', 50], ['a miss that lets it heal 4% (a hit for 4% if it is at full health)', 25]])}. Damage is credited to you.`,
    target: 'self',
    modes: [MODE],
    needs: GIANT,
    cost: 20,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const no = noFinish(api);
      if (no) return no;
      const roll = rollOdds(api, [['crush', 25], ['hit', 50], ['miss', 25]] as const);
      if (roll === 'miss' && hp(api) < maxHp(api)) {
        const healed = api.add('giantHp', 'game', share(maxHp(api), 4));
        api.feed(`${api.name(c.caster)} swung wild and missed. The giant healed ${healed}.`, 'bad');
        return;
      }
      const dealt = strike(api, c.caster, share(maxHp(api), roll === 'crush' ? 10 : 4));
      api.feed(`${api.name(c.caster)}'s wild swing ${roll === 'crush' ? 'crushed' : 'hit'} the giant for ${dealt}.`, 'good');
    },
  },
  {
    id: 'gloom-giant.roulette',
    name: 'Gloom Roulette',
    category: 'random',
    description: `Spin the gloom wheel. Odds: ${odds([['the giant takes 6% of its full health (credited to you)', 30], ['the giant heals 6%', 25], ['the shield mends by 2', 25], ['the shield cracks by 1', 20]])}. An outcome that cannot happen right now is skipped and the wheel spins again.`,
    target: 'room',
    modes: [MODE],
    needs: GIANT,
    cost: 20,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const roll = pickPossible(api, [
        ['wound', 30, hp(api) > 1],
        ['heal', 25, hp(api) < maxHp(api)],
        ['mend', 25, shield(api) < shieldMax(api)],
        ['crack', 20, shield(api) > 1],
      ] as const);
      if (roll === 'wound') api.feed(`Gloom Roulette: the giant took ${strike(api, c.caster, share(maxHp(api), 6))} damage.`, 'good');
      else if (roll === 'heal') api.feed(`Gloom Roulette: the giant healed ${api.add('giantHp', 'game', share(maxHp(api), 6))}.`, 'bad');
      else if (roll === 'mend') api.feed(`Gloom Roulette: the shield mended by ${api.add('shield', 'game', 2)}.`, 'good');
      else if (roll === 'crack') api.feed(`Gloom Roulette: the shield cracked by ${-api.add('shield', 'game', -1)}.`, 'bad');
      else return { error: 'The wheel is stuck: nothing it could land on can happen right now.' };
    },
  },
];

const lasting: CheatDef[] = [
  {
    id: 'gloom-giant.haymaker',
    name: 'Giant Haymaker',
    category: 'advantage',
    description: 'Wind up a haymaker: your next hit on the giant (within 30 seconds) deals three times its damage. It never lands the final blow by itself.',
    target: 'self',
    modes: [MODE],
    needs: GIANT,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 30_000,
    priority: 20,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const me = fx.caster;
          if ((d[me] ?? 0) <= 0 || over(api)) return;
          const extra = wound(api, d[me]! * 2);
          if (!extra) return;
          d[me]! += extra;
          const b = blowNow(api, me, 'hit');
          if (b) b.amount += extra;
          note(api, me, `haymaker +${extra}`);
          api.feed(`${api.name(me)} landed a haymaker on the giant (+${extra}).`, 'good');
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Haymaker ready: next hit ×3', tone: 'good' }),
  },
  {
    id: 'gloom-giant.giantsbane-edge',
    name: 'Giantsbane Edge',
    category: 'advantage',
    description: 'For 20 seconds, every hit you land that is not already a critical hit becomes one (+1 damage).',
    target: 'self',
    modes: [MODE],
    needs: GIANT,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 20,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const me = fx.caster;
          if ((d[me] ?? 0) <= 0 || over(api)) return;
          const b = blowNow(api, me, 'hit');
          if (!b || b.kind === 'crit') return;
          const extra = wound(api, 1);
          if (!extra) return;
          d[me]! += extra;
          b.kind = 'crit';
          b.amount += extra;
          fighter(api, me)!.crits++;
          note(api, me, 'Giantsbane Edge: critical hit');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Giantsbane Edge: every hit is critical', tone: 'good' }),
  },
  {
    id: 'gloom-giant.blunted-blade',
    name: 'Gloom-Blunted Blade',
    category: 'troll',
    description: 'For 15 seconds, another fighter\'s blade is blunted: each of their hits deals only 1 damage, so streak and critical bonuses do nothing.',
    target: 'opponent',
    modes: [MODE],
    needs: GIANT,
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 15_000,
    priority: 40,
    hooks: {
      delta: {
        score: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) <= 1 || over(api)) return;
          const refund = d[t]! - 1;
          api.add('giantHp', 'game', refund);
          d[t] = 1;
          const b = blowNow(api, t, 'hit');
          if (b) {
            if (b.kind === 'crit') fighter(api, t)!.crits--;
            b.kind = 'hit';
            b.amount = 1;
          }
          const last = fighter(api, t)?.stream.last;
          if (last) last.text = 'Hit for 1 (blunted blade)';
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Blunted blade: hits deal 1', tone: 'bad' }),
  },
  {
    id: 'gloom-giant.thick-hide',
    name: 'Thick Gloom Hide',
    category: 'troll',
    description: 'For 12 seconds the giant\'s hide thickens: every hit anyone lands deals 1 less damage (a 1-damage hit does nothing).',
    target: 'room',
    hostile: true,
    modes: [MODE],
    needs: GIANT,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 12_000,
    priority: 45,
    hooks: {
      delta: {
        score: (api, _fx, d) => {
          if (over(api)) return;
          for (const [id, n] of Object.entries(d)) {
            if (n <= 0 || !blowNow(api, id, 'hit')) continue;
            api.add('giantHp', 'game', 1);
            d[id] = n - 1;
            const b = blowNow(api, id, 'hit')!;
            b.amount = Math.max(0, b.amount - 1);
            note(api, id, 'thick hide: −1');
          }
        },
      },
    },
    overlay: () => ({ kind: 'banner', text: 'Thick hide: every hit deals 1 less', tone: 'bad' }),
  },
  {
    id: 'gloom-giant.decoy',
    name: 'Giant\'s Decoy',
    category: 'advantage',
    description: 'For 15 seconds you draw the giant\'s attention: whenever a wrong answer (anyone\'s) would break shield, you pay 2 of your damage per point instead and the shield is untouched, while you have enough damage to pay.',
    target: 'self',
    hostile: false,
    modes: [MODE],
    needs: GIANT,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 15_000,
    priority: 20,
    apply: (api, c) => (api.score(c.caster) >= 2 ? undefined : { error: 'You need at least 2 damage to pay for a decoy.' }),
    hooks: {
      delta: {
        shield: (api, fx, d) => {
          const cost = -(d.game ?? 0);
          if (over(api) || cost <= 0 || api.score(fx.caster) < cost * 2) return;
          api.addScore(fx.caster, -cost * 2);
          d.game = 0;
          const b = (api.s.log as Blow[]).at(-1);
          if (b && b.kind === 'strike' && b.at === api.now()) {
            const last = fighter(api, b.playerId)?.stream.last;
            if (last) last.text = `${api.name(fx.caster)}'s decoy took the giant's strike`;
          }
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Decoy: you take the giant\'s strikes', tone: 'info' }),
  },
  {
    id: 'gloom-giant.mender',
    name: 'Gloom Shield Mender',
    category: 'advantage',
    description: 'For 20 seconds, every correct answer you give also mends the shared shield by 1, up to the strength it started with.',
    target: 'self',
    modes: [MODE],
    needs: GIANT,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    apply: (api) => (shield(api) >= shieldMax(api) ? { error: 'The shield is already at full strength.' } : undefined),
    hooks: {
      delta: {
        score: (api, fx, d) => {
          if ((d[fx.caster] ?? 0) <= 0 || over(api)) return;
          if (api.add('shield', 'game', 1)) note(api, fx.caster, 'Gloom Shield Mender: shield +1');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Shield mender: your hits mend the shield', tone: 'good' }),
  },
  {
    id: 'gloom-giant.ward',
    name: 'Giant Ward',
    category: 'advantage',
    description: 'For 20 seconds, your own wrong answers do not hurt the shield: the giant\'s strike is turned aside. (A strike that would shatter the shield still shatters it.)',
    target: 'self',
    modes: [MODE],
    needs: ['giant', 'meter:misses'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    hooks: {
      delta: {
        misses: (api, fx, d) => {
          const me = fx.caster;
          if ((d[me] ?? 0) <= 0 || over(api)) return;
          const b = blowNow(api, me, 'strike');
          if (!b) return;
          if (!api.add('shield', 'game', b.amount)) return;
          api.s.log = (api.s.log as Blow[]).filter((x) => x !== b);
          const last = fighter(api, me)?.stream.last;
          if (last) last.text = 'Giant Ward turned the giant\'s strike aside';
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Giant Ward: your misses are safe', tone: 'good' }),
  },
  {
    id: 'gloom-giant.lullaby',
    name: 'Giant Lullaby',
    category: 'advantage',
    description: 'For 15 seconds, sing the enraged giant half to sleep: its strikes cost the shield 1 instead of 2. Only while it is enraged.',
    target: 'room',
    modes: [MODE],
    needs: GIANT,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 15_000,
    priority: 40,
    apply: (api) => (api.s.enraged ? undefined : { error: 'The giant is not enraged. Its strikes already cost 1.' }),
    hooks: {
      delta: {
        shield: (api, _fx, d) => {
          if (over(api) || !api.s.enraged || (d.game ?? 0) > -2) return;
          d.game! += 1;
          const b = (api.s.log as Blow[]).at(-1);
          if (b && b.kind === 'strike' && b.at === api.now()) {
            b.amount = Math.max(1, b.amount - 1);
            const last = fighter(api, b.playerId)?.stream.last;
            if (last) last.text = `The giant struck the shield (−${b.amount}, lullaby)`;
          }
        },
      },
    },
    overlay: () => ({ kind: 'banner', text: 'The giant is drowsy: strikes cost 1', tone: 'good' }),
  },
  {
    id: 'gloom-giant.jinx',
    name: 'Gloom Jinx',
    category: 'troll',
    description: 'For 20 seconds, another fighter is jinxed: each of their wrong answers lets the giant strike the shield a second time (the shield never breaks below 1 this way).',
    target: 'opponent',
    modes: [MODE],
    needs: ['giant', 'meter:misses'],
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 20_000,
    hooks: {
      delta: {
        misses: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) <= 0 || over(api)) return;
          const b = blowNow(api, t, 'strike');
          if (!b) return;
          const extra = -api.add('shield', 'game', -b.amount);
          if (!extra) return;
          b.amount += extra;
          note(api, t, `jinxed: the giant struck again (−${extra})`);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Jinxed: your misses hit twice', tone: 'bad' }),
  },
  {
    id: 'gloom-giant.thorns',
    name: 'Thorned Gloom Shield',
    category: 'advantage',
    description: 'For 15 seconds the shield grows thorns: every time the giant strikes it, the giant takes the same damage back, credited to the player whose wrong answer it was.',
    target: 'room',
    modes: [MODE],
    needs: ['giant', 'meter:misses'],
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 15_000,
    hooks: {
      delta: {
        misses: (api, _fx, d) => {
          if (over(api)) return;
          for (const [id, n] of Object.entries(d)) {
            if (n <= 0) continue;
            const b = blowNow(api, id, 'strike');
            if (!b) continue;
            const dealt = strike(api, id, b.amount);
            if (dealt) note(api, id, `the thorns hit the giant back for ${dealt}`);
          }
        },
      },
    },
    overlay: () => ({ kind: 'banner', text: 'Thorned shield: strikes hurt the giant too', tone: 'good' }),
  },
  {
    id: 'gloom-giant.vampire',
    name: 'Vampire Giant',
    category: 'troll',
    description: 'For 15 seconds the giant drinks from the shield: every point of shield its strikes break heals it 1 health.',
    target: 'room',
    hostile: true,
    modes: [MODE],
    needs: GIANT,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 15_000,
    priority: 60,
    hooks: {
      delta: {
        shield: (api, _fx, d) => {
          if (over(api) || (d.game ?? 0) >= 0) return;
          const healed = api.add('giantHp', 'game', -d.game!);
          if (healed) api.feed(`The vampire giant drank ${healed} health from the shield.`, 'bad');
        },
      },
    },
    overlay: () => ({ kind: 'banner', text: 'Vampire giant: strikes heal it', tone: 'bad' }),
  },
  {
    id: 'gloom-giant.poisoned-wounds',
    name: 'Giantbane Poison',
    category: 'advantage',
    description: 'For 16 seconds the giant\'s wounds are poisoned: it cannot heal at all. Needs Healing Giant on.',
    target: 'room',
    modes: [MODE],
    needs: ['giant', 'regen'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 16_000,
    priority: 40,
    apply: (api) => (hp(api) >= maxHp(api) ? { error: 'The giant has no wounds to poison yet.' } : undefined),
    hooks: {
      delta: {
        giantHp: (api, _fx, d) => {
          if (over(api) || (d.game ?? 0) <= 0) return;
          d.game = 0;
          api.feed('The poison stopped the Gloom Giant from healing.', 'good');
        },
      },
    },
    overlay: () => ({ kind: 'banner', text: 'Giantbane poison: the giant cannot heal', tone: 'good' }),
  },
  {
    id: 'gloom-giant.grudge',
    name: 'Giant\'s Grudge',
    category: 'troll',
    description: 'For 20 seconds the giant holds a grudge against another fighter: every 4 seconds it swats them, taking 1 of their damage and healing itself 1.',
    target: 'opponent',
    modes: [MODE],
    needs: GIANT,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    tickMs: 4_000,
    apply: (api, c) => (api.score(target(c)) > 0 ? undefined : { error: `${api.name(target(c))} has not dealt any damage to lose.` }),
    hooks: {
      tick: (api, fx) => {
        if (over(api)) return;
        api.addScore(target(fx), -1);
        api.add('giantHp', 'game', 1);
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'The giant holds a grudge against you', until: fx.endsAt }),
  },
  {
    id: 'gloom-giant.stomp',
    name: 'Giant Stomp',
    category: 'troll',
    description: 'The giant stomps next to another fighter: for 6 seconds they are knocked off their feet and cannot answer.',
    target: 'opponent',
    modes: [MODE],
    needs: GIANT,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 6_000,
    hooks: { gate: () => ({ block: 'The giant\'s stomp knocked you off your feet! Wait a moment.' }) },
    overlay: (fx) => ({ kind: 'countdown', label: 'Knocked down by a stomp', until: fx.endsAt }),
  },
];

defineCheats([...instant, ...lasting]);
