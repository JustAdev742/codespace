/*
 * Big Catch: answer right to earn casts, cast, wait for the bite, reel it in,
 * then sell the fish for points or put it in your tank to collect sets.
 *
 * The server decides each catch the moment the line goes out: the species by
 * the odds of the water, the player's lure and the event running then, the
 * weight within that species' range, and when the fish bites (1.5 to 4
 * seconds later). The catch and the bite time stay out of every view until
 * the bite (for the time) and the landing (for the fish). Reel within 3
 * seconds of the bite to land it, within the first half second for a perfect
 * catch (10% heavier). Reeling before the bite scares the fish off and the
 * cast is lost; too late and it gets away.
 *
 * A landed fish is sold (its points go to the player's wallet, which buys
 * lures) or put in the tank (6 fish; its points count, and every 3 fish of
 * one rarity earn a set bonus). Undecided catches are sold after 10 seconds.
 * The score is the wallet plus the tank. In Trophy Hunt every fish is sold
 * for lure money and the score is the three heaviest fish.
 *
 * Questions are always open: a player can answer while the line is out.
 * Waters rotate every 2 minutes (or stay put), and events run for 20 seconds
 * every 70 to 90 seconds (back to back in Frenzy). Which event comes next is
 * only decided when it starts.
 */
import { z } from 'zod';
import { answerSchema, type Rng } from '@ludora/shared';
import { defineMode } from '../../sdk/define.ts';
import type { BotContext, ModeContext, PlayerId } from '../../sdk/types.ts';
import { streamInit, streamNext, streamQuestionView, streamSubmit, type StreamState } from '../../mechanics/selfPaced.ts';
import { nameOf } from '../rules.ts';
import {
  BONUS_CAST_EVERY,
  DECIDE_SEC,
  EVENTS,
  EVENT_TIMING,
  LURES,
  MAX_LURE,
  PERFECT_BONUS,
  PERFECT_MS,
  REEL_WINDOW_MS,
  SET_BONUS,
  SET_SIZE,
  TANK_SIZE,
  TROPHY_COUNT,
  WATER_ROTATE_SEC,
  meta,
  settings,
  type EventId,
} from './meta.ts';
import { RARITY_INFO, WATER_INFO, speciesById, type Rarity, type Species, type SpeciesId, type WaterId } from './species.ts';
import { biteRangeMs, formatWeight, gramsFor, nextLure, nextWater, oddsTable, pointsFor, sizeCm, sizeSkew, speciesWeights, tankValue, type OddsMoment } from './odds.ts';

type Settings = {
  water: string;
  events: boolean;
  trophyHunt: boolean;
  frenzy: boolean;
  deepSea: boolean;
};

/** A landed fish. */
interface Fish {
  id: number;
  species: SpeciesId;
  grams: number;
  perfect: boolean;
  at: number;
}

type Phase = 'idle' | 'waiting' | 'biting' | 'landed';

interface Line {
  phase: Phase;
  /** Which cast this is (the player's count). */
  seq: number;
  castAt: number;
  /** Secret until the bite. */
  biteAt: number;
  /** The water the line went into. */
  water: WaterId;
  /** Decided at the cast and secret until the fish is landed. */
  hooked: { species: SpeciesId; grams: number } | null;
  landed: Fish | null;
  decideBy: number;
}

/** What happened to the player's last cast, for their result card. */
interface Outcome {
  seq: number;
  at: number;
  kind: 'sold' | 'tanked' | 'spooked' | 'escaped';
  fish: Fish | null;
  /** The species that got away (named only once it is gone). */
  escaped: SpeciesId | null;
  /** Points the fish is worth. Sold fish add them to the wallet; tanked fish to the tank. */
  points: number;
  /** Sold for the player when time ran out. */
  auto: boolean;
  /** Trophy Hunt: the fish is one of the player's heaviest three. */
  trophy: boolean;
  /** The tank fish completed a set of this rarity. */
  set: Rarity | null;
  title: string;
  detail: string | null;
}

interface Fisher {
  stream: StreamState;
  casts: number;
  line: Line;
  lure: number;
  /** Points to spend: everything sold, less what lures cost. */
  wallet: number;
  sold: number;
  spent: number;
  /** The tank, or in Trophy Hunt the three heaviest fish. */
  tank: Fish[];
  /** The heaviest fish this player has landed, heaviest first. */
  top: Fish[];
  landed: number;
  landedGrams: number;
  casted: number;
  perfect: number;
  escaped: number;
  spooked: number;
  outcome: Outcome | null;
}

