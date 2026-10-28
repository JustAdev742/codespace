/*
 * Gold Rush: metadata, settings, variants and every table the mode draws
 * from. Plain data only: the browser imports this (and odds.ts) for the
 * catalogue and to show the chances, so no game logic lives here.
 */
import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'gold-rush',
  title: 'Gold Rush',
  tagline: 'Right answers give you digs. Go deeper for bigger gold, and bank it before the shaft caves in.',
  description:
    'Every right answer gives you a dig. Each dig takes your mine shaft one level deeper and turns up something: gold dust, nuggets, a quartz vein, a lucky relic, or a cave-in that loses everything in your cart. Deeper levels pay more and cave in more often, and the chances are always on screen. Bank your cart to keep it safe, buy better gear, and have the most banked gold when the whistle blows.',
  category: 'party',
  pacing: 'self',
  players: { min: 1, max: 200, recommended: '2 to 60' },
  duration: { min: 4, max: 10 },
  difficulty: 2,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  common: {
    fields: ['timeLimitSec'],
    defaults: { timeLimitSec: 360 },
    help: { timeLimitSec: 'The whistle blows when time runs out. With no limit set, it blows after 6 minutes.' },
  },
  rules: [
    'Every right answer gives you a dig. Three right in a row gives a bonus dig. You can hold up to 6.',
    'Each dig takes your shaft one level deeper and finds something for your cart, or caves in.',
    'Deeper levels hold bigger gold but cave in more often. The chances for your next dig are always shown.',
    'A cave-in loses everything in your cart and sends you back to the top.',
    'Bank your cart to keep its gold safe for good. Your shaft starts again from the top.',
    'Spend banked gold on gear: a sharper pick, timber props against cave-ins, and a gold pan.',
    'A map lets you jump a claim: take a quarter of the cart of whoever carries the most. Banked gold is always safe.',
    'Gold still in your cart when the whistle blows does not count. Only banked gold wins.',
  ],
  thumbnail: { glyph: 'mountain', hue: 42, accentHue: 24 },
  status: 'beta',
  stage: '3d',
  tags: ['luck', 'risk', 'party', 'projector', 'self-paced', '3d'],
  accessibility: [
    'Digging, banking and buying gear are ordinary buttons that work with a keyboard or a switch.',
    'The chance of every find, and of a cave-in, is shown as a number, never by colour alone.',
    'The 3D view is a picture of what the buttons do; the game plays the same with 3D off.',
    'Under reduced motion the camera holds still and cave-ins do not shake the screen.',
  ],
};

export type GroundKind = 'standard' | 'deep' | 'creek';
export type RiskLevel = 'gentle' | 'normal' | 'wild';

