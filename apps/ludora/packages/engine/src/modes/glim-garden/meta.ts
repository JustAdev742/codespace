/*
 * Glim Garden: metadata, settings, variants and every number the mode uses.
 * Plain data only: the browser imports this file (through public.ts) for the
 * catalogue and the screens, so no game logic lives here.
 */
import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'glim-garden',
  title: 'Glim Garden',
  tagline: 'Grow a night garden together. Right answers are drops of water; blooms bring the fireflies.',
  description:
    'A calm garden game for the whole class. Every player has a plot in one shared night garden. A right answer fills your watering can with a drop; a wrong answer costs nothing. Spend drops on your own plot to plant and grow flowers, bushes or a lantern tree, or give a drop to a neighbour’s plant. Every bloom brings fireflies to its plot, and every gift brings one more. Light up the garden before morning. Nobody loses anything.',
  category: 'arcade',
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
    help: { timeLimitSec: 'When morning comes and the game ends. With no limit set, morning comes after 6 minutes. Calm Garden has no morning.' },
  },
  rules: [
    'Every player has a plot in one class garden. A right answer gives you a drop of water. You can hold 3.',
    'A wrong answer costs nothing: you see the right answer and the next question comes.',
    'Spend a drop to plant a seed in your plot, or to water what is growing there.',
    'Flowers bloom after 2 drops (1 firefly). Bushes after 4 (3 fireflies). A lantern tree after 6 (4 fireflies), and then it lights the plots next to it: their plants never droop and grow a little on their own.',
    'Give a drop to a neighbour’s plant: it grows, a firefly comes to their plot straight away, you get 2 points and they get 1.',
    'A plant left without water for a while droops. It never dies: the next drop perks it up, and it blooms a little later.',
    'Fireflies stay at the plot that brought them. A plot with 6 fireflies glows. Light up most of the garden’s plots before morning. Nobody loses anything.',
  ],
  thumbnail: { glyph: 'sprout', hue: 236, accentHue: 52 },
  status: 'playable',
  stage: '3d',
  tags: ['co-op', 'calm', 'self-paced', '3d', 'young', 'projector'],
  accessibility: [
    'Every action is an ordinary labelled button that works with a keyboard, a switch or a screen reader.',
    'What is growing and what just happened are said in words, not only shown.',
    'There is no time pressure on any one question, and nothing is ever lost.',
    'The 3D garden is a picture of what the buttons do; the game plays the same with 3D off.',
    'Under reduced motion the camera holds still and nothing bobs or drifts.',
  ],
};

/* ---------------------------------- plants ---------------------------------- */

export const KINDS = ['flower', 'bush', 'tree'] as const;
export type Kind = (typeof KINDS)[number];

export interface PlantInfo {
  label: string;
  /** Drops of water (after the seed) until it blooms. */
  need: number;
  /** Fireflies (and points for the plot's owner) when it blooms. */
  fireflies: number;
  /** One line for a young reader. */
  short: string;
}

export const PLANTS: Record<Kind, PlantInfo> = {
  flower: { label: 'Flower', need: 2, fireflies: 1, short: 'Quick. Blooms after 2 drops.' },
  bush: { label: 'Bush', need: 4, fireflies: 3, short: 'Blooms after 4 drops.' },
  tree: { label: 'Lantern tree', need: 6, fireflies: 4, short: 'Slow. Lights up the plots next to it.' },
};

/** Drops a watering can holds. */
export const MAX_DROPS = 3;
/** A plant with no water this long droops (seconds). */
export const DROOP_SEC = 60;
/** A plant in a lantern tree's light grows one step on its own this often (seconds). */
export const LIGHT_SEC = 30;
/** Fireflies a gift brings straight away. */
export const GIFT_FIREFLIES = 1;
/** Points a gift gives the giver, and the neighbour who gets it. */
export const GIFT_POINTS = 2;
export const GIFT_POINTS_TO = 1;