/** A catch worth showing on the big screen. */
interface Highlight {
  by: PlayerId;
  species: SpeciesId;
  grams: number;
  at: number;
}

interface RoomEvent {
  id: EventId;
  startedAt: number;
  endsAt: number;
}

interface State {
  fishers: Record<PlayerId, Fisher>;
  endsAt: number;
  water: WaterId;
  /** When the water next changes, or null when it stays put. */
  nextWaterAt: number | null;
  event: RoomEvent | null;
  nextEventAt: number | null;
  lastEvent: EventId | null;
  /** The heaviest fish of the game, heaviest first. */
  biggest: Highlight[];
  /** The heaviest of each species landed so far. */
  records: Partial<Record<SpeciesId, Highlight>>;
  /** Rare fish and legends, newest first. */
  rare: Highlight[];
  totals: { casts: number; landed: number; grams: number; perfect: number; escaped: number; spooked: number };
  fishSeq: number;
}

const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('answer'), iid: z.string().max(24), answer: answerSchema }),
  z.object({ type: z.literal('cast') }),
  z.object({ type: z.literal('reel') }),
  z.object({ type: z.literal('sell'), seq: z.number().int().min(0) }),
  z.object({ type: z.literal('tank'), seq: z.number().int().min(0) }),
  z.object({ type: z.literal('lure'), level: z.number().int().min(1).max(MAX_LURE) }),
]);
type Action = z.infer<typeof action>;

/** Used when the host sets no time limit: fishing always stops. */
const DEFAULT_TIME_SEC = meta.common.defaults.timeLimitSec!;
const BOARD_PLAYER = 5;
const BOARD_HOST = 10;
const TOP_KEEP = 10;
const BIGGEST_KEEP = 5;
const RARE_KEEP = 8;
/** A new heaviest fish of the game is told to the room once it weighs this much. */
const RECORD_FEED_GRAMS = 5000;

const lineTimer = (id: PlayerId) => `line:${id}`;
const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;
const pointsText = (n: number) => plural(n, 'point', 'points');

function teamOf(ctx: ModeContext, id: PlayerId) {
  return (ctx.player(id) ?? ctx.everyone().find((p) => p.id === id))?.teamId ?? null;
}

function sp(id: SpeciesId): Species {
  return speciesById(id)!;
}

const rarityOf = (id: SpeciesId): Rarity => sp(id).rarity;

function timeLimitMs(ctx: ModeContext<Settings>) {
  return (ctx.common.timeLimitSec > 0 ? ctx.common.timeLimitSec : DEFAULT_TIME_SEC) * 1000;
}

function idleLine(seq: number, water: WaterId): Line {
  return { phase: 'idle', seq, castAt: 0, biteAt: 0, water, hooked: null, landed: null, decideBy: 0 };
}

function newFisher(s: { water: WaterId }, ctx: ModeContext): Fisher {
  return {
    stream: streamInit(ctx),
    casts: 0,
    line: idleLine(0, s.water),
    lure: 0,
    wallet: 0,
    sold: 0,
    spent: 0,
    tank: [],
    top: [],
    landed: 0,
    landedGrams: 0,
    casted: 0,
    perfect: 0,
    escaped: 0,
    spooked: 0,
    outcome: null,
  };
}

/** Pick one row by weight. */
function pickWeighted<T extends { weight: number }>(rows: readonly T[], rng: Rng): T {
  const live = rows.filter((r) => r.weight > 0);
  const total = live.reduce((n, r) => n + r.weight, 0);
  let roll = rng.next() * total;
  for (const r of live) {
    roll -= r.weight;
    if (roll < 0) return r;
  }
  return live[live.length - 1]!;
}

/**
 * Decide a catch for the odds of a moment: the species by weight, then its
 * weight in grams. Exported so the tests can check the draw against oddsTable.
 */
export function drawCatch(m: OddsMoment, rng: Rng): { species: SpeciesId; grams: number } {
  const species = pickWeighted(speciesWeights(m), rng).species;
  return { species: species.id, grams: gramsFor(species, rng.next(), m) };
}

function moment(s: State, ctx: ModeContext<Settings>, f: Fisher): OddsMoment {
  return { water: s.water, lure: f.lure, event: s.event?.id ?? null, deepSea: ctx.settings.deepSea, frenzy: ctx.settings.frenzy };
}

/** A player's score: the wallet plus the tank, or in Trophy Hunt the three heaviest fish. */
function scoreOf(f: Fisher, ctx: ModeContext<Settings>): number {
  if (ctx.settings.trophyHunt) return tankValue(f.tank, rarityOf, false).total;
  return f.wallet + tankValue(f.tank, rarityOf).total;
}

