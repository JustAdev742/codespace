/*
 * Night Market: metadata, settings, variants and every table of odds the
 * mode uses. Metadata and plain data only: the browser imports this for the
 * catalogue and for the "What's inside?" odds, so no game logic lives here.
 */
import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'night-market',
  title: 'Night Market',
  tagline: 'Every right answer picks a mystery lantern. Coins, gambles, tricks and charms: the richest stall wins.',
  description:
    'Each right answer lets you pick one of three floating lanterns. A lantern’s colour tells you what kind it is (coins, a gamble, a trick on another player or a lucky charm) but never exactly what is inside. Market events shake up the odds for everyone, swipes and swaps can turn the lead around in a moment, and the richest stall when the market closes wins.',
  category: 'party',
  pacing: 'self',
  players: { min: 1, max: 200, recommended: '3 to 60' },
  duration: { min: 4, max: 10 },
  difficulty: 1,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  common: {
    fields: ['timeLimitSec'],
    defaults: { timeLimitSec: 360 },
    help: { timeLimitSec: 'The market closes when time runs out. With no limit set, it closes after 6 minutes.' },
  },
  rules: [
    'Every right answer lets you pick one of three lanterns. A wrong answer brings the next question.',
    'A lantern’s colour, icon and word tell you its kind, never exactly what is inside.',
    'Gold Fortune lanterns hold coins. Every 5 right answers, your coin lanterns are worth more.',
    'Red Wild lanterns are a gamble: your coins grow by half, or you lose some.',
    'Violet Trick lanterns swipe coins from a player you choose, swap coin totals with them, or charge everyone a small toll.',
    'Teal Charm lanterns hold a shield, Lantern Sight (your next three lanterns show what is inside) or a Lucky Streak (your next 2 Fortune lanterns pay double).',
    'A shield blocks the next swipe or swap played on you, then breaks. Everyone can see who holds one.',
    'You cannot trick the same player twice in a row, or a stall that was tricked in the last 15 seconds.',
    'Market events change the odds for 30 seconds at a time. The last 45 seconds are Last Call: Fortune lanterns pay double.',
    'The most coins when the market closes wins.',
    'In a team game, tricks only reach the other teams, and the best average wins.',
  ],
  thumbnail: { glyph: 'chest', hue: 280, accentHue: 45 },
  status: 'playable',
  tags: ['luck', 'tricks', 'party', 'projector', 'self-paced'],
  accessibility: [
    'Every lantern shows its kind as a word and an icon on a patterned lantern, never by colour alone.',
    'Picking a lantern and choosing a player are ordinary buttons that work with a keyboard or a switch.',
    'The odds of every lantern, with the current event applied, are one tap away under What’s inside?',
    'The opening animation is skipped when less motion is asked for.',
  ],
};

/* ------------------------------- the lanterns ------------------------------ */

export const LANTERN_KINDS = ['fortune', 'wild', 'trick', 'charm'] as const;
export type LanternKind = (typeof LANTERN_KINDS)[number];

/** How a kind looks and reads. Colour is never the only cue: each kind has its own word, icon and paper pattern. */
export const KIND_INFO: Record<LanternKind, { label: string; colour: string; hue: number; accentHue: number; pattern: 'stars' | 'flames' | 'moons' | 'leaves'; blurb: string }> = {
  fortune: { label: 'Fortune', colour: 'gold', hue: 44, accentHue: 22, pattern: 'stars', blurb: 'Coins. More of them as your stall levels up.' },
  wild: { label: 'Wild', colour: 'red', hue: 354, accentHue: 40, pattern: 'flames', blurb: 'A gamble: grow your coins, or lose some.' },
  trick: { label: 'Trick', colour: 'violet', hue: 272, accentHue: 190, pattern: 'moons', blurb: 'Swipe or swap coins with a player you choose, or charge a toll.' },
  charm: { label: 'Charm', colour: 'teal', hue: 172, accentHue: 50, pattern: 'leaves', blurb: 'A shield, Lantern Sight or a Lucky Streak.' },
};

