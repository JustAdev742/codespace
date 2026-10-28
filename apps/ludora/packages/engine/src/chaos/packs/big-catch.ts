import { defineCheats } from '../registry.ts';
import type { ActiveEffect, ChaosApi, CheatDef } from '../types.ts';
import { odds, rollOdds, share, target, transfer } from '../cheats/kit.ts';
import { isTrophyHunt } from '../adapters/big-catch.ts';
import { drawCatch } from '../../modes/big-catch/index.ts';
import {
  DECIDE_SEC,
  EVENTS,
  EVENT_INFO,
  EVENT_TIMING,
  LURES,
  MAX_LURE,
  PERFECT_BONUS,
  REEL_WINDOW_MS,
  SET_BONUS,
  SET_SIZE,
  TANK_SIZE,
  TROPHY_COUNT,
  WATER_ROTATE_SEC,
  type EventId,
} from '../../modes/big-catch/meta.ts';
import { formatWeight, gramsFor, nextWater, pointsFor, speciesWeights, type OddsMoment } from '../../modes/big-catch/odds.ts';
import { RARITIES, RARITY_INFO, WATERS, WATER_INFO, speciesById, type SpeciesId, type WaterId } from '../../modes/big-catch/species.ts';

/*
 * Cheats that only make sense in Big Catch: casts, the line (the wait, the
 * bite and the reel), the catch on the table, the tank and its sets, lures,
 * room events and the boat's water.
 *
 * Points, casts and lures move through the adapter's meters (score, currency,
 * casts, lure), so those cheats can be undone. Cheats that change the line,
 * the tank, a catch, an event or the water write the mode's state and are not.
 *
 * Catches are never chosen by a cheat. Every fish a cheat brings in is drawn
 * with the mode's own drawCatch from the odds table players see (the water,
 * their lure and the event), or from one rarity's rows of it; a cheat that
 * changes a weight draws it again from the species' own weight table with
 * gramsFor. Each description says which table it uses. Weights only ever move
 * by the mode's own rules (a perfect catch is 10% heavier), so every fish is
 * one the mode could have landed.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const MODE = 'big-catch';
const M = [MODE] as const;
const TOP_KEEP = 10;
const BIGGEST_KEEP = 5;
const RARE_KEEP = 8;
const RECORD_FEED_GRAMS = 5000;
/** Strong Line: how much longer a bite stays on the line. */
const STRONG_LINE_MS = 2000;
/** Fish Auction: how much over the market price the tank fetches. */
const AUCTION_PREMIUM = 1.25;
const EVENT_SEC = EVENT_TIMING.lastsSec;

type Api = ChaosApi;
type Line = any;

const fisher = (api: Api, id: string): any => api.s.fishers[id];
const settingsOf = (api: Api) => api.ctx.settings as Record<string, unknown>;
const trophy = (api: Api) => isTrophyHunt(settingsOf(api));
const lineTimer = (id: string) => `line:${id}`;
const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;
const pointsText = (n: number) => plural(n, 'point', 'points');
const inWater = (line: Line | undefined) => line?.phase === 'waiting' || line?.phase === 'biting';
const waterName = (w: WaterId) => WATER_INFO[w].label.toLowerCase();

/** Names that keep their capital letter mid-sentence (as the mode writes them). */
const PROPER: ReadonlySet<string> = new Set(['australianBass', 'murrayCod']);

/** "golden perch", "Murray cod", "the Silver Ghost". */
function fishName(id: SpeciesId): string {
  const s = speciesById(id)!;
  if (s.rarity === 'legend') return s.name.replace(/^The /, 'the ');
  return PROPER.has(id) ? s.name : s.name.charAt(0).toLowerCase() + s.name.slice(1);
}

/** "a golden perch", "an Australian bass", "Old Mossback". */
function aFish(id: SpeciesId): string {
  const name = fishName(id);
  if (speciesById(id)!.rarity === 'legend') return name;
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}

const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function idleLine(seq: number, water: WaterId) {
  return { phase: 'idle', seq, castAt: 0, biteAt: 0, water, hooked: null, landed: null, decideBy: 0 };
}

/** The odds of this moment for a player, as the mode works them out (with any field overridden). */
function momentFor(api: Api, id: string, over: Partial<OddsMoment> = {}): OddsMoment {
  const st = settingsOf(api);
  return {
    water: api.s.water,
    lure: fisher(api, id).lure,
    event: api.s.event?.id ?? null,
    deepSea: st.deepSea === true,
    frenzy: st.frenzy === true,
    ...over,
  };
}

function insertSorted(list: { grams: number; at: number }[], item: { grams: number; at: number }, keep: number) {
  list.push(item);
  list.sort((a, b) => b.grams - a.grams || a.at - b.at);
  list.length = Math.min(list.length, keep);
}

/* ------------------------------ catches ------------------------------ */

/**
 * Land a fish the way the mode's land() does: the player's catches and
 * stats, the room's totals, the heaviest fish, species records and the rare
 * tank. Where the fish goes next (the table, the wallet, the tank) is up to
 * the caller.
 */
function landFish(api: Api, id: string, hooked: { species: SpeciesId; grams: number }, perfect = false) {
  const s = api.s;
  const f = fisher(api, id);
  const now = api.now();
  const grams = perfect ? Math.round(hooked.grams * (1 + PERFECT_BONUS)) : hooked.grams;
  const fish = { id: ++s.fishSeq, species: hooked.species, grams, perfect, at: now };
  f.landed++;
  f.landedGrams += grams;
  if (perfect) {
    f.perfect++;
    s.totals.perfect++;
  }
  s.totals.landed++;
  s.totals.grams += grams;
  insertSorted(f.top, fish, TOP_KEEP);
  const h = { by: id, species: fish.species, grams, at: now };
  const wasBiggest = s.biggest[0]?.grams ?? 0;
  insertSorted(s.biggest, h, BIGGEST_KEEP);
  const record = s.records[fish.species];
  if (!record || grams > record.grams) s.records[fish.species] = h;
  const rarity = speciesById(fish.species)!.rarity;
  if (rarity === 'rare' || rarity === 'legend') s.rare = [h, ...s.rare].slice(0, RARE_KEEP);
  if (rarity === 'legend') api.feed(`${api.name(id)} landed ${fishName(fish.species)}: ${formatWeight(grams)}!`, 'big');
  else if (grams > wasBiggest && grams >= RECORD_FEED_GRAMS) api.feed(`${api.name(id)} landed the biggest catch so far: a ${formatWeight(grams)} ${fishName(fish.species)}.`, 'big');
  return fish;
}

