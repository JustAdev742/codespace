/*
 * Festival Workshop: metadata and the numbers the screens show. The browser
 * imports this file for the catalogue and for the shop and odds tables (see
 * the "./festival-workshop" entry in package.json), so it holds data only:
 * no game logic.
 */
import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export type Goods = 'lanterns' | 'kites' | 'candles' | 'fireworks';
export type StationKind = 'folder' | 'loom' | 'press' | 'lab' | 'helpers';
export type EventKind = 'parade' | 'rush' | 'sparks' | 'swing' | 'tea';
export type FavourKind = 'overtime' | 'tipJar' | 'prank' | 'lock';

export const GOODS: readonly Goods[] = ['lanterns', 'kites', 'candles', 'fireworks'];

export const GOODS_INFO: Record<Goods, { label: string; one: string; many: string }> = {
  lanterns: { label: 'Paper lanterns', one: 'paper lantern', many: 'paper lanterns' },
  kites: { label: 'Kites', one: 'kite', many: 'kites' },
  candles: { label: 'Candles', one: 'candle', many: 'candles' },
  fireworks: { label: 'Fireworks', one: 'firework', many: 'fireworks' },
};

export const STATION_ORDER: readonly StationKind[] = ['folder', 'loom', 'press', 'lab', 'helpers'];

/**
 * The shop. `income` is coins per second at level 1 and even demand (×1.0); Glim Helpers make nothing themselves.
 * Tuned by simulation (see the rules tests): bigger stations pay back more slowly (20, 30, 33 and 47 seconds),
 * so a fast workshop does not fill every slot with Firework Labs in the first minute, and a Candle Press earns
 * half a Lab's income per slot, so the market's ×0.6 to ×1.6 can tip the choice between them.
 */
export const STATIONS: Record<StationKind, { name: string; many: string; goods: Goods | null; cost: number; income: number }> = {
  folder: { name: 'Paper Folder', many: 'Paper Folders', goods: 'lanterns', cost: 20, income: 1 },
  loom: { name: 'Kite Loom', many: 'Kite Looms', goods: 'kites', cost: 120, income: 4 },
  press: { name: 'Candle Press', many: 'Candle Presses', goods: 'candles', cost: 500, income: 15 },
  lab: { name: 'Firework Lab', many: 'Firework Labs', goods: 'fireworks', cost: 1400, income: 30 },
  helpers: { name: 'Glim Helpers', many: 'Glim Helpers', goods: null, cost: 300, income: 0 },
};

/** The station that makes each kind of goods. */
export const MAKER: Record<Goods, StationKind> = { lanterns: 'folder', kites: 'loom', candles: 'press', fireworks: 'lab' };

export const MAX_LEVEL = 5;
/** Each level multiplies a station's income by this (level 5 makes about 6.5 times level 1). */
export const LEVEL_INCOME = 1.6;
/** Upgrading from level L costs the station's price × this to the power L, rounded to 5. */
export const UPGRADE_COST_GROWTH = 3;
/** Glim Helpers add this much to every other station at level 1, and HELPER_PER_LEVEL more for each level after. */
export const HELPER_FIRST = 0.2;
export const HELPER_PER_LEVEL = 0.1;
/** Small Stalls: stations and upgrades cost a quarter less. */
export const QUARTER_OFF = 0.75;

/** A right answer pays this many seconds of your income (at least `min` coins), plus `streakStep` for every answer in a row after the first, up to `streakMax`. */
export const PAYDAY = { seconds: 8, min: 10, streakStep: 0.1, streakMax: 0.5 } as const;

/**
 * The shared market. At every shift each goods' price is
 * clamp(1 + slope × (0.25 − share of the class's goods), min, max), then nudged
 * by one of `nudges` (each equally likely), kept in range and rounded to 0.1.
 * The wide range is used by Market Madness and while a market swing is on.
 */