/** Relative chance of each kind, drawn on its own for each of the three lanterns in an offer. */
export const KIND_WEIGHTS: Record<LanternKind, number> = { fortune: 50, wild: 14, trick: 22, charm: 14 };
/** Trick weight with the trick odds set to high. */
export const TRICK_WEIGHT_HIGH = 36;
/** Wild weight with wildness set to wild. */
export const WILD_WEIGHT_WILD = 25;
/** Lanterns in each offer. */
export const OFFER_SIZE = 3;

export type FortuneId = 'coins10' | 'coins20' | 'coins30' | 'coins40' | 'coins50' | 'coins75' | 'coins100' | 'quarter' | 'double' | 'jackpot';
export type WildId = 'grow' | 'loseSmall' | 'loseBig';
export type TrickId = 'swipe1' | 'swipe2' | 'swipe3' | 'swipe4' | 'swap' | 'toll';
export type CharmId = 'shield' | 'sight' | 'lucky';
export type ContentId = FortuneId | WildId | TrickId | CharmId;

/**
 * What a Fortune lantern holds. `coins` are flat amounts that grow with the
 * stall level; `percent` pays that share of your coins, at least `min`.
 */
export const FORTUNE_ODDS: readonly { id: FortuneId; weight: number; coins?: number; percent?: number; min?: number }[] = [
  { id: 'coins10', weight: 17, coins: 10 },
  { id: 'coins20', weight: 14, coins: 20 },
  { id: 'coins30', weight: 14, coins: 30 },
  { id: 'coins40', weight: 12, coins: 40 },
  { id: 'coins50', weight: 11, coins: 50 },
  { id: 'coins75', weight: 10, coins: 75 },
  { id: 'coins100', weight: 8, coins: 100 },
  { id: 'quarter', weight: 9, percent: 25, min: 25 },
  { id: 'double', weight: 2, percent: 100, min: 50 },
  { id: 'jackpot', weight: 3, coins: 250 },
];

/** What a Wild lantern holds. The sizes depend on the wildness setting (WILD_RULES). */
export const WILD_ODDS: readonly { id: WildId; weight: number }[] = [
  { id: 'grow', weight: 45 },
  { id: 'loseSmall', weight: 25 },
  { id: 'loseBig', weight: 30 },
];

/** Wild sizes: `grow` multiplies your coins (at least +`growMin`), the losses take that percent of them. */
export const WILD_RULES: Record<'normal' | 'wild', { grow: number; growMin: number; loseSmall: number; loseBig: number; weight: number }> = {
  normal: { grow: 1.5, growMin: 40, loseSmall: 10, loseBig: 25, weight: KIND_WEIGHTS.wild },
  wild: { grow: 2, growMin: 40, loseSmall: 15, loseBig: 40, weight: WILD_WEIGHT_WILD },
};
/** Wild Winds makes a Wild win this much bigger: ×1.5 becomes ×2, ×2 becomes ×2.5. */
export const WILD_WINDS_BOOST = 0.5;

/**
 * What a Trick lantern holds. Swipe sizes depend on the greed setting
 * (SWIPE_PERCENTS). A swap moves a whole fortune at once, so it is the rare
 * one: any more often and the last swap of the night decides the game.
 */
export const TRICK_ODDS: readonly { id: TrickId; weight: number }[] = [
  { id: 'swipe1', weight: 18 },
  { id: 'swipe2', weight: 18 },
  { id: 'swipe3', weight: 14 },
  { id: 'swipe4', weight: 10 },
  { id: 'swap', weight: 10 },
  { id: 'toll', weight: 30 },
];

/** The four swipe sizes, in percent of the target's coins, for each greed setting. */
export const SWIPE_PERCENTS: Record<'gentle' | 'normal' | 'greedy', readonly [number, number, number, number]> = {
  gentle: [5, 8, 12, 15],
  normal: [10, 15, 20, 25],
  greedy: [20, 25, 30, 35],
};
/** A swipe takes at least this many coins from anyone who has them. */
export const SWIPE_MIN = 5;
/**
 * A toll takes this percent of every other player's coins, at most `max` from
 * each and `total` in all: in a big class everyone pays a little less, so a
 * toll is worth about the same in a room of 5 or 50.
 */
