import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

/*
 * Glim Duels: catalogue data and the numbers the rules are built from.
 * Metadata only (the browser imports this file): the game logic is in index.ts.
 */

/** Damage of every hit before the speed bonus. */
export const BASE_HIT = 18;
/** Extra damage for answering at once, shrinking evenly to 0 at the deadline. */
export const SPEED_BONUS = 14;
/** Big Hits multiplies every hit by this. */
export const BIG_HITS = 1.5;
/** A power strike multiplies the next hit by this. */
export const STRIKE_MULT = 2;
/** Health a mend gives back (never above the duel's starting health). */
export const MEND_HEAL = 30;
/** Charge a player can hold. Each hit adds 1. */
export const CHARGE_CAP = 3;
/** What each power costs, in charge. */
export const POWER_COST = { shield: 1, strike: 2, mend: 2 } as const;
/** Standings points for a duel. */
export const DUEL_POINTS = { win: 3, draw: 1, loss: 0 } as const;
/** Starting health a host can pick. */
export const HEALTH_OPTIONS = [60, 100, 150] as const;
/**
 * The Shadow Glim, the computer rival of an odd player out: right this often,
 * and answering at a random moment between these shares of the time limit.
 * Shown on screen wherever a player meets it.
 */
export const SHADOW_ACCURACY = 0.6;
export const SHADOW_TIME = [0.35, 0.85] as const;
export const SHADOW_NAME = 'Shadow Glim';

export const meta: ModeMeta = {
  id: 'glim-duels',
  title: 'Glim Duels',
  tagline: 'Face a classmate, Glim to Glim. Right answers land the hits.',
  description:
    "Everyone duels a classmate at the same moment, on the same questions. A right answer hits your rival's Glim, harder the faster it comes, and builds charge for a shield, a power strike or a mend. Knock your rival out, or have more health when the duel ends. After each round everyone faces a new rival on a similar score, so every duel is close.",
  category: 'party',
  pacing: 'host',
  players: { min: 1, max: 200, recommended: '2 to 60' },
  duration: { min: 6, max: 12 },
  difficulty: 2,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 3,
  common: {
    fields: ['questionTimeSec', 'questionLimit'],
    defaults: { questionTimeSec: 15, questionLimit: 0 },
    help: { questionLimit: 'How many different questions to use from the set; 0 uses them all. Duel rounds and questions per duel set how long the game is, and questions come round again if it needs more.' },
  },
  rules: [
    'Each round you duel one classmate, and you both answer the same questions.',
    'Both Glims start every duel with 100 health.',
    'A right answer hits your rival for 18, plus up to 14 more the faster you answer.',
    'Partly right answers to select-all, ordering and matching questions hit for part of that.',
    'Both hits land together when the answer is shown. A Glim with no health left is knocked out.',
    'If both Glims are knocked out together, the faster right answer wins.',
    'After the last question of a duel, more health wins, then more damage dealt. Otherwise it is a draw.',
    'A win scores 3 points and a draw 1. Then everyone gets a new rival with a similar score.',
    'Every hit adds 1 charge, up to 3. Before you answer, you can spend it on one power.',
    'Shield (1 charge) blocks the next hit on you. Power strike (2) makes your next hit double. Mend (2) gives back 30 health.',
    'An odd player out duels the Shadow Glim, which gets 60% of questions right.',
    'Most points wins. Ties go to damage dealt, then right answers.',
    'With teams on, a team scores the average points of its players.',
  ],
  thumbnail: { glyph: 'sword', hue: 350, accentHue: 200 },
  status: 'playable',
  tags: ['classroom', 'competitive', 'projector', 'head-to-head'],
  accessibility: [
    'Health is written as a number beside every health bar.',
    'Shields and power strikes show as labelled icons, never by colour alone.',
    'Powers are big buttons with their name and cost written on them, and say why when they cannot be used.',
    'Number keys 1 to 6 pick an answer.',
  ],
};

