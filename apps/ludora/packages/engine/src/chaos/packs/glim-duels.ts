import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';
import { odds, rollOdds, scaleGain, share, target, transfer } from '../cheats/kit.ts';
import { CHARGE_CAP, HEALTH_OPTIONS, MEND_HEAL, SHADOW_NAME } from '../../modes/glim-duels/meta.ts';
import { creditOf, hitDamage, pairFighters, type Duel, type Pairing, type Side } from '../../modes/glim-duels/index.ts';

/*
 * Cheats that only make sense in Glim Duels: they work the duels themselves
 * (health, shields, power strikes, charge, the hits as they land), the
 * pairings for the next round, and the Shadow Glim.
 *
 * Health, charge and damage go through the adapter's meters where they belong
 * to a player; the Shadow Glim has no meter, so its side is written directly
 * (cheats that may touch it cannot be undone). Chaos never knocks a Glim out
 * and never ends a duel: health it takes away stops at 1, and a hit that
 * already knocked a Glim out is left as it was. Shields and power strikes
 * only appear when powers are on, as in the mode.
 */

const MODE = 'glim-duels';
const MODES = [MODE] as const;
const HEALTH = ['meter:health'] as const;
const POWERS = ['meter:health', 'powers'] as const;
const CHARGE = ['meter:charge', 'powers'] as const;
/** Shadow duels come from the pairings, which follow the standings (points). */
const SHADOW_NEEDS = ['meter:score', 'meter:health'] as const;
const SHADOW_TIMER = 'shadow';

/* -------------------------------- helpers ------------------------------- */

interface Seat {
  duel: Duel;
  i: 0 | 1;
  me: Side;
  rival: Side;
}

const maxHealth = (api: ChaosApi): number => {
  const n = Number(api.ctx.settings.health);
  return (HEALTH_OPTIONS as readonly number[]).includes(n) ? n : 100;
};
const big = (api: ChaosApi) => api.ctx.settings.damage === 'big';
const clash = (api: ChaosApi) => Boolean(api.ctx.settings.teamClash) && api.teams().length >= 2;

/** A player's seat in their current duel (over or not). */
function seatOf(api: ChaosApi, id: string): Seat | null {
  const duelId = api.s.fighters[id]?.duel;
  const duel: Duel | undefined = duelId ? api.s.duels.find((d: Duel) => d.id === duelId) : undefined;
  if (!duel) return null;
  const i = duel.sides[0].id === id ? 0 : duel.sides[1].id === id ? 1 : null;
  if (i === null) return null;
  return { duel, i, me: duel.sides[i], rival: duel.sides[1 - i]! };
}

/** A player's seat in a duel that is still being fought. */
function liveSeat(api: ChaosApi, id: string): Seat | null {
  const seat = seatOf(api, id);
  return seat && !seat.duel.over ? seat : null;
}

