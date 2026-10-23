import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';
import { FIRST_WAVE_MS, FLARE_BURN, GLOOMLINGS, GOLD_PER_RIGHT, START_GOLD, STREAK_FROM, STREAK_GOLD, TOWERS, UPGRADE_SHARE, WAVE_EVERY_MS, WAVE_GOLD } from './units.ts';

/*
 * Lantern Guard: a co-operative tower defence. Metadata only (the browser
 * imports this for the catalogue); the numbers come from units.ts, the same
 * table the engine plays by, so the rules never drift from the game.
 */

const pct = (share: number) => `${Math.round(share * 100)}%`;
const secs = (ms: number) => `${ms / 1000} seconds`;

export const meta: ModeMeta = {
  id: 'lantern-guard',
  title: 'Lantern Guard',
  tagline: 'Answer for gold, build light towers and hold back the gloom together.',
  description:
    'The gloom is creeping along the road to the festival’s Great Lantern, and the whole class defends it together. Right answers earn gold, gold builds light towers beside the road, and any tower can be upgraded by anyone. Waves grow, a Gloom Lord comes every few waves, and everyone wins if the lantern still shines after the last wave.',
  category: 'strategy',
  pacing: 'self',
  players: { min: 1, max: 200, recommended: '2 to 40' },
  duration: { min: 5, max: 10 },
  difficulty: 2,
  teams: 'none',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  common: { fields: ['timeLimitSec'], defaults: { timeLimitSec: 480 }, help: { timeLimitSec: 'Ten waves take about five and a half minutes. When time runs out with the lantern still lit, the class wins.' } },
  rules: [
    `A right answer earns ${GOLD_PER_RIGHT} gold, or ${GOLD_PER_RIGHT + STREAK_GOLD} on a streak of ${STREAK_FROM} or more. Everyone starts with ${START_GOLD} gold (enough for a first tower), and gold is your own.`,
    'Spend gold on light towers on the free spots beside the road, or upgrade any tower, yours or a classmate’s.',
    `Spark (${TOWERS.spark.cost} gold) zaps quickly. Beam (${TOWERS.beam.cost}) hits the toughest gloomling. Frost (${TOWERS.frost.cost}) slows one down. Firework (${TOWERS.firework.cost}) hits a whole crowd.`,
    `Level 2 costs ${pct(UPGRADE_SHARE[0])} of the tower’s price and level 3 costs ${pct(UPGRADE_SHARE[1])}. Every level hits harder and reaches further.`,
    `Waves march whether you are ready or not: the first after ${secs(FIRST_WAVE_MS)}, then one every ${secs(WAVE_EVERY_MS)}.`,
    `A gloomling that reaches the Great Lantern puts out its lights: 1 for a Wisp or a Shade, ${GLOOMLINGS.brute.lights} for a Brute, ${GLOOMLINGS.lord.lights} for a Gloom Lord.`,
    `When a wave is held, every guard gets ${WAVE_GOLD} gold.`,
    `Everyone can feed the Great Lantern gold. When it is full it flares and burns away ${pct(FLARE_BURN)} of every gloomling’s health.`,
    'Keep at least one light burning until the last wave is held, and the whole class wins.',
    'Guard points: 10 for each right answer, 1 for each gold you spend, 3 for each gloomling your towers defeat and 30 for a Gloom Lord.',
  ],
  thumbnail: { glyph: 'castle', hue: 220, accentHue: 45 },
  status: 'playable',
  tags: ['co-operative', 'tower defence', 'projector', 'self-paced'],
  accessibility: [
    'Every tower and gloomling has its own shape and outline, so the battle never depends on colour.',
    'Lights, gold, waves and health are always written as numbers too.',
    'On a phone, spots and towers can be chosen with Previous and Next buttons as well as by tapping the map.',
    'With reduced motion the battle moves in small steps instead of gliding, and towers do not flash.',
  ],
};