export const MARKET = {
  normal: { min: 0.6, max: 1.6, slope: 3.2, nudges: [-0.1, 0, 0.1] },
  wide: { min: 0.4, max: 2, slope: 4, nudges: [-0.2, -0.1, 0, 0.1, 0.2] },
} as const;
/** The screens hint at where prices are heading this long before a shift. */
export const SHIFT_HINT_MS = 15_000;

/** Festival events: the first starts at 45 s, then one every 75 s (every 45 s in Rush Orders), each lasting 30 s. */
export const EVENT_TIMING = { firstAtMs: 45_000, everyMs: 75_000, rushEveryMs: 45_000, lengthMs: 30_000 } as const;

/** Every event is equally likely, never the same one twice in a row. A tea break only comes when someone has Glim Helpers. */
export const EVENTS: Record<EventKind, { title: string; weight: number; text: string }> = {
  parade: { title: 'Parade order', weight: 1, text: 'The class makes one kind of goods together for 30 s: goods someone already makes, each equally likely.' },
  rush: { title: 'Rush hour', weight: 1, text: 'Paydays are doubled for 30 s.' },
  sparks: { title: 'Lucky sparks', weight: 1, text: 'Each right answer has a 1 in 4 chance to upgrade one of your stations for free.' },
  swing: { title: 'Market swing', weight: 1, text: 'The market reshuffles now, with prices from ×0.4 to ×2.' },
  tea: { title: 'Glim tea break', weight: 1, text: 'Glim Helpers count double for 30 s.' },
};
export const EVENT_ORDER: readonly EventKind[] = ['parade', 'rush', 'sparks', 'swing', 'tea'];

/** Lucky sparks: the chance a right answer upgrades a random station of yours that is not at level 5. */
export const LUCKY_SPARK_CHANCE = 0.25;
export const RUSH_HOUR_PAYDAY = 2;
export const TEA_BREAK_HELPERS = 2;

/**
 * Parade orders: the class target is `targetSeconds` × players × the goods' level-1 income.
 * The top 3 makers earn `bonusSeconds` of their income (`rushBonusSeconds` in Rush Orders);
 * if the class reaches the target, everyone who made some gets `boost` income for `boostMs`.
 * Tuned by simulation: a class of children reaches about three orders in four.
 */
export const PARADE = { targetSeconds: 30, bonusSeconds: 20, rushBonusSeconds: 40, boost: 1.25, boostMs: 30_000, rewarded: 3 } as const;

/** The grand finale: fireworks sell at this price (or ×3 in Fireworks Finale) and paydays grow by half. */
export const FINALE = { payday: 1.5 } as const;

/** Every fifth right answer offers two Festival Favours, drawn by weight with no card twice. */
export const FAVOUR_EVERY = 5;
export const FAVOUR_OFFER_MS = 20_000;
export const FAVOURS: Record<FavourKind, { title: string; weight: number; text: string }> = {
  overtime: { title: 'Overtime', weight: 35, text: 'Your income ×1.5 for 30 s.' },
  tipJar: { title: 'Tip jar', weight: 25, text: '+25% of your coins, at least 30.' },
  prank: { title: 'Prank', weight: 25, text: 'Pick a player. Their best station stops for 15 s, unless they hold a lock.' },
  lock: { title: 'Lock', weight: 15, text: 'Blocks the next prank on you. A second lock gives +40 coins instead.' },
};
export const FAVOUR_ORDER: readonly FavourKind[] = ['overtime', 'tipJar', 'prank', 'lock'];
export const OVERTIME = { mult: 1.5, ms: 30_000 } as const;
export const TIP_JAR = { share: 0.25, min: 30 } as const;
export const PRANK_MS = 15_000;
export const SECOND_LOCK_COINS = 40;

