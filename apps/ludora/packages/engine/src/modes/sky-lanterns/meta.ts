import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'sky-lanterns',
  title: 'Sky Lanterns',
  tagline: 'Light lanterns, read the wind and launch at the right moment. Storms do not wait.',
  description:
    'Correct answers fill your oil can. Spend oil to light paper lanterns, then launch every lantern you have lit at once: the stronger the wind, the more each one scores. The wind changes every 25 seconds and nobody knows what comes next, only the chance of a storm, which blows out every lantern still on the ground. Launch now, or wait for a gust?',
  category: 'strategy',
  pacing: 'self',
  players: { min: 1, max: 200, recommended: '2 to 60' },
  duration: { min: 3, max: 10 },
  difficulty: 2,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  common: { fields: ['timeLimitSec'], defaults: { timeLimitSec: 300 } },
  rules: [
    'Each correct answer earns 1 oil. Every third correct answer in a row earns 1 extra.',
    'Your oil can holds enough for two lanterns. Oil that does not fit spills, so keep lighting.',
    'Lighting a lantern costs 3 oil. Lit lanterns wait on the ground until you launch.',
    'Launch sends all your lit lanterns up at once. Each one scores the wind: calm ×1, breezy ×2, gusty ×3.',
    'The wind changes every 25 seconds. A storm blows out every lantern still on the ground. Launched points are safe.',
    'Nobody knows the next wind. The forecast shows the chance of a storm, which rises after every change without one and resets after a storm.',
    'Lanterns still on the ground when time runs out do not score. The highest score wins.',
  ],
  thumbnail: { glyph: 'lantern', hue: 255, accentHue: 40 },
  status: 'playable',
  tags: ['push your luck', 'strategy', 'projector', 'self-paced'],
  accessibility: [
    'The wind and the storm forecast are always written in words and numbers, never shown by colour alone.',
    'Lighting and launching are ordinary buttons that work with a keyboard or a switch.',
  ],
};

export const settings: SettingField[] = [
  { kind: 'number', key: 'lanternCost', label: 'Oil to light a lantern', min: 1, max: 6, step: 1, default: 3, unit: 'oil' },
  { kind: 'number', key: 'windChangeSec', label: 'Time between wind changes', min: 10, max: 60, step: 5, default: 25, unit: 'seconds' },
  { kind: 'toggle', key: 'storms', label: 'Storms', help: 'A storm blows out every lantern still on the ground.', default: true },
  {
    kind: 'number',
    key: 'stormChance',
    label: 'Starting storm chance',
    help: 'The chance of a storm at the first wind change, and again after every storm.',
    min: 0,
    max: 50,
    step: 5,
    default: 10,
    unit: '%',
  },
  {
    kind: 'number',
    key: 'stormRise',
    label: 'Storm chance rise',
    help: 'Added to the storm chance after every wind change without a storm.',
    min: 0,
    max: 25,
    step: 5,
    default: 10,
    unit: '%',
  },
  { kind: 'toggle', key: 'gales', label: 'Gales', help: 'A rare wind that makes every lantern launched while it blows worth ×4.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'sky-lanterns-calm-skies',
      modeId: 'sky-lanterns',
      title: 'Calm Skies',
      tagline: 'No storms. Just wait for the best wind before time runs out.',
      changes: 'Storms are switched off, so lanterns are never blown out. The only question is how long to wait for a gust before the clock runs down.',
      status: 'playable',
      thumbnail: { hue: 195 },
    },
    settings: { storms: false },
    locked: ['storms'],
  },
  {
    meta: {
      id: 'sky-lanterns-tempest',
      modeId: 'sky-lanterns',
      title: 'Tempest',
      tagline: 'Storms come thick and fast, but a rare gale scores ×4.',
      changes: 'The storm chance starts at 25% and rises by 15% after every change without a storm. A rare gale makes every lantern launched while it blows worth ×4.',
      status: 'playable',
      thumbnail: { hue: 285, accentHue: 190 },
    },
    settings: { storms: true, stormChance: 25, stormRise: 15, gales: true },
    locked: ['storms', 'stormChance', 'stormRise', 'gales'],
  },
];