/** Sell a fish at once, as every fish is in Trophy Hunt: its points go to the wallet, and in Trophy Hunt it may become a trophy. */
function sellAtOnce(api: Api, id: string, fish: any): { points: number; trophy: boolean } {
  const f = fisher(api, id);
  const points = pointsFor(fish.grams);
  f.wallet += points;
  f.sold += points;
  if (!trophy(api)) return { points, trophy: false };
  insertSorted(f.tank, fish, TROPHY_COUNT);
  return { points, trophy: f.tank.some((t: any) => t.id === fish.id) };
}

/** Land the fish biting on a line now, as if it had been reeled (not perfect): on the table, or sold at once in Trophy Hunt. */
function landFromLine(api: Api, id: string, how: string) {
  const f = fisher(api, id);
  const line = f.line;
  const now = api.now();
  const fish = landFish(api, id, line.hooked);
  if (trophy(api)) {
    const { points, trophy: isTrophy } = sellAtOnce(api, id, fish);
    api.ctx.clearTimer(lineTimer(id));
    f.outcome = {
      seq: line.seq,
      at: now,
      kind: 'sold',
      fish,
      escaped: null,
      points,
      auto: false,
      trophy: isTrophy,
      set: null,
      title: `${speciesById(fish.species)!.name}, ${formatWeight(fish.grams)}`,
      detail: `${isTrophy ? 'A new trophy! ' : ''}${how} Sold for ${pointsText(points)} to spend on lures.`,
    };
    f.line = idleLine(line.seq, line.water);
    return fish;
  }
  f.line = { ...line, phase: 'landed', landed: fish, decideBy: now + DECIDE_SEC * 1000 };
  api.ctx.setTimer(lineTimer(id), f.line.decideBy);
  return fish;
}

/** The fish this player landed in this very transaction (on the table, or sold at once in Trophy Hunt). */
function freshLanding(api: Api, id: string): any | null {
  const f = fisher(api, id);
  const now = api.now();
  if (f?.line.phase === 'landed' && f.line.landed?.at === now) return f.line.landed;
  if (trophy(api) && f?.outcome?.kind === 'sold' && f.outcome.fish?.at === now) return f.outcome.fish;
  return null;
}

/**
 * Change the weight of a fish already landed, everywhere the mode keeps it:
 * the line or result card, the player's catches and stats, the room's
 * totals and highlights, and in Trophy Hunt the wallet and the trophies.
 */
function reweigh(api: Api, id: string, fishId: number, grams: number, perfect: boolean) {
  const s = api.s;
  const f = fisher(api, id);
  let old: number | null = null;
  let species: SpeciesId | null = null;
  let at = 0;
  const touch = (x: any) => {
    if (!x || x.id !== fishId) return;
    old ??= x.grams;
    species = x.species;
    at = x.at;
    x.grams = grams;
    if (perfect) x.perfect = true;
  };
  for (const x of f.top) touch(x);
  for (const x of f.tank) touch(x);
  touch(f.line.landed);
  touch(f.outcome?.fish);
  if (old === null || species === null) return;
  const was: number = old;
  const sp: SpeciesId = species;
  const diff = grams - was;
  f.landedGrams += diff;
  s.totals.grams += diff;
  if (perfect) {
    f.perfect++;
    s.totals.perfect++;
  }
  const byGrams = (a: any, b: any) => b.grams - a.grams || a.at - b.at;
  f.top.sort(byGrams);
  const same = (h: any) => h.by === id && h.at === at && h.species === sp;
  for (const h of [...s.biggest, ...s.rare, ...Object.values(s.records)] as any[]) if (same(h)) h.grams = grams;
  if (!s.biggest.some(same)) insertSorted(s.biggest, { by: id, species: sp, grams, at } as any, BIGGEST_KEEP);
  s.biggest.sort(byGrams);
  const record = s.records[sp];
  if (!record || grams > record.grams) s.records[sp] = { by: id, species: sp, grams, at };
  if (!trophy(api)) return;
  const gained = pointsFor(grams) - pointsFor(was);
  f.wallet += gained;
  f.sold += gained;
  const fish = f.top.find((x: any) => x.id === fishId) ?? f.outcome?.fish;
  if (fish && !f.tank.some((x: any) => x.id === fishId)) insertSorted(f.tank, fish, TROPHY_COUNT);
  else f.tank.sort(byGrams);
  if (f.outcome?.fish?.id === fishId) {
    const isTrophy = f.tank.some((x: any) => x.id === fishId);
    const points = pointsFor(grams);
    f.outcome = {
      ...f.outcome,
      points,
      trophy: isTrophy,
      title: `${speciesById(sp)!.name}, ${formatWeight(grams)}${perfect ? ': perfect!' : ''}`,
      detail: `${isTrophy ? 'A new trophy! ' : ''}Sold for ${pointsText(points)} to spend on lures.`,
    };
  }
}

/* ------------------------------ casts ------------------------------ */

const SPOT = 'big-catch.secret-spot';
const GOLDEN_BAIT = 'big-catch.golden-bait';
const REDRAWS = [SPOT, GOLDEN_BAIT];

/** The line this player cast in this very transaction, if they cast one. */
function freshCast(api: Api, id: string, d: Record<string, number>): Line | null {
  if (!(d[id]! > 0)) return null;
  const line = fisher(api, id)?.line;
  return line?.phase === 'waiting' && line.castAt === api.now() && line.hooked ? line : null;
}

/** The odds a player's cast is drawn with while their own cheats are on: Secret Spot's water and Golden Bait. */
function castMoment(api: Api, id: string): OddsMoment {
  const mine = api.effectsOn(id);
  const spot = mine.find((e) => e.cheatId === SPOT);
  const golden = mine.some((e) => e.cheatId === GOLDEN_BAIT);
  return momentFor(api, id, { ...(spot ? { water: spot.params.water as WaterId } : {}), ...(golden ? { event: 'golden' as EventId } : {}) });
}