export const meta: ModeMeta = {
  id: 'festival-workshop',
  title: 'Festival Workshop',
  tagline: 'Build a workshop for the lantern festival. Read the class market, not the leader.',
  description:
    'Right answers bring in paydays; coins build and upgrade stations that make paper lanterns, kites, candles and fireworks every second. The whole class shares one market, so the goods everyone makes go cheap and the goods nobody makes pay well. Festival events, parade orders and Festival Favours (boosts, pranks and locks) shake things up. The biggest takings when time runs out wins.',
  category: 'strategy',
  pacing: 'self',
  players: { min: 1, max: 200, recommended: '1 to 60' },
  duration: { min: 5, max: 10 },
  difficulty: 2,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  common: {
    fields: ['timeLimitSec'],
    defaults: { timeLimitSec: 420 },
    help: { timeLimitSec: 'The workshop always closes: with no limit it runs for 7 minutes, so the finale still comes.' },
  },
  rules: [
    'A right answer brings in a payday: 8 seconds of your income, at least 10 coins, and up to 50% more on a streak.',
    'Coins build stations in your workshop slots and upgrade them up to level 5. Stations earn coins every second.',
    'Glim Helpers make nothing themselves, but add 20% or more to every other station.',
    'A full workshop can replace a station with a different one. The old station goes, with no coins back.',
    'Takings are everything your workshop has earned. Spending never lowers them, and the biggest takings win.',
    'The class shares one market: goods many people make go cheap (down to ×0.6), goods few make pay up to ×1.6. It shifts every minute.',
    'Festival events come every 75 seconds: parade orders, rush hours, lucky sparks, market swings and tea breaks.',
    'Every 5th right answer, pick a Festival Favour: Overtime, a Tip jar, a Prank on a rival or a Lock against pranks.',
    'The last 45 seconds are the Grand finale: fireworks sell at ×2 and paydays are 50% bigger.',
  ],
  thumbnail: { glyph: 'rocket', hue: 25, accentHue: 200 },
  status: 'playable',
  tags: ['economy', 'shared market', 'strategy', 'projector', 'self-paced'],
  accessibility: [
    'Market prices are written as numbers with up, down or steady arrows and words, never shown by colour alone.',
    'Every station, upgrade and favour is an ordinary button with its cost and what it does written on it.',
    'A stopped station says Tangled and counts down, so it never relies on colour.',
    'The odds of every event and favour are listed in the game.',
  ],
};

