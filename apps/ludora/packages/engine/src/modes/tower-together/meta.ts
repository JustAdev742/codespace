/*
 * Tower Together: metadata, settings, variants and the numbers the mode plays
 * by. Plain data only: the browser imports this (and odds.ts) for the
 * catalogue and to print the numbers on the buttons, so no game logic lives here.
 */
import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'tower-together',
  title: 'Tower Together',
  tagline: 'The whole class builds one lantern tower before dawn. Read the wind, steady the tower, and win or lose together.',
  description:
    'Every right answer earns a building piece. Timber builds fast but makes the tower sway, stone steadies it, and a lantern brace locks everything below it so it can never fall. Gusts of wind are announced a few seconds before they land, with their strength: if the tower is swaying too much when one hits, everything above the highest brace comes down. Reach the class target before dawn.',
  category: 'party',
  pacing: 'self',
  players: { min: 1, max: 200, recommended: '1 to 60' },
  duration: { min: 4, max: 8 },
  difficulty: 1,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match', 'blanks', 'sort'],
  minQuestions: 5,
  common: {
    fields: ['timeLimitSec'],
    defaults: { timeLimitSec: 360 },
    help: { timeLimitSec: 'The night lasts this long: the tower has to reach the target by dawn. With no limit set, dawn comes after 6 minutes.' },
  },
  rules: [
    'Everyone builds one tower together. Every right answer earns a building piece, and you can hold up to 3.',
    'Timber adds two floors but makes the tower sway more. Stone adds one floor and steadies it. A lantern brace adds no height, but nothing below it can ever fall.',
    'Gusts of wind are announced on every screen a few seconds before they land, with their strength. The odds of each strength are always on screen.',
    'If the tower is swaying more than a gust can stand when it lands, every floor above the highest brace falls. If not, the tower holds.',
    'A brace needs a few new floors above the last one before it can go on.',
    'Reach the class target before dawn for a star, and go beyond it for more. The target is set from the number of builders.',
    'A wrong answer costs nothing but a moment. Nobody is ever knocked out.',
    'You score for the pieces you place, your floors still standing at dawn, and floors your braces save.',
  ],
  thumbnail: { glyph: 'tower', hue: 238, accentHue: 44 },
  status: 'playable',
  stage: '3d',
  tags: ['co-op', 'whole class', 'projector', 'self-paced', '3d'],
  accessibility: [
    'Placing timber, stone or a lantern brace is an ordinary button that works with a keyboard or a switch, and says what it will do to the height and the sway.',
    'The sway, the next gust and what it can stand are written in words and numbers, not only drawn on the gauge.',
    'The 3D view is a picture of the tower: it says in words how high the tower is, how much it sways and what just happened, and the game plays the same with 3D off.',
    'Under reduced motion the camera holds still and the tower does not sway on screen; the gauge carries the information.',
  ],
};

export const settings: SettingField[] = [
  { kind: 'select', key: 'gusts', label: 'Wind', help: 'How often gusts come and how strong they are. Calm: no gusts at all, and nothing ever falls.', default: 'normal', options: [
    { value: 'normal', label: 'Normal' },
    { value: 'storm', label: 'Storm night' },
    { value: 'calm', label: 'Calm' },
  ] },
  { kind: 'select', key: 'target', label: 'Target', help: 'How high the class has to build. Lower suits younger or newer classes.', default: 'standard', options: [
    { value: 'low', label: 'Lower' },
    { value: 'standard', label: 'Standard' },
    { value: 'high', label: 'Higher' },
  ] },
  { kind: 'toggle', key: 'twoTowers', label: 'Two towers', help: 'In a team game, each team builds its own tower in the same wind, and the team that gets nearer its target wins.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'tower-together-two-towers',
      modeId: 'tower-together',
      title: 'Two Towers',
      tagline: 'Two teams, two towers, the same wind. Which tower stands tallest at dawn?',
      changes:
        'Players are split into two teams, and each team builds its own tower with its own target and sway. The same gusts hit both towers at the same moment. At dawn the team that got nearer its target (or furthest past it) wins.',
      status: 'playable',
      thumbnail: { glyph: 'tower', hue: 200, accentHue: 350 },
    },
    settings: { twoTowers: true },
    common: { teamCount: 2 },
    locked: ['twoTowers'],
  },
  {
    meta: {
      id: 'tower-together-storm-night',
      modeId: 'tower-together',
      title: 'Storm Night',
      tagline: 'Stronger gusts, more often. Brace early, steady often.',
      changes: 'Gusts come every 30 seconds instead of every 40, and strong gusts and gales are far more likely (the odds are on screen). Everything else plays as normal. For older classes.',
      status: 'playable',
      thumbnail: { glyph: 'tower', hue: 258, accentHue: 190 },
    },
    settings: { gusts: 'storm' },
    locked: ['gusts'],
  },
  {
    meta: {
      id: 'tower-together-calm-build',
      modeId: 'tower-together',
      title: 'Calm Build',
      tagline: 'No wind tonight: nothing falls. Build as high as you can.',
      changes: 'There are no gusts and nothing ever falls. Timber still makes the tower sway, and when it sways all the way no more timber fits until someone adds stone. For the youngest classes.',
      status: 'playable',
      thumbnail: { glyph: 'tower', hue: 150, accentHue: 44 },
    },
    settings: { gusts: 'calm' },
    locked: ['gusts'],
  },
];

