import { defineCheats } from '../registry.ts';
import type { ActiveEffect, CastInput, ChaosApi, CheatDef } from '../types.ts';
import { odds, rollOdds, target, transfer } from '../cheats/kit.ts';
import { distancesFrom, grid, shrineName } from '../../modes/lantern-lands/map.ts';
import { EVENT_MS, EVENTS, SHRINE_BONUS, SHRINE_FORT_COST, SHRINE_ONLY_POINTS, SHRINE_RAID_COST, STREAK_FOR_DOUBLE, type EventKind } from '../../modes/lantern-lands/meta.ts';
import { fortMaxOf, NOBODY, scoreFor } from '../../modes/lantern-lands/index.ts';

/*
 * Cheats that only make sense in Lantern Lands: they work the hex map
 * (claims, captures, forts, shrines), the room events, the final glow,
 * energy, the team bonus meter and the team scoring itself.
 *
 * Map cheats write the mode's state directly (owner and fort arrays, events),
 * so they cannot be undone; energy, team points and the bonus meter go
 * through meters. Chaos never touches a home (homes can never be raided),
 * never lights a lake or a hill, and never pushes team points to the goal
 * (the teamScore meter stops one short). Captures follow the mode's own
 * rule: a land that changes hands loses its forts. Lowering forts and
 * capturing land respect a running lantern storm, as raids do.
 */

const MODE = 'lantern-lands';
const MODES = [MODE] as const;
/** Every cheat here needs the energy meter, which every Lantern Lands game has. */
const NEEDS = ['meter:currency'] as const;
const TEAM_NEEDS = ['meter:currency', 'teams'] as const;
const CHANGES_KEPT = 24;
const CHANGE_GLOW_MS = 4000;
const PLAYS_KEPT = 6;

/* -------------------------------- helpers ------------------------------- */

const st = (api: ChaosApi) => api.s;
const over = (api: ChaosApi) => st(api).winners !== null;
const radius = (api: ChaosApi): number => st(api).map.radius;
const adj = (api: ChaosApi): readonly (readonly number[])[] => grid(radius(api)).adj;
const label = (api: ChaosApi, l: number) => grid(radius(api)).labels[l] ?? '?';
const isShrine = (api: ChaosApi, l: number) => (st(api).map.shrines as number[]).includes(l);
const isHome = (api: ChaosApi, l: number) => (st(api).map.homes as number[]).includes(l);
const blocked = (api: ChaosApi) => new Set<number>([...st(api).map.lakes, ...st(api).map.hills]);
const place = (api: ChaosApi, l: number) => (isShrine(api, l) ? shrineName(radius(api), l) : label(api, l));
const fortMax = (api: ChaosApi) => fortMaxOf(api.ctx.settings as { fortMax: string });
const storm = (api: ChaosApi) => st(api).event?.kind === 'storm';
const owner = (api: ChaosApi): number[] => st(api).owner;
const forts = (api: ChaosApi): number[] => st(api).fort;
const teamName = (api: ChaosApi, t: number): string => st(api).teams[t]?.name ?? 'other team';
const teamIdOf = (api: ChaosApi, t: number): string => st(api).teams[t]?.id ?? '';
const teamIndex = (api: ChaosApi, teamId: string | null): number => (teamId === null ? -1 : (st(api).teams as { id: string }[]).findIndex((t) => t.id === teamId));
/** The map team of a player (the mode's member record). */
const teamOfPlayer = (api: ChaosApi, id: string): number => st(api).members[id]?.team ?? -1;
const membersOf = (api: ChaosApi, t: number) => api.ids().filter((id) => teamOfPlayer(api, id) === t);
const rivalsOf = (api: ChaosApi, t: number) => (st(api).teams as unknown[]).map((_, i) => i).filter((i) => i !== t);

function recordChange(api: ChaosApi, land: number, team: number, from: number) {
  const s = st(api);
  const at = api.now();
  s.changes = [{ land, at, team, from }, ...s.changes.filter((c: { at: number }) => at - c.at < CHANGE_GLOW_MS)].slice(0, CHANGES_KEPT);
}

function recordPlay(api: ChaosApi, team: number, text: string, shrine: boolean) {
  const s = st(api);
  s.plays = [{ at: api.now(), team, text, shrine }, ...s.plays].slice(0, PLAYS_KEPT);
}

/** Empty, open lands next to a team's lands. */
function claimable(api: ChaosApi, t: number): number[] {
  const o = owner(api);
  const b = blocked(api);
  const a = adj(api);
  return o.flatMap((v, l) => (v === NOBODY && !b.has(l) && a[l]!.some((n) => o[n] === t) ? [l] : []));
}

/** Rival lands (never homes) next to a team's lands. */
function rivalBorder(api: ChaosApi, t: number): number[] {
  const o = owner(api);
  const a = adj(api);
  return o.flatMap((v, l) => (v >= 0 && v !== t && !isHome(api, l) && a[l]!.some((n) => o[n] === t) ? [l] : []));
}

/** A team's own lands (never homes) next to a land it does not hold: the edge of its territory. */
function edgeLands(api: ChaosApi, t: number): number[] {
  const o = owner(api);
  const b = blocked(api);
  const a = adj(api);
  return o.flatMap((v, l) => (v === t && !isHome(api, l) && a[l]!.some((n) => o[n] !== t && !b.has(n)) ? [l] : []));
}

/** Empty neighbours of a land: claiming it opens that much ground. */
function room(api: ChaosApi, l: number): number {
  const o = owner(api);
  const b = blocked(api);
  return adj(api)[l]!.filter((n) => o[n] === NOBODY && !b.has(n)).length;
}

/** Light an empty land for a team, as a claim does (with a fort when claims come with one). */
function lightLand(api: ChaosApi, l: number, t: number) {
  const s = st(api);
  s.owner[l] = t;
  s.fort[l] = api.ctx.settings.claimFort ? 1 : 0;
  recordChange(api, l, t, NOBODY);
  if (isShrine(api, l) && !s.lit.includes(l)) s.lit.push(l);
}

/** A land changes hands, as a capture does: it loses its forts. */
function captureLand(api: ChaosApi, l: number, t: number) {
  const s = st(api);
  const from = s.owner[l];
  s.owner[l] = t;
  s.fort[l] = 0;
  recordChange(api, l, t, from);
  if (isShrine(api, l) && !s.lit.includes(l)) s.lit.push(l);
}

/** The claim that opens the most empty ground (ties: lowest land number). */
function bestClaim(api: ChaosApi, t: number): number | null {
  const options = claimable(api, t);
  if (!options.length) return null;
  return options.sort((x, y) => room(api, y) - room(api, x) || x - y)[0]!;
}