/** Draw a fresh cast's fish again from the odds table of the player's own cheats, once per cast. */
function redrawCast(api: Api, fx: ActiveEffect, id: string, line: Line) {
  if (api.effectsOn(id).some((e) => REDRAWS.includes(e.cheatId) && e.data.drawn === line.seq)) return;
  fx.data.drawn = line.seq;
  const m = castMoment(api, id);
  if (m.water === line.water && m.event === (api.s.event?.id ?? null)) return;
  line.hooked = drawCatch(m, api.rng);
  line.water = m.water;
}

/** How many times Lucky Scales and Skinny Fish weigh a fish. */
const WEIGHINGS = 3;

/**
 * Weigh the fish on a fresh cast WEIGHINGS times in all (the mode's own draw
 * and more draws from its species' weight table, with the odds it was drawn
 * with) and keep the heaviest or the lightest. Returns how much it changed.
 */
function weighAgain(api: Api, id: string, line: Line, keep: 'heaviest' | 'lightest'): number {
  const species = speciesById(line.hooked.species)!;
  const m = { ...castMoment(api, id), water: line.water };
  let grams = line.hooked.grams;
  for (let i = 1; i < WEIGHINGS; i++) {
    const g = gramsFor(species, api.rng.next(), m);
    grams = keep === 'heaviest' ? Math.max(grams, g) : Math.min(grams, g);
  }
  const changed = grams - line.hooked.grams;
  if (changed) line.hooked = { ...line.hooked, grams };
  return changed;
}

/** Stretch or shrink the wait for the bite on a fresh cast. */
function scaleWait(api: Api, id: string, line: Line, factor: number) {
  line.biteAt = line.castAt + Math.max(1, Math.round((line.biteAt - line.castAt) * factor));
  api.ctx.setTimer(lineTimer(id), line.biteAt);
}

/* ------------------------------ events ------------------------------ */

const EVENT_LINES: Record<EventId, string> = {
  feeding: `Feeding Time: bites come twice as fast for ${EVENT_SEC} seconds.`,
  golden: `Golden Hour: rarer fish are more likely for ${EVENT_SEC} seconds.`,
  school: `Passing School: common fish are half as heavy again for ${EVENT_SEC} seconds.`,
};

const eventOn = (api: Api) => Boolean(api.s.event && api.s.event.endsAt > api.now());

/** An event that now runs past the next one's start pushes that start back to its end, so it is not cut short. */
function keepNextAfter(api: Api) {
  const s = api.s;
  if (!s.event || s.nextEventAt === null || s.nextEventAt >= s.event.endsAt) return;
  if (s.event.endsAt < s.endsAt) {
    s.nextEventAt = s.event.endsAt;
    api.ctx.setTimer('event', s.nextEventAt);
  } else {
    s.nextEventAt = null;
    api.ctx.clearTimer('event');
  }
}

function startEvent(api: Api, id: EventId) {
  const now = api.now();
  api.s.event = { id, startedAt: now, endsAt: now + EVENT_SEC * 1000 };
  api.s.lastEvent = id;
  api.ctx.setTimer('eventEnd', api.s.event.endsAt);
  keepNextAfter(api);
  api.feed(EVENT_LINES[id], 'big');
}

function startCheat(id: string, name: string, event: EventId, cost: number): CheatDef {
  return {
    id,
    name,
    category: 'round',
    description: `Start ${EVENT_INFO[event].label} for everyone now: ${EVENT_INFO[event].blurb.charAt(0).toLowerCase()}${EVENT_INFO[event].blurb.slice(1, -1)} for ${EVENT_SEC} seconds. Not while another event is on.`,
    target: 'room',
    modes: M,
    needs: ['event-gaps'],
    cost,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api) => {
      if (eventOn(api)) return { error: `${EVENT_INFO[api.s.event.id as EventId].label} is already on.` };
      startEvent(api, event);
    },
  };
}

/* ------------------------------ lures ------------------------------ */

const LURE_TAG = 'big-catch-lure';

/** A purchase the mode would accept right now: the next lure, with the points for it. */
function wouldBuyLure(api: Api, playerId: string, action: any): boolean {
  const f = fisher(api, playerId);
  return action?.type === 'lure' && f && action.level === f.lure + 1 && f.lure < MAX_LURE && f.wallet >= LURES[action.level]!.price;
}