export const TOLL = { percent: 5, max: 25, total: 200 } as const;

/** What a Charm lantern holds: with shields, and (when nobody can trick you) without them. */
export const CHARM_ODDS: Record<'normal' | 'noShields', readonly { id: CharmId; weight: number }[]> = {
  normal: [
    { id: 'shield', weight: 50 },
    { id: 'sight', weight: 25 },
    { id: 'lucky', weight: 25 },
  ],
  noShields: [
    { id: 'sight', weight: 50 },
    { id: 'lucky', weight: 50 },
  ],
};
/** Coins instead of a second shield: you can hold only one. */
export const SHIELD_REFUND = 30;
/** Fortune lanterns a Lucky Streak doubles. */
export const LUCKY_CHARGES = 2;
/** Lucky Streak charges you can hold at once. */
export const LUCKY_MAX = 4;

/** The stall level rises every this many right answers. */
export const LEVEL_EVERY = 5;
/** Each level adds this share to flat coin amounts (+25%). */
export const LEVEL_BONUS = 0.25;

/** Seconds a player has to choose who to trick before it goes to the richest player they may trick. */
export const TRICK_CHOOSE_SEC = 20;
/**
 * Seconds a stall is watched after a swipe or swap lands on it (or bounces off
 * its shield): nobody can trick it again until then, so a whole class cannot
 * pile on the leader at once.
 */
export const TRICK_GUARD_SEC = 15;
/** Coins a swipe or swap gives when nobody is left to trick. */
export const NO_TARGET_COINS = 25;
/** The target list shows at most this many players, richest first. */
export const TARGET_LIST_MAX = 40;

/* ------------------------------ market events ----------------------------- */

export const MARKET_EVENTS = ['golden', 'trickster', 'rain', 'calm', 'winds'] as const;
export type MarketEventId = (typeof MARKET_EVENTS)[number] | 'lastCall';

export const EVENT_INFO: Record<MarketEventId, { label: string; blurb: string; needsTricks: boolean }> = {
  golden: { label: 'Golden Hour', blurb: 'Fortune lanterns pay double.', needsTricks: false },
  trickster: { label: 'Trickster Moon', blurb: 'Trick lanterns are twice as likely.', needsTricks: true },
  rain: { label: 'Lantern Rain', blurb: 'Every right answer gives two picks.', needsTricks: false },
  calm: { label: 'Calm Night', blurb: 'No trick lanterns, and shields cannot break.', needsTricks: true },
  winds: { label: 'Wild Winds', blurb: 'Wild lanterns are twice as likely and win bigger.', needsTricks: false },
  lastCall: { label: 'Last Call', blurb: 'Fortune lanterns pay double until the market closes.', needsTricks: false },
};

/**
 * Each event that can run is equally likely, never the one that just ran.
 * Trickster Moon and Calm Night only run when tricks can be played.
 */
export const EVENT_WEIGHTS: Record<(typeof MARKET_EVENTS)[number], number> = { golden: 1, trickster: 1, rain: 1, calm: 1, winds: 1 };

/** The first event starts this long into the game, the next ones this far apart, and each lasts this long. */
export const EVENT_TIMING = { firstSec: 60, everySec: 90, lastsSec: 30, lastCallSec: 45 } as const;

/* -------------------------------- settings -------------------------------- */