function holdings(api: ChaosApi, t: number) {
  let lands = 0;
  let shrines = 0;
  owner(api).forEach((o, l) => {
    if (o !== t) return;
    lands++;
    if (isShrine(api, l)) shrines++;
  });
  return { lands, shrines };
}

const shrinesOnly = (api: ChaosApi) => api.ctx.settings.scoring === 'shrines';
const bloom = (api: ChaosApi) => st(api).event?.kind === 'bloom';
const inGlow = (api: ChaosApi) => api.now() >= st(api).glowAt;

/** What a team's shrines are worth at a scoring right now, on top of the lands they stand on. */
function shrinePart(api: ChaosApi, t: number): number {
  const { shrines } = holdings(api, t);
  const each = shrinesOnly(api) ? SHRINE_ONLY_POINTS : SHRINE_BONUS;
  return shrines * each * (bloom(api) ? 2 : 1) * (inGlow(api) ? 2 : 1);
}

/** A team's own index from a cast or effect: `team` for team targets, else the caster's map team. */
function castTeam(api: ChaosApi, c: CastInput | ActiveEffect): number {
  const fromTeam = teamIndex(api, c.team);
  return fromTeam >= 0 ? fromTeam : teamOfPlayer(api, c.caster);
}

/** The enemy team of an enemy-team cast. */
const enemyOf = (api: ChaosApi, c: CastInput | ActiveEffect) => teamIndex(api, c.team);

function gameOn(api: ChaosApi): { error: string } | null {
  return over(api) ? { error: 'The game is over.' } : null;
}

function noStorm(api: ChaosApi): { error: string } | null {
  return storm(api) ? { error: 'The lantern storm protects every land: no fort can be lowered and no land captured until it passes.' } : null;
}

const mapAction = (a: unknown): { type: 'claim' | 'fortify' | 'raid'; land: number } | null => {
  const x = a as { type?: string; land?: number } | null;
  return x && (x.type === 'claim' || x.type === 'fortify' || x.type === 'raid') && typeof x.land === 'number' ? (x as { type: 'claim' | 'fortify' | 'raid'; land: number }) : null;
};

/** What a map move costs in the mode: shrines cost more to raid or fortify. */
const moveCost = (api: ChaosApi, a: { type: 'claim' | 'fortify' | 'raid'; land: number }) =>
  a.type === 'claim' ? 1 : isShrine(api, a.land) ? (a.type === 'raid' ? SHRINE_RAID_COST : SHRINE_FORT_COST) : 1;

const EVENT_START: Record<EventKind, string> = {
  storm: 'Lantern storm: for 30 seconds no fort can be lowered and no land captured.',
  bloom: 'Shrine bloom: shrines score double for 30 seconds.',
  double: 'Double energy: every right answer gives 2 energy for 30 seconds.',
  rumble: 'Rumbling ground: every fort dropped by 1.',
  fog: 'Fog: rival forts are hidden for 30 seconds.',
};

/* --------------------------------- map ---------------------------------- */

