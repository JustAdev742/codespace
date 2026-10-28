/*
 * Big Catch: metadata, settings, variants and every table the mode uses.
 * Metadata and plain data only: the browser imports this for the catalogue,
 * the species cards and the odds, so no game logic lives here.
 */
import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';
import type { Rarity, WaterId } from './species.ts';

export const meta: ModeMeta = {
  id: 'big-catch',
  title: 'Big Catch',
  tagline: 'Every right answer is a cast. Wait for the bite, reel it in, and land the biggest fish.',
  description:
    'Answer questions to earn casts, then fish a river, an estuary and a reef. Watch the bobber, reel in the moment it dips, and decide what to do with each catch: sell it for points to spend on lures, or put it in your tank and collect sets. Every chance is shown, and the biggest score when time runs out wins.',
  category: 'arcade',
  pacing: 'self',
  players: { min: 1, max: 200, recommended: '1 to 60' },
  duration: { min: 4, max: 10 },
  difficulty: 1,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  common: {
    fields: ['timeLimitSec'],
    defaults: { timeLimitSec: 360 },
    help: { timeLimitSec: 'Fishing stops when time runs out. With no limit set, it stops after 6 minutes.' },
  },
  rules: [
    'Every right answer gives you a cast. Every third right answer in a row gives a bonus cast.',
    'Cast your line and watch the bobber. When it dips, press Reel within 3 seconds to land the fish.',
    'Reel within half a second of the bite for a perfect catch: the fish is 10% heavier.',
    'Reel too early and you scare the fish away. Wait too long and it gets away.',
    'You can keep answering questions while your line is in the water.',
    'Sell a fish for 10 points a kilogram, or put it in your tank, which holds 6 fish.',
    'Fish in your tank are worth their points too, and every 3 of the same rarity earn a set bonus.',
    'Lures cost points and make bigger, rarer fish more likely. The chance of every fish is always on screen.',
    'The river, the estuary and the reef each have their own fish. The water can change every 2 minutes.',
    'Events change the odds for 20 seconds: Feeding Time, Golden Hour and Passing School.',
    'The biggest score when time runs out wins. In a team game, the best average wins.',
  ],
  thumbnail: { glyph: 'fish', hue: 198, accentHue: 46 },
  status: 'playable',
  stage: '3d',
  tags: ['fishing', 'luck', 'reflexes', 'projector', 'self-paced', '3d'],
  accessibility: [
    'Cast, Reel, Sell, Tank and every lure are ordinary buttons that work with a keyboard or a switch.',
    'The bite is shown with words and a sound as well as the bobber, and the reel window has a visible countdown.',
    'The chance of every fish, with your lure and the current event applied, is one tap away.',
    'The game plays without 3D: the scene is a picture, not the controls.',
  ],
};

/* --------------------------------- the line -------------------------------- */

/** How long after a cast the fish bites, in milliseconds (drawn evenly between the two). */
export const BITE_MS = { normal: [1500, 4000], deepSea: [3000, 6000] } as const;
/** Frenzy makes every bite come this much sooner (and Feeding Time halves it again). */
export const FRENZY_BITE = 0.6;
/** Feeding Time: bites come twice as fast. */
export const FEEDING_BITE = 0.5;
/** Reel within this long of the bite to land the fish. */
export const REEL_WINDOW_MS = 3000;
/** Reel within this long of the bite for a perfect catch. */
export const PERFECT_MS = 500;
/** A perfect catch is this much heavier. */
export const PERFECT_BONUS = 0.1;
/** A landed fish that is neither sold nor tanked in this long is sold for you. */
export const DECIDE_SEC = 10;
/** Every third right answer in a row gives one more cast. */
export const BONUS_CAST_EVERY = 3;

/* --------------------------------- scoring -------------------------------- */

/** A fish is worth this many points per kilogram, rounded to whole points. */
export const POINTS_PER_KG = 10;
/** Fish your tank holds. */
export const TANK_SIZE = 6;
/** Every 3 fish of one rarity in your tank earn this bonus. */
export const SET_SIZE = 3;
export const SET_BONUS: Record<Rarity, number> = { common: 30, uncommon: 60, rare: 120, legend: 250 };
/** Trophy Hunt: this many of your heaviest fish make your score. */
export const TROPHY_COUNT = 3;

/* ---------------------------------- lures --------------------------------- */

export interface Lure {
  level: number;
  name: string;
  /** Points this lure costs, bought after the one before it. */
  price: number;
  /** Each rarity's chance is multiplied by this before the table is shared out again. */
  boost: Record<Rarity, number>;
  /** Weight skew: a fish's weight is min + (max − min) × u^skew for an even u, so a lower skew means heavier fish. */
  skew: number;
}