/** A live seat, or the refusal when there is none. `other` words it for a target rather than the caster. */
function needLive(api: ChaosApi, id: string, other?: 'them'): Seat | { error: string } {
  return liveSeat(api, id) ?? { error: `${other ? `${api.name(id)} is` : 'You are'} not in a duel that is still being fought.` };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const sideName = (api: ChaosApi, side: Side) => (side.id ? api.name(side.id) : `the ${SHADOW_NAME}`);

/** Lower a side's health by up to `amount`, never below 1. Players go through the health meter; the Shadow Glim is written directly. */
function lower(api: ChaosApi, side: Side, amount: number): number {
  const take = Math.max(0, Math.min(amount, side.health - 1));
  if (take <= 0) return 0;
  if (side.id) return -api.add('health', side.id, -take);
  side.health -= take;
  return take;
}

/** Raise a side's health by up to `amount`, never above the duel's starting health. */
function raise(api: ChaosApi, side: Side, amount: number): number {
  const give = Math.max(0, Math.min(amount, maxHealth(api) - side.health));
  if (give <= 0) return 0;
  if (side.id) return api.add('health', side.id, give);
  side.health += give;
  return give;
}

/** Add damage to a hit the caster just landed: the rival loses it (never below 1) and it counts as damage dealt. */
function boostHit(api: ChaosApi, fx: ActiveEffect, d: Record<string, number>, extra: number) {
  const seat = liveSeat(api, fx.caster);
  if (!seat || extra <= 0) return;
  const added = lower(api, seat.rival, extra);
  if (!added) return;
  seat.me.dealt += added;
  d[fx.caster] = (d[fx.caster] ?? 0) + added;
}

/** The hit a player landed on the question that just closed, if it is the one being resolved now. */
function freshHit(api: ChaosApi, seat: Seat) {
  const last = seat.duel.last;
  if (!last || last.at !== api.s.sync.round) return null;
  return last.hits[seat.i];
}

const powerAction = (a: unknown) => (a as { type?: string } | null)?.type === 'power';

/** Pairings for the next round, ready to change. */
function nextPairs(api: ChaosApi): Pairing[] | { error: string } {
  const next: Pairing[] | null = api.s.next;
  if (!next || api.s.finished) return { error: 'The next round\'s pairings are not out yet. Try between duel rounds.' };
  return next.map((p) => [p[0], p[1]] as Pairing);
}

const partner = (pair: Pairing, id: string) => (pair[0] === id ? pair[1] : pair[0]);

/**
 * Pair two loose players with each other. When Team Clash forbids it they are left planned against the
 * Shadow Glim, which the mode's own settlePairings re-pairs among themselves when the round starts.
 */
function pairLoose(api: ChaosApi, pairs: Pairing[], a: string | null, b: string | null) {
  if (a && b && !(clash(api) && api.teamOf(a) === api.teamOf(b))) pairs.push([a, b]);
  else {
    if (a) pairs.push([a, null]);
    if (b) pairs.push([b, null]);
  }
}

/** Re-arm the Shadow Glim's lock-in timer the way the mode does after its answers change. */
function armShadow(api: ChaosApi) {
  const s = api.s;
  const due = (s.duels as Duel[]).filter((d) => d.shadow && !d.shadow.answered).map((d) => s.sync.startedAt + d.shadow!.ms);
  if (due.length && s.sync.phase === 'question') api.ctx.setTimer(SHADOW_TIMER, Math.min(...due));
  else api.ctx.clearTimer(SHADOW_TIMER);
}

/* ------------------------------- instant -------------------------------- */

const instant: CheatDef[] = [
  {
    id: 'glim-duels.second-wind',
    name: 'Duellist\'s Second Wind',
    category: 'advantage',
    description: 'Your Glim goes back to full health in the duel you are fighting.',
    target: 'self',
    modes: MODES,
    needs: HEALTH,
    cost: 40,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const seat = needLive(api, c.caster);
      if ('error' in seat) return seat;
      if (seat.me.health >= maxHealth(api)) return { error: 'Your Glim is already at full health.' };
      api.set('health', c.caster, maxHealth(api));
    },
  },
  {
    id: 'glim-duels.duel-leech',
    name: 'Duelling Leech',
    category: 'advantage',
    description: 'Drain 20% of the duel\'s starting health from your rival\'s Glim (it stops at 1) and add it to yours (up to full health).',
    target: 'self',
    modes: MODES,
    needs: HEALTH,
    cost: 35,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const seat = needLive(api, c.caster);
      if ('error' in seat) return seat;
      const taken = lower(api, seat.rival, share(maxHealth(api), 20));
      if (!taken) return { error: `${sideName(api, seat.rival)} is down to 1 health already.` };
      const healed = raise(api, seat.me, taken);
      api.feed(`Duelling Leech: ${api.name(c.caster)} drained ${taken} health from ${sideName(api, seat.rival)} and healed ${healed}.`, 'big');
    },
  },
  {
    id: 'glim-duels.health-swap',
    name: 'Duel Health Swap',
    category: 'advantage',
    description: 'Your Glim and your rival\'s swap health. Only when your rival has more.',
    target: 'self',
    modes: MODES,
    needs: HEALTH,
    cost: 45,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const seat = needLive(api, c.caster);
      if ('error' in seat) return seat;
      const mine = seat.me.health;
      const theirs = seat.rival.health;
      if (theirs <= mine) return { error: 'Your rival does not have more health than you.' };
      api.set('health', c.caster, theirs);
      if (seat.rival.id) api.set('health', seat.rival.id, mine);
      else seat.rival.health = mine;
      api.feed(`Duel Health Swap: ${api.name(c.caster)} (${mine}) and ${sideName(api, seat.rival)} (${theirs}) swapped health.`, 'big');
    },
  },
  {
    id: 'glim-duels.hex-bolt',
    name: 'Duel Hex Bolt',
    category: 'troll',
    description: 'An opponent\'s Glim loses 25% of the duel\'s starting health. It never drops below 1, so it cannot knock them out.',
    target: 'opponent',
    modes: MODES,
    needs: HEALTH,
    cost: 30,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const t = target(c);
      const seat = needLive(api, t, 'them');
      if ('error' in seat) return seat;
      const lost = lower(api, seat.me, share(maxHealth(api), 25));
      if (!lost) return { error: `${api.name(t)}'s Glim is down to 1 health already.` };
      api.feed(`Duel Hex Bolt: ${api.name(t)}'s Glim lost ${lost} health.`, 'bad');
    },
  },
  {
    id: 'glim-duels.aegis',
    name: 'Duel Aegis',
    category: 'advantage',
    description: 'Your Glim raises a shield now, for free. Like the power, it blocks the next hit on you.',
    target: 'self',
    modes: MODES,
    needs: POWERS,
    cost: 25,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const seat = needLive(api, c.caster);
      if ('error' in seat) return seat;
      if (seat.me.shield) return { error: 'Your shield is already up.' };
      seat.me.shield = true;
    },
  },
  {
    id: 'glim-duels.overdrive',
    name: 'Duel Overdrive',
    category: 'advantage',
    description: 'Your Glim readies a power strike now, for free: your next hit does double damage.',
    target: 'self',
    modes: MODES,
    needs: POWERS,
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const seat = needLive(api, c.caster);
      if ('error' in seat) return seat;
      if (seat.me.strike) return { error: 'Your power strike is already ready.' };
      seat.me.strike = true;
    },
  },
  {
    id: 'glim-duels.shatter',
    name: 'Duel Shield Shatter',
    category: 'troll',
    description: 'Breaks the shield an opponent\'s Glim has raised.',
    target: 'opponent',
    modes: MODES,
    needs: POWERS,
    cost: 20,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const seat = needLive(api, t, 'them');
      if ('error' in seat) return seat;
      if (!seat.me.shield) return { error: `${api.name(t)} has no shield up.` };
      seat.me.shield = false;
      api.feed(`Duel Shield Shatter: ${api.name(t)}'s shield broke.`, 'bad');
    },
  },
  {
    id: 'glim-duels.strike-thief',
    name: 'Duel Strike Thief',
    category: 'troll',
    description: 'Take an opponent\'s ready power strike: it leaves their Glim and readies on yours.',
    target: 'opponent',
    modes: MODES,
    needs: POWERS,
    cost: 30,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const theirs = needLive(api, t, 'them');
      if ('error' in theirs) return theirs;
      const mine = needLive(api, c.caster);
      if ('error' in mine) return mine;
      if (!theirs.me.strike) return { error: `${api.name(t)} has no power strike ready.` };
      if (mine.me.strike) return { error: 'You already have a power strike ready.' };
      theirs.me.strike = false;
      mine.me.strike = true;
      api.feed(`Duel Strike Thief: ${api.name(c.caster)} stole ${api.name(t)}'s power strike.`, 'bad');
    },
  },
  {
    id: 'glim-duels.overcharge',
    name: 'Duel Overcharge',
    category: 'economy',
    description: `Your charge fills to the most you can hold (${CHARGE_CAP}).`,
    target: 'self',
    modes: MODES,
    needs: CHARGE,
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      if (!api.set('charge', c.caster, CHARGE_CAP)) return { error: 'Your charge is already full.' };
    },
  },
  {
    id: 'glim-duels.charge-leech',
    name: 'Duel Charge Leech',
    category: 'economy',
    description: `Take all of an opponent's charge, as much as you can hold (up to ${CHARGE_CAP}).`,
    target: 'opponent',
    modes: MODES,
    needs: CHARGE,
    cost: 25,
    cooldownMs: 35_000,
    apply: (api, c) => {
      const t = target(c);
      const has = api.get('charge', t);
      if (has <= 0) return { error: `${api.name(t)} has no charge.` };
      const got = transfer(api, 'charge', t, c.caster, has);
      if (!got) return { error: 'Your charge is already full.' };
      api.feed(`Duel Charge Leech: ${api.name(c.caster)} took ${got} charge from ${api.name(t)}.`, 'bad');
    },
  },
  {
    id: 'glim-duels.roulette',
    name: 'Duel Roulette',
    category: 'random',
    description: `Spin for your duel. Odds: ${odds([['your Glim raises a free shield', 30], ['your Glim readies a free power strike', 30], ['your rival\'s Glim loses 15% of starting health', 25], ['your own Glim loses 15% of starting health', 15]])}. Health never drops below 1. Needs your shield down, no strike ready, and both Glims above 1 health.`,
    target: 'self',
    modes: MODES,
    needs: POWERS,
    cost: 20,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const seat = needLive(api, c.caster);
      if ('error' in seat) return seat;
      if (seat.me.shield || seat.me.strike || seat.me.health <= 1 || seat.rival.health <= 1) {
        return { error: 'The wheel needs your shield down, no strike ready, and both Glims above 1 health.' };
      }
      const roll = rollOdds<'shield' | 'strike' | 'rival' | 'self'>(api, [['shield', 30], ['strike', 30], ['rival', 25], ['self', 15]]);
      const hit = share(maxHealth(api), 15);
      if (roll === 'shield') seat.me.shield = true;
      else if (roll === 'strike') seat.me.strike = true;
      else if (roll === 'rival') lower(api, seat.rival, hit);
      else lower(api, seat.me, hit);
      const text = { shield: 'a free shield', strike: 'a free power strike', rival: `${sideName(api, seat.rival)} loses health`, self: 'their own Glim loses health' }[roll];
      api.feed(`Duel Roulette: ${api.name(c.caster)} spun ${text}.`, roll === 'self' ? 'bad' : 'good');
    },
  },
];