const map: CheatDef[] = [
  {
    id: 'lantern-lands.shrine-leap',
    name: 'Shrine Leap',
    category: 'advantage',
    description: 'Your team lights the empty shrine closest to its lands, wherever it is on the map (it does not have to be next to your lands).',
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 45,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = castTeam(api, c);
      const o = owner(api);
      const b = blocked(api);
      const empty = (st(api).map.shrines as number[]).filter((l) => o[l] === NOBODY);
      if (!empty.length) return gameOn(api) ?? { error: 'Every shrine is already lit.' };
      const mine = o.flatMap((v, l) => (v === t ? [l] : []));
      const dist = distancesFrom(radius(api), mine, (l) => !b.has(l));
      const steps = (l: number) => (dist[l]! < 0 ? Infinity : dist[l]!);
      const l = empty.sort((x, y) => steps(x) - steps(y) || x - y)[0]!;
      lightLand(api, l, t);
      recordPlay(api, t, `Chaos lit ${place(api, l)} for the ${teamName(api, t)}`, true);
      api.feed(`Shrine Leap: the ${teamName(api, t)} lit ${place(api, l)}.`, 'big');
    },
  },
  {
    id: 'lantern-lands.border-heist',
    name: 'Hex Border Heist',
    category: 'advantage',
    description: 'Your team captures the weakest rival land next to its own (fewest forts; never a home or a shrine). Like any capture, the land loses its forts. Refused during a lantern storm.',
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 35,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const no = gameOn(api) ?? noStorm(api);
      if (no) return no;
      const t = castTeam(api, c);
      const options = rivalBorder(api, t).filter((l) => !isShrine(api, l));
      if (!options.length) return { error: 'No rival land touches yours (shrines and homes do not count).' };
      const l = options.sort((x, y) => forts(api)[x]! - forts(api)[y]! || x - y)[0]!;
      const from = owner(api)[l]!;
      captureLand(api, l, t);
      recordPlay(api, t, `Chaos took ${label(api, l)} from the ${teamName(api, from)}`, false);
      api.feed(`Hex Border Heist: the ${teamName(api, t)} took ${label(api, l)} from the ${teamName(api, from)}.`, 'big');
    },
  },
  {
    id: 'lantern-lands.shrine-flip',
    name: 'Shrine Flip',
    category: 'advantage',
    description: 'Take one shrine a rival team holds, anywhere on the map, and keep its forts: the rival shrine closest to your lands. Refused during a lantern storm.',
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 55,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const no = gameOn(api) ?? noStorm(api);
      if (no) return no;
      const t = castTeam(api, c);
      const o = owner(api);
      const b = blocked(api);
      const theirs = (st(api).map.shrines as number[]).filter((l) => o[l]! >= 0 && o[l] !== t && !isHome(api, l));
      if (!theirs.length) return { error: 'No rival team holds a shrine.' };
      const dist = distancesFrom(radius(api), o.flatMap((v, l) => (v === t ? [l] : [])), (l) => !b.has(l));
      const steps = (l: number) => (dist[l]! < 0 ? Infinity : dist[l]!);
      const l = theirs.sort((x, y) => steps(x) - steps(y) || x - y)[0]!;
      const from = o[l]!;
      st(api).owner[l] = t;
      recordChange(api, l, t, from);
      recordPlay(api, t, `Chaos flipped ${place(api, l)} from the ${teamName(api, from)}`, true);
      api.feed(`Shrine Flip: ${place(api, l)} now belongs to the ${teamName(api, t)}, forts and all.`, 'big');
    },
  },
  {
    id: 'lantern-lands.raze',
    name: 'Razed Hex Ramparts',
    category: 'troll',
    description: 'The enemy team\'s most fortified land (never a home) loses every fort it has. Refused during a lantern storm.',
    target: 'enemy-team',
    modes: MODES,
    needs: TEAM_NEEDS,
    cost: 30,
    cooldownMs: 40_000,
    undoable: false,
    apply: (api, c) => {
      const no = gameOn(api) ?? noStorm(api);
      if (no) return no;
      const e = enemyOf(api, c);
      const f = forts(api);
      const options = owner(api).flatMap((v, l) => (v === e && !isHome(api, l) && f[l]! > 0 ? [l] : []));
      if (!options.length) return { error: `The ${teamName(api, e)} have no forts to raze.` };
      const l = options.sort((x, y) => f[y]! - f[x]! || x - y)[0]!;
      const had = f[l]!;
      f[l] = 0;
      api.feed(`Razed Hex Ramparts: ${place(api, l)} of the ${teamName(api, e)} lost all ${had} of its forts.`, 'bad');
    },
  },
  {
    id: 'lantern-lands.earthquake',
    name: 'Rumble Under Their Lands',
    category: 'troll',
    description: 'Every fort the enemy team holds drops by 1, like a rumbling ground that only shakes their lands. Refused during a lantern storm.',
    target: 'enemy-team',
    modes: MODES,
    needs: TEAM_NEEDS,
    cost: 35,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const no = gameOn(api) ?? noStorm(api);
      if (no) return no;
      const e = enemyOf(api, c);
      const f = forts(api);
      let shaken = 0;
      owner(api).forEach((v, l) => {
        if (v === e && f[l]! > 0) {
          f[l] = f[l]! - 1;
          shaken++;
        }
      });
      if (!shaken) return { error: `The ${teamName(api, e)} have no forts to shake.` };
      api.feed(`Rumble Under Their Lands: ${shaken} ${shaken === 1 ? 'land' : 'lands'} of the ${teamName(api, e)} lost a fort.`, 'bad');
    },
  },
  {
    id: 'lantern-lands.shrine-ward',
    name: 'Shrine Wardens',
    category: 'advantage',
    description: 'Every shrine your team holds is fortified up to the strongest fort the game allows (3, or 5 in Fortress).',
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 40,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const no = gameOn(api);
      if (no) return no;
      const t = castTeam(api, c);
      const max = fortMax(api);
      const f = forts(api);
      const mine = (st(api).map.shrines as number[]).filter((l) => owner(api)[l] === t && !isHome(api, l) && f[l]! < max);
      if (!mine.length) return { error: 'Your team holds no shrine that could take another fort.' };
      for (const l of mine) f[l] = max;
      api.feed(`Shrine Wardens: ${mine.map((l) => place(api, l)).join(', ')} now ${mine.length === 1 ? 'has' : 'have'} ${max} forts.`, 'good');
    },
  },
  {
    id: 'lantern-lands.palisade',
    name: 'Hex Palisade',
    category: 'advantage',
    description: 'Every land your team holds at the edge of its territory (next to land it does not hold; never a home) gains 1 fort, up to the most a land can hold.',
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 35,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const no = gameOn(api);
      if (no) return no;
      const t = castTeam(api, c);
      const max = fortMax(api);
      const f = forts(api);
      const lands = edgeLands(api, t).filter((l) => f[l]! < max);
      if (!lands.length) return { error: 'Your team has no edge land that could take another fort.' };
      for (const l of lands) f[l] = f[l]! + 1;
      api.feed(`Hex Palisade: ${lands.length} ${lands.length === 1 ? 'land' : 'lands'} of the ${teamName(api, t)} gained a fort.`, 'good');
    },
  },
  {
    id: 'lantern-lands.fort-plunder',
    name: 'Hex Fort Plunder',
    category: 'advantage',
    description: 'Lift every fort off the strongest rival land next to yours (never a home) and stack them on your own land beside it with the fewest forts, up to the most a land can hold (any extra are lost). Refused during a lantern storm.',
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 40,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const no = gameOn(api) ?? noStorm(api);
      if (no) return no;
      const t = castTeam(api, c);
      const f = forts(api);
      const o = owner(api);
      const a = adj(api);
      const pairs = rivalBorder(api, t)
        .filter((l) => f[l]! > 0)
        .flatMap((from) => {
          const to = a[from]!.filter((n) => o[n] === t && !isHome(api, n)).sort((x, y) => f[x]! - f[y]! || x - y)[0];
          return to === undefined ? [] : [{ from, to }];
        })
        .sort((x, y) => f[y.from]! - f[x.from]! || x.from - y.from);
      const pick = pairs[0];
      if (!pick) return { error: 'No fortified rival land touches one of your lands (homes do not count).' };
      const moved = f[pick.from]!;
      const fits = Math.min(moved, fortMax(api) - f[pick.to]!);
      f[pick.from] = 0;
      f[pick.to] = f[pick.to]! + fits;
      api.feed(`Hex Fort Plunder: ${moved} ${moved === 1 ? 'fort' : 'forts'} came off ${place(api, pick.from)}; ${fits} went up on ${place(api, pick.to)}.`, 'big');
    },
  },
  {
    id: 'lantern-lands.lottery',
    name: 'Hexland Lottery',
    category: 'random',
    description: `Spin the lantern wheel. Odds: ${odds([['your team claims the empty land next to its own that opens the most ground', 40], ['you gain 2 energy', 30], ['a random rival team claims an empty land next to its own', 30]])}. Needs empty land beside your team and a rival, and room for energy.`,
    target: 'self',
    modes: MODES,
    needs: TEAM_NEEDS,
    cost: 25,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const no = gameOn(api);
      if (no) return no;
      const t = castTeam(api, c);
      const rivals = rivalsOf(api, t).filter((r) => membersOf(api, r).length && claimable(api, r).length);
      const roomForEnergy = api.get('currency', c.caster) < (api.meter('currency')?.max?.(api.s, c.caster, api.ctx) ?? Infinity);
      if (!claimable(api, t).length || !rivals.length || !roomForEnergy) return { error: 'The lottery needs empty land beside your team and beside a rival, and room for more energy.' };
      const roll = rollOdds<'claim' | 'energy' | 'rival'>(api, [['claim', 40], ['energy', 30], ['rival', 30]]);
      if (roll === 'claim') {
        const l = bestClaim(api, t)!;
        lightLand(api, l, t);
        api.feed(`Hexland Lottery: the ${teamName(api, t)} won ${place(api, l)}.`, 'good');
      } else if (roll === 'energy') {
        const got = api.add('currency', c.caster, 2);
        api.feed(`Hexland Lottery: ${api.name(c.caster)} won ${got} energy.`, 'good');
      } else {
        const r = api.rng.pick(rivals);
        const l = bestClaim(api, r)!;
        lightLand(api, l, r);
        api.feed(`Hexland Lottery: the wheel handed ${place(api, l)} to the ${teamName(api, r)}.`, 'bad');
      }
    },
  },
];

