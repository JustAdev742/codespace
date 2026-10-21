import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'comet-dash',
  title: 'Comet Dash',
  tagline: 'Answer your way along the comet trail. First to the end wins.',
  description:
    'A race where every correct answer moves your comet forward. Streaks give you a boost, and staying close behind a rival lets you slipstream past them. Everyone answers at their own pace while the big screen shows the race.',
  category: 'arcade',
  pacing: 'self',
  players: { min: 1, max: 200, recommended: '2 to 60' },
  duration: { min: 3, max: 10 },
  difficulty: 1,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  rules: [
    'Each correct answer moves you one space.',
    'Every third correct answer in a row is a boost: one extra space.',
    'Answer correctly while a rival is up to three spaces ahead to slipstream: one extra space.',
    'The race ends when the podium is full, everyone has finished, or time runs out.',
  ],
  thumbnail: { glyph: 'comet', hue: 200, accentHue: 45 },
  status: 'playable',
  tags: ['race', 'projector', 'self-paced'],
  accessibility: ['Positions are announced as text as well as shown on the track.'],
};

export const settings: SettingField[] = [
  { kind: 'number', key: 'distance', label: 'Track length', min: 8, max: 50, step: 1, default: 20, unit: 'spaces' },
  { kind: 'number', key: 'boostEvery', label: 'Correct answers in a row for a boost', min: 2, max: 10, step: 1, default: 3 },
  { kind: 'toggle', key: 'slipstream', label: 'Slipstream', help: 'Extra space for answering right just behind a rival.', default: true },
  { kind: 'toggle', key: 'wrongSetback', label: 'Wrong answers move you back', default: false },
  { kind: 'number', key: 'finishers', label: 'Podium places before the race ends', min: 1, max: 20, step: 1, default: 3 },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'comet-dash-sprint',
      modeId: 'comet-dash',
      title: 'Comet Sprint',
      tagline: 'A short track and the first finisher wins.',
      changes: 'Ten spaces, and the race ends as soon as one player finishes.',
      status: 'playable',
      thumbnail: { hue: 18 },
    },
    settings: { distance: 10, finishers: 1 },
    locked: ['finishers'],
  },
  {
    meta: {
      id: 'comet-dash-gauntlet',
      modeId: 'comet-dash',
      title: 'Meteor Gauntlet',
      tagline: 'Wrong answers knock you back. No slipstream to help.',
      changes: 'Every wrong answer costs a space and slipstream is off, so accuracy beats speed.',
      status: 'playable',
      thumbnail: { hue: 330 },
    },
    settings: { wrongSetback: true, slipstream: false },
    locked: ['wrongSetback', 'slipstream'],
  },
];