/* ------------------------- pairings and the Shadow ---------------------- */

const pairing: CheatDef[] = [
  {
    id: 'glim-duels.call-out',
    name: 'Duel Call-Out',
    category: 'troll',
    description: 'Between duel rounds: you and the opponent you pick will duel each other next round. The rivals you were each meant to face are paired with each other instead (in Team Clash, if they are teammates, the mode finds them new rivals when the round starts).',
    target: 'opponent',
    modes: MODES,
    needs: ['meter:score'],
    cost: 40,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const pairs = nextPairs(api);
      if ('error' in pairs) return pairs;
      const mine = pairs.find((p) => p[0] === c.caster || p[1] === c.caster);
      const theirs = pairs.find((p) => p[0] === t || p[1] === t);
      if (!mine || !theirs) return { error: 'One of you is not in the next round\'s pairings yet.' };
      if (mine === theirs) return { error: `You are already meant to duel ${api.name(t)}.` };
      if (clash(api) && api.teamOf(c.caster) === api.teamOf(t)) return { error: 'Team Clash duels are always between two teams.' };
      const p = partner(mine, c.caster);
      const q = partner(theirs, t);
      const kept = pairs.filter((x) => x !== mine && x !== theirs);
      kept.push([c.caster, t]);
      pairLoose(api, kept, p, q);
      api.s.next = kept;
      api.feed(`Duel Call-Out: ${api.name(c.caster)} will duel ${api.name(t)} next round.`, 'big');
    },
  },
  {
    id: 'glim-duels.seat-swap',
    name: 'Duel Seat Swap',
    category: 'troll',
    description: 'Swap seats with an opponent who is fighting another duel: you take over their Glim (health, shield and strike) against their rival, and they take over yours. Not in Team Clash.',
    target: 'opponent',
    modes: MODES,
    needs: HEALTH,
    cost: 50,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api, c) => {
      if (clash(api)) return { error: 'Team Clash duels must stay between two teams, so seats cannot be swapped.' };
      const t = target(c);
      const a = needLive(api, c.caster);
      if ('error' in a) return a;
      const b = needLive(api, t, 'them');
      if ('error' in b) return b;
      if (a.duel === b.duel) return { error: `${api.name(t)} is your own rival: there is no seat to swap.` };
      const f = api.s.fighters;
      [a.me.id, b.me.id] = [t, c.caster];
      [a.me.name, b.me.name] = [b.me.name, a.me.name];
      [f[c.caster].duel, f[t].duel] = [b.duel.id, a.duel.id];
      // Keep the mode's bookkeeping in step: rivals faced (for rematches) and duels against the Shadow Glim.
      for (const [who, rival] of [
        [c.caster, b.rival.id],
        [t, a.rival.id],
      ] as const) {
        if (rival === null) {
          f[who].shadowDuels++;
          continue;
        }
        if (!f[who].faced.includes(rival)) f[who].faced.push(rival);
        if (f[rival] && !f[rival].faced.includes(who)) f[rival].faced.push(who);
      }
      if (a.rival.id === null) f[c.caster].shadowDuels = Math.max(0, f[c.caster].shadowDuels - 1);
      if (b.rival.id === null) f[t].shadowDuels = Math.max(0, f[t].shadowDuels - 1);
      api.feed(`Duel Seat Swap: ${api.name(c.caster)} and ${api.name(t)} swapped duels.`, 'big');
    },
  },
  {
    id: 'glim-duels.shadow-fumble',
    name: 'Shadow Glim Fumble',
    category: 'advantage',
    description: 'If you are duelling the Shadow Glim, its answer to the question that is open now turns wrong, so it lands no hit on you.',
    target: 'self',
    modes: MODES,
    needs: SHADOW_NEEDS,
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const seat = needLive(api, c.caster);
      if ('error' in seat) return seat;
      if (seat.rival.id !== null) return { error: 'You are not duelling the Shadow Glim.' };
      const sh = seat.duel.shadow;
      if (api.s.sync.phase !== 'question' || !sh) return { error: 'Wait for a question to open.' };
      if (!sh.correct) return { error: 'The Shadow Glim is already going to miss this one.' };
      sh.correct = false;
    },
  },
  {
    id: 'glim-duels.shadow-surge',
    name: 'Shadow Glim Surge',
    category: 'troll',
    description: 'In every duel against the Shadow Glim except your own, the Shadow locks in a right answer to the open question at once (as fast as it can answer, so it hits hard).',
    target: 'room',
    hostile: true,
    modes: MODES,
    needs: SHADOW_NEEDS,
    cost: 30,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const sync = api.s.sync;
      if (sync.phase !== 'question') return { error: 'Wait for a question to open.' };
      const duels = (api.s.duels as Duel[]).filter((d) => !d.over && d.shadow && d.sides[1].id === null && d.sides[0].id !== c.caster);
      if (!duels.length) return { error: 'Nobody else is duelling the Shadow Glim right now.' };
      const at = Math.max(0, api.now() - sync.startedAt);
      const surged = duels.filter((d) => !(d.shadow!.correct && d.shadow!.answered));
      if (!surged.length) return { error: 'The Shadow Glim has already answered right in every Shadow duel.' };
      for (const d of surged) {
        const sh = d.shadow!;
        sh.correct = true;
        sh.answered = true;
        sh.ms = Math.min(sh.ms, at);
      }
      armShadow(api);
      const victims = surged.map((d) => sideName(api, d.sides[0]));
      api.feed(`Shadow Glim Surge: the Shadow Glim answered at once against ${victims.join(', ')}.`, 'bad');
    },
  },
  {
    id: 'glim-duels.pairing-scramble',
    name: 'Duel Pairing Scramble',
    category: 'round',
    description: 'Between duel rounds: the next round\'s pairings are drawn again at random, whatever the standings. Rematches are still avoided where they can be, Team Clash duels stay between two teams, and the Shadow Glim still goes to whoever has met it least.',
    target: 'room',
    modes: MODES,
    needs: ['meter:score'],
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const pairs = nextPairs(api);
      if ('error' in pairs) return pairs;
      const ids = pairs.flatMap((p) => (p[1] ? [p[0], p[1]] : [p[0]]));
      const key = (ps: readonly Pairing[]) =>
        ps
          .map((p) => [p[0], p[1] ?? ''].sort().join('+'))
          .sort()
          .join('|');
      const before = key(pairs);
      // The mode's own pairing, with every player on level terms: only the random tiebreak orders them.
      for (let i = 0; i < 12; i++) {
        const entries = ids.map((id) => {
          const f = api.s.fighters[id];
          return { id, points: 0, dealt: 0, tie: api.rng.next(), team: api.teamOf(id), shadowDuels: f?.shadowDuels ?? 0, faced: f?.faced ?? [] };
        });
        const drawn = pairFighters(entries, clash(api));
        if (key(drawn) === before) continue;
        api.s.next = drawn;
        api.feed('Duel Pairing Scramble: the next round\'s pairings were drawn again at random.', 'big');
        return;
      }
      return { error: 'The pairings came out the same however they were drawn.' };
    },
  },
];

