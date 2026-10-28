import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';
import { odds, rollOdds, share, target } from '../cheats/kit.ts';
import { MAPS, pathInReach, spotProgress, type GuardMap, type MapId } from '../../modes/lantern-guard/maps.ts';
import { firstFighter, flareCost, HP_SCALE, roomFactor, variantFactor, waveHp } from '../../modes/lantern-guard/index.ts';
import {
  DIFFICULTY_HP,
  FLARE_BURN,
  FLARE_BURN_BOSS,
  FLARE_SLOW_MS,
  GLOOMLINGS,
  MAX_LEVEL,
  TICK_MS,
  TOWER_ORDER,
  TOWER_SETS,
  TOWERS,
  towerStats,
  upgradeCost,
  WAVE_GOLD,
  type GloomKind,
  type TowerKind,
} from '../../modes/lantern-guard/units.ts';

/*
 * Cheats that only make sense in Lantern Guard: they work on towers (build,
 * upgrade, sell, move, retool, reload), on the gloomlings on the road (slow,
 * push back, scorch, shrink, banish, add one), on the waves' clock, on the
 * Great Lantern's flare, and on each guard's own gold.
 *
 * Lantern Guard is co-operative, so the trolls hinder one guard (their gold,
 * their towers' reload, their right to build, who gets the credit) rather
 * than the shared battle. The mode's rules, kept here:
 *  - Chaos never defeats a gloomling except through the Great Lantern's own
 *    flare: scorched ones keep at least 1 health so a tower lands the last hit.
 *    A gloomling that does leave the road (flare, banish) is taken off its
 *    wave's count, as the mode does, so waves are still held exactly once.
 *  - A gloomling chaos adds joins the wave that is still open, and only while
 *    the Great Lantern has more lights than everything on the road could put
 *    out with it: chaos never puts the last light in reach.
 *  - The wave clock is never pushed so late that time could run out before
 *    the waves do (that would hand the class a win).
 *  - Guard points come from gold spent, so gold chaos hands back from a
 *    purchase is taken off what that guard spent.
 */

const MODE = 'lantern-guard';
const M = [MODE] as const;
const GOLD = ['meter:currency'] as const;
const FLARE = ['meter:flare'] as const;
const id = (slug: string) => `${MODE}.${slug}`;

/* -------------------------------- helpers -------------------------------- */

const guardOf = (api: ChaosApi, pid: string): any => api.s.guards?.[pid] ?? null;

function mapOf(api: ChaosApi): GuardMap {
  const m = String(api.ctx.settings.map);
  return MAPS[(m in MAPS ? m : 'river') as MapId];
}

function allowed(api: ChaosApi): readonly TowerKind[] {
  return TOWER_SETS[String(api.ctx.settings.towers)] ?? TOWER_SETS.all!;
}

const connected = (api: ChaosApi) => api.players().filter((p) => p.connected).length;
const live = (api: ChaosApi): any[] => api.s.gloom.filter((g: any) => g.hp > 0);
const towersOf = (api: ChaosApi, pid: string): any[] => api.s.towers.filter((t: any) => t.by === pid);
const CLAIM = `${MODE}.claim-jump`;
/** Towers a guard really owns: not ones they have only claimed for a while with Claim Jump. */
function ownTowers(api: ChaosApi, pid: string): any[] {
  const claimed = new Set(api.effects().filter((e) => e.cheatId === CLAIM && e.caster === pid).map((e) => e.data.spot));
  return towersOf(api, pid).filter((t) => !claimed.has(t.spot));
}
const towerName = (t: { kind: TowerKind }) => TOWERS[t.kind].name;
/** Map points of road a tower of this reach sees from a spot. */
const reach = (api: ChaosApi, spot: number, range: number) => pathInReach(mapOf(api), mapOf(api).spots[spot]!, range);
const freeSpots = (api: ChaosApi) => mapOf(api).spots.map((_, i) => i).filter((i) => !api.s.towers.some((t: any) => t.spot === i));

/** The free spot that sees the most road for a tower of this kind (where the room's bots would build). */
function bestFreeSpot(api: ChaosApi, kind: TowerKind): number | null {
  const range = towerStats(kind, 1).range;
  const free = freeSpots(api);
  return free.length ? free.reduce((a, b) => (reach(api, b, range) > reach(api, a, range) ? b : a)) : null;
}

/** Lowest level first, then the cheapest kind. */
const weakestFirst = (a: any, b: any) => a.level - b.level || TOWERS[a.kind as TowerKind].cost - TOWERS[b.kind as TowerKind].cost;

function noRoad(api: ChaosApi): { error: string } | null {
  return live(api).length ? null : { error: 'There are no gloomlings on the road.' };
}

function addLog(api: ChaosApi, entry: Record<string, unknown>) {
  const s = api.s;
  s.seq++;
  s.log = [...s.log, { ...entry, at: api.now(), seq: s.seq }].slice(-10);
}

function noTowers(api: ChaosApi, pid: string, you: boolean): { error: string } | null {
  return towersOf(api, pid).length ? null : { error: you ? 'You have no towers.' : `${api.name(pid)} has no towers.` };
}

