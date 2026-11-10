/*
 * Summit Scramble: metadata, settings, variants and the numbers the mode
 * plays by. Plain data only: the browser imports this (and odds.ts) for the
 * catalogue and to print the odds on the buttons, so no game logic lives here.
 */
import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'summit-scramble',
  title: 'Summit Scramble',
  tagline: 'Right answers give you grip. Climb the mountain by lantern light and race the class to the summit.',
  description:
    'Everyone climbs the same mountain at night. Every right answer gives you grip, and grip moves you: a steady climb up one ledge, or a bold leap up four that sometimes slips. Every tenth ledge is a camp you can never fall below, and the first to each camp score a bonus. Watch for the wind, throw a rope down to the climber below you, and reach the summit before the lanterns burn low.',
  category: 'arcade',
  pacing: 'self',
  players: { min: 1, max: 200, recommended: '2 to 60' },
  duration: { min: 5, max: 8 },
  difficulty: 1,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match', 'blanks', 'sort'],
  minQuestions: 5,
  common: {
    fields: ['timeLimitSec'],
    defaults: { timeLimitSec: 420 },
    help: { timeLimitSec: 'The climb ends when time runs out, or sooner when enough climbers reach the summit. With no limit set, it ends after 7 minutes.' },
  },
  rules: [
    'Every right answer gives you 1 grip. Three right in a row gives a bonus grip. You can hold up to 6.',
    'A wrong answer costs nothing, but your Glim takes a moment to catch its balance before the next question.',
    'Climb: spend 1 grip to go up one ledge. It always works.',
    'Leap: spend 2 grip to go up four ledges. It works 7 times in 10; when it fails you slide back one ledge. The odds are on the button. In calm air a leap gains more than two climbs on average.',
    'When the wind blows, leaps work only 5 times in 10, so two climbs gain more. Every screen warns you a few seconds before it starts.',
    'Every tenth ledge is a camp. You never slide below a camp you have reached, and the first three climbers to each camp score a bonus.',
    'Land on a ledge with a rope to pick it up, then throw it down: the nearest climber below you comes up two ledges, and you both score (your first 5 ropes score for you).',
    'Points come from your height, camp bonuses, ropes thrown and the summit. Reaching the summit always puts you above everyone still climbing, and getting there earlier always beats getting there later.',
  ],
  thumbnail: { glyph: 'mountain', hue: 226, accentHue: 44 },
  status: 'playable',
  stage: '3d',
  tags: ['race', 'luck', 'projector', 'self-paced', '3d'],
  accessibility: [
    'Climbing, leaping and throwing a rope are ordinary buttons that work with a keyboard or a switch.',
    'The chance of a leap working is written on the Leap button as a number, and changes there when the wind blows.',
    'The 3D view is a picture of what the buttons do: it says in words which ledge you are on, and the game plays the same with 3D off.',
    'Under reduced motion the camera holds still and slips do not shake the picture.',
  ],
};

export const settings: SettingField[] = [
  { kind: 'number', key: 'summit', label: 'Mountain height', help: 'Ledges to the summit. Every tenth ledge is a camp.', min: 20, max: 60, step: 10, default: 30, unit: 'ledges' },
  { kind: 'number', key: 'finishers', label: 'Climbers to the summit', help: 'The climb ends when this many climbers (or roped teams) reach the summit, or everyone does.', min: 1, max: 20, step: 1, default: 3 },
  { kind: 'toggle', key: 'leaps', label: 'Leaps', help: 'Off: climbers can only climb one ledge at a time, so the climb is about right answers alone.', default: true },
  { kind: 'toggle', key: 'wind', label: 'Wind', help: 'Now and then the wind blows for a few seconds and leaps work less often. Every screen warns before it starts.', default: true },
  { kind: 'toggle', key: 'ropes', label: 'Ropes', help: 'Some ledges hold a rope a climber can throw down to pull up the climber below.', default: true },
  { kind: 'toggle', key: 'roped', label: 'Roped teams', help: 'In a team game, each team climbs as one: everyone shares the team’s height and grip.', default: false },
  { kind: 'toggle', key: 'night', label: 'Night climb', help: 'Climbers can see only 3 ledges ahead, so ropes and wind come as surprises.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'summit-scramble-roped-teams',
      modeId: 'summit-scramble',
      title: 'Roped Teams',
      tagline: 'Climb as one team on one rope. Every right answer lifts you all.',
      changes:
        'Players are split into teams (2 by default), and each team climbs as one: every right answer from anyone on the team adds to the team’s grip, anyone can spend it, and the whole team shares one height and one score.',
      status: 'playable',
      thumbnail: { glyph: 'flag', hue: 226, accentHue: 150 },
    },
    settings: { roped: true },
    common: { teamCount: 2 },
    locked: ['roped'],
  },
  {
    meta: {
      id: 'summit-scramble-night-climb',
      modeId: 'summit-scramble',
      title: 'Night Climb',
      tagline: 'Your lantern lights only three ledges ahead. Ropes and wind come out of the dark.',
      changes:
        'Climbers can see ropes only on the next 3 ledges above them, and the wind comes with no warning: it is announced the moment it starts blowing. Everything else plays as normal.',
      status: 'playable',
      thumbnail: { glyph: 'lantern', hue: 232, accentHue: 44 },
    },
    settings: { night: true },
    locked: ['night'],
  },
  {
    meta: {
      id: 'summit-scramble-steady',
      modeId: 'summit-scramble',
      title: 'Steady Climb',
      tagline: 'No leaps and no wind: every right answer is one ledge nearer the top.',
      changes: 'There are no leaps and no wind, so nobody ever slides back. Every grip is one ledge up, and the climb is won by right answers alone: a calm game for younger classes.',
      status: 'playable',
      thumbnail: { glyph: 'mountain', hue: 160, accentHue: 44 },
    },
    settings: { leaps: false, wind: false },
    locked: ['leaps', 'wind'],
  },
];