export const settings: SettingField[] = [
  {
    kind: 'select',
    key: 'slots',
    label: 'Workshop slots',
    options: [
      { value: '4', label: '4 slots' },
      { value: '6', label: '6 slots' },
      { value: '8', label: '8 slots' },
    ],
    default: '6',
  },
  {
    kind: 'select',
    key: 'shiftSeconds',
    label: 'Time between market shifts',
    options: [
      { value: '30', label: '30 seconds' },
      { value: '60', label: '1 minute' },
      { value: '90', label: '90 seconds' },
    ],
    default: '60',
  },
  {
    kind: 'select',
    key: 'marketRange',
    label: 'Market prices',
    options: [
      { value: 'normal', label: 'Steady: ×0.6 to ×1.6' },
      { value: 'wide', label: 'Wild: ×0.4 to ×2' },
    ],
    default: 'normal',
  },
  { kind: 'toggle', key: 'events', label: 'Festival events', help: 'Parade orders, rush hours, lucky sparks, market swings and tea breaks.', default: true },
  { kind: 'toggle', key: 'rushOrders', label: 'Rush orders', help: 'Every event is a parade order, one every 45 seconds, and the top 3 makers earn 40 seconds of income.', default: false },
  { kind: 'toggle', key: 'favours', label: 'Festival Favours', help: 'Every 5th right answer offers a choice of two favours.', default: true },
  { kind: 'toggle', key: 'pranks', label: 'Pranks', help: 'A prank stops a rival’s best station for 15 seconds. Off: no pranks and no locks.', default: true },
  {
    kind: 'select',
    key: 'finaleSeconds',
    label: 'Grand finale',
    options: [
      { value: '0', label: 'No finale' },
      { value: '45', label: 'The last 45 seconds' },
      { value: '90', label: 'The last 90 seconds' },
    ],
    default: '45',
  },
  {
    kind: 'select',
    key: 'finaleDemand',
    label: 'Firework price in the finale',
    options: [
      { value: '2', label: '×2' },
      { value: '3', label: '×3' },
    ],
    default: '2',
  },
  {
    kind: 'select',
    key: 'startingCoins',
    label: 'Starting coins',
    options: [
      { value: '0', label: 'None' },
      { value: '50', label: '50 coins' },
      { value: '200', label: '200 coins' },
    ],
    default: '50',
  },
  {
    kind: 'select',
    key: 'prices',
    label: 'Station prices',
    options: [
      { value: 'standard', label: 'Standard' },
      { value: 'quarterOff', label: 'A quarter off' },
    ],
    default: 'standard',
  },
  { kind: 'number', key: 'goal', label: 'Takings to win', help: '0 means no goal: the biggest takings when time runs out wins.', min: 0, max: 1_000_000, step: 5_000, default: 0, unit: 'coins' },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'festival-workshop-small-stalls',
      modeId: 'festival-workshop',
      title: 'Small Stalls',
      tagline: 'Four slots, and everything costs a quarter less. Every slot counts.',
      changes: 'The workshop has 4 slots instead of 6, and stations and upgrades cost a quarter less, so the choice of what goes in each slot matters more.',
      status: 'playable',
      thumbnail: { hue: 45, accentHue: 330 },
    },
    settings: { slots: '4', prices: 'quarterOff' },
    locked: ['slots', 'prices'],
  },
  {
    meta: {
      id: 'festival-workshop-market-madness',
      modeId: 'festival-workshop',
      title: 'Market Madness',
      tagline: 'The market shifts every 30 seconds, from ×0.4 to ×2.',
      changes: 'The market shifts every 30 seconds instead of every minute, and prices always swing wide, from ×0.4 to ×2, so the goods nobody makes pay double.',
      status: 'playable',
      thumbnail: { hue: 300, accentHue: 50 },
    },
    settings: { shiftSeconds: '30', marketRange: 'wide' },
    locked: ['shiftSeconds', 'marketRange'],
  },
  {
    meta: {
      id: 'festival-workshop-rush-orders',
      modeId: 'festival-workshop',
      title: 'Rush Orders',
      tagline: 'Parade after parade. The top makers earn big.',
      changes: 'Every festival event is a parade order, one every 45 seconds, and the top 3 makers of each order earn 40 seconds of income instead of 20.',
      status: 'playable',
      thumbnail: { hue: 200, accentHue: 25 },
    },
    settings: { events: true, rushOrders: true },
    locked: ['events', 'rushOrders'],
  },
  {
    meta: {
      id: 'festival-workshop-fireworks-finale',
      modeId: 'festival-workshop',
      title: 'Fireworks Finale',
      tagline: 'A 90-second finale where fireworks sell at ×3.',
      changes: 'The grand finale lasts the last 90 seconds instead of 45, and fireworks sell at ×3 instead of ×2, so a Firework Lab ready in time pays off.',
      status: 'playable',
      thumbnail: { hue: 345, accentHue: 45 },
    },
    settings: { finaleSeconds: '90', finaleDemand: '3' },
    locked: ['finaleSeconds', 'finaleDemand'],
  },
  {
    meta: {
      id: 'festival-workshop-friendly',
      modeId: 'festival-workshop',
      title: 'Friendly Fair',
      tagline: 'No pranks. Just build, trade and help the parade.',
      changes: 'Pranks are switched off, so nobody can stop anyone’s stations, and the only Festival Favours are Overtime and the Tip jar.',
      status: 'playable',
      thumbnail: { hue: 150, accentHue: 40 },
    },
    settings: { pranks: false },
    locked: ['pranks'],
  },
];