/** Health a gloomling of this kind would have if it set off now in this wave (as the mode works it out). */
function hpFor(api: ChaosApi, kind: GloomKind, wave: number): number {
  const st = api.ctx.settings as any;
  const n = connected(api);
  const tough = roomFactor(n) * variantFactor(st, n) * (DIFFICULTY_HP[st.difficulty] ?? 1) * mapOf(api).toughness * HP_SCALE;
  return Math.max(1, Math.round(GLOOMLINGS[kind].hp * waveHp(wave) * tough));
}

/** Why a gloomling of this kind cannot join the road now, or null. */
function cannotAdd(api: ChaosApi, kind: GloomKind): string | null {
  const s = api.s;
  if (!((s.open[String(s.wave)] ?? 0) > 0)) return 'No wave is marching right now.';
  const atStake = live(api).reduce((n: number, g: any) => n + GLOOMLINGS[g.kind as GloomKind].lights, 0) + GLOOMLINGS[kind].lights;
  if (atStake >= s.lights) return 'The Great Lantern is too low on lights for another gloomling.';
  return null;
}

/** True when the road holds the night's last gloomlings: the last wave, nothing still to set off. */
function lastOfTheNight(api: ChaosApi): boolean {
  const s = api.s;
  return !api.ctx.settings.endless && s.nextWaveAt === null && !s.spawns.length;
}

function addGloomling(api: ChaosApi, kind: GloomKind): number {
  const s = api.s;
  const road = api.rng.int(0, mapOf(api).paths.length - 1);
  const maxHp = hpFor(api, kind, s.wave);
  s.nextId++;
  s.gloom.push({ id: s.nextId, kind, road, p: 0, hp: maxHp, maxHp, slowUntil: 0, wave: s.wave });
  s.open[String(s.wave)] = (s.open[String(s.wave)] ?? 0) + 1;
  return road;
}

/** Take gloomlings off the road and off their waves' counts, as the mode does with the defeated. */
function removeFromRoad(api: ChaosApi, gone: any[]) {
  const s = api.s;
  s.gloom = s.gloom.filter((g: any) => !gone.includes(g));
  for (const g of gone) s.open[String(g.wave)] = (s.open[String(g.wave)] ?? 1) - 1;
}

/** Add gold to the flare pot for a guard, counting them among its givers. */
function intoFlare(api: ChaosApi, pid: string | null, gold: number): number {
  const put = api.add('flare', 'game', gold);
  if (put > 0 && pid && !api.s.flare.givers.includes(pid)) api.s.flare.givers = [...api.s.flare.givers, pid];
  return put;
}

/** Log entries the mode has written since this effect last looked. */
function freshLog(api: ChaosApi, fx: ActiveEffect): any[] {
  const from = Number(fx.data.logSeq ?? 0);
  fx.data.logSeq = api.s.seq;
  return api.s.log.filter((e: any) => e.seq > from);
}

/** The gold a build or upgrade log entry cost. */
function priceOf(e: any): number {
  if (e.kind === 'build') return TOWERS[e.tower as TowerKind].cost;
  if (e.kind === 'upgrade') return upgradeCost(e.tower, e.level - 1) ?? 0;
  return 0;
}

const remember = (fx: ActiveEffect | null, data: Record<string, unknown>) => void (fx && Object.assign(fx.data, data));

/* --------------------------------- gold --------------------------------- */