export const LURES: readonly Lure[] = [
  { level: 0, name: 'Bare hook', price: 0, boost: { common: 1, uncommon: 1, rare: 1, legend: 1 }, skew: 1.8 },
  { level: 1, name: 'Soft plastic', price: 50, boost: { common: 1, uncommon: 1.3, rare: 1.7, legend: 1.3 }, skew: 1.5 },
  { level: 2, name: 'Spinner', price: 90, boost: { common: 1, uncommon: 1.6, rare: 2.4, legend: 1.6 }, skew: 1.25 },
  { level: 3, name: 'Golden lure', price: 120, boost: { common: 1, uncommon: 2, rare: 3.2, legend: 2 }, skew: 1 },
];
export const MAX_LURE = LURES.length - 1;

/* --------------------------------- waters --------------------------------- */

/** The order the waters come round in when they rotate. */
export const WATER_ORDER: readonly WaterId[] = ['river', 'estuary', 'reef'];
export const WATER_ROTATE_SEC = 120;

/* --------------------------------- events --------------------------------- */

export const EVENTS = ['feeding', 'golden', 'school'] as const;
export type EventId = (typeof EVENTS)[number];

export const EVENT_INFO: Record<EventId, { label: string; blurb: string }> = {
  feeding: { label: 'Feeding Time', blurb: 'Bites come twice as fast.' },
  golden: { label: 'Golden Hour', blurb: 'Rarer fish are more likely.' },
  school: { label: 'Passing School', blurb: 'Common fish are half as heavy again.' },
};

/** Golden Hour multiplies each rarity's chance by this. */
export const GOLDEN_BOOST: Record<Rarity, number> = { common: 1, uncommon: 1.5, rare: 2, legend: 2 };
/** Passing School makes common fish this much heavier. */
export const SCHOOL_WEIGHT = 1.5;

/**
 * An event starts 70 to 90 seconds after the one before (the first 70 to 90
 * seconds in) and lasts 20 seconds. In Frenzy they run back to back from the
 * start. Which event comes next is only decided when it starts.
 */
export const EVENT_TIMING = { gapMinSec: 70, gapMaxSec: 90, lastsSec: 20 } as const;

/* -------------------------------- deep sea -------------------------------- */

/** Deep Sea: common fish are this much as likely, weights skew this much heavier, and bites wait longer (BITE_MS.deepSea). */
export const DEEP_SEA = { common: 0.5, skew: -0.8, minSkew: 0.4 } as const;

/* -------------------------------- settings -------------------------------- */

export const settings: SettingField[] = [
  {
    kind: 'select',
    key: 'water',
    label: 'Water',
    options: [
      { value: 'rotate', label: 'All three: river, estuary and reef, 2 minutes each' },
      { value: 'river', label: 'River only' },
      { value: 'estuary', label: 'Estuary only' },
      { value: 'reef', label: 'Reef only' },
    ],
    default: 'rotate',
  },
  { kind: 'toggle', key: 'events', label: 'Events', help: 'A 20-second event every 70 to 90 seconds changes the odds.', default: true },
  { kind: 'toggle', key: 'trophyHunt', label: 'Trophy Hunt', help: 'Only your 3 heaviest fish count. Every fish is sold for lure money.', default: false },
  { kind: 'toggle', key: 'frenzy', label: 'Frenzy', help: 'Events run back to back, and bites come sooner.', default: false },
  { kind: 'toggle', key: 'deepSea', label: 'Deep sea', help: 'Reef only, with bigger fish and longer waits for a bite.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'big-catch-trophy-hunt',
      modeId: 'big-catch',
      title: 'Trophy Hunt',
      tagline: 'Only your three heaviest fish count. Go big or go home.',
      changes: 'Your score is the points of your 3 heaviest fish, nothing else. Every fish you land is sold straight away for points to spend on lures, so there is no tank and no sets.',
      status: 'playable',
      thumbnail: { glyph: 'trophy', hue: 44, accentHue: 198 },
    },
    settings: { trophyHunt: true },
    locked: ['trophyHunt'],
  },
  {
    meta: {
      id: 'big-catch-frenzy',
      modeId: 'big-catch',
      title: 'Fishing Frenzy',
      tagline: 'Events back to back and quicker bites. Keep that line wet.',
      changes: 'An event is always running, and a new one starts every 20 seconds from the first cast. Bites come in 0.9 to 2.4 seconds instead of 1.5 to 4, so you have to be ready.',
      status: 'playable',
      thumbnail: { glyph: 'bolt', hue: 24, accentHue: 198 },
    },
    settings: { frenzy: true },
    locked: ['frenzy'],
  },
  {
    meta: {
      id: 'big-catch-deep-sea',
      modeId: 'big-catch',
      title: 'Deep Sea',
      tagline: 'Head far out over the reef for bigger fish and longer waits.',
      changes: 'Only the reef is fished. Common fish are half as likely, most fish come up near the top of their weight range, and a bite takes 3 to 6 seconds instead of 1.5 to 4.',
      status: 'playable',
      thumbnail: { glyph: 'anchor', hue: 222, accentHue: 190 },
    },
    settings: { deepSea: true, water: 'reef' },
    locked: ['deepSea', 'water'],
  },
];