/* ------------------------------- lasting -------------------------------- */

const lasting: CheatDef[] = [
  {
    id: 'glim-duels.short-circuit',
    name: 'Duel Short Circuit',
    category: 'troll',
    description: 'For 20 seconds, an opponent cannot use powers (shield, power strike or mend). Needs them to have some charge.',
    target: 'opponent',
    modes: MODES,
    needs: CHARGE,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    apply: (api, c) => (api.get('charge', target(c)) > 0 ? undefined : { error: `${api.name(target(c))} has no charge to use anyway.` }),
    hooks: {
      gate: (_api, _fx, _id, action) => (powerAction(action) ? { block: 'Short circuit: your powers are out for a few seconds.' } : undefined),
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Short circuit: no powers', until: fx.endsAt }),
  },
  {
    id: 'glim-duels.spark-tax',
    name: 'Duel Spark Tax',
    category: 'economy',
    description: 'For 30 seconds, every charge an opponent earns goes to you instead, while you have room to hold it. Needs room on both sides to start.',
    target: 'opponent',
    modes: MODES,
    needs: CHARGE,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 30_000,
    priority: 10,
    apply: (api, c) => {
      if (api.get('charge', target(c)) >= CHARGE_CAP) return { error: `${api.name(target(c))} is full of charge, so there is nothing for them to earn.` };
      if (api.get('charge', c.caster) >= CHARGE_CAP) return { error: 'Your charge is full: there is no room for theirs.' };
    },
    hooks: {
      delta: {
        charge: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) <= 0 || !api.ids().includes(fx.caster)) return;
          // The state already holds this reveal's charge for the caster too.
          const room = CHARGE_CAP - api.get('charge', fx.caster);
          const cut = Math.min(d[t]!, room);
          if (cut <= 0) return;
          d[t]! -= cut;
          d[fx.caster] = (d[fx.caster] ?? 0) + cut;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Spark tax: your charge goes elsewhere', tone: 'bad' }),
  },
  {
    id: 'glim-duels.spark-refund',
    name: 'Duel Spark Refund',
    category: 'economy',
    description: 'For 30 seconds, every power you use hands 1 charge back.',
    target: 'self',
    modes: MODES,
    needs: CHARGE,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 30_000,
    priority: 40,
    hooks: {
      delta: {
        // Charge only goes down in this mode when a power spends it.
        charge: (_api, fx, d) => void ((d[fx.caster] ?? 0) < 0 && (d[fx.caster]! += 1)),
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Spark refund: powers give 1 charge back', tone: 'good' }),
  },
  {
    id: 'glim-duels.ever-shield',
    name: 'Everlasting Duel Aegis',
    category: 'advantage',
    description: 'For 30 seconds, your Glim\'s shield is up: it rises now, and whenever a hit breaks it, it rises again within a second.',
    target: 'self',
    modes: MODES,
    needs: POWERS,
    cost: 55,
    cooldownMs: 90_000,
    durationMs: 30_000,
    tickMs: 1000,
    stacking: 'reject',
    apply: (api, c) => {
      const seat = needLive(api, c.caster);
      if ('error' in seat) return seat;
      seat.me.shield = true;
    },
    hooks: {
      tick: (api, fx) => {
        const seat = liveSeat(api, fx.caster);
        if (seat && !seat.me.shield) seat.me.shield = true;
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Everlasting shield', until: fx.endsAt }),
  },
  {
    id: 'glim-duels.fury',
    name: 'Duel Fury',
    category: 'advantage',
    description: 'For 20 seconds, your hits land 50% harder. The extra never knocks a Glim out: it stops at 1 health.',
    target: 'self',
    modes: MODES,
    needs: HEALTH,
    cost: 35,
    cooldownMs: 50_000,
    durationMs: 20_000,
    priority: 20,
    hooks: {
      delta: {
        dealt: (api, fx, d) => {
          const dmg = d[fx.caster] ?? 0;
          if (dmg > 0) boostHit(api, fx, d, scaleGain(dmg, 1.5) - dmg);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Fury: hits ×1.5', tone: 'good' }),
  },
  {
    id: 'glim-duels.lightning',
    name: 'Duel Lightning Reflexes',
    category: 'advantage',
    description: 'For 25 seconds, your hits land as if you had answered the moment the question opened (the full speed bonus). The extra never knocks a Glim out: it stops at 1 health.',
    target: 'self',
    modes: MODES,
    needs: HEALTH,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 25_000,
    priority: 20,
    hooks: {
      delta: {
        dealt: (api, fx, d) => {
          if ((d[fx.caster] ?? 0) <= 0) return;
          const seat = liveSeat(api, fx.caster);
          const h = seat ? freshHit(api, seat) : null;
          const a = api.s.sync.answers[fx.caster];
          if (!h || h.blocked || h.dmg <= 0 || !a) return;
          const full = hitDamage({ credit: creditOf(a), responseMs: 0, limitMs: 1 }, { big: big(api), strike: h.strike });
          boostHit(api, fx, d, full - h.raw);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Lightning reflexes', tone: 'good' }),
  },
  {
    id: 'glim-duels.vampire',
    name: 'Vampire Duellist',
    category: 'advantage',
    description: 'For 25 seconds, every hit you land heals your own Glim by half its damage (never above full health), while your duel goes on.',
    target: 'self',
    modes: MODES,
    needs: HEALTH,
    cost: 35,
    cooldownMs: 50_000,
    durationMs: 25_000,
    priority: 30,
    hooks: {
      delta: {
        dealt: (api, fx, d) => {
          const dmg = d[fx.caster] ?? 0;
          const seat = liveSeat(api, fx.caster);
          if (dmg > 0 && seat) raise(api, seat.me, Math.max(1, Math.floor(dmg / 2)));
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Vampire: hits heal you', tone: 'good' }),
  },
  {
    id: 'glim-duels.thorns',
    name: 'Thorned Duellist',
    category: 'advantage',
    description: 'For 25 seconds, whenever your Glim takes damage, your rival\'s Glim takes half as much (never below 1), while your duel goes on.',
    target: 'self',
    modes: MODES,
    needs: HEALTH,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 25_000,
    priority: 25,
    hooks: {
      delta: {
        health: (api, fx, d) => {
          const took = -(d[fx.caster] ?? 0);
          const seat = liveSeat(api, fx.caster);
          if (took <= 0 || !seat) return;
          const back = Math.ceil(took / 2);
          // A player rival's change is written back through the meter (which stops at 1); the Shadow Glim directly.
          if (seat.rival.id) d[seat.rival.id] = (d[seat.rival.id] ?? 0) - back;
          else seat.rival.health = Math.max(1, seat.rival.health - back);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Thorns', tone: 'good' }),
  },
  {
    id: 'glim-duels.jinx',
    name: 'Jinxed Duellist',
    category: 'troll',
    description: 'For 20 seconds, an opponent\'s hits do half damage: the rest goes back to the Glim they hit. A hit that already knocked a Glim out still stands.',
    target: 'opponent',
    modes: MODES,
    needs: HEALTH,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 30,
    hooks: {
      delta: {
        dealt: (api, fx, d) => {
          const t = target(fx);
          const dmg = d[t] ?? 0;
          const seat = liveSeat(api, t);
          if (dmg <= 0 || !seat) return;
          const back = raise(api, seat.rival, dmg - scaleGain(dmg, 0.5));
          if (!back) return;
          seat.me.dealt -= back;
          d[t] = dmg - back;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Jinxed: half damage', tone: 'bad' }),
  },
  {
    id: 'glim-duels.static-shock',
    name: 'Duel Static Shock',
    category: 'troll',
    description: 'For 20 seconds, every hit you land also takes 1 charge from the Glim you hit (the Shadow Glim has none, so this needs a player rival).',
    target: 'self',
    modes: MODES,
    needs: POWERS,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 30,
    apply: (api, c) => {
      const seat = needLive(api, c.caster);
      if ('error' in seat) return seat;
      if (seat.rival.id === null) return { error: 'The Shadow Glim has no charge to shock away.' };
    },
    hooks: {
      delta: {
        dealt: (api, fx, d) => {
          const seat = seatOf(api, fx.caster);
          if ((d[fx.caster] ?? 0) > 0 && seat?.rival.id) api.add('charge', seat.rival.id, -1);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Static shock', tone: 'good' }),
  },
  {
    id: 'glim-duels.regen',
    name: 'Duelling Regen',
    category: 'advantage',
    description: 'For 20 seconds, your Glim heals 4% of the duel\'s starting health every 2 seconds (never above full).',
    target: 'self',
    modes: MODES,
    needs: HEALTH,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 20_000,
    tickMs: 2_000,
    stacking: 'reject',
    apply: (api, c) => {
      const seat = needLive(api, c.caster);
      return 'error' in seat ? seat : undefined;
    },
    hooks: {
      tick: (api, fx) => {
        const seat = liveSeat(api, fx.caster);
        if (seat) raise(api, seat.me, share(maxHealth(api), 4));
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Regenerating', until: fx.endsAt }),
  },
  {
    id: 'glim-duels.rot',
    name: 'Duelling Rot',
    category: 'troll',
    description: 'For 20 seconds, an opponent\'s Glim loses 4% of the duel\'s starting health every 2 seconds. It never drops below 1, so it cannot knock them out.',
    target: 'opponent',
    modes: MODES,
    needs: HEALTH,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 20_000,
    tickMs: 2_000,
    stacking: 'reject',
    apply: (api, c) => {
      const seat = needLive(api, target(c), 'them');
      if ('error' in seat) return seat;
      if (seat.me.health <= 1) return { error: `${api.name(target(c))}'s Glim is down to 1 health already.` };
    },
    hooks: {
      tick: (api, fx) => {
        const seat = liveSeat(api, target(fx));
        if (seat) lower(api, seat.me, share(maxHealth(api), 4));
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Your Glim is rotting', until: fx.endsAt }),
  },
  {
    id: 'glim-duels.mirror-shield',
    name: 'Duel Mirror Shield',
    category: 'advantage',
    description: 'Polish your raised shield into a mirror: within 30 seconds, the first hit a shield of yours blocks also bounces back onto the Glim that threw it, for the hit\'s full damage (it stops at 1 health), while your duel goes on. Needs your shield up.',
    target: 'self',
    modes: MODES,
    needs: POWERS,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 30_000,
    tickMs: 250,
    stacking: 'reject',
    apply: (api, c, fx) => {
      const seat = needLive(api, c.caster);
      if ('error' in seat) return seat;
      if (!seat.me.shield) return { error: 'Raise a shield first: the mirror needs one to polish.' };
      fx!.data.duel = seat.duel.id;
      fx!.data.seen = seat.duel.last?.at ?? -1;
    },
    hooks: {
      // Hits land at the reveal; the mirror looks at each new one just after.
      tick: (api, fx) => {
        const seat = liveSeat(api, fx.caster);
        if (!seat || seat.duel.id !== fx.data.duel) return void api.endEffect(fx.eid, 'used');
        const last = seat.duel.last;
        if (!last || last.at === fx.data.seen) return;
        fx.data.seen = last.at;
        const h = last.hits[(1 - seat.i) as 0 | 1];
        if (!h?.blocked || h.raw <= 0) return;
        const back = lower(api, seat.rival, h.raw);
        if (back) {
          seat.me.dealt += back;
          api.add('dealt', fx.caster, back);
          api.feed(`Duel Mirror Shield: ${api.name(fx.caster)}'s shield bounced ${back} damage back at ${sideName(api, seat.rival)}.`, 'big');
        }
        api.endEffect(fx.eid, 'used');
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Mirror shield: a blocked hit bounces back', tone: 'good' }),
  },
  {
    id: 'glim-duels.spark-sponge',
    name: 'Duel Spark Sponge',
    category: 'economy',
    description: `For 25 seconds, every time your Glim takes damage in your duel, you soak up 1 charge (up to the most you can hold, ${CHARGE_CAP}).`,
    target: 'self',
    modes: MODES,
    needs: ['meter:health', 'meter:charge', 'powers'],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 25_000,
    // After thorns (25), so damage they add counts too.
    priority: 35,
    apply: (api, c) => {
      const seat = needLive(api, c.caster);
      if ('error' in seat) return seat;
      if (api.get('charge', c.caster) >= CHARGE_CAP) return { error: 'Your charge is already full.' };
    },
    hooks: {
      delta: {
        // Health only goes down in a mode move when a hit lands.
        health: (api, fx, d) => {
          if ((d[fx.caster] ?? 0) < 0 && liveSeat(api, fx.caster)) api.add('charge', fx.caster, 1);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Spark sponge: hits on you give charge', tone: 'good' }),
  },
  {
    id: 'glim-duels.golden-mend',
    name: 'Duel Golden Mend',
    category: 'advantage',
    description: `For 30 seconds, every mend you use heals twice as much: ${MEND_HEAL * 2} health instead of ${MEND_HEAL} (never above full health). It costs the usual charge.`,
    target: 'self',
    modes: MODES,
    needs: POWERS,
    cost: 25,
    cooldownMs: 50_000,
    durationMs: 30_000,
    apply: (api, c) => {
      const seat = needLive(api, c.caster);
      return 'error' in seat ? seat : undefined;
    },
    hooks: {
      delta: {
        health: (api, fx, d) => {
          const me = fx.caster;
          // A mend is the only mode move that raises health while a question is open (a new duel starts before its powers are used).
          if ((d[me] ?? 0) <= 0 || api.s.sync.phase !== 'question' || api.s.used[me] !== 'mend' || !liveSeat(api, me)) return;
          d[me]! += MEND_HEAL;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: `Golden mend: mends heal ${MEND_HEAL * 2}`, tone: 'good' }),
  },
  {
    id: 'glim-duels.daredevil',
    name: 'Duel Daredevil Stance',
    category: 'advantage',
    description: 'For 20 seconds, your hits land twice as hard, and so do hits on your Glim. The extra on either side never knocks a Glim out: it stops at 1 health.',
    target: 'self',
    modes: MODES,
    needs: HEALTH,
    cost: 30,
    cooldownMs: 50_000,
    durationMs: 20_000,
    priority: 20,
    apply: (api, c) => {
      const seat = needLive(api, c.caster);
      return 'error' in seat ? seat : undefined;
    },
    hooks: {
      delta: {
        dealt: (api, fx, d) => {
          const dmg = d[fx.caster] ?? 0;
          if (dmg > 0) boostHit(api, fx, d, dmg);
        },
        // The health meter stops at 1 while the duel goes on; a hit that already knocked the Glim out ended the duel and stands.
        health: (api, fx, d) => {
          const took = -(d[fx.caster] ?? 0);
          if (took > 0 && liveSeat(api, fx.caster)) d[fx.caster]! -= took;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Daredevil: every hit ×2, yours and theirs', tone: 'info' }),
  },
  {
    id: 'glim-duels.wager',
    name: 'Duel Wager',
    category: 'score',
    description: 'Bet on the duel you are fighting: if you win it, you score 2 extra points; if you lose it, you lose 1 point (if you have one); a draw changes nothing. If the duel is still going after 4 minutes, the bet is off.',
    target: 'self',
    modes: MODES,
    needs: ['meter:score', 'meter:health'],
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 240_000,
    tickMs: 500,
    stacking: 'reject',
    apply: (api, c, fx) => {
      const seat = needLive(api, c.caster);
      if ('error' in seat) return seat;
      fx!.data.duel = seat.duel.id;
      fx!.data.side = seat.i;
    },
    hooks: {
      // A finished duel stays in the state until the next round starts, long after the half-second this waits.
      tick: (api, fx) => {
        const duel = (api.s.duels as Duel[]).find((x) => x.id === fx.data.duel);
        if (!duel) return void api.endEffect(fx.eid, 'used');
        if (!duel.over) return;
        api.endEffect(fx.eid, 'used');
        const me = fx.caster;
        if (duel.winner === fx.data.side) {
          const got = api.addScore(me, 2);
          api.feed(`Duel Wager: ${api.name(me)} won their duel and the bet, +${plural(got, 'point')}.`, 'good');
        } else if (duel.winner === 'draw') {
          api.feed('Duel Wager: your duel was a draw, so the bet changes nothing.', 'info', [me]);
        } else {
          const lost = -api.addScore(me, -1);
          api.feed(lost ? `Duel Wager: ${api.name(me)} lost their duel and the bet, −1 point.` : 'Duel Wager: you lost the duel, but had no point to lose.', lost ? 'bad' : 'info', lost ? undefined : [me]);
        }
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Duel wager: win +2, lose −1', tone: 'info' }),
  },
];

const cheats: CheatDef[] = [...instant, ...pairing, ...lasting];

defineCheats(cheats);