function insertSorted(list: Highlight[] | Fish[], item: Highlight | Fish, keep: number) {
  const arr = list as { grams: number; at: number }[];
  arr.push(item);
  arr.sort((a, b) => b.grams - a.grams || a.at - b.at);
  arr.length = Math.min(arr.length, keep);
}

/* --------------------------------- casting -------------------------------- */

function cast(s: State, ctx: ModeContext<Settings>, id: PlayerId, f: Fisher) {
  const now = ctx.now();
  const m = moment(s, ctx, f);
  const hooked = drawCatch(m, ctx.rng);
  const [lo, hi] = biteRangeMs(m);
  const biteAt = now + lo + Math.floor(ctx.rng.next() * (hi - lo + 1));
  f.casts--;
  f.casted++;
  s.totals.casts++;
  f.line = { phase: 'waiting', seq: f.line.seq + 1, castAt: now, biteAt, water: s.water, hooked, landed: null, decideBy: 0 };
  ctx.setTimer(lineTimer(id), biteAt);
}

function finish(f: Fisher, outcome: Omit<Outcome, 'seq' | 'escaped' | 'auto' | 'trophy' | 'set' | 'fish' | 'points'> & Partial<Outcome>) {
  f.outcome = { seq: f.line.seq, escaped: null, auto: false, trophy: false, set: null, fish: null, points: 0, ...outcome };
  f.line = idleLine(f.line.seq, f.line.water);
}

function spook(f: Fisher, ctx: ModeContext<Settings>, id: PlayerId, s: State) {
  ctx.clearTimer(lineTimer(id));
  f.spooked++;
  s.totals.spooked++;
  finish(f, { at: ctx.now(), kind: 'spooked', title: 'Too soon! You scared the fish away.', detail: 'Wait for the bobber to dip, then reel.' });
}

function escape(f: Fisher, ctx: ModeContext<Settings>, s: State) {
  const species = f.line.hooked?.species ?? null;
  f.escaped++;
  s.totals.escaped++;
  finish(f, {
    at: ctx.now(),
    kind: 'escaped',
    escaped: species,
    title: species ? `${withArticle(species)} got away!` : 'It got away!',
    detail: `Reel within ${String(REEL_WINDOW_MS / 1000)} seconds of the bite.`,
  });
}

/** Names that keep their capital letter mid-sentence. */
const PROPER: ReadonlySet<SpeciesId> = new Set(['australianBass', 'murrayCod']);

/** A species' name as it reads mid-sentence: "golden perch", "Murray cod", "the Silver Ghost". */
function inSentence(id: SpeciesId): string {
  const s = sp(id);
  if (s.rarity === 'legend') return s.name.replace(/^The /, 'the ');
  return PROPER.has(id) ? s.name : s.name.charAt(0).toLowerCase() + s.name.slice(1);
}

/** "A golden perch", "An Australian bass", "Old Mossback", "The Silver Ghost": the start of a sentence. */
function withArticle(id: SpeciesId): string {
  const name = inSentence(id);
  if (sp(id).rarity === 'legend') return name.charAt(0).toUpperCase() + name.slice(1);
  return `${/^[aeiou]/i.test(name) ? 'An' : 'A'} ${name}`;
}

/** Reeling while the fish is biting lands it. */
function land(s: State, ctx: ModeContext<Settings>, id: PlayerId, f: Fisher) {
  const now = ctx.now();
  const hooked = f.line.hooked!;
  const perfect = now - f.line.biteAt <= PERFECT_MS;
  const grams = perfect ? Math.round(hooked.grams * (1 + PERFECT_BONUS)) : hooked.grams;
  const fish: Fish = { id: ++s.fishSeq, species: hooked.species, grams, perfect, at: now };
  ctx.clearTimer(lineTimer(id));
  f.landed++;
  f.landedGrams += grams;
  if (perfect) {
    f.perfect++;
    s.totals.perfect++;
  }
  s.totals.landed++;
  s.totals.grams += grams;
  insertSorted(f.top, fish, TOP_KEEP);
  showOff(s, ctx, id, fish);

  if (ctx.settings.trophyHunt) {
    // Every fish is sold for lure money; the heaviest three are the score.
    const points = pointsFor(grams);
    f.wallet += points;
    f.sold += points;
    const before = f.tank.map((t) => t.id);
    insertSorted(f.tank, fish, TROPHY_COUNT);
    const trophy = !before.includes(fish.id) && f.tank.some((t) => t.id === fish.id);
    finish(f, {
      at: now,
      kind: 'sold',
      fish,
      points,
      trophy,
      title: `${sp(fish.species).name}, ${formatWeight(grams)}${perfect ? ': perfect!' : ''}`,
      detail: `${trophy ? 'A new trophy! ' : ''}Sold for ${pointsText(points)} to spend on lures.`,
    });
    return;
  }
  f.line = { ...f.line, phase: 'landed', landed: fish, decideBy: now + DECIDE_SEC * 1000 };
  ctx.setTimer(lineTimer(id), f.line.decideBy);
}