export const settings: SettingField[] = [
  {
    kind: 'select',
    key: 'map',
    label: 'Map',
    options: [
      { value: 'river', label: 'River Road: one road with a gentle bend' },
      { value: 'spiral', label: 'Spiral Hill: a long road that winds inwards' },
      { value: 'twin', label: 'Twin Gates: two roads that meet halfway' },
    ],
    default: 'river',
  },
  { kind: 'number', key: 'waves', label: 'Waves', help: 'Each wave adds about 28 seconds to the game.', min: 5, max: 20, step: 1, default: 10 },
  { kind: 'number', key: 'lives', label: 'Lights on the Great Lantern', help: 'Gloomlings that reach the lantern put lights out. When the last one goes out, the gloom wins.', min: 5, max: 40, step: 1, default: 20, unit: 'lights' },
  {
    kind: 'select',
    key: 'difficulty',
    label: 'Gloomling toughness',
    options: [
      { value: 'easy', label: 'Easy: a quarter less health' },
      { value: 'normal', label: 'Normal' },
      { value: 'hard', label: 'Hard: 15% more health' },
    ],
    default: 'normal',
  },
  {
    kind: 'select',
    key: 'towers',
    label: 'Towers',
    options: [
      { value: 'all', label: 'All four towers' },
      { value: 'frost-fire', label: 'Only Frost and Firework towers, against weaker gloomlings' },
    ],
    default: 'all',
  },
  {
    kind: 'select',
    key: 'bossEvery',
    label: 'Gloom Lords',
    help: 'A Gloom Lord is a boss with far more health than any other gloomling. The last wave always ends with one.',
    options: [
      { value: '0', label: 'None' },
      { value: '3', label: 'Every third wave' },
      { value: '5', label: 'Every fifth wave' },
    ],
    default: '5',
  },
  {
    kind: 'select',
    key: 'crowd',
    label: 'Small gloomlings in each wave',
    options: [
      { value: 'fewer', label: 'Fewer (a fifth fewer)' },
      { value: 'normal', label: 'Normal' },
      { value: 'more', label: 'More (half as many again)' },
    ],
    default: 'normal',
  },
  { kind: 'toggle', key: 'endless', label: 'Endless night', help: 'The waves never stop. The game ends when the last light goes out or time runs out, and the score is the number of waves held.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'lantern-guard-endless',
      modeId: 'lantern-guard',
      title: 'Endless Night',
      tagline: 'The waves never stop. How many can the class hold?',
      changes: 'There is no last wave: they keep coming, tougher each time, until the last light goes out or time runs out. The class is scored on how many waves it held.',
      status: 'playable',
      thumbnail: { glyph: 'castle', hue: 250, accentHue: 300 },
    },
    settings: { endless: true },
    locked: ['endless'],
  },
  {
    meta: {
      id: 'lantern-guard-fragile',
      modeId: 'lantern-guard',
      title: 'Fragile Festival',
      tagline: 'Only 8 lights. Every gloomling that slips through hurts.',
      changes: 'The Great Lantern starts with 8 lights instead of 20, so a single Gloom Lord that gets through nearly puts it out. Leaks matter from the very first wave.',
      status: 'playable',
      thumbnail: { glyph: 'lantern', hue: 15, accentHue: 45 },
    },
    settings: { lives: 8 },
    locked: ['lives'],
  },
  {
    meta: {
      id: 'lantern-guard-boss-rush',
      modeId: 'lantern-guard',
      title: 'Boss Rush',
      tagline: 'A Gloom Lord every third wave, with fewer small gloomlings.',
      changes: 'A Gloom Lord marches every third wave instead of every fifth, and on the last wave too, while each wave brings a fifth fewer Wisps, Shades and Brutes. Strong single-target towers win the day.',
      status: 'playable',
      thumbnail: { glyph: 'crown', hue: 280, accentHue: 45 },
    },
    settings: { bossEvery: '3', crowd: 'fewer' },
    locked: ['bossEvery', 'crowd'],
  },
  {
    meta: {
      id: 'lantern-guard-frost-fire',
      modeId: 'lantern-guard',
      title: 'Frost and Fire',
      tagline: 'Only Frost and Firework towers. Slow them, then burst them.',
      changes: 'Spark and Beam towers are not available: the class defends with Frost towers that slow the gloom and Firework towers that burst over crowds, so the two have to work together. Everyone starts with 60 gold, enough for a Frost tower at once, and the gloomlings have about two thirds of their usual health to make up for the missing towers.',
      status: 'playable',
      thumbnail: { glyph: 'snow', hue: 195, accentHue: 20 },
    },
    settings: { towers: 'frost-fire' },
    locked: ['towers'],
  },
  {
    meta: {
      id: 'lantern-guard-twin-gates',
      modeId: 'lantern-guard',
      title: 'Twin Gates',
      tagline: 'The gloom comes through two gates at once.',
      changes: 'The map has two entrances whose roads meet halfway, so the gloom splits up and the class has to guard both roads before they join.',
      status: 'playable',
      thumbnail: { glyph: 'map', hue: 160, accentHue: 45 },
    },
    settings: { map: 'twin' },
    locked: ['map'],
  },
];