export const settings: SettingField[] = [
  { kind: 'toggle', key: 'claimJumping', label: 'Claim jumping', help: 'Maps let a player take a quarter of the fullest cart. Off: no maps.', default: true },
  { kind: 'toggle', key: 'events', label: 'Goldfield events', help: 'Every minute or so: Gold Fever, Steady Ground or a Rich Lead.', default: true },
  { kind: 'number', key: 'goalGold', label: 'Gold to win', help: 'The first to bank this much wins at once. 0 plays until the whistle.', min: 0, max: 10000, step: 250, default: 0, unit: 'gold' },
  {
    kind: 'select',
    key: 'risk',
    label: 'Cave-ins',
    options: [
      { value: 'gentle', label: 'Gentle: cave-ins are rarer' },
      { value: 'normal', label: 'Normal' },
      { value: 'wild', label: 'Wild: cave-ins come sooner' },
    ],
    default: 'normal',
  },
  {
    kind: 'select',
    key: 'ground',
    label: 'Ground',
    options: [
      { value: 'standard', label: 'Goldfield: 12 levels' },
      { value: 'deep', label: 'Deep lead: 16 levels, bigger nuggets, steeper risk' },
      { value: 'creek', label: 'Creek: no cave-ins, smaller finds' },
    ],
    default: 'standard',
  },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'gold-rush-deep-lead',
      modeId: 'gold-rush',
      title: 'Deep Lead',
      tagline: 'Sixteen levels down, with nuggets the size of your fist and cave-ins to match.',
      changes: 'The shaft goes 16 levels deep instead of 12. Finds are 40% bigger and Bonanzas turn up from level 9, but cave-ins start at level 2 and keep climbing all the way down.',
      status: 'beta',
      thumbnail: { glyph: 'mountain', hue: 24, accentHue: 50 },
    },
    settings: { ground: 'deep' },
    locked: ['ground'],
  },
  {
    meta: {
      id: 'gold-rush-race',
      modeId: 'gold-rush',
      title: 'Race to 1,000',
      tagline: 'The first to bank 1,000 gold wins on the spot.',
      changes: 'The game ends the moment a player banks 1,000 gold, and they win. If nobody gets there before the whistle, the most banked gold wins as usual.',
      status: 'beta',
      thumbnail: { glyph: 'flag', hue: 44, accentHue: 200 },
    },
    settings: { goalGold: 1000 },
    locked: ['goalGold'],
  },
  {
    meta: {
      id: 'gold-rush-creek',
      modeId: 'gold-rush',
      title: 'Creek Panning',
      tagline: 'Pan the creek instead of digging deep. No cave-ins, ever.',
      changes: 'There are no cave-ins and no claim jumping, and the creek bed is 8 levels deep. Finds are half the size, so it is a calm, steady game for younger players.',
      status: 'beta',
      thumbnail: { glyph: 'wave', hue: 190, accentHue: 44 },
    },
    settings: { ground: 'creek', claimJumping: false },
    locked: ['ground', 'claimJumping'],
  },
];

/* --------------------------------- finds --------------------------------- */

export const FIND_KINDS = ['dust', 'nugget', 'bonanza', 'vein', 'relic', 'map', 'water', 'cavein'] as const;
export type FindKind = (typeof FIND_KINDS)[number];

export const FIND_INFO: Record<FindKind, { label: string; blurb: string }> = {
  dust: { label: 'Gold dust', blurb: 'A little gold.' },
  nugget: { label: 'Nugget', blurb: 'A good lump of gold.' },
  bonanza: { label: 'Bonanza', blurb: 'A huge nugget. Only deep down.' },
  vein: { label: 'Quartz vein', blurb: 'A little gold, and your next find is doubled.' },
  relic: { label: 'Lucky relic', blurb: 'A little gold and a free dig.' },
  map: { label: 'Map', blurb: 'Jump a claim: take a quarter of the fullest cart.' },
  water: { label: 'Water', blurb: 'Nothing but mud this time.' },
  cavein: { label: 'Cave-in', blurb: 'You lose your cart and go back to the top.' },
};

/** How deep each ground goes. Digging at the bottom keeps drawing from the last level. */
export const GROUND: Record<GroundKind, { levels: number; size: number; bonanzaFrom: number; caveIns: boolean }> = {
  standard: { levels: 12, size: 1, bonanzaFrom: 7, caveIns: true },
  deep: { levels: 16, size: 1.4, bonanzaFrom: 9, caveIns: true },
  creek: { levels: 8, size: 0.5, bonanzaFrom: 99, caveIns: false },
};

/** Chance of a cave-in on reaching a level (percent), before gear and events. Index 0 is level 1. */
export const CAVE_IN: Record<'standard' | 'deep', readonly number[]> = {
  standard: [0, 4, 7, 10, 13, 16, 20, 24, 28, 32, 36, 40],
  deep: [0, 3, 6, 8, 10, 13, 16, 19, 22, 25, 28, 31, 34, 37, 40, 44],
};

export const RISK_SCALE: Record<RiskLevel, number> = { gentle: 0.6, normal: 1, wild: 1.4 };
export const CAVE_IN_MAX = 60;