/** Room-wide highlights: the heaviest fish, species records and the rare-fish tank. */
function showOff(s: State, ctx: ModeContext<Settings>, id: PlayerId, fish: Fish) {
  const h: Highlight = { by: id, species: fish.species, grams: fish.grams, at: fish.at };
  const wasBiggest = s.biggest[0]?.grams ?? 0;
  insertSorted(s.biggest, h, BIGGEST_KEEP);
  const record = s.records[fish.species];
  if (!record || fish.grams > record.grams) s.records[fish.species] = h;
  const species = sp(fish.species);
  if (species.rarity === 'rare' || species.rarity === 'legend') s.rare = [h, ...s.rare].slice(0, RARE_KEEP);
  const who = nameOf(ctx, id);
  if (species.rarity === 'legend') ctx.feed(`${who} landed ${inSentence(fish.species)}: ${formatWeight(fish.grams)}!`, { tone: 'big' });
  else if (fish.grams > wasBiggest && fish.grams >= RECORD_FEED_GRAMS) ctx.feed(`${who} landed the biggest catch so far: a ${formatWeight(fish.grams)} ${inSentence(fish.species)}.`, { tone: 'big' });
}

/** Sell the landed fish. `auto` says why it was sold for the player, when they did not choose. */
function sell(f: Fisher, ctx: ModeContext<Settings>, id: PlayerId, auto: string | null = null) {
  const fish = f.line.landed!;
  const points = pointsFor(fish.grams);
  ctx.clearTimer(lineTimer(id));
  f.wallet += points;
  f.sold += points;
  finish(f, {
    at: ctx.now(),
    kind: 'sold',
    fish,
    points,
    auto: auto !== null,
    title: `Sold for ${pointsText(points)}`,
    detail: auto,
  });
}

function tank(f: Fisher, ctx: ModeContext<Settings>, id: PlayerId) {
  const fish = f.line.landed!;
  const rarity = rarityOf(fish.species);
  ctx.clearTimer(lineTimer(id));
  f.tank.push(fish);
  const count = f.tank.filter((t) => rarityOf(t.species) === rarity).length;
  const set = count % SET_SIZE === 0 ? rarity : null;
  const points = pointsFor(fish.grams);
  finish(f, {
    at: ctx.now(),
    kind: 'tanked',
    fish,
    points,
    set,
    title: `In the tank: ${pointsText(points)}`,
    detail: set ? `A set of ${String(SET_SIZE)} ${RARITY_INFO[rarity].label.toLowerCase()} fish: +${String(SET_BONUS[rarity])} bonus!` : `${plural(TANK_SIZE - f.tank.length, 'space', 'spaces')} left in your tank.`,
  });
}

/* ------------------------------ room timers ------------------------------- */

const EVENT_LINES: Record<EventId, string> = {
  feeding: 'Feeding Time: bites come twice as fast for 20 seconds.',
  golden: 'Golden Hour: rarer fish are more likely for 20 seconds.',
  school: 'Passing School: common fish are half as heavy again for 20 seconds.',
};

function eventGap(ctx: ModeContext<Settings>) {
  if (ctx.settings.frenzy) return EVENT_TIMING.lastsSec * 1000;
  return (EVENT_TIMING.gapMinSec + ctx.rng.int(0, EVENT_TIMING.gapMaxSec - EVENT_TIMING.gapMinSec)) * 1000;
}

function scheduleEvent(s: State, ctx: ModeContext<Settings>, at: number) {
  if (at < s.endsAt) {
    s.nextEventAt = at;
    ctx.setTimer('event', at);
  } else {
    s.nextEventAt = null;
    ctx.clearTimer('event');
  }
}

