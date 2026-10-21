import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'time-attack',
  title: 'Time Attack',
  tagline: 'Beat the clock. Every streak of five raises your multiplier.',
  description:
    'A solo score attack. Answer as many questions as you can before the clock runs out. Wrong answers knock seconds off the clock, and every five right in a row raises your multiplier, up to three times the points.',
  category: 'arcade',
  pacing: 'solo',
  players: { min: 1, max: 1 },
  duration: { min: 1, max: 3 },
  difficulty: 1,
  teams: 'none',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  common: { fields: [], defaults: { timeLimitSec: 0 } },
  rules: [
    'Answer as many questions as you can before the clock reaches zero.',
    'A correct answer scores 100 points, times your multiplier.',
    'Every five correct answers in a row raise the multiplier by one, up to ×3. A wrong answer resets it to ×1.',
    'A wrong answer also takes seconds off the clock.',
  ],
  thumbnail: { glyph: 'stopwatch', hue: 8, accentHue: 48 },
  status: 'playable',
  tags: ['solo', 'score attack', 'practice'],
  accessibility: ['The time left is shown as a number as well as a bar.', 'Number keys 1 to 6 pick an answer.'],
};

export const settings: SettingField[] = [
  {
    kind: 'select',
    key: 'clock',
    label: 'Clock',
    options: [
      { value: '30', label: '30 seconds' },
      { value: '60', label: '1 minute' },
      { value: '90', label: '90 seconds' },
      { value: '120', label: '2 minutes' },
    ],
    default: '60',
  },
  { kind: 'number', key: 'penaltySeconds', label: 'Seconds lost for a wrong answer', min: 0, max: 10, step: 1, default: 3, unit: 'seconds' },
  { kind: 'toggle', key: 'suddenDeath', label: 'Sudden death', help: 'The first wrong answer ends the run.', default: false },
  { kind: 'number', key: 'bonusSeconds', label: 'Seconds won for a correct answer', help: 'The clock never goes above its starting time.', min: 0, max: 5, step: 1, default: 0, unit: 'seconds' },
  { kind: 'toggle', key: 'overdrive', label: 'Overdrive', help: 'The multiplier has no top limit, but a wrong answer costs the lost seconds times your multiplier.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'time-attack-sudden',
      modeId: 'time-attack',
      title: 'One Slip',
      tagline: 'One wrong answer and the run is over.',
      changes: 'The first mistake ends the run, however much time is left.',
      status: 'playable',
      thumbnail: { hue: 340 },
    },
    settings: { suddenDeath: true },
    locked: ['suddenDeath'],
  },
  {
    meta: {
      id: 'time-attack-long',
      modeId: 'time-attack',
      title: 'Marathon Attack',
      tagline: 'Two whole minutes to build a huge score.',
      changes: 'The clock starts at two minutes instead of one.',
      status: 'playable',
      thumbnail: { hue: 200 },
    },
    settings: { clock: '120' },
    locked: ['clock'],
  },
  {
    meta: {
      id: 'time-attack-keep-it-lit',
      modeId: 'time-attack',
      title: 'Keep It Lit',
      tagline: 'Thirty seconds of fuse, and every right answer adds two.',
      changes: 'The clock starts at 30 seconds, but every correct answer adds 2 seconds back (never above 30), so a run lasts as long as you keep answering well.',
      status: 'playable',
      thumbnail: { glyph: 'lantern', hue: 36, accentHue: 10 },
    },
    settings: { clock: '30', bonusSeconds: 2 },
    locked: ['clock', 'bonusSeconds'],
  },
  {
    meta: {
      id: 'time-attack-supernova',
      modeId: 'time-attack',
      title: 'Supernova',
      tagline: 'No top multiplier, but every slip costs more.',
      changes: 'The multiplier keeps climbing past ×3, one step for every five right in a row, with no top limit. The catch: a wrong answer costs 3 seconds times your multiplier.',
      status: 'playable',
      thumbnail: { hue: 290, accentHue: 48 },
    },
    settings: { overdrive: true },
    locked: ['overdrive'],
  },
];