/** Night Bloom: how long each night and each day lasts (seconds). The game starts at night. */
export const NIGHT_SEC = 70;
export const DAY_SEC = 40;

/** How many fireflies light up one plot, by the host's choice. */
export const SIZES = ['small', 'usual', 'big'] as const;
export type GardenSize = (typeof SIZES)[number];
export const PLOT_FIREFLIES: Record<GardenSize, number> = { small: 4, usual: 6, big: 8 };
/** The share of a garden's plots that must glow for it to be full. */
export const GOAL_SHARE = 0.8;

/**
 * Glowing plots that fill a garden of `plots` plots: most of them, so one
 * absent player never holds the class back. The numbers stay as small as the
 * class (`rules-glim-garden.test.ts` holds the measured results).
 */
export function goalFor(plots: number): number {
  return Math.max(1, Math.ceil(Math.max(1, plots) * GOAL_SHARE - 1e-9));
}

/* ------------------------------ settings, variants ------------------------------ */

export const settings: SettingField[] = [
  {
    kind: 'select',
    key: 'size',
    label: 'Fireflies to light a plot',
    help: 'How many fireflies each plot needs to glow. The garden is full when most of its plots glow.',
    default: 'usual',
    options: [
      { value: 'small', label: '4 (for the youngest)' },
      { value: 'usual', label: '6' },
      { value: 'big', label: '8' },
    ],
  },
  { kind: 'toggle', key: 'morning', label: 'Morning comes', help: 'The game ends when time runs out; a full garden keeps growing until then. Off: no clock at all; the game ends when the garden is full, or when you end it.', default: true },
  { kind: 'toggle', key: 'droop', label: 'Plants droop', help: 'A plant left without water for 60 seconds droops and needs a drop to perk up. It never dies.', default: true },
  { kind: 'toggle', key: 'teamGardens', label: 'Team gardens', help: 'In a team game, each team grows its own garden with its own goal.', default: false },
  { kind: 'toggle', key: 'nightBloom', label: 'Night and day', help: 'Day and night take turns. Flowers grow only in the dark, and lantern trees only shine at night.', default: false },
  { kind: 'toggle', key: 'showTable', label: 'Show the table at the end', help: 'Off: the results show only the garden the class grew, with no table of scores.', default: true },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'glim-garden-calm',
      modeId: 'glim-garden',
      title: 'Calm Garden',
      tagline: 'No clock and no drooping. The garden grows until it is full.',
      changes: 'There is no morning: the game ends when the garden is full of fireflies, or when you end it. Plants never droop. Made for the youngest players.',
      status: 'playable',
      thumbnail: { glyph: 'sprout', hue: 168, accentHue: 52 },
    },
    settings: { morning: false, droop: false, size: 'small' },
    locked: ['morning', 'droop'],
  },
  {
    meta: {
      id: 'glim-garden-teams',
      modeId: 'glim-garden',
      title: 'Team Gardens',
      tagline: 'Each team grows its own garden, with its own goal.',
      changes: 'Players are split into teams. Each team has a garden of its own, and neighbours are only your teammates. Each garden has its own goal, sized to the team. The game ends at morning, or when every garden is full.',
      status: 'playable',
      thumbnail: { glyph: 'sprout', hue: 280, accentHue: 140 },
    },
    common: { teamCount: 2 },
    settings: { teamGardens: true },
    locked: ['teamGardens'],
  },
  {
    meta: {
      id: 'glim-garden-night-bloom',
      modeId: 'glim-garden',
      title: 'Night Bloom',
      tagline: 'Day and night take turns. Flowers open only in the dark.',
      changes: `Night (${String(NIGHT_SEC)} seconds) and day (${String(DAY_SEC)} seconds) take turns. Flowers grow only at night: by day they sleep and cannot be watered. Lantern trees shine only at night. Bushes grow any time.`,
      status: 'playable',
      thumbnail: { glyph: 'sprout', hue: 210, accentHue: 30 },
    },
    settings: { nightBloom: true },
    locked: ['nightBloom'],
  },
];
