import { fieldMeter, streamParts } from './helpers.ts';
import type { ChaosAdapter, MeterDef } from '../types.ts';
import type { ModeContext, PlayerId } from '../../sdk/types.ts';
import { MAX_LURE } from '../../modes/big-catch/meta.ts';
import { formatWeight, tankValue, type TankFish } from '../../modes/big-catch/odds.ts';
import { speciesById, type Rarity, type SpeciesId } from '../../modes/big-catch/species.ts';

/*
 * How Big Catch looks to cheats.
 *
 * The score is the wallet (points from fish sold, less what lures cost) plus
 * the tank (every fish's points and the set bonuses), exactly as the mode
 * ranks players. Writing it moves the wallet. When a cheat takes more than
 * the wallet holds, fish are sold from the tank to make up the difference
 * (keeping the most valuable tank that fits) and the player is told which;
 * so a write always lands on exactly the score asked for, nothing is created
 * or lost on the way, and no wallet goes below zero.
 *
 * In Trophy Hunt the score is the points of the three heaviest fish, which
 * no cheat can write without inventing weights. There the score meter is not
 * offered (so cheats that need it are not either) and reads only.
 *
 * The wallet is the game's currency in both: it buys lures. Casts and the
 * lure level are meters too, so cheats that move them can be undone. The
 * three watch meters (casts made, fish landed, fish lost) never change from
 * chaos; they let lasting cheats act in the very transaction a cast, a
 * landing or a lost fish happens.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type Settings = Record<string, unknown> | undefined;

const fishers = (s: any): Record<PlayerId, any> | undefined => s?.fishers;
export const isTrophyHunt = (settings: Settings) => settings?.trophyHunt === true;
const rarityOf = (id: SpeciesId): Rarity => speciesById(id)?.rarity ?? 'common';

/** What a tank is worth, with set bonuses (none in Trophy Hunt). */
export const tankPoints = (tank: readonly TankFish[], sets = true) => tankValue(tank, rarityOf, sets).total;

/** A player's score as the mode ranks it. */
export function bigCatchScore(f: any, settings: Settings): number {
  if (!f) return 0;
  return isTrophyHunt(settings) ? tankPoints(f.tank, false) : Number(f.wallet) + tankPoints(f.tank);
}

/**
 * The fish to keep (by index) when a score must fall below what the tank is
 * worth: the most valuable selection worth no more than `limit`. Ties keep
 * more fish, then the ones caught first. A tank holds at most 6, so trying
 * every selection is cheap.
 */
export function tankUnder(tank: readonly TankFish[], limit: number): number[] {
  let best: number[] = [];
  let bestValue = -1;
  for (let mask = 0; mask < 1 << tank.length; mask++) {
    const keep = tank.map((_, i) => i).filter((i) => mask & (1 << i));
    const value = tankPoints(keep.map((i) => tank[i]!));
    if (value > limit) continue;
    const better =
      value > bestValue ||
      (value === bestValue && keep.length > best.length) ||
      (value === bestValue && keep.length === best.length && keep.join() < best.join());
    if (better) {
      best = keep;
      bestValue = value;
    }
  }
  return best;
}

function writeScore(s: any, id: PlayerId, v: number, ctx: ModeContext) {
  const f = fishers(s)?.[id];
  if (!f || isTrophyHunt(ctx.settings)) return;
  const inTank = tankPoints(f.tank);
  if (v >= inTank) {
    f.wallet = v - inTank;
    return;
  }
  const keep = tankUnder(f.tank, v);
  const sold = (f.tank as any[]).filter((_, i) => !keep.includes(i));
  f.tank = keep.map((i) => f.tank[i]);
  f.wallet = v - tankPoints(f.tank);
  if (sold.length && typeof ctx.feed === 'function') {
    const names = sold.map((fish) => `${speciesById(fish.species)?.name.toLowerCase() ?? 'fish'} (${formatWeight(fish.grams)})`);
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
    ctx.feed(`Chaos took more points than your wallet held, so your ${list} ${sold.length === 1 ? 'was' : 'were'} sold from your tank to pay.`, { tone: 'bad', to: [id] });
  }
}

const scoreMeter: MeterDef = {
  key: 'score',
  label: 'Score',
  scope: 'player',
  get: (s, id, ctx) => bigCatchScore(fishers(s)?.[id], ctx?.settings),
  set: (s, id, v, ctx) => writeScore(s, id, v, ctx),
  // Trophy Hunt: read only (and not offered).
  min: (s, id, ctx) => (isTrophyHunt(ctx.settings) ? bigCatchScore(fishers(s)?.[id], ctx.settings) : 0),
  max: (s, id, ctx) => (isTrophyHunt(ctx.settings) ? bigCatchScore(fishers(s)?.[id], ctx.settings) : Number.MAX_SAFE_INTEGER),
  offered: (settings) => !isTrophyHunt(settings),
};

/** A count the mode keeps that chaos watches (its delta hooks see who it changed for) but never writes. */
function watchMeter(key: string, label: string, read: (f: any) => number): MeterDef {
  const at = (s: any, id: string) => {
    const f = fishers(s)?.[id];
    return f ? read(f) : 0;
  };
  return { key, label, scope: 'player', get: at, set: () => {}, min: at, max: at };
}

export const bigCatchAdapter: ChaosAdapter = {
  modeId: 'big-catch',
  meters: [
    scoreMeter,
    // Points to spend on lures. Outside Trophy Hunt they are part of the score as well.
    fieldMeter('currency', 'Wallet', fishers, 'wallet'),
    fieldMeter('casts', 'Casts', fishers, 'casts'),
    // The lure a player fishes with; buying the next one is still the mode's move.
    fieldMeter('lure', 'Lure', fishers, 'lure', { max: () => MAX_LURE }),
    watchMeter('casted', 'Casts made', (f) => f.casted),
    watchMeter('landed', 'Fish landed', (f) => f.landed),
    watchMeter('lost', 'Fish lost', (f) => f.escaped + f.spooked),
  ],
  ...streamParts((s: any, id) => s.fishers[id]?.stream),
  features: (st) => [
    // A tank to keep fish in, and a catch on the table to sell or keep, exist outside Trophy Hunt.
    ...(isTrophyHunt(st) ? ['trophy-hunt'] : ['tank']),
    ...(st.frenzy === true ? ['frenzy'] : []),
    ...(st.deepSea === true ? ['deep-sea'] : []),
    ...(st.deepSea !== true && (st.water ?? 'rotate') === 'rotate' ? ['rotation'] : []),
    // Events run when switched on, and always in Frenzy; only outside Frenzy are there gaps to start one in.
    ...(st.events !== false || st.frenzy === true ? ['events'] : []),
    ...(st.events !== false && st.frenzy !== true ? ['event-gaps'] : []),
  ],
};
