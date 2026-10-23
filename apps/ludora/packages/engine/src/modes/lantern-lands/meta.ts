/*
 * Lantern Lands: metadata only. The browser imports this for the catalogue,
 * so it holds no game logic, just the facts and numbers players are shown.
 */
import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

/** Room events. One starts every EVENT_EVERY_MS from EVENT_FIRST_MS and lasts EVENT_MS. */
export const EVENT_KINDS = ['storm', 'bloom', 'double', 'rumble', 'fog'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENTS: Record<EventKind, { label: string; text: string }> = {
  storm: { label: 'Lantern storm', text: 'Forts cannot be lowered and no land can be captured. Claiming and fortifying still work.' },
  bloom: { label: 'Shrine bloom', text: 'Shrines score double.' },
  double: { label: 'Double energy', text: 'Every right answer gives 2 energy.' },
  rumble: { label: 'Rumbling ground', text: 'The ground shook and every fort dropped by 1. Homes are safe.' },
  fog: { label: 'Fog', text: 'Rival forts are hidden. You can still see who owns each land.' },
};

/**
 * Relative chance of each event. The event that ran last is left out of the
 * next draw, so with five equal weights each of the other four has a 1 in 4 chance.
 */
export const EVENT_WEIGHTS: Record<EventKind, number> = { storm: 1, bloom: 1, double: 1, rumble: 1, fog: 1 };
export const EVENT_FIRST_MS = 60_000;
export const EVENT_EVERY_MS = 90_000;
export const EVENT_MS = 30_000;

/** The final glow: every score counts double for this long before time runs out. */
export const FINAL_GLOW_MS = 45_000;
/** After this many right answers in a row, each right answer gives 2 energy. */
export const STREAK_FOR_DOUBLE = 3;
/** Points a shrine scores on top of being a land (doubled in a shrine bloom). */
export const SHRINE_BONUS = 3;
/** Shrine Race: points per shrine, the only thing that scores. */
export const SHRINE_ONLY_POINTS = 5;
export const SHRINE_RAID_COST = 2;
/** Fortifying a shrine costs the same as raiding one, so the first team there cannot build a cheap fortress. */
export const SHRINE_FORT_COST = 2;
/** Homes cannot be raided; they are drawn as if they had this many forts. */
export const HOME_FORT = 3;
/** Small team boost: a smaller team's right answers are worth at most this many times a full team's. */
export const BOOST_CAP = 3;
/**
 * Underdog boost: a team with fewer lands than the leading team charges this
 * × (1 − its lands ÷ the leader's lands) bonus energy for every energy it earns.
 * Tuned in bot simulations: without it a slightly stronger team ended with 3
 * times the other's lands in a third of games; with it that became rare, and
 * the stronger team still won about three games in four.
 */
export const UNDERDOG_BOOST = 0.75;
/** When the host sets no time limit the game still ends, so the final glow always comes. */
export const DEFAULT_TIME_SEC = 480;

export const meta: ModeMeta = {
  id: 'lantern-lands',
  title: 'Lantern Lands',
  tagline: 'Light up the map with your team, one land at a time.',
  description:
    'Teams share one map of hexagon lands. Right answers give energy: spend it to claim a land next to your team’s, build up a fort, or raid a rival’s border. Shrines score extra, so the centre is always fought over. Every 10 seconds each team scores for the lands it holds, and the last 45 seconds count double.',
  category: 'strategy',
  pacing: 'self',
  players: { min: 2, max: 200, recommended: '4 to 60' },
  duration: { min: 6, max: 12 },
  difficulty: 3,
  teams: 'required',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  common: {
    fields: ['timeLimitSec'],
    defaults: { timeLimitSec: DEFAULT_TIME_SEC },
    help: { timeLimitSec: 'The last 45 seconds are the final glow, when every score counts double. No limit plays 8 minutes.' },
  },
  rules: [
    'Each team starts with one home land on the edge of the map.',
    'A right answer gives 1 energy. After 3 right answers in a row, each one gives 2.',
    'You can hold 3 energy. The team with the fewest lands can hold 4.',
    'Claim (1 energy): light an empty land next to your team’s lands.',
    'Fortify (1 energy): add a fort to one of your team’s lands, up to 3.',
    'Raid (1 energy): take a fort off a rival land next to yours. A land with no fort left becomes yours.',
    'Raiding or fortifying a shrine costs 2 energy. Homes cannot be raided.',
    'Every 10 seconds each team scores 1 point per land and 3 more per shrine.',
    'Every 90 seconds a room event changes the rules for 30 seconds.',
    'In the final glow, the last 45 seconds, every score counts double.',
    'A team behind on lands gets bonus energy: the further behind, the more.',
    'A team with fewer players gets bonus energy too, so team size never decides the game.',
    'The team with the most points wins.',
  ],
  thumbnail: { glyph: 'map', hue: 100, accentHue: 30 },
  status: 'playable',
  tags: ['teams', 'strategy', 'map', 'projector', 'self-paced'],
  accessibility: [
    'Teams are told apart by colour, by a pattern (stripes, dots, waves, checks, solid or cross-hatch) and by a letter on every land.',
    'Every map action is also a big button in a list of lands you can claim, raid or fortify, so nothing needs a precise tap.',
    'Forts are drawn as pips and written as numbers; room events are written out in words.',
  ],
};

export const settings: SettingField[] = [
  {
    kind: 'select',
    key: 'mapSize',
    label: 'Map size',
    help: 'Big suits five or six teams, or a large class.',
    options: [
      { value: 'small', label: 'Small (37 lands)' },
      { value: 'normal', label: 'Normal (61 lands)' },
      { value: 'big', label: 'Big (91 lands)' },
    ],
    default: 'normal',
  },
  {
    kind: 'select',
    key: 'shrines',
    label: 'Shrines',
    help: 'With some numbers of teams the count moves to the nearest one that gives every team the same chance.',
    options: [
      { value: '3', label: '3 shrines' },
      { value: '5', label: '5 shrines' },
      { value: '7', label: '7 shrines' },
    ],
    default: '5',
  },
  {
    kind: 'select',
    key: 'scoreEvery',
    label: 'Teams score every',
    options: [
      { value: '10', label: '10 seconds' },
      { value: '15', label: '15 seconds' },
    ],
    default: '10',
  },
  {
    kind: 'select',
    key: 'fortMax',
    label: 'Strongest fort',
    options: [
      { value: '3', label: '3 forts' },
      { value: '5', label: '5 forts' },
    ],
    default: '3',
  },
  { kind: 'toggle', key: 'events', label: 'Room events', help: 'Every 90 seconds a random event changes the rules for 30 seconds.', default: true },
  { kind: 'toggle', key: 'fog', label: 'Fog of war', help: 'Players only see lands next to their team’s. The big screen hides every fort.', default: false },
  { kind: 'number', key: 'goalPoints', label: 'Points to win', help: 'The first team to reach this wins at once. 0 plays to the time limit.', min: 0, max: 5000, step: 250, default: 0, unit: 'points' },
  {
    kind: 'select',
    key: 'scoring',
    label: 'What scores',
    options: [
      { value: 'lands', label: 'Every land, shrines score extra' },
      { value: 'shrines', label: `Only shrines, ${SHRINE_ONLY_POINTS} points each` },
    ],
    default: 'lands',
  },
  { kind: 'toggle', key: 'claimFort', label: 'Claims come with a fort', help: 'A newly claimed land starts with 1 fort.', default: false },
  { kind: 'number', key: 'energyCap', label: 'Energy a player can hold', min: 3, max: 5, step: 1, default: 3, unit: 'energy' },
  { kind: 'toggle', key: 'doubleEnergy', label: 'Double energy', help: 'Every right answer gives 2 energy.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'lantern-lands-shrine-race',
      modeId: 'lantern-lands',
      title: 'Shrine Race',
      tagline: 'Only shrines score, and there are seven of them.',
      changes: `Ordinary lands score nothing: only shrines do, ${SHRINE_ONLY_POINTS} points each at every scoring, and the map has 7 of them. Lands only matter as a path to the next shrine.`,
      status: 'playable',
      thumbnail: { hue: 48, accentHue: 280 },
    },
    settings: { scoring: 'shrines', shrines: '7' },
    locked: ['scoring', 'shrines'],
  },
  {
    meta: {
      id: 'lantern-lands-fortress',
      modeId: 'lantern-lands',
      title: 'Fortress',
      tagline: 'Forts go up to 5, and every claim comes with one.',
      changes: 'A land can hold up to 5 forts instead of 3, and a newly claimed land starts with 1 fort, so borders are slow to break and raids need a whole team behind them.',
      status: 'playable',
      thumbnail: { hue: 25, accentHue: 200 },
    },
    settings: { fortMax: '5', claimFort: true },
    locked: ['fortMax', 'claimFort'],
  },
  {
    meta: {
      id: 'lantern-lands-fog',
      modeId: 'lantern-lands',
      title: 'Fog of War',
      tagline: 'You only see the lands next to your own.',
      changes: 'The map is always fogged: each player only sees who holds the lands next to their team’s, and the big screen hides every fort. Scout by spreading out.',
      status: 'playable',
      thumbnail: { hue: 220, accentHue: 60 },
    },
    settings: { fog: true },
    locked: ['fog'],
  },
  {
    meta: {
      id: 'lantern-lands-big-map',
      modeId: 'lantern-lands',
      title: 'Big Map',
      tagline: 'Ninety-one lands and seven shrines to fight over.',
      changes: 'The map grows from 61 lands to 91 and has 7 shrines instead of 5, so there is room for every team to grow before the borders meet.',
      status: 'playable',
      thumbnail: { hue: 140, accentHue: 330 },
    },
    settings: { mapSize: 'big', shrines: '7' },
    locked: ['mapSize', 'shrines'],
  },
  {
    meta: {
      id: 'lantern-lands-blitz',
      modeId: 'lantern-lands',
      title: 'Blitz',
      tagline: 'Four minutes, double energy, and room for five.',
      changes: 'The game lasts 4 minutes instead of 8, every right answer gives 2 energy and a player can hold 5, so the map fills in seconds and the borders never stop moving.',
      status: 'playable',
      thumbnail: { hue: 0, accentHue: 50 },
    },
    settings: { energyCap: 5, doubleEnergy: true },
    common: { timeLimitSec: 240 },
    locked: ['energyCap', 'doubleEnergy', 'timeLimitSec'],
  },
];
