/*
 * Spot Kick: metadata, settings, variants and every number the mode draws
 * from. Plain data only: the browser imports this (and odds.ts) for the
 * catalogue and to show the chances, so no game logic lives here.
 */
import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'spot-kick',
  title: 'Spot Kick',
  tagline: 'Right answers earn footballs. Pick your spot, pick your power, and beat the keeper under the floodlights.',
  description:
    'A penalty shoot-out under floodlights. Every right answer earns a football. Spend one to take a penalty: aim for a corner or the middle, then place it or blast it. A placed shot always hits the target but is easier to save; a blast is harder to stop but can fly wide. The keeper learns where you like to shoot, so mix it up. Three goals in a row and you are on fire: your next goal counts double. Every chance is on the buttons before you shoot.',
  category: 'party',
  pacing: 'self',
  players: { min: 1, max: 200, recommended: '2 to 60' },
  duration: { min: 5, max: 8 },
  difficulty: 1,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  common: {
    fields: ['timeLimitSec'],
    defaults: { timeLimitSec: 360 },
    help: { timeLimitSec: 'The final whistle blows when time runs out. With no limit set, it blows after 6 minutes.' },
  },
  rules: [
    'Every right answer earns a football. You can hold up to 3. A wrong answer earns none.',
    'Spend a football to take a penalty: choose one of five places (the four corners or the middle) and how hard to hit it.',
    'A placed shot always hits the target but is easier to save. A blasted shot is harder to save but can fly wide.',
    'The keeper learns: every shot at the same place makes the keeper cover it a little more, and mixing your shots up makes them forget.',
    'The chances on every button already include what the keeper has learned. Nothing is hidden.',
    'Three goals in a row and you are on fire: your next goal counts double. A miss or a save puts the fire out.',
    'Every goal is a point. The most points at the final whistle wins.',
  ],
  thumbnail: { glyph: 'ball', hue: 140, accentHue: 48 },
  status: 'playable',
  stage: '3d',
  tags: ['luck', 'strategy', 'party', 'projector', 'self-paced', '3d', 'sport'],
  accessibility: [
    'Every place to aim and both strengths are ordinary labelled buttons, laid out like a goal, that work with a keyboard or a switch.',
    'The chance of a goal, a save and a miss is written on every button as a number, never shown by colour alone.',
    'What happened to each shot is said in words for screen readers.',
    'The 3D view is a picture of what the buttons do; the game plays the same with 3D off.',
    'Under reduced motion the camera holds still and the crowd does not jump.',
  ],
};

/* ---------------------------------- shots ---------------------------------- */

/** The five places to aim, as the kicker sees the goal: top left, top right, bottom left, bottom right, the middle. */
export const AIMS = ['tl', 'tr', 'mid', 'bl', 'br'] as const;
export type Aim = (typeof AIMS)[number];

export const POWERS = ['placed', 'blasted'] as const;
export type Power = (typeof POWERS)[number];

export const AIM_INFO: Record<Aim, { label: string; short: string }> = {
  tl: { label: 'Top left', short: 'top left' },
  tr: { label: 'Top right', short: 'top right' },
  mid: { label: 'Middle', short: 'down the middle' },
  bl: { label: 'Bottom left', short: 'bottom left' },
  br: { label: 'Bottom right', short: 'bottom right' },
};

export const POWER_INFO: Record<Power, { label: string; blurb: string }> = {
  placed: { label: 'Placed', blurb: 'Always on target, easier to save.' },
  blasted: { label: 'Blasted', blurb: 'Harder to save, but it can fly wide.' },
};

export type Outcome = 'goal' | 'saved' | 'wide';

/**
 * Before the keeper learns anything: the chance (percent) that a shot misses the
 * target, and that the keeper saves it. A goal is whatever is left.
 */