const cheats: CheatDef[] = [
  /* ------------------------------- your line ------------------------------- */
  {
    id: 'big-catch.bait-bucket',
    name: 'Bait Bucket',
    category: 'advantage',
    description: 'Get 3 casts straight away, without answering.',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      if (api.add('casts', c.caster, 3) <= 0) return { error: 'You cannot hold any more casts.' };
    },
  },
  {
    id: 'big-catch.hungry-fish',
    name: 'Hungry Fish',
    category: 'advantage',
    description: 'The fish on your line bites right now, instead of keeping you waiting. Reel within 3 seconds to land it.',
    target: 'self',
    modes: M,
    cost: 20,
    cooldownMs: 30_000,
    undoable: false,
    apply: (api, c) => {
      const line = fisher(api, c.caster)?.line;
      if (line?.phase === 'biting') return { error: 'A fish is already biting. Reel!' };
      if (line?.phase !== 'waiting') return { error: 'Your line is not in the water. Cast first.' };
      line.biteAt = api.now();
      api.ctx.setTimer(lineTimer(c.caster), api.now());
      api.feed('Hungry Fish: something grabs your bait!', 'good', [c.caster]);
    },
  },
  {
    id: 'big-catch.strong-line',
    name: 'Strong Line',
    category: 'advantage',
    description: `For 20 seconds, every fish that bites on your line stays on ${STRONG_LINE_MS / 1000} seconds longer before it gets away: ${(REEL_WINDOW_MS + STRONG_LINE_MS) / 1000} seconds to reel instead of ${REEL_WINDOW_MS / 1000}. A perfect catch still needs a reel in the first half second.`,
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    tickMs: 250,
    hooks: {
      // Just before it would get away, the bite is moved 2 seconds later, which the reel countdown shows.
      tick: (api, fx) => {
        const id = target(fx);
        const line = fisher(api, id)?.line;
        if (line?.phase !== 'biting' || api.now() - line.biteAt < REEL_WINDOW_MS - 400) return;
        const done = (fx.data.done ?? []) as number[];
        if (done.includes(line.seq)) return;
        line.biteAt += STRONG_LINE_MS;
        api.ctx.setTimer(lineTimer(id), line.biteAt + REEL_WINDOW_MS);
        fx.data.done = [...done.slice(-4), line.seq];
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Strong Line', tone: 'good' }),
  },
  {
    id: 'big-catch.perfect-strike',
    name: 'Perfect Strike',
    category: 'score',
    description: `For 45 seconds, the next fish you land counts as a perfect catch, ${Math.round(PERFECT_BONUS * 100)}% heavier, even if your timing was off. If your reel was perfect anyway, it waits for the next one. Used up when it helps.`,
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 45_000,
    hooks: {
      delta: {
        landed: (api, fx, d) => {
          const id = target(fx);
          if (!(d[id]! > 0)) return;
          const fish = freshLanding(api, id);
          if (!fish || fish.perfect) return;
          const grams = Math.round(fish.grams * (1 + PERFECT_BONUS));
          reweigh(api, id, fish.id, grams, true);
          api.feed(`Perfect Strike: that ${fishName(fish.species)} counts as a perfect catch, ${formatWeight(grams)}.`, 'good', [id]);
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Perfect Strike', tone: 'good' }),
  },
  {
    id: 'big-catch.lucky-scales',
    name: 'Lucky Scales',
    category: 'score',
    description: `For 40 seconds, each fish that takes your bait is weighed ${WEIGHINGS} times, every weighing drawn from its species' weight table (with your lure and the event), and you keep the heaviest.`,
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 40_000,
    priority: 20,
    hooks: {
      delta: {
        casted: (api, fx, d) => {
          const id = target(fx);
          const line = freshCast(api, id, d);
          if (line) weighAgain(api, id, line, 'heaviest');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Lucky Scales', tone: 'good' }),
  },
  {
    id: 'big-catch.spare-rod',
    name: 'Spare Rod',
    category: 'score',
    description:
      'A spare rod lands a fish for you straight away, drawn from the odds table for the water you are fishing (with your lure and the event), and sells it at once for its points. In Trophy Hunt it can become one of your trophies.',
    target: 'self',
    modes: M,
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const fish = landFish(api, c.caster, drawCatch(momentFor(api, c.caster), api.rng));
      const sold = sellAtOnce(api, c.caster, fish);
      api.feed(`Spare Rod: ${aFish(fish.species)}, ${formatWeight(fish.grams)}, sold for ${pointsText(sold.points)}${sold.trophy ? ': a new trophy!' : '.'}`, 'good', [c.caster]);
    },
  },
  {
    id: 'big-catch.landing-net',
    name: 'Landing Net',
    category: 'advantage',
    description: 'For 40 seconds, the next fish that would get away from you is scooped up in your net and landed instead (not a perfect catch). Used up when it saves one.',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 50_000,
    durationMs: 40_000,
    tickMs: 250,
    hooks: {
      tick: (api, fx) => {
        const id = target(fx);
        const line = fisher(api, id)?.line;
        // A quarter of a second before the reel window closes, the net goes in.
        if (line?.phase !== 'biting' || api.now() - line.biteAt < REEL_WINDOW_MS - 250) return;
        const fish = landFromLine(api, id, 'Scooped up in your landing net.');
        api.feed(`Landing Net: ${aFish(fish.species)} was about to get away, so you netted it.`, 'good', [id]);
        api.endEffect(fx.eid, 'used');
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Landing Net', tone: 'good' }),
  },
  {
    id: 'big-catch.patient-bobber',
    name: 'Patient Bobber',
    category: 'advantage',
    description: 'For 30 seconds, reeling in before a fish bites does nothing, instead of scaring the fish away. Your line stays in the water.',
    target: 'self',
    modes: M,
    cost: 20,
    cooldownMs: 45_000,
    durationMs: 30_000,
    hooks: {
      gate: (api, _fx, playerId, action: any) => {
        if (action?.type !== 'reel') return;
        const line = fisher(api, playerId)?.line;
        if (line?.phase === 'waiting' && api.now() < line.biteAt) return { block: 'Patient Bobber: nothing is biting yet, so the fish stays.' };
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Patient Bobber', tone: 'good' }),
  },
  {
    id: 'big-catch.lucky-sinker',
    name: 'Lucky Sinker',
    category: 'advantage',
    description: 'For 30 seconds, every fish that gets away from you, or that you scare off by reeling too soon, gives you the cast back.',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 50_000,
    durationMs: 30_000,
    hooks: {
      delta: {
        lost: (api, fx, d) => {
          const id = target(fx);
          if (!(d[id]! > 0)) return;
          if (api.add('casts', id, d[id]!) > 0) api.feed('Lucky Sinker: you get that cast back.', 'good', [id]);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Lucky Sinker', tone: 'good' }),
  },
  {
    id: SPOT,
    name: 'Secret Spot',
    category: 'advantage',
    description:
      "For 30 seconds, your casts go into the water you pick (river, estuary or reef) wherever the boat is: each catch is drawn from that water's odds table, with your lure and the event. Only in games where the boat moves between the waters.",
    target: 'self',
    modes: M,
    needs: ['rotation'],
    params: [{ key: 'water', label: 'Water', kind: 'choice', options: WATERS.map((w) => ({ value: w, label: WATER_INFO[w].label })), default: 'reef' }],
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 30_000,
    priority: 10,
    apply: (api, c) => {
      if (c.params.water === api.s.water) return { error: `The boat is already on the ${waterName(api.s.water)}.` };
    },
    hooks: {
      delta: {
        casted: (api, fx, d) => {
          const id = target(fx);
          const line = freshCast(api, id, d);
          if (line) redrawCast(api, fx, id, line);
        },
      },
    },
    overlay: (fx) => ({ kind: 'badge', text: `Secret Spot: ${WATER_INFO[fx.params.water as WaterId].label}`, tone: 'good' }),
  },
  {
    id: GOLDEN_BAIT,
    name: 'Golden Bait',
    category: 'advantage',
    description: "For 20 seconds, every cast you make is drawn from the Golden Hour odds table (rarer fish more likely), whatever event the room has. The fish's weights follow Golden Hour too.",
    target: 'self',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 20_000,
    priority: 10,
    apply: (api) => {
      if (api.s.event?.id === 'golden' && eventOn(api)) return { error: 'Golden Hour is already on for everyone.' };
    },
    hooks: {
      delta: {
        casted: (api, fx, d) => {
          const id = target(fx);
          const line = freshCast(api, id, d);
          if (line) redrawCast(api, fx, id, line);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Golden Bait', tone: 'good' }),
  },
  {
    id: 'big-catch.chum-bucket',
    name: 'Chum Bucket',
    category: 'advantage',
    description: 'For 20 seconds, fish bite on your line twice as fast, on top of any event. Only you get the fish excited.',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    hooks: {
      delta: {
        casted: (api, fx, d) => {
          const id = target(fx);
          const line = freshCast(api, id, d);
          if (line) scaleWait(api, id, line, 0.5);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Chum Bucket', tone: 'good' }),
  },
  {
    id: 'big-catch.borrowed-lure',
    name: 'Borrowed Lure',
    category: 'advantage',
    description: 'Borrow the next lure up for 30 seconds: bigger, rarer fish are more likely while you have it. You cannot buy a lure until you give it back.',
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 60_000,
    durationMs: 30_000,
    tags: [LURE_TAG],
    conflicts: [LURE_TAG],
    apply: (api, c, fx) => {
      const from = fisher(api, c.caster).lure;
      if (api.add('lure', c.caster, 1) <= 0) return { error: `You already fish with the ${LURES[MAX_LURE]!.name.toLowerCase()}.` };
      if (fx) Object.assign(fx.data, { from, lent: from + 1 });
    },
    hooks: {
      gate: (api, _fx, playerId, action) => (wouldBuyLure(api, playerId, action) ? { block: 'Give the borrowed lure back first: it goes back when its time is up.' } : undefined),
      end: (api, fx, reason) => {
        if (reason === 'undone') return;
        if (fisher(api, target(fx))?.lure === fx.data.lent) api.set('lure', target(fx), Number(fx.data.from));
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: `Borrowed: ${LURES[Number(fx.data.lent ?? 1)]?.name ?? 'lure'}`, until: fx.endsAt }),
  },
  {
    id: 'big-catch.fish-finder',
    name: 'Fish Finder',
    category: 'advantage',
    description: 'For 10 seconds, your fish finder shows which fish is on your line before you land it (not how heavy it is).',
    target: 'self',
    modes: M,
    cost: 15,
    cooldownMs: 30_000,
    durationMs: 10_000,
    tickMs: 500,
    apply: (api, c, fx) => {
      const line = fisher(api, c.caster)?.line;
      if (!inWater(line)) return { error: 'Your line is not in the water. Cast first.' };
      if (fx) fx.data.species = line.hooked.species;
    },
    hooks: {
      tick: (api, fx) => {
        const line = fisher(api, target(fx))?.line;
        if (!inWater(line)) api.endEffect(fx.eid, 'used');
        else fx.data.species = line.hooked.species;
      },
    },
    overlay: (fx) => ({ kind: 'badge', text: `On your line: ${upper(fishName(fx.data.species as SpeciesId))}`, tone: 'info' }),
  },

  /* ------------------------------ other fishers ----------------------------- */
  {
    id: 'big-catch.tangled-line',
    name: 'Tangled Line',
    category: 'troll',
    description: 'Tangle an opponent\'s line: for 8 seconds they cannot cast. A line already in the water is not touched.',
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 40_000,
    durationMs: 8_000,
    hooks: {
      gate: (api, _fx, playerId, action: any) => {
        const f = fisher(api, playerId);
        // Only casts the mode would take: anything else it refuses with its own reason.
        if (action?.type === 'cast' && f?.line.phase === 'idle' && f.casts > 0) return { block: 'Your line is tangled! Untangle it before you cast.' };
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Tangled line', until: fx.endsAt }),
  },
  {
    id: 'big-catch.noisy-boat',
    name: 'Noisy Boat',
    category: 'troll',
    description: 'A noisy boat goes past an opponent: for 20 seconds, fish take twice as long to bite on their line.',
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    hooks: {
      delta: {
        casted: (api, fx, d) => {
          const id = target(fx);
          const line = freshCast(api, id, d);
          if (line) scaleWait(api, id, line, 2);
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Noisy boat', tone: 'bad' }),
  },
  {
    id: 'big-catch.skinny-fish',
    name: 'Skinny Fish',
    category: 'troll',
    description: `For 40 seconds, each fish that takes an opponent's bait is weighed ${WEIGHINGS} times, every weighing drawn from its species' weight table (with their lure and the event), and they get the lightest.`,
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 40_000,
    priority: 20,
    hooks: {
      delta: {
        casted: (api, fx, d) => {
          const id = target(fx);
          const line = freshCast(api, id, d);
          if (line) weighAgain(api, id, line, 'lightest');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Skinny fish', tone: 'bad' }),
  },
  {
    id: 'big-catch.cheeky-seagull',
    name: 'Cheeky Seagull',
    category: 'troll',
    description: `A seagull swoops on the catch an opponent has not yet sold or kept. Odds: ${odds([
      ['it flies off with the fish', 60],
      ['it drops the fish on your jetty, and you sell it for half its points', 40],
    ])}. Either way, they lose the fish.`,
    target: 'opponent',
    modes: M,
    needs: ['tank'],
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const f = fisher(api, t);
      if (f?.line.phase !== 'landed') return { error: `${api.name(t)} has no catch waiting to be sold or kept.` };
      const fish = f.line.landed;
      const toYou = rollOdds(api, [
        [false, 60],
        [true, 40],
      ] as const);
      api.ctx.clearTimer(lineTimer(t));
      f.outcome = {
        seq: f.line.seq,
        at: api.now(),
        kind: 'escaped',
        fish: null,
        escaped: fish.species,
        points: 0,
        auto: false,
        trophy: false,
        set: null,
        title: `A seagull flew off with your ${fishName(fish.species)}!`,
        detail: toYou ? `It dropped it on ${api.name(c.caster)}'s jetty.` : 'It is gone for good.',
      };
      f.line = idleLine(f.line.seq, f.line.water);
      if (toYou) {
        const half = pointsFor(fish.grams) > 0 ? Math.max(1, Math.round(pointsFor(fish.grams) / 2)) : 0;
        if (half) api.add('currency', c.caster, half);
        api.feed(`Cheeky Seagull: it dropped ${api.name(t)}'s ${fishName(fish.species)} on your jetty. Sold for ${pointsText(half)}.`, 'good', [c.caster]);
      } else api.feed(`Cheeky Seagull: it flew off with ${api.name(t)}'s ${fishName(fish.species)}.`, 'info', [c.caster]);
    },
  },
  {
    id: 'big-catch.sunken-log',
    name: 'Sunken Log',
    category: 'troll',
    description: "An opponent's line catches on a sunken log: the fish on it gets away, and the cast is gone.",
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const f = fisher(api, t);
      if (!inWater(f?.line)) return { error: `${api.name(t)} has no line in the water.` };
      const species = f.line.hooked.species as SpeciesId;
      api.ctx.clearTimer(lineTimer(t));
      f.outcome = {
        seq: f.line.seq,
        at: api.now(),
        kind: 'escaped',
        fish: null,
        escaped: species,
        points: 0,
        auto: false,
        trophy: false,
        set: null,
        title: `Snagged on a sunken log! ${upper(aFish(species))} got away.`,
        detail: `${api.name(c.caster)} steered your line into the log.`,
      };
      f.line = idleLine(f.line.seq, f.line.water);
    },
  },
  {
    id: 'big-catch.rusty-reel',
    name: 'Rusty Reel',
    category: 'troll',
    description: 'For 20 seconds, the first time an opponent reels in after each bite, the handle sticks and nothing happens: they have to reel again, and the fish keeps pulling.',
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    durationMs: 20_000,
    hooks: {
      gate: (api, fx, playerId, action: any) => {
        if (action?.type !== 'reel') return;
        const line = fisher(api, playerId)?.line;
        // Only a reel that would land the fish sticks; reeling too soon still scares it off.
        const since = api.now() - Number(line?.biteAt ?? 0);
        if (!inWater(line) || since < 0 || since > REEL_WINDOW_MS) return;
        const stuck = (fx.data.stuck ?? []) as number[];
        if (stuck.includes(line.seq)) return;
        fx.data.stuck = [...stuck.slice(-4), line.seq];
        return { block: 'Rusty Reel! The handle sticks. Reel again!' };
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Rusty reel', tone: 'bad' }),
  },
  {
    id: 'big-catch.weedy-lure',
    name: 'Weed on the Lure',
    category: 'troll',
    description: 'Weed wraps round an opponent\'s lure: for 20 seconds they fish as if with a bare hook, and cannot buy a lure. Their lure is back afterwards.',
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 60_000,
    durationMs: 20_000,
    tags: [LURE_TAG],
    conflicts: [LURE_TAG],
    apply: (api, c, fx) => {
      const t = target(c);
      const lure = fisher(api, t)?.lure ?? 0;
      if (lure <= 0) return { error: `${api.name(t)} only has a bare hook.` };
      if (fx) fx.data.lure = lure;
      api.set('lure', t, 0);
    },
    hooks: {
      gate: (api, _fx, playerId, action) => (wouldBuyLure(api, playerId, action) ? { block: 'Your lure is full of weed! Wait for it to clear.' } : undefined),
      end: (api, fx, reason) => {
        if (reason === 'undone') return;
        const t = target(fx);
        const f = fisher(api, t);
        if (f) api.set('lure', t, Math.max(f.lure, Number(fx.data.lure ?? 0)));
      },
    },
    overlay: (fx) => ({ kind: 'countdown', label: 'Weed on your lure', until: fx.endsAt }),
  },
  {
    id: 'big-catch.crossed-lines',
    name: 'Crossed Lines',
    category: 'troll',
    description: "Cross your line with an opponent's while both are in the same water: you swap the fish hooked on them. Neither of you knows what you gave or got until it is landed.",
    target: 'opponent',
    modes: M,
    cost: 30,
    cooldownMs: 50_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const mine = fisher(api, c.caster)?.line;
      const theirs = fisher(api, t)?.line;
      if (!inWater(mine)) return { error: 'Your line is not in the water. Cast first.' };
      if (!inWater(theirs)) return { error: `${api.name(t)} has no line in the water.` };
      if (mine.water !== theirs.water) return { error: `Your lines are in different waters.` };
      if (mine.hooked.species === theirs.hooked.species && mine.hooked.grams === theirs.hooked.grams) return { error: 'Your lines hold the very same fish already.' };
      [mine.hooked, theirs.hooked] = [theirs.hooked, mine.hooked];
      api.feed(`${api.name(c.caster)} crossed lines with you: you swapped fish.`, 'bad', [t]);
    },
  },
  {
    id: 'big-catch.fish-swap',
    name: 'Fish Swap',
    category: 'troll',
    description: "Swap the newest fish in your tank for the newest in an opponent's tank. Set bonuses follow the fish.",
    target: 'opponent',
    modes: M,
    needs: ['tank'],
    cost: 35,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api, c) => {
      const t = target(c);
      const mine = fisher(api, c.caster).tank as any[];
      const theirs = fisher(api, t)?.tank as any[] | undefined;
      if (!mine.length) return { error: 'Your tank is empty.' };
      if (!theirs?.length) return { error: `${api.name(t)}'s tank is empty.` };
      const a = mine[mine.length - 1];
      const b = theirs[theirs.length - 1];
      if (a.species === b.species && a.grams === b.grams) return { error: 'Your newest fish are just the same.' };
      mine[mine.length - 1] = b;
      theirs[theirs.length - 1] = a;
      api.feed(`${api.name(c.caster)} swapped your ${fishName(b.species)} (${formatWeight(b.grams)}) for their ${fishName(a.species)} (${formatWeight(a.grams)}).`, 'bad', [t]);
    },
  },
  {
    id: 'big-catch.bait-thief',
    name: 'Bait Thief',
    category: 'troll',
    description: "Take 2 of an opponent's casts for yourself (as many as they have).",
    target: 'opponent',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    apply: (api, c) => {
      const t = target(c);
      if (api.get('casts', t) <= 0) return { error: `${api.name(t)} has no casts.` };
      if (transfer(api, 'casts', t, c.caster, 2) <= 0) return { error: 'You cannot hold any more casts.' };
      api.feed(`${api.name(c.caster)} pinched some of your casts.`, 'bad', [t]);
    },
  },

  /* -------------------------------- the market ------------------------------- */
  {
    id: 'big-catch.fish-auction',
    name: 'Fish Auction',
    category: 'economy',
    description: `Auction every fish in your tank: they sell for ${Math.round((AUCTION_PREMIUM - 1) * 100)}% more than their points, straight into your wallet. Set bonuses go with the fish.`,
    target: 'self',
    modes: M,
    needs: ['tank'],
    cost: 30,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api, c) => {
      const f = fisher(api, c.caster);
      if (!f.tank.length) return { error: 'Your tank is empty.' };
      const count = f.tank.length;
      const paid = Math.round((f.tank as any[]).reduce((n, fish) => n + pointsFor(fish.grams), 0) * AUCTION_PREMIUM);
      f.tank = [];
      api.add('currency', c.caster, paid);
      api.feed(`Fish Auction: ${plural(count, 'fish', 'fish')} sold for ${pointsText(paid)}.`, 'good', [c.caster]);
    },
  },
  {
    id: 'big-catch.tackle-sale',
    name: 'Tackle Sale',
    category: 'economy',
    description: 'For 60 seconds, the next lure you buy costs half: the other half comes back to your wallet. Used up on that lure.',
    target: 'self',
    modes: M,
    needs: ['meter:currency'],
    cost: 20,
    cooldownMs: 60_000,
    durationMs: 60_000,
    apply: (api, c) => {
      if (fisher(api, c.caster).lure >= MAX_LURE) return { error: 'You already have the best lure.' };
    },
    hooks: {
      delta: {
        // Only the mode buying a lure moves it up in its own transactions.
        lure: (api, fx, d) => {
          const id = target(fx);
          if (!(d[id]! > 0)) return;
          const refund = Math.floor(LURES[fisher(api, id).lure]!.price / 2);
          api.add('currency', id, refund);
          api.feed(`Tackle Sale: ${pointsText(refund)} back.`, 'good', [id]);
          api.endEffect(fx.eid, 'used');
        },
      },
    },
    overlay: () => ({ kind: 'badge', text: 'Tackle Sale', tone: 'good' }),
  },
  {
    id: 'big-catch.trade-in',
    name: 'Lure Trade-In',
    category: 'economy',
    description: 'Hand your lure back to the tackle shop and get its full price back in your wallet. You fish with the lure before it.',
    target: 'self',
    modes: M,
    cost: 20,
    cooldownMs: 60_000,
    apply: (api, c) => {
      const lure = fisher(api, c.caster).lure;
      if (lure <= 0) return { error: 'You only have a bare hook.' };
      if (api.hasTag(c.caster, LURE_TAG)) return { error: 'That lure is not yours to trade in right now.' };
      api.add('lure', c.caster, -1);
      api.add('currency', c.caster, LURES[lure]!.price);
    },
  },
  {
    id: 'big-catch.matching-fish',
    name: 'Matching Fish',
    category: 'economy',
    description:
      "If your tank is one fish short of a set, a fish of that rarity joins it: drawn from the rows of that rarity in the odds table for the water you are fishing, in their usual proportions, with its weight from its species' table.",
    target: 'self',
    modes: M,
    needs: ['tank'],
    cost: 40,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api, c) => {
      const f = fisher(api, c.caster);
      if (f.tank.length >= TANK_SIZE) return { error: 'Your tank is full.' };
      const count = (r: string) => (f.tank as any[]).filter((fish) => speciesById(fish.species)!.rarity === r).length;
      const rarity = [...RARITIES].reverse().find((r) => count(r) % SET_SIZE === SET_SIZE - 1);
      if (!rarity) return { error: 'No set in your tank is one fish short.' };
      const m = momentFor(api, c.caster);
      const rows = speciesWeights(m).filter((r) => r.species.rarity === rarity && r.weight > 0);
      if (!rows.length) return { error: `No ${RARITY_INFO[rarity].label.toLowerCase()} fish live in the ${waterName(m.water)}.` };
      let roll = api.rng.next() * rows.reduce((n, r) => n + r.weight, 0);
      const species = (rows.find((r) => (roll -= r.weight) < 0) ?? rows[rows.length - 1]!).species;
      const fish = landFish(api, c.caster, { species: species.id, grams: gramsFor(species, api.rng.next(), m) });
      f.tank.push(fish);
      api.feed(`Matching Fish: ${aFish(fish.species)}, ${formatWeight(fish.grams)}, completes a set of ${RARITY_INFO[rarity].label.toLowerCase()} fish (+${SET_BONUS[rarity]}).`, 'good', [c.caster]);
    },
  },

  /* -------------------------------- the water -------------------------------- */
  startCheat('big-catch.dinner-bell', 'Dinner Bell', 'feeding', 35),
  startCheat('big-catch.golden-hour-now', 'Early Golden Hour', 'golden', 40),
  startCheat('big-catch.call-the-school', 'Call the School', 'school', 35),
  {
    id: 'big-catch.still-water',
    name: 'Still Water',
    category: 'round',
    description: 'End the event that is on right now. In Frenzy the next one still starts on time.',
    target: 'room',
    modes: M,
    needs: ['events'],
    cost: 25,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      if (!eventOn(api)) return { error: 'No event is on.' };
      const label = EVENT_INFO[api.s.event.id as EventId].label;
      api.s.event = null;
      api.ctx.clearTimer('eventEnd');
      api.feed(`${label} is over early.`, 'info');
    },
  },
  {
    id: 'big-catch.slack-tide',
    name: 'Slack Tide',
    category: 'round',
    description: 'The event that is on right now lasts 15 seconds longer. The next event waits for it to finish.',
    target: 'room',
    modes: M,
    needs: ['events'],
    cost: 25,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      if (!eventOn(api)) return { error: 'No event is on.' };
      api.s.event = { ...api.s.event, endsAt: api.s.event.endsAt + 15_000 };
      api.ctx.setTimer('eventEnd', api.s.event.endsAt);
      keepNextAfter(api);
      api.feed(`${EVENT_INFO[api.s.event.id as EventId].label} lasts 15 seconds longer.`, 'info');
    },
  },
  {
    id: 'big-catch.full-steam',
    name: 'Full Steam Ahead',
    category: 'round',
    description: `The boat moves on to the next water now, for everyone, and stays there ${WATER_ROTATE_SEC / 60} minutes. Lines already in the water stay where they are.`,
    target: 'room',
    modes: M,
    needs: ['rotation'],
    cost: 35,
    cooldownMs: 90_000,
    undoable: false,
    apply: (api) => {
      const s = api.s;
      if (s.nextWaterAt === null) return { error: `The boat stays on the ${waterName(s.water)} for the rest of the game.` };
      s.water = nextWater(s.water);
      const next = api.now() + WATER_ROTATE_SEC * 1000;
      s.nextWaterAt = next < s.endsAt ? next : null;
      if (s.nextWaterAt === null) api.ctx.clearTimer('water');
      else api.ctx.setTimer('water', s.nextWaterAt);
      api.feed(`Full steam ahead! The boat moves to the ${waterName(s.water)}.`, 'big');
    },
  },
  {
    id: 'big-catch.drop-anchor',
    name: 'Drop Anchor',
    category: 'round',
    description: 'The boat stays on the water it is on for 60 seconds longer before it moves on, for everyone.',
    target: 'room',
    modes: M,
    needs: ['rotation'],
    cost: 25,
    cooldownMs: 75_000,
    undoable: false,
    apply: (api) => {
      const s = api.s;
      if (s.nextWaterAt === null) return { error: `The boat stays on the ${waterName(s.water)} for the rest of the game anyway.` };
      const next = s.nextWaterAt + 60_000;
      if (next >= s.endsAt) {
        s.nextWaterAt = null;
        api.ctx.clearTimer('water');
        api.feed(`Anchor down: the boat stays on the ${waterName(s.water)} for the rest of the game.`, 'info');
      } else {
        s.nextWaterAt = next;
        api.ctx.setTimer('water', next);
        api.feed(`Anchor down: the boat stays on the ${waterName(s.water)} for another minute.`, 'info');
      }
    },
  },

  /* ---------------------------------- luck ---------------------------------- */
  {
    id: 'big-catch.change-of-tide',
    name: 'Change of Tide',
    category: 'random',
    description: `The event that is on right now changes to one of the other two, which runs for a fresh ${EVENT_SEC} seconds. Odds: one of the other two 50%, the other 50%.`,
    target: 'room',
    modes: M,
    needs: ['events'],
    cost: 30,
    cooldownMs: 60_000,
    undoable: false,
    apply: (api) => {
      if (!eventOn(api)) return { error: 'No event is on.' };
      const others = EVENTS.filter((e) => e !== api.s.event.id);
      startEvent(
        api,
        rollOdds(api, [
          [others[0]!, 50],
          [others[1]!, 50],
        ]),
      );
    },
  },
  {
    id: 'big-catch.message-bottle',
    name: 'Message in a Bottle',
    category: 'random',
    description: `Reel up a bottle with a note inside. Odds: ${odds([
      ['2 casts', 40],
      ['a fish, drawn from the odds table for the water you are fishing and sold at once', 25],
      ['a voucher worth a tenth of your wallet (at least 5 points)', 20],
      ['a cast lost overboard', 15],
    ])}. If you have no cast to lose, you find 5 points instead.`,
    target: 'self',
    modes: M,
    cost: 25,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const id = c.caster;
      const pick = rollOdds(api, [
        ['casts', 40],
        ['fish', 25],
        ['voucher', 20],
        ['lose', 15],
      ] as const);
      if (pick === 'casts' && api.add('casts', id, 2) > 0) return void api.feed('Message in a Bottle: 2 casts!', 'good', [id]);
      if (pick === 'fish') {
        const fish = landFish(api, id, drawCatch(momentFor(api, id), api.rng));
        const sold = sellAtOnce(api, id, fish);
        return void api.feed(`Message in a Bottle: ${aFish(fish.species)} was tangled round it. Sold for ${pointsText(sold.points)}.`, 'good', [id]);
      }
      if (pick === 'voucher') {
        const got = api.add('currency', id, Math.max(5, share(api.get('currency', id), 10)));
        return void api.feed(`Message in a Bottle: a voucher for ${pointsText(got)}.`, 'good', [id]);
      }
      if (pick === 'lose' && api.add('casts', id, -1) < 0) return void api.feed('Message in a Bottle: you dropped a cast overboard reaching for it.', 'bad', [id]);
      api.add('currency', id, 5);
      api.feed('Message in a Bottle: 5 points, a little soggy.', 'good', [id]);
    },
  },
  {
    id: 'big-catch.double-or-splash',
    name: 'Double or Splash',
    category: 'random',
    description: `Gamble the catch you have not yet sold or kept. Odds: ${odds([
      ['it sells for double its points', 45],
      ['it flops back into the water and is gone', 55],
    ])}.`,
    target: 'self',
    modes: M,
    needs: ['tank'],
    cost: 20,
    cooldownMs: 45_000,
    undoable: false,
    apply: (api, c) => {
      const id = c.caster;
      const f = fisher(api, id);
      if (f.line.phase !== 'landed') return { error: 'You have no catch waiting to be sold or kept.' };
      const fish = f.line.landed;
      const won = rollOdds(api, [
        [true, 45],
        [false, 55],
      ] as const);
      api.ctx.clearTimer(lineTimer(id));
      const base = { seq: f.line.seq, at: api.now(), auto: false, trophy: false, set: null };
      if (won) {
        const points = pointsFor(fish.grams) * 2;
        f.wallet += points;
        f.sold += points;
        f.outcome = { ...base, kind: 'sold', fish, escaped: null, points, title: `Double! Sold for ${pointsText(points)}`, detail: 'Double or Splash came up double.' };
      } else {
        f.outcome = { ...base, kind: 'escaped', fish: null, escaped: fish.species, points: 0, title: `Splash! Your ${fishName(fish.species)} flopped back into the water.`, detail: 'Double or Splash came up splash.' };
      }
      f.line = idleLine(f.line.seq, f.line.water);
    },
  },
];

defineCheats(cheats);

/** For the tests: how much longer Strong Line keeps a bite, the auction's premium and how many weighings the scales make. */
export const BIG_CATCH_CHAOS = { STRONG_LINE_MS, AUCTION_PREMIUM, WEIGHINGS } as const;