/* --------------------------------- moving --------------------------------- */

/** The most grip a climber (or roped team) can hold. */
export const MAX_GRIP = 6;
/** Right answers in a row for a bonus grip. */
export const BONUS_EVERY = 3;
/** Every this many ledges is a camp. */
export const CAMP_EVERY = 10;

export const CLIMB = { cost: 1, gain: 1 } as const;
export const LEAP = { cost: 2, gain: 4, slip: 1 } as const;
/** Percent chance a leap works, in calm air and in the wind. */
export const LEAP_CHANCE = { calm: 70, wind: 50 } as const;

/** How long a wrong answer holds back the next question while your Glim catches its balance. */
export const STEADY_MS = 2000;

/** A thrown rope lifts the climber below this many ledges (never past the thrower). */
export const ROPE_PULL = 2;
/** Ropes on each stretch of ten ledges between camps. */
export const ROPES_PER_STRETCH = 2;

/** How far ahead climbers can see in a Night Climb. */
export const NIGHT_SIGHT = 3;

/* --------------------------------- the wind -------------------------------- */

export const WIND = {
  /** The first gust comes this long into the climb. */
  firstSec: 50,
  /** Then one every this long, give or take `jitterSec`. */
  everySec: 60,
  jitterSec: 12,
  /** Every screen is warned this long before it starts (not in a Night Climb). */
  warnSec: 5,
  /** How long it blows. */
  blowSec: 10,
} as const;

/* --------------------------------- points --------------------------------- */

export const POINTS = {
  /** For every ledge of height. */
  ledge: 10,
  /** The first, second and third to reach each camp. */
  camp: [40, 25, 15] as readonly number[],
  /** Throwing a rope to the climber below, for up to `ropeScored` ropes each. */
  rope: 15,
  ropeScored: 5,
  /**
   * The summit: `summitBase` for the last place that ends the climb, and `summitStep` more for
   * each place earlier. A step is bigger than everything else one climber can score beyond
   * height (5 camps at 40 and 5 ropes at 15 make 275), so finishing order always decides the top
   * of the table, and any summiter outscores everyone still climbing.
   */
  summitBase: 400,
  summitStep: 300,
} as const;

/** The most a climber can score beyond height: every camp first, and every scored rope. */
export const MAX_EXTRA = 5 * 40 + 5 * 15;

/** The camp ledges below a summit (the summit itself is not a camp). */
export function campsBelow(summit: number): number[] {
  const out: number[] = [];
  for (let l = CAMP_EVERY; l < summit; l += CAMP_EVERY) out.push(l);
  return out;
}

/** The highest camp at or below a ledge (0 is the foot of the mountain). */
export function campFloor(ledge: number, summit: number): number {
  return Math.min(Math.floor(ledge / CAMP_EVERY) * CAMP_EVERY, Math.floor((summit - 1) / CAMP_EVERY) * CAMP_EVERY);
}

/** Summit bonus for the nth climber there (1-based) when the climb ends at `finishers` summiters. */
export function summitBonus(order: number, finishers: number): number {
  return POINTS.summitBase + POINTS.summitStep * Math.max(0, finishers - order);
}

/** Camp bonus for the nth climber there (1-based), 0 after the third. */
export function campBonus(order: number): number {
  return POINTS.camp[order - 1] ?? 0;
}