/* -------------------------------- energy -------------------------------- */

const energy: CheatDef[] = [
  {
    id: 'lantern-lands.snuff',
    name: 'Hexland Snuff-Out',
    category: 'troll',
    description: 'Every player on the enemy team loses 1 energy.',
    target: 'enemy-team',
    modes: MODES,
    needs: TEAM_NEEDS,
    cost: 30,
    cooldownMs: 40_000,
    apply: (api, c) => {
      const no = gameOn(api);
      if (no) return no;
      let lost = 0;
      for (const id of c.targets) lost -= api.add('currency', id, -1);
      if (!lost) return { error: 'Nobody on that team has any energy.' };
      api.feed(`Hexland Snuff-Out: the ${teamName(api, enemyOf(api, c))} lost ${lost} energy between them.`, 'bad');
    },
  },
  {
    id: 'lantern-lands.energy-heist',
    name: 'Hexland Energy Heist',
    category: 'economy',
    description: 'Take all of an opponent\'s energy, as much as you can hold (one more than the room\'s energy cap).',
    target: 'opponent',
    modes: MODES,
    needs: NEEDS,
    cost: 30,
    cooldownMs: 35_000,
    apply: (api, c) => {
      const t = target(c);
      if (api.get('currency', t) <= 0) return { error: `${api.name(t)} has no energy.` };
      const got = transfer(api, 'currency', t, c.caster, api.get('currency', t));
      if (!got) return { error: 'Your energy is already full.' };
      api.feed(`Hexland Energy Heist: ${api.name(c.caster)} took ${got} energy from ${api.name(t)}.`, 'bad');
    },
  },
  {
    id: 'lantern-lands.rally',
    name: 'Hexland Rally',
    category: 'economy',
    description: 'Every player on your team, you included, gains 1 energy (up to one more than the room\'s energy cap).',
    target: 'my-team',
    modes: MODES,
    needs: TEAM_NEEDS,
    cost: 35,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const no = gameOn(api);
      if (no) return no;
      let given = 0;
      for (const id of c.targets) given += api.add('currency', id, 1);
      if (!given) return { error: 'Everyone on your team is already full of energy.' };
      api.feed(`Hexland Rally: the ${teamName(api, castTeam(api, c))} gained ${given} energy between them.`, 'good');
    },
  },
  {
    id: 'lantern-lands.kindled-streak',
    name: 'Hexland Hot Streak',
    category: 'advantage',
    description: `Your run of right answers jumps to ${STREAK_FOR_DOUBLE}, so your next right answer gives 2 energy.`,
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 20,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const m = st(api).members[c.caster];
      if (!m) return { error: 'You are not on the map.' };
      if (m.stream.streak >= STREAK_FOR_DOUBLE) return { error: 'Your streak is already hot.' };
      m.stream.streak = STREAK_FOR_DOUBLE;
      m.stream.bestStreak = Math.max(m.stream.bestStreak, STREAK_FOR_DOUBLE);
    },
  },
  {
    id: 'lantern-lands.bonus-surge',
    name: 'Brimming Hexland Bonus',
    category: 'economy',
    description: 'Your team\'s bonus meter fills to the top (3), so it pays bonus energy to your teammates\' next right answers.',
    target: 'self',
    modes: MODES,
    needs: [...NEEDS, 'meter:bonus'],
    cost: 30,
    cooldownMs: 50_000,
    apply: (api, c) => {
      const no = gameOn(api);
      if (no) return no;
      const id = teamIdOf(api, castTeam(api, c));
      if (!api.set('bonus', id, 3)) return { error: 'Your team\'s bonus meter is already full.' };
    },
  },
  {
    id: 'lantern-lands.bonus-drain',
    name: 'Hexland Bonus Blowout',
    category: 'troll',
    description: 'Empties an enemy team\'s bonus meter, so their next right answers get no bonus energy from it.',
    target: 'enemy-team',
    modes: MODES,
    needs: [...TEAM_NEEDS, 'meter:bonus'],
    cost: 15,
    cooldownMs: 30_000,
    apply: (api, c) => {
      const no = gameOn(api);
      if (no) return no;
      if (!api.set('bonus', c.team!, 0)) return { error: 'Their bonus meter is already empty.' };
    },
  },
];

/* ------------------------------- scoring -------------------------------- */