export const BASE_ODDS: Record<Power, Record<Aim, { wide: number; save: number }>> = {
  placed: {
    tl: { wide: 0, save: 30 },
    tr: { wide: 0, save: 30 },
    mid: { wide: 0, save: 50 },
    bl: { wide: 0, save: 34 },
    br: { wide: 0, save: 34 },
  },
  blasted: {
    tl: { wide: 26, save: 10 },
    tr: { wide: 26, save: 10 },
    mid: { wide: 6, save: 30 },
    bl: { wide: 14, save: 18 },
    br: { wide: 14, save: 18 },
  },
};

/** How much more often the keeper saves at a place, for each step they have learned it (percentage points). */
export const READ_STEP = 8;
/** The most a keeper can learn one place. */
export const READ_MAX = 4;
/** Keeper duty: a place the keeper guards is saved this much more often (percentage points). */
export const GUARD_BONUS = 25;
/** A shot on target always keeps at least this chance of going in. */
export const MIN_GOAL = 5;

/** Footballs a player can hold. */
export const MAX_BALLS = 3;
/** Goals in a row to catch fire. */
export const FIRE_STREAK = 3;
/** Golden goal lasts at most this long; nobody scoring means a draw. */
export const GOLDEN_SEC = 90;
/** Keeper duty: places each keeper guards. */
export const GUARD_COUNT = 2;

/* ------------------------------ settings, variants ------------------------------ */

export const settings: SettingField[] = [
  { kind: 'toggle', key: 'keeperLearns', label: 'The keeper learns', help: 'Shots at the same place get easier to save; mixing them up makes the keeper forget. Off: the chances never change.', default: true },
  { kind: 'toggle', key: 'houseMatch', label: 'House match', help: 'In a team game, goals add up for your team and the big screen shows the scoreline. The keeper learns your whole team’s habits.', default: false },
  { kind: 'toggle', key: 'keeperDuty', label: 'Keeper duty', help: 'Everyone also sets two places their own keeper guards. Rivals’ shots at those places are saved more often.', default: false },
  { kind: 'toggle', key: 'goldenGoal', label: 'Golden goal', help: 'Level at the top when the whistle blows: the next goal by a leader wins.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'spot-kick-house-match',
      modeId: 'spot-kick',
      title: 'House Match',
      tagline: 'Two teams, one scoreline. Every goal counts for your house.',
      changes: 'Players are split into two teams. Goals add up for your team and the big screen shows the scoreline. The keeper learns your whole team’s habits, so teammates have to mix their shots up together.',
      status: 'playable',
      thumbnail: { glyph: 'ball', hue: 220, accentHue: 4 },
    },
    common: { teamCount: 2 },
    settings: { houseMatch: true },
    locked: ['houseMatch'],
  },
  {
    meta: {
      id: 'spot-kick-keeper-duty',
      modeId: 'spot-kick',
      title: 'Keeper Duty',
      tagline: 'You shoot at your classmates’ goals, and they shoot at yours.',
      changes: 'Every shot is taken at a rival’s goal, in turn. Each player sets which two places their own keeper guards, and can change the plan at any time: a rival shooting at a guarded place is saved 25 in 100 times more often. Both plans are shown, so the chances are always true.',
      status: 'playable',
      thumbnail: { glyph: 'shield', hue: 160, accentHue: 48 },
    },
    settings: { keeperDuty: true },
    locked: ['keeperDuty'],
  },
  {
    meta: {
      id: 'spot-kick-golden-goal',
      modeId: 'spot-kick',
      title: 'Golden Goal',
      tagline: 'Level at the whistle? The next goal wins it.',
      changes: 'If the top players (or teams) are level when time runs out, the game goes to golden goal: only they can shoot, and the first of them to score wins at once. If nobody scores within 90 seconds it ends as a draw.',
      status: 'playable',
      thumbnail: { glyph: 'trophy', hue: 44, accentHue: 140 },
    },
    settings: { goldenGoal: true },
    locked: ['goldenGoal'],
  },
];