export const settings: SettingField[] = [
  { kind: 'toggle', key: 'tricks', label: 'Tricks', help: 'Violet lanterns let players swipe, swap or charge a toll. Off: no tricks and no shields.', default: true },
  { kind: 'toggle', key: 'events', label: 'Market events', help: 'A 30-second event every 90 seconds changes the odds, and the last 45 seconds are Last Call.', default: true },
  { kind: 'number', key: 'goalCoins', label: 'Coins to win', help: 'The first stall to reach this many coins wins at once. 0 plays until time runs out.', min: 0, max: 10000, step: 250, default: 0, unit: 'coins' },
  {
    kind: 'select',
    key: 'greed',
    label: 'Swipe size',
    options: [
      { value: 'gentle', label: 'Gentle: a swipe takes 5% to 15%' },
      { value: 'normal', label: 'Normal: a swipe takes 10% to 25%' },
      { value: 'greedy', label: 'Greedy: a swipe takes 20% to 35%' },
    ],
    default: 'normal',
  },
  {
    kind: 'select',
    key: 'trickOdds',
    label: 'Trick lanterns',
    options: [
      { value: 'normal', label: 'Normal: 22 in 100 lanterns' },
      { value: 'high', label: 'Common: 36 in 100 lanterns' },
    ],
    default: 'normal',
  },
  {
    kind: 'select',
    key: 'wildness',
    label: 'Wild lanterns',
    options: [
      { value: 'normal', label: 'Normal: win ×1.5, or lose 10% or 25%' },
      { value: 'wild', label: 'Wild: more of them, win ×2, or lose 15% or 40%' },
    ],
    default: 'normal',
  },
  { kind: 'toggle', key: 'fog', label: 'Lantern fog', help: 'Lantern kinds are hidden, so every pick is pure luck.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'night-market-friendly',
      modeId: 'night-market',
      title: 'Friendly Market',
      tagline: 'No tricks between players. Just coins, gambles and charms.',
      changes: 'Trick lanterns never appear, so nobody can swipe or swap your coins. Without tricks there is nothing to shield against, so Charm lanterns hold Lantern Sight or a Lucky Streak, half and half.',
      status: 'playable',
      thumbnail: { hue: 172, accentHue: 45 },
    },
    settings: { tricks: false },
    locked: ['tricks'],
  },
  {
    meta: {
      id: 'night-market-thieves-moon',
      modeId: 'night-market',
      title: 'Thieves’ Moon',
      tagline: 'More trick lanterns, and every swipe takes a bigger bite.',
      changes: 'Trick lanterns turn up 36 times in 100 instead of 22, and swipes take 20% to 35% of a player’s coins instead of 10% to 25%. Shields are worth their weight in gold.',
      status: 'playable',
      thumbnail: { glyph: 'mask', hue: 268, accentHue: 320 },
    },
    settings: { greed: 'greedy', trickOdds: 'high' },
    locked: ['greed', 'trickOdds'],
  },
  {
    meta: {
      id: 'night-market-race',
      modeId: 'night-market',
      title: 'Race to 2,500',
      tagline: 'The first stall to reach 2,500 coins wins on the spot.',
      changes: 'The game ends the moment a player reaches 2,500 coins, and they win. If nobody gets there before time runs out, the richest stall wins as usual.',
      status: 'playable',
      thumbnail: { glyph: 'flag', hue: 36, accentHue: 280 },
    },
    settings: { goalCoins: 2500 },
    locked: ['goalCoins'],
  },
  {
    meta: {
      id: 'night-market-high-rollers',
      modeId: 'night-market',
      title: 'High Rollers',
      tagline: 'Wild lanterns everywhere: double up, or lose 40%.',
      changes: 'Wild lanterns turn up 25 times in 100 instead of 14. A Wild win doubles your coins instead of adding half, but a loss takes 15% or 40% instead of 10% or 25%.',
      status: 'playable',
      thumbnail: { glyph: 'dice', hue: 352, accentHue: 45 },
    },
    settings: { wildness: 'wild' },
    locked: ['wildness'],
  },
  {
    meta: {
      id: 'night-market-fog',
      modeId: 'night-market',
      title: 'Lantern Fog',
      tagline: 'Fog hides every lantern’s colour. Pure luck, every pick.',
      changes: 'Fog hides the kind of every lantern, so you pick without knowing whether it holds coins, a gamble, a trick or a charm. Lantern Sight still shows what is inside.',
      status: 'playable',
      thumbnail: { glyph: 'ghost', hue: 238, accentHue: 190 },
    },
    settings: { fog: true },
    locked: ['fog'],
  },
];