function startEvent(s: State, ctx: ModeContext<Settings>) {
  const at = s.nextEventAt ?? ctx.now();
  const pool = EVENTS.filter((e) => e !== s.lastEvent);
  const id = pool[ctx.rng.int(0, pool.length - 1)]!;
  const endsAt = at + EVENT_TIMING.lastsSec * 1000;
  s.event = { id, startedAt: at, endsAt };
  s.lastEvent = id;
  ctx.setTimer('eventEnd', endsAt);
  ctx.feed(EVENT_LINES[id], { tone: 'big' });
  scheduleEvent(s, ctx, at + eventGap(ctx));
}

function rotateWater(s: State, ctx: ModeContext<Settings>) {
  const at = s.nextWaterAt ?? ctx.now();
  s.water = nextWater(s.water);
  const next = at + WATER_ROTATE_SEC * 1000;
  s.nextWaterAt = next < s.endsAt ? next : null;
  if (s.nextWaterAt !== null) ctx.setTimer('water', s.nextWaterAt);
  ctx.feed(`The boat moves to the ${WATER_INFO[s.water].label.toLowerCase()}.`, { tone: 'info' });
}

function onLineTimer(s: State, ctx: ModeContext<Settings>, id: PlayerId) {
  const f = s.fishers[id];
  if (!f) return;
  const now = ctx.now();
  const line = f.line;
  if (line.phase === 'waiting' && now >= line.biteAt) {
    line.phase = 'biting';
    ctx.setTimer(lineTimer(id), line.biteAt + REEL_WINDOW_MS);
  } else if (line.phase === 'biting' && now >= line.biteAt + REEL_WINDOW_MS) {
    escape(f, ctx, s);
  } else if (line.phase === 'landed' && now >= line.decideBy) {
    sell(f, ctx, id, `Sold for you after ${String(DECIDE_SEC)} seconds.`);
  }
}

/* ---------------------------------- views --------------------------------- */

function ranking(s: State, ctx: ModeContext<Settings>, me: PlayerId | null) {
  const rows = ctx
    .players()
    .filter((p) => s.fishers[p.id])
    .map((p) => ({ playerId: p.id, name: p.name, teamId: p.teamId, score: scoreOf(s.fishers[p.id]!, ctx), rank: 0, isYou: p.id === me }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1]!.score === r.score ? rows[i - 1]!.rank : i + 1));
  return rows;
}

function teamRows(s: State, ctx: ModeContext<Settings>) {
  if (!ctx.teams().length) return null;
  const everyone = ctx.everyone();
  return ctx.teams().map((t) => {
    const members = everyone.filter((p) => p.teamId === t.id && s.fishers[p.id]);
    const total = members.reduce((n, p) => n + scoreOf(s.fishers[p.id]!, ctx), 0);
    return { teamId: t.id, name: t.name, hue: t.hue, members: members.length, average: members.length ? Math.round(total / members.length) : 0 };
  });
}

const fishView = (f: Fish) => ({ id: f.id, species: f.species, grams: f.grams, perfect: f.perfect });

function lineView(f: Fisher, ctx: ModeContext<Settings>) {
  const l = f.line;
  switch (l.phase) {
    case 'idle':
      return { phase: 'idle' as const, seq: l.seq };
    case 'waiting':
      // Nothing about the fish, and not when it will bite.
      return { phase: 'waiting' as const, seq: l.seq, castAt: l.castAt, water: l.water };
    case 'biting':
      return { phase: 'biting' as const, seq: l.seq, castAt: l.castAt, water: l.water, biteAt: l.biteAt, perfectBy: l.biteAt + PERFECT_MS, reelBy: l.biteAt + REEL_WINDOW_MS };
    case 'landed': {
      const fish = l.landed!;
      return {
        phase: 'landed' as const,
        seq: l.seq,
        castAt: l.castAt,
        water: l.water,
        fish: { ...fishView(fish), cm: sizeCm(sp(fish.species), fish.grams), points: pointsFor(fish.grams) },
        decideBy: l.decideBy,
        canTank: !ctx.settings.trophyHunt && f.tank.length < TANK_SIZE,
      };
    }
  }
}