const scoring: CheatDef[] = [
  {
    id: 'lantern-lands.census',
    name: 'Hexland Census',
    category: 'score',
    description: 'Your team scores its lands and shrines once more, right now, exactly as a scoring would (shrine bloom and final glow included), but never up to the points goal.',
    target: 'self',
    modes: MODES,
    needs: [...NEEDS, 'meter:teamScore'],
    cost: 40,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const no = gameOn(api);
      if (no) return no;
      const t = castTeam(api, c);
      const { lands, shrines } = holdings(api, t);
      const pts = scoreFor(lands, shrines, { shrinesOnly: shrinesOnly(api), bloom: bloom(api), glow: inGlow(api) });
      if (pts <= 0) return { error: 'Your team holds nothing that scores.' };
      const got = api.add('teamScore', teamIdOf(api, t), pts);
      if (!got) return { error: 'Your team is as close to the goal as chaos can take it.' };
      api.feed(`Hexland Census: the ${teamName(api, t)} scored ${got} extra points.`, 'good');
    },
  },
  {
    id: 'lantern-lands.shrine-chorus',
    name: 'Shrine Chorus',
    category: 'score',
    description: 'For 30 seconds, at each scoring your team\'s shrines score their points a second time (bloom and glow included). Needs a shrine to start.',
    target: 'self',
    modes: MODES,
    needs: [...NEEDS, 'meter:teamScore'],
    cost: 35,
    cooldownMs: 60_000,
    durationMs: 30_000,
    priority: 20,
    apply: (api, c, fx) => {
      const t = castTeam(api, c);
      if (!holdings(api, t).shrines) return { error: 'Your team holds no shrine.' };
      if (fx) fx.data.team = t;
    },
    hooks: {
      delta: {
        teamScore: (api, fx, d) => {
          const t = Number(fx.data.team);
          const id = teamIdOf(api, t);
          if ((d[id] ?? 0) <= 0) return;
          d[id]! += shrinePart(api, t);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Shrine chorus', tone: 'good' }),
  },
  {
    id: 'lantern-lands.borrowed-light',
    name: 'Borrowed Shrine Light',
    category: 'troll',
    description: 'For 30 seconds, the points an enemy team\'s shrines earn at each scoring go to your team instead. Needs them to hold a shrine.',
    target: 'enemy-team',
    modes: MODES,
    needs: [...TEAM_NEEDS, 'meter:teamScore'],
    cost: 45,
    cooldownMs: 75_000,
    durationMs: 30_000,
    priority: 10,
    apply: (api, c, fx) => {
      if (!holdings(api, enemyOf(api, c)).shrines) return { error: 'That team holds no shrine.' };
      if (fx) fx.data.mine = teamOfPlayer(api, c.caster);
    },
    hooks: {
      delta: {
        teamScore: (api, fx, d) => {
          const e = enemyOf(api, fx);
          const theirs = teamIdOf(api, e);
          const mine = teamIdOf(api, Number(fx.data.mine));
          if ((d[theirs] ?? 0) <= 0 || !mine) return;
          const cut = Math.min(d[theirs]!, shrinePart(api, e));
          if (cut <= 0) return;
          d[theirs]! -= cut;
          d[mine] = (d[mine] ?? 0) + cut;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Shrine light borrowed', tone: 'bad' }),
  },
  {
    id: 'lantern-lands.blackout',
    name: 'Hexland Blackout',
    category: 'troll',
    description: 'The enemy team scores nothing at the next scoring (if it comes within 20 seconds).',
    target: 'enemy-team',
    modes: MODES,
    needs: [...TEAM_NEEDS, 'meter:teamScore'],
    cost: 40,
    cooldownMs: 60_000,
    durationMs: 20_000,
    priority: 40,
    stacking: 'reject',
    hooks: {
      delta: {
        teamScore: (api, fx, d) => {
          const id = fx.team!;
          if ((d[id] ?? 0) <= 0) return;
          api.feed(`Hexland Blackout: the ${teamName(api, enemyOf(api, fx))} lost ${d[id]} points of light.`, 'bad');
          d[id] = 0;
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Blackout: your next scoring is lost', until: fx.endsAt }),
  },
];

/* ------------------------------ room events ----------------------------- */

const EVENT_OPTIONS = (Object.keys(EVENTS) as EventKind[]).map((k) => ({ value: k, label: EVENTS[k].label }));

const events: CheatDef[] = [
  {
    id: 'lantern-lands.call-weather',
    name: 'Hexland Weathermaker',
    category: 'round',
    description: 'Start the room event of your choice now, for 30 seconds, replacing any event that is running. Not in the final glow, when the mode starts no events either.',
    target: 'room',
    modes: MODES,
    needs: [...NEEDS, 'events'],
    params: [{ key: 'event', label: 'Event', kind: 'choice', options: EVENT_OPTIONS, default: 'bloom' }],
    cost: 45,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api, c) => {
      const no = gameOn(api);
      if (no) return no;
      const s = st(api);
      const kind = c.params.event as EventKind;
      if (inGlow(api)) return { error: 'No room event can start in the final glow.' };
      if (s.event?.kind === kind) return { error: `${EVENTS[kind].label} is already running.` };
      const now = api.now();
      s.event = { kind, startedAt: now, endsAt: now + EVENT_MS };
      s.lastEvent = kind;
      s.eventsRun++;
      if (kind === 'rumble') s.fort = s.fort.map((f: number) => Math.max(0, f - 1));
      api.ctx.setTimer('eventEnd', s.event.endsAt);
      recordPlay(api, NOBODY, EVENTS[kind].label, false);
      api.feed(EVENT_START[kind], 'big');
    },
  },
  {
    id: 'lantern-lands.clear-skies',
    name: 'Clear Hexland Skies',
    category: 'round',
    description: 'Ends the room event that is running now. The next one still comes on time.',
    target: 'room',
    modes: MODES,
    needs: [...NEEDS, 'events'],
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api) => {
      const s = st(api);
      if (!s.event || over(api)) return { error: 'No room event is running.' };
      const label = EVENTS[s.event.kind as EventKind].label;
      s.event = null;
      api.ctx.clearTimer('eventEnd');
      api.feed(`Clear Hexland Skies: the ${label.toLowerCase()} is over.`, 'info');
    },
  },
  {
    id: 'lantern-lands.long-weather',
    name: 'Lingering Hexland Weather',
    category: 'round',
    description: 'The room event running now lasts 20 seconds longer (a new event can still replace it when it is due).',
    target: 'room',
    modes: MODES,
    needs: [...NEEDS, 'events'],
    cost: 25,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const s = st(api);
      if (!s.event || over(api)) return { error: 'No room event is running.' };
      s.event.endsAt += 20_000;
      api.ctx.setTimer('eventEnd', s.event.endsAt);
      api.feed(`Lingering Hexland Weather: the ${EVENTS[s.event.kind as EventKind].label.toLowerCase()} lasts 20 seconds longer.`, 'info');
    },
  },
  {
    id: 'lantern-lands.early-glow',
    name: 'Early Hexland Glow',
    category: 'round',
    description: 'The final glow, when every score counts double, starts 30 seconds sooner (no sooner than now). As in the mode, no room event starts once it has begun.',
    target: 'room',
    modes: MODES,
    needs: NEEDS,
    cost: 40,
    cooldownMs: 120_000,
    undoable: false,
    apply: (api) => {
      const no = gameOn(api);
      if (no) return no;
      const s = st(api);
      const now = api.now();
      if (now >= s.glowAt) return { error: 'The final glow has already begun.' };
      s.glowAt = Math.max(now, s.glowAt - 30_000);
      api.ctx.setTimer('glow', s.glowAt);
      if (s.nextEventAt !== null && s.nextEventAt >= s.glowAt) {
        s.nextEventAt = null;
        api.ctx.clearTimer('event');
      }
      api.feed('Early Hexland Glow: the final glow comes 30 seconds sooner.', 'big');
    },
  },
];

/* ------------------------------- lasting -------------------------------- */

const lasting: CheatDef[] = [
  {
    id: 'lantern-lands.creeping-light',
    name: 'Creeping Hex Light',
    category: 'advantage',
    description: 'For 20 seconds, every 4 seconds your team claims one empty land next to its lands (the one that opens the most empty ground).',
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 50,
    cooldownMs: 75_000,
    durationMs: 20_000,
    tickMs: 4_000,
    stacking: 'reject',
    apply: (api, c, fx) => {
      const no = gameOn(api);
      if (no) return no;
      const t = castTeam(api, c);
      if (!claimable(api, t).length) return { error: 'There is no empty land next to your team\'s lands.' };
      if (fx) fx.data.team = t;
    },
    hooks: {
      tick: (api, fx) => {
        if (over(api)) return;
        const t = Number(fx.data.team);
        const l = bestClaim(api, t);
        if (l !== null) lightLand(api, l, t);
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Creeping light', until: fx.endsAt }),
  },
  {
    id: 'lantern-lands.wildfire',
    name: 'Hexland Wildfire',
    category: 'troll',
    description: 'For 20 seconds, every 5 seconds one of the enemy team\'s unfortified edge lands (never a home or a shrine) burns out and becomes empty land again.',
    target: 'enemy-team',
    modes: MODES,
    needs: TEAM_NEEDS,
    cost: 45,
    cooldownMs: 60_000,
    durationMs: 20_000,
    tickMs: 5_000,
    stacking: 'reject',
    apply: (api, c) => {
      const no = gameOn(api);
      if (no) return no;
      if (!burnable(api, enemyOf(api, c)).length) return { error: 'That team has no unfortified edge land to burn.' };
    },
    hooks: {
      tick: (api, fx) => {
        if (over(api)) return;
        const e = enemyOf(api, fx);
        const options = burnable(api, e);
        if (!options.length) return;
        const l = api.rng.pick(options);
        st(api).owner[l] = NOBODY;
        st(api).fort[l] = 0;
        api.feed(`Hexland Wildfire: ${label(api, l)} of the ${teamName(api, e)} burned out.`, 'bad');
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Wildfire on your lands', until: fx.endsAt }),
  },
  {
    id: 'lantern-lands.rust',
    name: 'Hex Fort Rust',
    category: 'troll',
    description: 'For 25 seconds, every 5 seconds the enemy team\'s most fortified land (never a home) loses 1 fort. It pauses while a lantern storm runs.',
    target: 'enemy-team',
    modes: MODES,
    needs: TEAM_NEEDS,
    cost: 35,
    cooldownMs: 50_000,
    durationMs: 25_000,
    tickMs: 5_000,
    stacking: 'reject',
    apply: (api, c) => {
      const no = gameOn(api) ?? noStorm(api);
      if (no) return no;
      if (rustTarget(api, enemyOf(api, c)) === null) return { error: 'That team has no forts to rust.' };
    },
    hooks: {
      tick: (api, fx) => {
        if (over(api) || storm(api)) return;
        const l = rustTarget(api, enemyOf(api, fx));
        if (l !== null) forts(api)[l] = forts(api)[l]! - 1;
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Your forts are rusting', until: fx.endsAt }),
  },
  {
    id: 'lantern-lands.frozen-frontier',
    name: 'Frozen Hex Frontier',
    category: 'troll',
    description: 'For 20 seconds, nobody on the enemy team can claim empty land. Their raids and forts still work.',
    target: 'enemy-team',
    modes: MODES,
    needs: TEAM_NEEDS,
    cost: 30,
    cooldownMs: 45_000,
    durationMs: 20_000,
    apply: (api, c) => {
      const no = gameOn(api);
      if (no) return no;
      if (!claimable(api, enemyOf(api, c)).length) return { error: 'That team has no empty land to claim anyway.' };
    },
    hooks: {
      gate: (_api, _fx, _id, action) => (mapAction(action)?.type === 'claim' ? { block: 'The frontier is frozen: you cannot claim land for a few seconds.' } : undefined),
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Frontier frozen: no claims', until: fx.endsAt }),
  },
  {
    id: 'lantern-lands.wardstones',
    name: 'Hexland Wardstones',
    category: 'advantage',
    description: 'For 15 seconds, rival teams cannot raid any land your team holds.',
    target: 'room',
    modes: MODES,
    needs: NEEDS,
    cost: 40,
    cooldownMs: 60_000,
    durationMs: 15_000,
    stacking: 'stack',
    apply: (api, c, fx) => {
      const no = gameOn(api);
      if (no) return no;
      const t = castTeam(api, c);
      if (!rivalsOf(api, t).some((r) => rivalBorder(api, r).some((l) => owner(api)[l] === t))) return { error: 'No rival land touches yours, so nobody can raid you right now.' };
      if (fx) {
        fx.data.team = t;
        fx.data.name = teamName(api, t);
      }
    },
    hooks: {
      gate: (api, fx, id, action) => {
        const a = mapAction(action);
        const t = Number(fx.data.team);
        if (a?.type !== 'raid' || teamOfPlayer(api, id) === t || owner(api)[a.land] !== t) return;
        return { block: `Wardstones protect the ${teamName(api, t)} for a few seconds.` };
      },
    },
    overlay: (fx) => ({ kind: 'badge', text: `Hexland Wardstones: the ${String(fx.data.name)} cannot be raided`, tone: 'info' }),
  },
  {
    id: 'lantern-lands.trembling-hands',
    name: 'Hexland Jitters',
    category: 'troll',
    description: 'For 10 seconds, an opponent cannot claim, fortify or raid. They can still answer questions and save up energy.',
    target: 'opponent',
    modes: MODES,
    needs: NEEDS,
    cost: 25,
    cooldownMs: 35_000,
    durationMs: 10_000,
    hooks: {
      gate: (_api, _fx, _id, action) => (mapAction(action) ? { block: 'Your hands are trembling: no map moves for a few seconds.' } : undefined),
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Trembling hands: no map moves', until: fx.endsAt }),
  },
  {
    id: 'lantern-lands.heavy-lanterns',
    name: 'Heavy Hexland Lanterns',
    category: 'troll',
    description: 'For 20 seconds, every claim, fort or raid an opponent makes costs 1 more energy than usual. A move they cannot pay the extra for is refused.',
    target: 'opponent',
    modes: MODES,
    needs: NEEDS,
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 20_000,
    priority: 30,
    hooks: {
      gate: (api, _fx, id, action) => {
        const a = mapAction(action);
        const have = st(api).members[id]?.energy ?? 0;
        if (!a) return;
        const cost = moveCost(api, a);
        // Short of the usual cost too: the mode refuses it with its own message.
        if (have >= cost && have < cost + 1) return { block: `Heavy lanterns: that move costs you ${cost + 1} energy right now.` };
      },
      delta: {
        // Energy only goes down in this mode when a map move spends it.
        currency: (_api, fx, d) => void ((d[target(fx)] ?? 0) < 0 && (d[target(fx)]! -= 1)),
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Heavy lanterns: moves cost 1 more', tone: 'bad' }),
  },
  {
    id: 'lantern-lands.lantern-credit',
    name: 'Hexland Build Credit',
    category: 'economy',
    description: 'For 15 seconds, the energy your claims, forts and raids cost is handed straight back (you still need enough to make the move).',
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 50,
    cooldownMs: 75_000,
    durationMs: 15_000,
    priority: 40,
    hooks: {
      delta: {
        currency: (_api, fx, d) => void ((d[fx.caster] ?? 0) < 0 && (d[fx.caster] = 0)),
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Lantern credit: moves are free', tone: 'good' }),
  },
  {
    id: 'lantern-lands.wick-siphon',
    name: 'Hexland Energy Siphon',
    category: 'economy',
    description: 'For 20 seconds, whenever an opponent gains energy, 1 of it goes to you instead (while you have room to hold it).',
    target: 'opponent',
    modes: MODES,
    needs: NEEDS,
    cost: 30,
    cooldownMs: 40_000,
    durationMs: 20_000,
    priority: 10,
    hooks: {
      delta: {
        currency: (api, fx, d) => {
          const t = target(fx);
          if ((d[t] ?? 0) <= 0 || !api.ids().includes(fx.caster)) return;
          const max = api.meter('currency')?.max?.(api.s, fx.caster, api.ctx) ?? Infinity;
          if (api.get('currency', fx.caster) >= max) return;
          d[t]! -= 1;
          d[fx.caster] = (d[fx.caster] ?? 0) + 1;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Your wick is being siphoned', tone: 'bad' }),
  },
];

/** Unfortified enemy edge lands Wildfire may burn: never homes or shrines. */
function burnable(api: ChaosApi, e: number): number[] {
  return edgeLands(api, e).filter((l) => !isShrine(api, l) && forts(api)[l] === 0);
}

/** The most fortified land a team holds (never a home), or null. */
function rustTarget(api: ChaosApi, e: number): number | null {
  const f = forts(api);
  const options = owner(api).flatMap((v, l) => (v === e && !isHome(api, l) && f[l]! > 0 ? [l] : []));
  return options.sort((x, y) => f[y]! - f[x]! || x - y)[0] ?? null;
}

/* ----------------- more: the rival border, timing, double moves ----------------- */

/** A team's lands (never homes) that touch a rival team's land: its rival border. */
function borderLands(api: ChaosApi, t: number): number[] {
  const o = owner(api);
  const a = adj(api);
  return o.flatMap((v, l) => (v === t && !isHome(api, l) && a[l]!.some((n) => o[n]! >= 0 && o[n] !== t) ? [l] : []));
}

/** A team's lands (never homes) that no rival land touches, with forts on them. */
function safeForts(api: ChaosApi, t: number): number[] {
  const front = new Set(borderLands(api, t));
  return owner(api).flatMap((v, l) => (v === t && !isHome(api, l) && !front.has(l) && forts(api)[l]! > 0 ? [l] : []));
}

/** The map move a player made in this very transaction, if any (the mode records it on the member). */
function moveNow(api: ChaosApi, id: string): { kind: string; land: number; at: number; fort: number } | null {
  const mv = st(api).members[id]?.move;
  return mv && mv.at === api.now() ? mv : null;
}

/** Points every team would score if a scoring happened now (teams whose players have all left score nothing, as in the mode). */
function scoringNow(api: ChaosApi): number[] {
  return (st(api).teams as unknown[]).map((_, t) => {
    if (!membersOf(api, t).length) return 0;
    const { lands, shrines } = holdings(api, t);
    return scoreFor(lands, shrines, { shrinesOnly: shrinesOnly(api), bloom: bloom(api), glow: inGlow(api) });
  });
}

/** How late the final glow may be pushed: it always covers at least this much of the end. */
const GLOW_KEEP_MS = 15_000;
const GLOW_PUSH_MS = 30_000;

const more: CheatDef[] = [
  {
    id: 'lantern-lands.regroup',
    name: 'Hex Regroup',
    category: 'advantage',
    description: 'Forts on your team\'s lands that no rival land touches move out to its rival border, one at a time, each to the land beside a rival with the fewest forts, up to the most a land can hold (never a home). Forts that do not fit stay where they are.',
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 35,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const no = gameOn(api);
      if (no) return no;
      const t = castTeam(api, c);
      const f = forts(api);
      const max = fortMax(api);
      const safe = safeForts(api, t);
      if (!safe.length) return { error: 'Your team has no forts away from its rival border.' };
      const front = borderLands(api, t);
      if (!front.length) return { error: 'No rival land touches yours, so there is no rival border to move to.' };
      let moved = 0;
      for (const from of safe) {
        while (f[from]! > 0) {
          const to = front.filter((l) => f[l]! < max).sort((x, y) => f[x]! - f[y]! || x - y)[0];
          if (to === undefined) break;
          f[from] = f[from]! - 1;
          f[to] = f[to]! + 1;
          moved++;
        }
      }
      if (!moved) return { error: 'Your team\'s rival border already holds as many forts as it can.' };
      api.feed(`Hex Regroup: the ${teamName(api, t)} moved ${moved} ${moved === 1 ? 'fort' : 'forts'} out to its rival border.`, 'good');
    },
  },
  {
    id: 'lantern-lands.salvage',
    name: 'Hexland Salvage',
    category: 'economy',
    description: 'Take forts down off your team\'s lands that no rival land touches (never a home) and gain 1 energy for each, as many as you have room to hold (one more than the room\'s energy cap). The most fortified of those lands goes first.',
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 25,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const no = gameOn(api);
      if (no) return no;
      const t = teamOfPlayer(api, c.caster);
      const f = forts(api);
      if (!safeForts(api, t).length) return { error: 'Your team has no forts away from its rival border.' };
      const max = api.meter('currency')?.max?.(api.s, c.caster, api.ctx) ?? 0;
      let room = max - api.get('currency', c.caster);
      if (room <= 0) return { error: 'Your energy is already full.' };
      let taken = 0;
      for (; room > 0; room--) {
        const l = safeForts(api, t).sort((x, y) => f[y]! - f[x]! || x - y)[0];
        if (l === undefined) break;
        f[l] = f[l]! - 1;
        taken++;
      }
      api.add('currency', c.caster, taken);
      api.feed(`Hexland Salvage: ${api.name(c.caster)} took down ${taken} ${taken === 1 ? 'fort' : 'forts'} away from the rival border for ${taken} energy.`, 'info');
    },
  },
  {
    id: 'lantern-lands.snap-tally',
    name: 'Hexland Snap Tally',
    category: 'round',
    description: 'The next scoring comes right now for every team, scored by the mode exactly as usual, and the one after it a full interval later. Not when the next scoring is under 2 seconds away anyway, and not when it could reach the points goal (that scoring must come on time).',
    target: 'room',
    modes: MODES,
    needs: NEEDS,
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      const no = gameOn(api);
      if (no) return no;
      const s = st(api);
      const now = api.now();
      if (s.nextScoreAt > s.endsAt) return { error: 'There is no scoring left before time runs out.' };
      if (s.nextScoreAt - now < 2000) return { error: 'The next scoring is about to happen anyway.' };
      const goal = Number(api.ctx.settings.goalPoints) || 0;
      const gains = scoringNow(api);
      if (goal > 0 && gains.some((g, t) => (s.points[t] ?? 0) + g >= goal)) return { error: 'That scoring could win the game, so it has to come on time.' };
      s.nextScoreAt = now;
      api.ctx.setTimer('score', now);
      api.feed('Hexland Snap Tally: every team scores its lands right now.', 'big');
    },
  },
  {
    id: 'lantern-lands.late-glow',
    name: 'Late Hexland Glow',
    category: 'round',
    description: `The final glow, when every score counts double, starts ${GLOW_PUSH_MS / 1000} seconds later, but it always covers at least the last ${GLOW_KEEP_MS / 1000} seconds. Not once it has begun.`,
    target: 'room',
    modes: MODES,
    needs: NEEDS,
    cost: 35,
    cooldownMs: 120_000,
    undoable: false,
    apply: (api) => {
      const no = gameOn(api);
      if (no) return no;
      const s = st(api);
      if (api.now() >= s.glowAt) return { error: 'The final glow has already begun.' };
      const at = Math.min(s.glowAt + GLOW_PUSH_MS, s.endsAt - GLOW_KEEP_MS);
      if (at <= s.glowAt) return { error: 'The final glow cannot start any later.' };
      const moved = Math.round((at - s.glowAt) / 1000);
      s.glowAt = at;
      api.ctx.setTimer('glow', at);
      api.feed(`Late Hexland Glow: the final glow comes ${moved} seconds later.`, 'big');
    },
  },
  {
    id: 'lantern-lands.twin-lanterns',
    name: 'Hexland Twin Lanterns',
    category: 'advantage',
    description: 'For 15 seconds each raid you make takes 2 forts off a rival land instead of 1 (a land still needs a raid on no forts to be captured), and each fort you build adds 2, up to the most a land can hold. Raids still wait out a lantern storm.',
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 35,
    cooldownMs: 50_000,
    durationMs: 15_000,
    hooks: {
      delta: {
        // Energy only goes down in this mode when a map move spends it.
        currency: (api, fx, d) => {
          const id = fx.caster;
          if (!((d[id] ?? 0) < 0) || over(api)) return;
          const mv = moveNow(api, id);
          if (!mv) return;
          const t = teamOfPlayer(api, id);
          const f = forts(api);
          const o = owner(api)[mv.land]!;
          if (mv.kind === 'raid' && o >= 0 && o !== t && f[mv.land]! > 0 && !storm(api)) f[mv.land] = f[mv.land]! - 1;
          else if (mv.kind === 'fortify' && o === t && f[mv.land]! < fortMax(api)) f[mv.land] = f[mv.land]! + 1;
          else return;
          mv.fort = f[mv.land]!;
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Twin lanterns: raids and forts count twice', tone: 'good' }),
  },
  {
    id: 'lantern-lands.foundations',
    name: 'Hexland Foundations',
    category: 'advantage',
    description: 'For 20 seconds, every land a player on your team claims or captures gets 1 more fort straight away (up to the most a land can hold).',
    target: 'self',
    modes: MODES,
    needs: NEEDS,
    cost: 35,
    cooldownMs: 50_000,
    durationMs: 20_000,
    apply: (api, c, fx) => {
      const no = gameOn(api);
      if (no) return no;
      if (fx) fx.data.team = teamOfPlayer(api, c.caster);
    },
    hooks: {
      delta: {
        currency: (api, fx, d) => {
          if (over(api)) return;
          const t = Number(fx.data.team);
          const f = forts(api);
          for (const [id, change] of Object.entries(d)) {
            if (!(change < 0) || teamOfPlayer(api, id) !== t) continue;
            const mv = moveNow(api, id);
            if (!mv || (mv.kind !== 'claim' && mv.kind !== 'capture') || owner(api)[mv.land] !== t || f[mv.land]! >= fortMax(api)) continue;
            f[mv.land] = f[mv.land]! + 1;
            mv.fort = f[mv.land]!;
          }
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Foundations: new lands come with a fort', tone: 'good' }),
  },
  {
    id: 'lantern-lands.border-toll',
    name: 'Hexland Border Toll',
    category: 'score',
    description: 'The enemy team pays your team a toll out of its points: 1 point for each of its lands that touches yours (2 in the final glow). Never more than it has, and never up to the points goal.',
    target: 'enemy-team',
    modes: MODES,
    needs: [...TEAM_NEEDS, 'meter:teamScore'],
    cost: 35,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const no = gameOn(api);
      if (no) return no;
      const e = enemyOf(api, c);
      const t = teamOfPlayer(api, c.caster);
      const o = owner(api);
      const a = adj(api);
      const touching = o.filter((v, l) => v === e && a[l]!.some((n) => o[n] === t)).length;
      if (!touching) return { error: `No land of the ${teamName(api, e)} touches yours.` };
      const got = transfer(api, 'teamScore', teamIdOf(api, e), teamIdOf(api, t), touching * (inGlow(api) ? 2 : 1));
      if (!got) return { error: `The ${teamName(api, e)} have no points to pay, or your team is as close to the goal as chaos can take it.` };
      api.feed(`Hexland Border Toll: the ${teamName(api, e)} paid the ${teamName(api, t)} ${got} ${got === 1 ? 'point' : 'points'} for ${touching} border ${touching === 1 ? 'land' : 'lands'}.`, 'bad');
    },
  },
];

const cheats: CheatDef[] = [...map, ...energy, ...scoring, ...events, ...lasting, ...more];

defineCheats(cheats);