export const settings: SettingField[] = [
  { kind: 'number', key: 'rounds', label: 'Duel rounds', help: 'Everyone gets a new rival each round.', min: 2, max: 8, step: 1, default: 4, unit: 'rounds' },
  { kind: 'number', key: 'duelLength', label: 'Questions per duel', help: 'A knockout can end a duel sooner.', min: 3, max: 9, step: 1, default: 5, unit: 'questions' },
  {
    kind: 'select',
    key: 'health',
    label: 'Starting health',
    options: [
      { value: '60', label: '60 (quick knockouts)' },
      { value: '100', label: '100' },
      { value: '150', label: '150 (long duels)' },
    ],
    default: '100',
  },
  { kind: 'toggle', key: 'powers', label: 'Powers', help: 'Hits build charge for a shield, a power strike or a mend.', default: true },
  { kind: 'toggle', key: 'autoAdvance', label: 'Move on automatically', help: 'Turn off to talk through each answer before moving on.', default: true },
  {
    kind: 'select',
    key: 'damage',
    label: 'Hits',
    options: [
      { value: 'normal', label: 'Normal (18 to 32)' },
      { value: 'big', label: 'Big (27 to 48)' },
    ],
    default: 'normal',
  },
  {
    kind: 'toggle',
    key: 'teamClash',
    label: 'Team clash',
    help: "With teams on, every duel is between two teams, and a team scores the total of its players' duel points instead of the average.",
    default: false,
  },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'glim-duels-pure',
      modeId: 'glim-duels',
      title: 'Pure Duels',
      tagline: 'No powers. Just speed and accuracy.',
      changes: 'Powers are switched off: no charge, shields, power strikes or mends. Every duel comes down to right answers and how fast they come.',
      status: 'playable',
      thumbnail: { hue: 215, accentHue: 50 },
    },
    settings: { powers: false },
    locked: ['powers'],
  },
  {
    meta: {
      id: 'glim-duels-glass',
      modeId: 'glim-duels',
      title: 'Glass Glims',
      tagline: 'Glims start with 60 health, so knockouts come fast.',
      changes: 'Every Glim starts its duels with 60 health instead of 100, so three quick hits knock it out and most duels end early.',
      status: 'playable',
      thumbnail: { hue: 185, accentHue: 320 },
    },
    settings: { health: '60' },
    locked: ['health'],
  },
  {
    meta: {
      id: 'glim-duels-marathon',
      modeId: 'glim-duels',
      title: 'Duel Marathon',
      tagline: 'Six rounds of longer duels.',
      changes: 'Six duel rounds instead of four, and each duel lasts up to seven questions instead of five, so there are more rivals to face and more time to come back.',
      status: 'playable',
      thumbnail: { hue: 150, accentHue: 30 },
    },
    settings: { rounds: 6, duelLength: 7 },
    locked: ['rounds', 'duelLength'],
  },
  {
    meta: {
      id: 'glim-duels-big-hits',
      modeId: 'glim-duels',
      title: 'Big Hits',
      tagline: 'Every hit lands half as hard again.',
      changes: 'Every hit does one and a half times the damage (27 to 48 instead of 18 to 32), so a duel can turn on a single question.',
      status: 'playable',
      thumbnail: { hue: 15, accentHue: 50 },
    },
    settings: { damage: 'big' },
    locked: ['damage'],
  },
  {
    meta: {
      id: 'glim-duels-team-clash',
      modeId: 'glim-duels',
      title: 'Team Clash',
      tagline: 'Two teams, and every duel is between them.',
      changes:
        "The room splits into two teams and every duel is between players from different teams. A team scores the total of its players' duel points, not the average; wins against the Shadow Glim count for the player but not the team.",
      status: 'playable',
      thumbnail: { hue: 200, accentHue: 350 },
    },
    settings: { teamClash: true },
    common: { teamCount: 2 },
    locked: ['teamClash'],
  },
];