/* --------------------------------- pieces --------------------------------- */

export type PieceKind = 'timber' | 'stone' | 'lantern';
export const PIECE_KINDS: readonly PieceKind[] = ['timber', 'stone', 'lantern'];

/** The most pieces a builder can hold. */
export const MAX_HOLD = 3;

/**
 * What each piece does. Sway is for a crew of one builder: a crew of n builders
 * places about n times as many pieces, so every piece moves the gauge 1/n as
 * much and the gauge moves at the same pace for 1 builder or 60 (`swayFor`).
 */
export const PIECES: Record<PieceKind, { floors: number; sway: number }> = {
  timber: { floors: 2, sway: 18 },
  stone: { floors: 1, sway: -9 },
  lantern: { floors: 0, sway: 0 },
};

/**
 * Leverage: the floors standing above the highest brace make the tower sway
 * too, this much for a stretch as tall as the whole target (so the same share
 * of the target sways the same for any class). A brace takes it back to 0.
 */
export const LEVERAGE = 80;

/** The gauge runs from 0 (still) to this (as much as it can sway). No timber goes on past it. */
export const MAX_SWAY = 100;

/** After a fall the tower settles: what is left sways this much of what it did. */
export const SETTLE = 0.4;

/** A wrong answer holds the next question back this long. */
export const STEADY_MS = 2000;

/* --------------------------------- gusts ---------------------------------- */

export type GustStrength = 'breeze' | 'gust' | 'gale';
export type WindSetting = 'normal' | 'storm' | 'calm';

/** Each strength's name and the most sway the tower can have when it lands and still hold. */
export const STRENGTHS: Record<GustStrength, { name: string; limit: number }> = {
  breeze: { name: 'Breeze', limit: 70 },
  gust: { name: 'Strong gust', limit: 45 },
  gale: { name: 'Gale', limit: 25 },
};

/** Percent chance of each strength, by wind setting. Each row sums to 100. */
export const GUST_ODDS: Record<Exclude<WindSetting, 'calm'>, Record<GustStrength, number>> = {
  normal: { breeze: 50, gust: 35, gale: 15 },
  storm: { breeze: 20, gust: 40, gale: 40 },
};

export const GUST_TIMING: Record<Exclude<WindSetting, 'calm'>, { firstSec: number; everySec: number }> = {
  normal: { firstSec: 40, everySec: 40 },
  storm: { firstSec: 30, everySec: 30 },
};

/** Every screen is warned this long before a gust lands, with its strength. */
export const WARN_SEC = 8;
/** No gust lands this close to dawn. */
export const QUIET_END_SEC = 15;

/* -------------------------------- targets --------------------------------- */

export type TargetSetting = 'low' | 'standard' | 'high';

/**
 * The class target in floors: so many floors for each builder (less a little), for
 * the default 6-minute night (scaled for longer or shorter nights). Measured
 * by simulation (docs/features/tower.md): a class that reads the gauge usually
 * gets there; one that does not usually falls short.
 */
export const TARGET = {
  base: -4,
  perBuilder: { low: 30, standard: 36, high: 42 } as Record<TargetSetting, number>,
  /** The night the per-builder figure is measured for. */
  nightSec: 360,
  /** A Storm Night's target is this share of a normal night's: more gusts cost more floors, even played well. */
  storm: 0.9,
};

/** Stars: one for the target, then one each for these shares of it. */
export const STAR_STEPS = [1, 1.25, 1.5] as const;

/**
 * Floors a brace needs above the last brace (or the ground) before it can go
 * on: a tenth of the target, and never fewer than 4. Braces protect, but there
 * cannot be one under every piece, so a fall always costs something.
 */
export const BRACE_SHARE = 0.25;
export function braceGap(target: number): number {
  return Math.max(4, Math.round(target * BRACE_SHARE));
}

/* --------------------------------- points --------------------------------- */

export const POINTS = {
  /** Every piece placed. */
  piece: 10,
  /** Every floor of yours still standing at dawn (a lantern brace counts as one lit floor). */
  standing: 5,
  /** Every floor a brace of yours saves from a fall. */
  saved: 3,
} as const;

/** Floors a piece adds to the score when it stands at dawn. */
export function standingFloors(kind: PieceKind): number {
  return kind === 'lantern' ? 1 : PIECES[kind].floors;
}