const gold: CheatDef[] = [
  {
    id: id('gold-loan'),
    name: 'Guard’s Gold Loan',
    category: 'economy',
    description: 'Borrow 40 gold now. When 45 seconds are up (or you stop it early) the loan is paid back out of your gold, as much of the 40 as you have then; anything you cannot pay is forgiven.',
    target: 'self',
    modes: M,
    needs: GOLD,
    cost: 30,
    cooldownMs: 90_000,
    durationMs: 45_000,
    stacking: 'reject',
    apply: (api, c, fx) => {
      api.add('currency', c.caster, 40);
      remember(fx, { owed: 40 });
    },
    hooks: {
      end: (api, fx, reason) => {
        // Undo already took the 40 back; a guard who left owes nothing.
        if (reason === 'undone' || reason === 'left') return;
        const paid = -api.add('currency', fx.caster, -Number(fx.data.owed ?? 0));
        api.feed(paid ? `You paid back ${paid} gold of your loan.` : 'Your loan was forgiven: you had no gold to pay it back.', 'info', [fx.caster]);
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Loan due: 40 gold', until: fx.endsAt }),
  },
  {
    id: id('butterfingers'),
    name: 'Gold Fumble',
    category: 'troll',
    description: 'For 20 seconds, half the gold an opponent earns from each right answer slips through their fingers into the Great Lantern’s flare pot (counted as their gift). Once the pot is full they keep it all.',
    target: 'opponent',
    modes: M,
    needs: [...GOLD, ...FLARE],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    priority: 10,
    apply: (api, c, fx) => remember(fx, { correct: guardOf(api, target(c)).stream.correct }),
    hooks: {
      delta: {
        currency: (api, fx, d) => {
          const t = target(fx);
          const g = guardOf(api, t);
          const gained = d[t] ?? 0;
          if (!g || gained <= 0 || g.stream.correct <= Number(fx.data.correct)) return;
          fx.data.correct = g.stream.correct;
          const slipped = intoFlare(api, t, share(gained, 50));
          if (slipped <= 0) return;
          d[t]! -= slipped;
          api.feed(`Gold fumble! ${slipped} of your gold fell into the Great Lantern.`, 'bad', [t]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Gold fumble', tone: 'bad' }),
  },
  {
    id: id('matching-funds'),
    name: 'Matching Funds',
    category: 'economy',
    description: 'For 30 seconds, every time you feed the Great Lantern the same amount of gold is added again, from nowhere (until it is full).',
    target: 'self',
    modes: M,
    needs: FLARE,
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 30_000,
    priority: 20,
    apply: (api, _c, fx) => remember(fx, { logSeq: api.s.seq }),
    hooks: {
      delta: {
        flare: (api, fx, d) => {
          const fed = freshLog(api, fx).filter((e) => e.kind === 'feed' && e.playerId === fx.caster).reduce((n, e) => n + Number(e.gold), 0);
          if ((d.game ?? 0) <= 0 || fed <= 0) return;
          d.game! += fed;
          api.feed(`Matching funds: your ${fed} gold for the Great Lantern was matched.`, 'good', [fx.caster]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Feeds matched', tone: 'good' }),
  },
  {
    id: id('builders-discount'),
    name: 'Builder’s Discount',
    category: 'economy',
    description: 'For 30 seconds, every tower you build or upgrade costs half: half its price is handed straight back to you (and does not count as gold spent).',
    target: 'self',
    modes: M,
    needs: GOLD,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 30_000,
    priority: 50,
    apply: (api, _c, fx) => remember(fx, { logSeq: api.s.seq }),
    hooks: {
      delta: {
        currency: (api, fx, d) => {
          if ((d[fx.caster] ?? 0) >= 0) return;
          const paid = freshLog(api, fx).filter((e) => e.playerId === fx.caster).reduce((n, e) => n + priceOf(e), 0);
          const back = Math.floor(paid / 2);
          if (back <= 0) return;
          d[fx.caster]! += back;
          const g = guardOf(api, fx.caster);
          g.spent = Math.max(0, g.spent - back);
          api.feed(`Builder’s discount: ${back} gold back.`, 'good', [fx.caster]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Half-price towers', tone: 'good' }),
  },
  {
    id: id('war-chest'),
    name: 'Wave Treasure Chest',
    category: 'economy',
    description: `The next wave the class holds (within 90 seconds) pays you three times the usual ${WAVE_GOLD} gold.`,
    target: 'self',
    modes: M,
    needs: GOLD,
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 90_000,
    priority: 20,
    apply: (api, _c, fx) => remember(fx, { held: api.s.held }),
    hooks: {
      delta: {
        currency: (api, fx, d) => {
          if (api.s.held <= Number(fx.data.held) || (d[fx.caster] ?? 0) < WAVE_GOLD) return;
          d[fx.caster]! += 2 * WAVE_GOLD;
          api.feed(`Treasure chest: that wave paid you ${3 * WAVE_GOLD} gold.`, 'good', [fx.caster]);
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Treasure chest: ×3 wave gold', tone: 'good' }),
  },
  {
    id: id('payday-heist'),
    name: 'Payday Heist',
    category: 'troll',
    description: `When the class next holds a wave (within 90 seconds), the ${WAVE_GOLD} gold it pays an opponent goes to you instead.`,
    target: 'opponent',
    modes: M,
    needs: GOLD,
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 90_000,
    priority: 10,
    apply: (api, _c, fx) => remember(fx, { held: api.s.held }),
    hooks: {
      delta: {
        currency: (api, fx, d) => {
          const t = target(fx);
          if (api.s.held <= Number(fx.data.held) || (d[t] ?? 0) < WAVE_GOLD) return;
          d[t]! -= WAVE_GOLD;
          d[fx.caster] = (d[fx.caster] ?? 0) + WAVE_GOLD;
          api.feed(`${api.name(fx.caster)} pulled off a payday heist: ${api.name(t)}’s ${WAVE_GOLD} wave gold went to them.`, 'bad', [t, fx.caster]);
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Payday heist', tone: 'bad' }),
  },
  {
    id: id('gloom-bounty'),
    name: 'Gloom Bounty',
    category: 'economy',
    description: 'For 60 seconds, every gloomling a tower of yours defeats pays you a bounty of 3 gold.',
    target: 'self',
    modes: M,
    needs: GOLD,
    cost: 30,
    cooldownMs: 90_000,
    durationMs: 60_000,
    tickMs: 500,
    apply: (api, c, fx) => noTowers(api, c.caster, true) ?? remember(fx, { defeats: guardOf(api, c.caster).defeats }),
    hooks: {
      tick: (api, fx) => {
        const g = guardOf(api, fx.caster);
        const n = g.defeats - Number(fx.data.defeats);
        if (n <= 0) return;
        fx.data.defeats = g.defeats;
        api.add('currency', fx.caster, 3 * n);
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Bounty: 3 gold a gloomling', tone: 'good' }),
  },
  {
    id: id('lantern-pilfer'),
    name: 'Lantern Pilfer',
    category: 'troll',
    description: 'Pilfer a quarter of the gold in the Great Lantern’s flare pot for yourself. A full lantern you pilfer from is no longer full.',
    target: 'room',
    hostile: true,
    modes: M,
    needs: [...GOLD, ...FLARE],
    cost: 30,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const pot = api.get('flare', 'game');
      if (pot <= 0) return { error: 'The Great Lantern has no gold in it.' };
      const took = -api.add('flare', 'game', -share(pot, 25));
      api.add('currency', c.caster, took);
      api.feed(`${api.name(c.caster)} pilfered ${took} gold from the Great Lantern.`, 'bad');
    },
  },
  {
    id: id('collection-plate'),
    name: 'Collection Plate',
    category: 'economy',
    description: 'Pass round the collection plate: every guard, you included, puts up to 10 of their gold into the Great Lantern’s flare pot, until it is full. Each counts as a giver.',
    target: 'room',
    modes: M,
    needs: [...GOLD, ...FLARE],
    cost: 25,
    cooldownMs: 60_000,
    // It also writes the flare's list of givers.
    undoable: false,
    apply: (api) => {
      if (api.s.flare.charged) return { error: 'The Great Lantern is already full.' };
      let total = 0;
      for (const p of api.ids()) {
        const give = Math.min(10, api.get('currency', p), api.s.flare.cost - api.s.flare.pot);
        if (give <= 0) continue;
        api.add('currency', p, -give);
        total += intoFlare(api, p, give);
      }
      if (!total) return { error: 'Nobody has any gold to give.' };
      api.feed(`The collection plate went round: ${total} gold for the Great Lantern.`, 'good');
    },
  },
  {
    id: id('snuffed-streak'),
    name: 'Snuffed Streak',
    category: 'troll',
    description: 'An opponent’s answer streak is snuffed out back to 0, so they lose the streak bonus gold until they build a new streak.',
    target: 'opponent',
    modes: M,
    cost: 20,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const st = guardOf(api, t)?.stream;
      if (!st?.streak) return { error: `${api.name(t)} has no streak to snuff out.` };
      st.streak = 0;
      api.feed(`${api.name(t)}’s streak was snuffed out.`, 'bad');
    },
  },
];

/* -------------------------------- towers -------------------------------- */

const towers: CheatDef[] = [
  {
    id: id('tower-buyback'),
    name: 'Tower Buyback',
    category: 'economy',
    description: 'Sell back your weakest tower (lowest level, then cheapest): whoever paid for it and its upgrades gets 75% of what they paid back (which no longer counts as gold spent), and its spot is free again. Not the room’s last tower.',
    target: 'self',
    modes: M,
    cost: 20,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const s = api.s;
      const mine = ownTowers(api, c.caster).sort(weakestFirst);
      if (!mine.length) return { error: 'You have no towers to sell.' };
      if (s.towers.length <= 1) return { error: 'That is the only tower guarding the road.' };
      const t = mine[0];
      const paid: [string, number][] = [[c.caster, TOWERS[t.kind as TowerKind].cost], ...t.ups.map((p: string, i: number) => [p, upgradeCost(t.kind, i + 1) ?? 0] as [string, number])];
      for (const [p, gold] of paid) {
        const g = guardOf(api, p);
        if (!g) continue;
        const back = Math.floor(gold * 0.75);
        g.gold += back;
        g.spent = Math.max(0, g.spent - back);
      }
      s.towers = s.towers.filter((x: any) => x !== t);
      api.feed(`${api.name(c.caster)} sold back a level ${t.level} ${towerName(t)} tower.`, 'info');
    },
  },
  {
    id: id('lantern-smith'),
    name: 'Lantern Smith',
    category: 'advantage',
    description: `A lantern smith upgrades your lowest-level tower by one level for free (up to level ${MAX_LEVEL}).`,
    target: 'self',
    modes: M,
    cost: 40,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const t = ownTowers(api, c.caster).filter((x) => x.level < MAX_LEVEL).sort(weakestFirst)[0];
      if (!t) return { error: 'You have no tower to upgrade.' };
      t.level++;
      t.ups.push(c.caster);
      addLog(api, { kind: 'upgrade', playerId: c.caster, tower: t.kind, level: t.level });
      api.feed(`A lantern smith upgraded ${api.name(c.caster)}’s ${towerName(t)} tower to level ${t.level}.`, 'good');
    },
  },
  {
    id: id('lantern-sprout'),
    name: 'Lantern Sprout',
    category: 'advantage',
    description: 'A free level 1 tower sprouts for you on the free spot that sees the most road: a Spark (a Firework when only Frost and Firework towers are used). It is yours, but its price does not count as gold spent.',
    target: 'self',
    modes: M,
    needs: GOLD,
    cost: 50,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api, c) => {
      const kind = firstFighter(allowed(api));
      const spot = bestFreeSpot(api, kind);
      if (spot === null) return { error: 'Every spot beside the road has a tower.' };
      api.s.towers.push({ spot, kind, level: 1, by: c.caster, ups: [], charge: towerStats(kind, 1).every - TICK_MS, shot: null, defeats: 0 });
      guardOf(api, c.caster).built++;
      addLog(api, { kind: 'build', playerId: c.caster, tower: kind });
      api.feed(`A ${TOWERS[kind].name} tower sprouted for ${api.name(c.caster)}.`, 'good');
    },
  },
  {
    id: id('uproot'),
    name: 'Uproot to the Last Line',
    category: 'advantage',
    description: 'Your tower with the fewest defeats is uprooted and replanted, keeping its level, on the free spot nearest the Great Lantern as a last line of defence. Only when that spot is nearer the lantern than where the tower stands.',
    target: 'self',
    modes: M,
    needs: GOLD,
    cost: 25,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const mine = ownTowers(api, c.caster);
      if (!mine.length) return { error: 'You have no towers.' };
      const map = mapOf(api);
      const along = (spot: number) => spotProgress(map, map.spots[spot]!);
      const t = mine.reduce((a, b) => (b.defeats < a.defeats ? b : a));
      const free = freeSpots(api);
      const to = free.length ? free.reduce((a, b) => (along(b) > along(a) ? b : a)) : null;
      if (to === null || along(to) <= along(t.spot)) return { error: 'There is no free spot nearer the Great Lantern than your tower.' };
      t.spot = to;
      t.shot = null;
      api.feed(`${api.name(c.caster)} uprooted a ${towerName(t)} tower to the last line before the Great Lantern.`, 'info');
    },
  },
  {
    id: id('retool'),
    name: 'Retool',
    category: 'economy',
    description: 'Turn your weakest tower of another kind into the kind you choose, at the same level. You pay the difference in build price if the new kind costs more, and get it back if it costs less.',
    target: 'self',
    modes: M,
    needs: GOLD,
    params: [{ key: 'kind', label: 'Tower', kind: 'choice', options: TOWER_ORDER.map((k) => ({ value: k, label: TOWERS[k].name })), default: 'frost' }],
    cost: 25,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const kind = String(c.params.kind) as TowerKind;
      if (!allowed(api).includes(kind)) return { error: `${TOWERS[kind].name} towers are not used in this game.` };
      const t = ownTowers(api, c.caster).filter((x) => x.kind !== kind).sort(weakestFirst)[0];
      if (!t) return { error: `You have no tower to turn into a ${TOWERS[kind].name}.` };
      const g = guardOf(api, c.caster);
      const diff = TOWERS[kind].cost - TOWERS[t.kind as TowerKind].cost;
      if (diff > g.gold) return { error: `You need ${diff - g.gold} more gold for that.` };
      g.gold -= diff;
      g.spent = Math.max(0, g.spent + diff);
      const was = towerName(t);
      t.kind = kind;
      t.charge = towerStats(kind, t.level).every - TICK_MS;
      t.shot = null;
      api.feed(`${api.name(c.caster)} retooled a ${was} tower into a ${TOWERS[kind].name}.`, 'info');
    },
  },
  {
    id: id('claim-jump'),
    name: 'Claim Jump',
    category: 'troll',
    description: 'For 30 seconds an opponent’s best tower (highest level, then most defeats) fights under your name: the gloomlings it defeats count for you. Then it goes back to them.',
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 30_000,
    apply: (api, c, fx) => {
      const t = target(c);
      const best = ownTowers(api, t).sort((a, b) => b.level - a.level || b.defeats - a.defeats)[0];
      if (!best) return { error: `${api.name(t)} has no towers.` };
      best.by = c.caster;
      remember(fx, { spot: best.spot, owner: t });
      api.feed(`${api.name(c.caster)} jumped the claim on ${api.name(t)}’s ${towerName(best)} tower.`, 'bad');
    },
    hooks: {
      end: (api, fx) => {
        const t = api.s.towers.find((x: any) => x.spot === fx.data.spot && x.by === fx.caster);
        if (t) t.by = fx.data.owner;
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Claim jumped', tone: 'bad' }),
  },
  {
    id: id('hand-me-down'),
    name: 'Hand-Me-Down',
    category: 'troll',
    description: 'One upgrade level moves from an opponent’s highest-level tower to your lowest-level tower (up to level 3). No gold changes hands.',
    target: 'opponent',
    modes: M,
    cost: 35,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const from = ownTowers(api, t).filter((x) => x.level > 1).sort((a, b) => b.level - a.level)[0];
      if (!from) return { error: `${api.name(t)} has no upgraded tower.` };
      const to = ownTowers(api, c.caster).filter((x) => x.level < MAX_LEVEL).sort(weakestFirst)[0];
      if (!to) return { error: 'You have no tower that can take another level.' };
      from.level--;
      from.ups.pop();
      to.level++;
      to.ups.push(c.caster);
      api.feed(`${api.name(c.caster)} took a hand-me-down level from ${api.name(t)}’s ${towerName(from)} tower.`, 'bad');
    },
  },
  {
    id: id('overclock'),
    name: 'Overclock',
    category: 'advantage',
    description: 'For 15 seconds your towers reload half as fast again, so they fire about 1.5 times as often.',
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 15_000,
    tickMs: TICK_MS,
    apply: (api, c) => noTowers(api, c.caster, true) ?? undefined,
    hooks: {
      tick: (api, fx) => {
        for (const t of towersOf(api, fx.caster)) {
          const every = towerStats(t.kind, t.level).every;
          t.charge = Math.min(2 * every, t.charge + TICK_MS / 2);
        }
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Towers overclocked', tone: 'good' }),
  },
  {
    id: id('jammed-gears'),
    name: 'Rusted Turrets',
    category: 'troll',
    description: 'For 15 seconds an opponent’s towers reload 40% slower.',
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 15_000,
    tickMs: TICK_MS,
    apply: (api, c) => noTowers(api, target(c), false) ?? undefined,
    hooks: {
      tick: (api, fx) => {
        for (const t of towersOf(api, target(fx))) t.charge = Math.max(0, t.charge - TICK_MS * 0.4);
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Towers jammed', tone: 'bad' }),
  },
  {
    id: id('volley'),
    name: 'Volley',
    category: 'advantage',
    description: 'Every tower in the room finishes reloading at once, so they all fire on the next beat. Only while gloomlings are on the road.',
    target: 'room',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const no = noRoad(api);
      if (no) return no;
      let n = 0;
      for (const t of api.s.towers) {
        const every = towerStats(t.kind, t.level).every;
        if (t.charge < every) {
          t.charge = every;
          n++;
        }
      }
      if (!n) return { error: 'Every tower is already loaded.' };
      api.feed(`${api.name(c.caster)} called a volley: ${n} towers are loaded at once.`, 'good');
    },
  },
  {
    id: id('sharpened-light'),
    name: 'Sharpened Light',
    category: 'advantage',
    description: 'For 15 seconds each shot your towers fire hits the gloomling it aims at for half as much again (a Firework’s splash is not sharpened). Sharpened shots never land the last hit: the tower’s own damage does that.',
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 15_000,
    tickMs: TICK_MS,
    apply: (api, c, fx) => {
      const no = noTowers(api, c.caster, true);
      if (no) return no;
      remember(fx, { shots: Object.fromEntries(towersOf(api, c.caster).map((t) => [t.spot, t.shot?.at ?? 0])) });
    },
    hooks: {
      tick: (api, fx) => {
        const seen = fx.data.shots as Record<string, number>;
        for (const t of towersOf(api, fx.caster)) {
          if (!t.shot || t.shot.at <= (seen[t.spot] ?? 0)) continue;
          seen[t.spot] = t.shot.at;
          const hit = live(api)
            .filter((g) => g.road === t.shot.road && Math.abs(g.p - t.shot.p) < 0.02)
            .sort((a, b) => Math.abs(a.p - t.shot.p) - Math.abs(b.p - t.shot.p))[0];
          if (hit) hit.hp = Math.max(1, hit.hp - towerStats(t.kind, t.level).damage / 2);
        }
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Sharpened light', tone: 'good' }),
  },
  {
    id: id('surveyors-flag'),
    name: 'Surveyor’s Flag',
    category: 'advantage',
    description: 'Plant a flag on the free spot that sees the most road: for 30 seconds nobody but you can build on it.',
    target: 'everyone-else',
    hostile: false,
    modes: M,
    needs: GOLD,
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 30_000,
    apply: (api, _c, fx) => {
      const spot = bestFreeSpot(api, firstFighter(allowed(api)));
      if (spot === null) return { error: 'Every spot beside the road has a tower.' };
      remember(fx, { spot });
    },
    hooks: {
      gate: (_api, fx, _p, a: any) => (a?.type === 'build' && a.spot === fx.data.spot ? { block: 'That spot is flagged for someone else. Pick another.' } : undefined),
    },
    overlayFor: 'all',
    overlay: () => ({ kind: 'badge', text: 'A spot is flagged', tone: 'info' }),
  },
  {
    id: id('red-tape'),
    name: 'Red Tape',
    category: 'troll',
    description: 'For 20 seconds an opponent is tied up in red tape: they cannot build or upgrade towers. Their gold stays theirs.',
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    hooks: {
      gate: (_api, _fx, _p, a: any) => (a?.type === 'build' || a?.type === 'upgrade' ? { block: 'Red tape: you cannot build or upgrade for a moment.' } : undefined),
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Red tape: no building', until: fx.endsAt }),
  },
];

/* --------------------------------- gloom -------------------------------- */

const gloom: CheatDef[] = [
  {
    id: id('deep-frost'),
    name: 'Deep Frost',
    category: 'advantage',
    description: 'For 10 seconds every gloomling on the road, and every one that sets off, stays slowed as if by a Frost tower.',
    target: 'room',
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 10_000,
    tickMs: TICK_MS,
    apply: (api) => noRoad(api) ?? void live(api).forEach((g) => (g.slowUntil = Math.max(g.slowUntil, api.now() + 500))),
    hooks: {
      tick: (api) => {
        for (const g of live(api)) g.slowUntil = Math.max(g.slowUntil, api.now() + 500);
      },
    },
    overlayFor: 'all',
    overlay: (fx) => ({ kind: 'countdown', label: 'Deep frost', until: fx.endsAt }),
  },
  {
    id: id('lantern-gust'),
    name: 'Lantern Gust',
    category: 'advantage',
    description: 'A gust from the Great Lantern pushes every gloomling on the road back by a twelfth of the road (never past the entrance).',
    target: 'room',
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const on = live(api).filter((g) => g.p > 0);
      if (!on.length) return { error: 'There are no gloomlings on the road to push.' };
      for (const g of on) g.p = Math.max(0, g.p - 1 / 12);
      api.feed(`A lantern gust pushed back ${on.length} gloomlings.`, 'good');
    },
  },
  {
    id: id('lords-chains'),
    name: 'Lord’s Chains',
    category: 'advantage',
    description: 'The Gloom Lord furthest along the road is chained where it stands for 6 seconds. Towers can still hit it.',
    target: 'room',
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 6_000,
    tickMs: TICK_MS,
    stacking: 'reject',
    apply: (api, _c, fx) => {
      const lord = live(api).filter((g) => g.kind === 'lord').sort((a, b) => b.p - a.p)[0];
      if (!lord) return { error: 'There is no Gloom Lord on the road.' };
      remember(fx, { lord: lord.id, p: lord.p });
      api.feed('The Gloom Lord is in chains.', 'good');
    },
    hooks: {
      tick: (api, fx) => {
        const g = api.s.gloom.find((x: any) => x.id === fx.data.lord);
        if (g && g.p > Number(fx.data.p)) g.p = Number(fx.data.p);
      },
    },
    overlayFor: 'all',
    overlay: (fx) => ({ kind: 'countdown', label: 'Gloom Lord chained', until: fx.endsAt }),
  },
  {
    id: id('ember-rain'),
    name: 'Ember Rain',
    category: 'advantage',
    description: 'Embers rain on the road: every gloomling loses a tenth of its full health, but never its last point (the towers must finish them).',
    target: 'room',
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const hit = live(api).filter((g) => g.hp > 1);
      if (!hit.length) return { error: 'There is nothing on the road for the embers to burn.' };
      for (const g of hit) g.hp = Math.max(1, g.hp - Math.round(g.maxHp / 10));
      api.feed(`Ember rain scorched ${hit.length} gloomlings.`, 'good');
    },
  },
  {
    id: id('shrink-charm'),
    name: 'Shrink Charm',
    category: 'advantage',
    description: 'The Brute with the most health left shrinks into a Shade of the same wave with the same share of its health left. It puts out 1 light instead of 2 if it gets through, but walks faster.',
    target: 'room',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const brute = live(api).filter((g) => g.kind === 'brute').sort((a, b) => b.hp - a.hp)[0];
      if (!brute) return { error: 'There is no Brute on the road.' };
      const maxHp = hpFor(api, 'shade', brute.wave);
      brute.hp = Math.max(1, Math.round((brute.hp / brute.maxHp) * maxHp));
      brute.maxHp = maxHp;
      brute.kind = 'shade';
      api.feed('A Brute shrank into a Shade.', 'good');
    },
  },
  {
    id: id('banish'),
    name: 'Banish the Straggler',
    category: 'advantage',
    description: 'The gloomling furthest back on the road (never a Gloom Lord) is banished: it vanishes without anyone getting the credit, and counts as gone for its wave. Never the last gloomling of the night.',
    target: 'room',
    modes: M,
    cost: 40,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const g = live(api).filter((x) => x.kind !== 'lord').sort((a, b) => a.p - b.p)[0];
      if (!g) return { error: 'There is no gloomling to banish.' };
      // Banishing the night's very last gloomling would win the game for the class.
      if (lastOfTheNight(api) && live(api).length === 1) return { error: 'That is the last gloomling of the night: the towers must finish it.' };
      removeFromRoad(api, [g]);
      api.feed(`A ${GLOOMLINGS[g.kind as GloomKind].name} was banished from the road.`, 'good');
    },
  },
  {
    id: id('gloom-lure'),
    name: 'Gloom Lure',
    category: 'troll',
    description: 'Lure an extra Shade onto the road: it joins the wave that is marching at a random entrance, with that wave’s health. Never while the Great Lantern has no more lights than everything on the road (the Shade included) could put out.',
    target: 'room',
    hostile: true,
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const why = cannotAdd(api, 'shade');
      if (why) return { error: why };
      addGloomling(api, 'shade');
      api.feed(`${api.name(c.caster)} lured an extra Shade onto the road.`, 'bad');
    },
  },
  {
    id: id('lantern-lull'),
    name: 'Lantern Lull',
    category: 'round',
    description: 'A lull before the storm: the next wave, and every wave after it, comes 10 seconds later. Not when the waves would then run so late that time could run out first.',
    target: 'room',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const s = api.s;
      if (s.nextWaveAt === null) return { error: 'No more waves are coming.' };
      const at = s.nextWaveAt + 10_000;
      const lastWaveAt = api.ctx.settings.endless ? at : at + Math.max(0, Number(api.ctx.settings.waves) - s.wave - 1) * 28_000;
      if (s.endsAt !== null && lastWaveAt + 60_000 > s.endsAt) return { error: 'The waves are already as late as they can be.' };
      s.nextWaveAt = at;
      // An empty road waits on a timer set for the next wave; move it too.
      if (!s.gloom.length && !s.spawns.length) api.ctx.setTimer('tick', at);
      api.feed('A lantern lull: the next wave comes 10 seconds later.', 'good');
    },
  },
  {
    id: id('sealed-gate'),
    name: 'Sealed Gate',
    category: 'round',
    description: 'The gate is sealed for a moment: every gloomling still waiting to set off sets off 6 seconds later. Not so close to the end of the night that time could run out before they do.',
    target: 'room',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api) => {
      const s = api.s;
      if (!s.spawns.length) return { error: 'No gloomlings are waiting to set off.' };
      const lastAt = Math.max(...s.spawns.map((sp: any) => sp.at)) + 6_000;
      if (!api.ctx.settings.endless && s.endsAt !== null && lastAt + 60_000 > s.endsAt) return { error: 'It is too close to the end of the night to hold the gate.' };
      s.spawns = s.spawns.map((sp: any) => ({ ...sp, at: sp.at + 6_000 }));
      api.feed(`The gate is sealed: ${s.spawns.length} gloomlings wait 6 more seconds.`, 'good');
    },
  },
];

/* --------------------------------- flare -------------------------------- */

function flareNow(api: ChaosApi): number {
  const s = api.s;
  const now = api.now();
  const burned: any[] = [];
  for (const g of live(api)) {
    g.hp -= Math.round(g.maxHp * (GLOOMLINGS[g.kind as GloomKind].boss ? FLARE_BURN_BOSS : FLARE_BURN));
    g.slowUntil = Math.max(g.slowUntil, now + FLARE_SLOW_MS);
    if (g.hp > 0) continue;
    burned.push(g);
    if (g.kind === 'lord') {
      s.lordsDown++;
      api.feed('The Great Lantern’s flare brought down the Gloom Lord.', 'big');
      addLog(api, { kind: 'lord', playerId: null });
    }
  }
  removeFromRoad(api, burned);
  addLog(api, { kind: 'flare', burned: burned.length });
  s.flare = { pot: 0, cost: flareCost(connected(api)), charged: false, count: s.flare.count + 1, at: now, givers: [] };
  return burned.length;
}

const flare: CheatDef[] = [
  {
    id: id('kindling'),
    name: 'Kindling',
    category: 'economy',
    description: 'Throw kindling on the Great Lantern: its flare pot fills by a fifth of its price, from nowhere (never past full; if that fills it, it is charged as if the room had fed it).',
    target: 'room',
    modes: M,
    needs: FLARE,
    cost: 30,
    cooldownMs: 60_000,
    apply: (api, c) => {
      if (api.s.flare.charged) return { error: 'The Great Lantern is already full.' };
      const put = api.add('flare', 'game', share(api.s.flare.cost, 20));
      api.feed(`${api.name(c.caster)} threw ${put} gold of kindling on the Great Lantern${api.s.flare.charged ? '. It is full' : ''}.`, 'good');
    },
  },
  {
    id: id('ignite'),
    name: 'Ignite the Great Lantern',
    category: 'advantage',
    description: 'A full Great Lantern flares right now, without waiting for the road to get busy: every gloomling on the road burns as in a normal flare and is slowed for 3 seconds. Not when that flare would burn away the last gloomlings of the night.',
    target: 'room',
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      if (!api.s.flare.charged) return { error: 'The Great Lantern is not full yet.' };
      const no = noRoad(api);
      if (no) return no;
      // A flare that would burn away everything left on the last wave would win the night: the mode's own flare must do that.
      const burns = (g: any) => g.hp <= Math.round(g.maxHp * (GLOOMLINGS[g.kind as GloomKind].boss ? FLARE_BURN_BOSS : FLARE_BURN));
      if (lastOfTheNight(api) && live(api).every(burns)) return { error: 'That flare would end the night. Let the Great Lantern choose its moment.' };
      const burned = flareNow(api);
      api.feed(`${api.name(c.caster)} ignited the Great Lantern${burned ? `. It burned away ${burned} gloomlings` : ''}.`, 'big');
    },
  },
  {
    id: id('will-o-wisp'),
    name: 'Will-o’-the-Wisp',
    category: 'random',
    description: `Follow a will-o’-the-wisp. Odds: ${odds([['every gloomling on the road is slowed for 4 seconds', 30], ['every guard gets 10 gold', 25], ['the Great Lantern’s flare pot fills by a tenth', 25], ['a Wisp joins the marching wave', 20]])}. If what it picks cannot happen right now, every guard gets 10 gold instead.`,
    target: 'room',
    modes: M,
    needs: GOLD,
    cost: 20,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api) => {
      const pick = rollOdds(api, [['slow', 30], ['gold', 25], ['pot', 25], ['wisp', 20]] as const);
      if (pick === 'slow' && live(api).length) {
        for (const g of live(api)) g.slowUntil = Math.max(g.slowUntil, api.now() + 4000);
        return void api.feed('The will-o’-the-wisp led the gloom astray: everything on the road is slowed.', 'good');
      }
      if (pick === 'pot' && !api.s.flare.charged) {
        const put = api.add('flare', 'game', share(api.s.flare.cost, 10));
        return void api.feed(`The will-o’-the-wisp gave the Great Lantern ${put} gold.`, 'good');
      }
      if (pick === 'wisp' && !cannotAdd(api, 'wisp')) {
        addGloomling(api, 'wisp');
        return void api.feed('The will-o’-the-wisp turned out to be a real Wisp. It joined the wave.', 'bad');
      }
      for (const p of api.ids()) api.add('currency', p, 10);
      api.feed('The will-o’-the-wisp led every guard to 10 gold.', 'good');
    },
  },
];

const cheats: CheatDef[] = [...gold, ...towers, ...gloom, ...flare];

defineCheats(cheats);