/** Relative weights of what a dig finds when it does not cave in, by depth band. */
export const FIND_WEIGHTS: readonly { from: number; weights: Partial<Record<Exclude<FindKind, 'cavein'>, number>> }[] = [
  { from: 1, weights: { dust: 70, water: 18, relic: 8, vein: 4 } },
  { from: 3, weights: { dust: 50, nugget: 20, water: 12, relic: 7, vein: 7, map: 4 } },
  { from: 7, weights: { dust: 34, nugget: 30, water: 10, relic: 6, vein: 9, map: 5, bonanza: 6 } },
];

/** Gold for a find at a level: a base that grows with depth, then a spread around it. */
export const FIND_GOLD: Record<'dust' | 'nugget' | 'bonanza' | 'vein' | 'relic', { base: number; perLevel: number; spread: readonly [number, number] }> = {
  dust: { base: 6, perLevel: 5, spread: [0.6, 1.4] },
  nugget: { base: 30, perLevel: 14, spread: [0.7, 1.6] },
  bonanza: { base: 200, perLevel: 40, spread: [0.8, 1.5] },
  vein: { base: 5, perLevel: 2, spread: [1, 1] },
  relic: { base: 10, perLevel: 2, spread: [1, 1] },
};

/** Claim jumping takes this share of the target's cart. */
export const JUMP_SHARE = 0.25;
/** A map with nobody to jump pays this instead. */
export const JUMP_CONSOLATION = 10;

/* ---------------------------------- digs --------------------------------- */

export const MAX_DIGS = 6;
/** Right answers in a row for a bonus dig, by pick level (0: none bought). */
export const BONUS_EVERY = [3, 2, 2] as const;
/** Digs per right answer, by pick level. */
export const DIGS_PER_RIGHT = [1, 1, 2] as const;

/* ---------------------------------- gear --------------------------------- */

export const GEAR = ['pick', 'props', 'pan'] as const;
export type GearId = (typeof GEAR)[number];

export const GEAR_INFO: Record<GearId, { label: string; levels: readonly { cost: number; effect: string }[] }> = {
  pick: {
    label: 'Sharper pick',
    levels: [
      { cost: 150, effect: 'A bonus dig every 2 right answers in a row, not 3.' },
      { cost: 450, effect: 'Every right answer gives 2 digs.' },
    ],
  },
  props: {
    label: 'Timber props',
    levels: [
      { cost: 100, effect: 'Cave-ins are 15% less likely.' },
      { cost: 250, effect: 'Cave-ins are 30% less likely.' },
      { cost: 500, effect: 'Cave-ins are 45% less likely.' },
    ],
  },
  pan: {
    label: 'Gold pan',
    levels: [{ cost: 200, effect: 'Banking adds 10% to your cart.' }],
  },
};

/** How much each props level cuts the chance of a cave-in. */
export const PROPS_CUT = [0, 0.15, 0.3, 0.45] as const;
export const PAN_BONUS = 0.1;

/* --------------------------------- events -------------------------------- */

export const GOLD_EVENTS = ['fever', 'steady', 'richLead'] as const;
export type GoldEventId = (typeof GOLD_EVENTS)[number];

export const EVENT_INFO: Record<GoldEventId, { label: string; blurb: string; seconds: number }> = {
  fever: { label: 'Gold Fever', blurb: 'Every find is worth double.', seconds: 20 },
  steady: { label: 'Steady Ground', blurb: 'No cave-ins at all.', seconds: 15 },
  richLead: { label: 'Rich Lead', blurb: 'Finds from level 5 down are half as big again.', seconds: 20 },
};

export const EVENT_TIMING = { firstSec: 60, everySec: 75, jitterSec: 15 } as const;
/** Rich Lead's boost starts at this level. */
export const RICH_LEAD_FROM = 5;