function hostLine(f: Fisher) {
  const l = f.line;
  if (l.phase === 'idle') return { phase: l.phase };
  if (l.phase === 'waiting') return { phase: l.phase, castAt: l.castAt };
  if (l.phase === 'biting') return { phase: l.phase, castAt: l.castAt, biteAt: l.biteAt };
  return { phase: l.phase, castAt: l.castAt, species: l.landed!.species, grams: l.landed!.grams };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/* ---------------------------------- mode ---------------------------------- */

export const bigCatch = defineMode<State, Settings, Action>({
  meta,
  settings,
  defaults: meta.common.defaults,
  action,
  init(ctx) {
    const now = ctx.now();
    const endsAt = now + timeLimitMs(ctx);
    ctx.setTimer('time', endsAt);
    const choice = ctx.settings.water;
    const rotate = !ctx.settings.deepSea && choice === 'rotate';
    const water: WaterId = ctx.settings.deepSea ? 'reef' : choice === 'estuary' || choice === 'reef' ? choice : 'river';
    const s: State = {
      fishers: {},
      endsAt,
      water,
      nextWaterAt: null,
      event: null,
      nextEventAt: null,
      lastEvent: null,
      biggest: [],
      records: {},
      rare: [],
      totals: { casts: 0, landed: 0, grams: 0, perfect: 0, escaped: 0, spooked: 0 },
      fishSeq: 0,
    };
    for (const p of ctx.players()) s.fishers[p.id] = newFisher(s, ctx);
    if (rotate && now + WATER_ROTATE_SEC * 1000 < endsAt) {
      s.nextWaterAt = now + WATER_ROTATE_SEC * 1000;
      ctx.setTimer('water', s.nextWaterAt);
    }
    if (ctx.settings.frenzy) {
      s.nextEventAt = now;
      startEvent(s, ctx);
    } else if (ctx.settings.events) scheduleEvent(s, ctx, now + eventGap(ctx));
    return s;
  },
  onPlayerJoin(s, p, ctx) {
    s.fishers[p.id] ??= newFisher(s, ctx);
  },
  onPlayerLeave(s, p, ctx) {
    const f = s.fishers[p.id];
    if (!f) return;
    // A catch on the table is sold so it still counts; a line in the water is wound in.
    if (f.line.phase === 'landed') sell(f, ctx, p.id, 'Sold for you as you left.');
    else if (f.line.phase !== 'idle') {
      ctx.clearTimer(lineTimer(p.id));
      f.line = idleLine(f.line.seq, f.line.water);
    }
  },
  onAction(s, playerId, a, ctx) {
    const f = s.fishers[playerId];
    if (!f) return { error: 'You are not in this game.' };
    switch (a.type) {
      case 'answer': {
        const res = streamSubmit(f.stream, playerId, a.iid, a.answer, ctx);
        if ('error' in res) return res;
        if (res.correct) {
          const bonus = res.streak % BONUS_CAST_EVERY === 0 ? 1 : 0;
          f.casts += 1 + bonus;
          if (f.stream.last) f.stream.last.text = bonus ? `+2 casts: ${String(BONUS_CAST_EVERY)} in a row!` : '+1 cast';
        } else if (f.stream.last) f.stream.last.text = 'No cast this time';
        streamNext(f.stream, ctx);
        return;
      }
      case 'cast': {
        if (f.line.phase === 'landed') return { error: 'Sell your catch or put it in your tank first.' };
        if (f.line.phase !== 'idle') return { error: 'Your line is already in the water.' };
        if (f.casts <= 0) return { error: 'You have no casts left. Answer a question to earn one.' };
        cast(s, ctx, playerId, f);
        return;
      }
      case 'reel': {
        const phase = f.line.phase;
        if (phase === 'idle') return { error: 'Your line is not in the water.' };
        if (phase === 'landed') return { error: 'Sell your catch or put it in your tank first.' };
        // Judged by the clock, not the phase, so a reel that arrives a moment before the bite's timer fires still counts.
        const now = ctx.now();
        if (now < f.line.biteAt) spook(f, ctx, playerId, s);
        else if (now > f.line.biteAt + REEL_WINDOW_MS) escape(f, ctx, s);
        else land(s, ctx, playerId, f);
        return;
      }
      case 'sell':
      case 'tank': {
        if (f.line.phase !== 'landed') return { error: 'There is no catch waiting for you.' };
        if (a.seq !== f.line.seq) return { error: 'That catch has already gone.' };
        if (a.type === 'sell') sell(f, ctx, playerId);
        else {
          if (f.tank.length >= TANK_SIZE) return { error: 'Your tank is full. Sell this one instead.' };
          tank(f, ctx, playerId);
        }
        return;
      }
      case 'lure': {
        if (a.level <= f.lure) return { error: 'You already have that lure.' };
        if (a.level !== f.lure + 1) return { error: 'Buy the lures in order.' };
        const lure = LURES[a.level]!;
        if (f.wallet < lure.price) return { error: `The ${lure.name.toLowerCase()} costs ${pointsText(lure.price)}. You have ${String(f.wallet)}.` };
        f.wallet -= lure.price;
        f.spent += lure.price;
        f.lure = a.level;
        return;
      }
    }
  },
  onTimer(s, id, ctx) {
    if (id === 'time') {
      // Catches still on the table are sold, so every landed fish counts.
      for (const [pid, f] of Object.entries(s.fishers)) if (f.line.phase === 'landed') sell(f, ctx, pid, 'Time is up, so it was sold for you.');
      ctx.endGame();
      return;
    }
    if (id === 'water') rotateWater(s, ctx);
    else if (id === 'event') startEvent(s, ctx);
    else if (id === 'eventEnd') {
      if (s.event && ctx.now() >= s.event.endsAt) s.event = null;
    } else if (id.startsWith('line:')) onLineTimer(s, ctx, id.slice('line:'.length));
  },
  view(s, viewer, ctx) {
    const me = viewer.kind === 'player' ? viewer.playerId : null;
    const rows = ranking(s, ctx, me);
    const top = rows.slice(0, viewer.kind === 'host' ? BOARD_HOST : BOARD_PLAYER);
    const mine = rows.find((r) => r.isYou);
    if (mine && !top.includes(mine)) top.push(mine);
    const base = {
      endsAt: s.endsAt,
      water: { id: s.water, nextAt: s.nextWaterAt, next: s.nextWaterAt === null ? null : nextWater(s.water) },
      event: s.event ? { id: s.event.id, endsAt: s.event.endsAt } : null,
      nextEventAt: s.nextEventAt,
      rules: { trophyHunt: ctx.settings.trophyHunt, frenzy: ctx.settings.frenzy, deepSea: ctx.settings.deepSea, tankSize: ctx.settings.trophyHunt ? TROPHY_COUNT : TANK_SIZE },
      players: rows.length,
      board: top,
      teams: teamRows(s, ctx),
    };
    const named = (h: Highlight) => ({ playerId: h.by, name: nameOf(ctx, h.by), species: h.species, grams: h.grams, at: h.at });
    if (viewer.kind === 'host') {
      return {
        ...base,
        lines: ctx
          .players()
          .filter((p) => s.fishers[p.id])
          .map((p) => ({ playerId: p.id, name: p.name, teamId: p.teamId, ...hostLine(s.fishers[p.id]!) })),
        biggest: s.biggest.map(named),
        records: Object.values(s.records).map((h) => named(h!)),
        rareTank: s.rare.map(named),
        totals: s.totals,
      };
    }
    const f = me ? s.fishers[me] : undefined;
    if (!me || !f) return { ...base, you: null };
    const m = moment(s, ctx, f);
    const value = tankValue(f.tank, rarityOf, !ctx.settings.trophyHunt);
    const next = nextLure(f.lure);
    return {
      ...base,
      you: {
        score: scoreOf(f, ctx),
        rank: mine?.rank ?? null,
        teamId: teamOf(ctx, me),
        wallet: f.wallet,
        casts: f.casts,
        streak: f.stream.streak,
        toBonus: BONUS_CAST_EVERY - (f.stream.streak % BONUS_CAST_EVERY),
        line: lineView(f, ctx),
        outcome: f.outcome,
        tank: { fish: f.tank.map(fishView), points: value.fish, bonus: value.bonus, value: value.total, sets: value.sets.filter((x) => x.count > 0).map(({ rarity, count, sets }) => ({ rarity, count, sets })) },
        catches: { count: f.landed, grams: f.landedGrams, top: f.top.map(fishView) },
        lure: { level: f.lure, name: LURES[f.lure]!.name, next: next ? { level: next.level, name: next.name, price: next.price } : null },
        odds: {
          water: m.water,
          lure: m.lure,
          event: m.event,
          rows: oddsTable(m).map((r) => ({ species: r.species, percent: round1(r.percent), minKg: round2(r.minKg), maxKg: round2(r.maxKg) })),
          biteMs: biteRangeMs(m),
          skew: round2(sizeSkew(m)),
        },
        stats: { casts: f.casted, landed: f.landed, perfect: f.perfect, escaped: f.escaped, spooked: f.spooked },
        question: streamQuestionView(f.stream, ctx),
        feedback: f.stream.last,
      },
    };
  },
  results(s, ctx) {
    const trophy = ctx.settings.trophyHunt;
    const standings = ctx.everyone().map((p) => {
      const f = s.fishers[p.id];
      const score = f ? scoreOf(f, ctx) : 0;
      return { playerId: p.id, score, label: trophy ? `${pointsText(score)} from ${plural(f?.tank.length ?? 0, 'trophy', 'trophies')}` : pointsText(score) };
    });
    const teams = teamRows(s, ctx);
    const best = Math.max(0, ...standings.map((r) => r.score));
    const leaders = standings.filter((r) => r.score === best);
    let summary = 'Nobody landed a fish this time.';
    if (best > 0) summary = leaders.length === 1 ? `${nameOf(ctx, leaders[0]!.playerId)} won with ${pointsText(best)}.` : `${String(leaders.length)} players tied on ${pointsText(best)}.`;
    const biggest = s.biggest[0];
    if (biggest) summary += ` Biggest catch: ${nameOf(ctx, biggest.by)}’s ${formatWeight(biggest.grams)} ${inSentence(biggest.species).replace(/^the /, '')}.`;
    return {
      standings,
      ...(teams ? { teamStandings: teams.map((t) => ({ teamId: t.teamId, score: t.average, label: `${pointsText(t.average)} on average` })) } : {}),
      summary,
    };
  },
  bot(view, ctx) {
    const you = view?.you;
    if (!you) return null;
    const line = you.line;
    if (line.phase === 'landed') return botDecide(view, you, ctx);
    if (line.phase === 'biting') return ctx.rng.next() < reelChance(ctx.now - line.biteAt) ? { type: 'reel' } : null;
    // Watching the bobber; every now and then too keen and reeling before the bite.
    if (line.phase === 'waiting') return ctx.rng.next() < 0.015 ? { type: 'reel' } : null;
    if (you.casts > 0) {
      if (wantsLure(view, you, ctx.now) && you.wallet >= you.lure.next.price && ctx.rng.next() < 0.6) return { type: 'lure', level: you.lure.next.level };
      return { type: 'cast' };
    }
    const q = you.question;
    return q ? { type: 'answer', iid: q.iid, answer: ctx.answer(q.iid) } : null;
  },
  botDelay(view, rng) {
    const you = view?.you;
    switch (you?.line?.phase) {
      case 'landed':
        return 700 + rng.int(0, 1800);
      case 'biting':
        return 150 + rng.int(0, 350);
      case 'waiting':
        // Watching the bobber, but now and then looking away for a moment.
        return rng.next() < 0.15 ? 2000 + rng.int(0, 2500) : 200 + rng.int(0, 350);
      default:
        return you?.casts > 0 ? 400 + rng.int(0, 900) : 2200 + rng.int(0, 4500);
    }
  },
});

/* ---------------------------------- bots ---------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The chance a bot reels on this look, given how long the fish has been biting: a reaction time that sometimes misses. */
function reelChance(sinceBite: number): number {
  if (sinceBite < 250) return 0.15;
  if (sinceBite < 600) return 0.5;
  if (sinceBite < 1500) return 0.7;
  return 0.85;
}

/**
 * A lure is worth buying while there is time for it to pay for itself: the
 * soft plastic with more than 2 minutes 20 seconds left, each one after that
 * with 50 seconds more. In Trophy Hunt lure money counts for nothing else.
 */
function wantsLure(view: any, you: any, now: number): boolean {
  const next = you.lure.next;
  if (!next) return false;
  if (view.rules.trophyHunt) return true;
  return view.endsAt - now > (90 + 50 * next.level) * 1000;
}

/**
 * Sell while saving up for a lure, unless the fish is rare or finishes a set.
 * Otherwise tank anything uncommon or better and commons that carry on a set
 * (keeping a little room for something better), and sell the rest.
 */
function botDecide(view: any, you: any, ctx: BotContext) {
  const fish = you.line.fish;
  const sell = { type: 'sell', seq: you.line.seq } as const;
  const tank = { type: 'tank', seq: you.line.seq } as const;
  if (!you.line.canTank) return sell;
  const rarity = speciesById(fish.species)?.rarity ?? 'common';
  const same = (you.tank.fish as any[]).filter((t) => speciesById(t.species)?.rarity === rarity).length;
  const room = view.rules.tankSize - you.tank.fish.length;
  const finishesSet = same % SET_SIZE === SET_SIZE - 1;
  const big = rarity === 'rare' || rarity === 'legend';
  if (finishesSet || big) return tank;
  if (wantsLure(view, you, ctx.now) && you.wallet < you.lure.next.price) return sell;
  const keep = (rarity === 'uncommon' && room > 1) || (rarity === 'common' && same % SET_SIZE > 0 && room > 2) || ctx.rng.next() < 0.15;
  return keep ? tank : sell;
}
