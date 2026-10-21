import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'survival-run',
  title: 'Survival Run',
  tagline: 'Three hearts, a shrinking timer and no finish line.',
  description:
    'An endless solo run. Every question has a timer, and each correct answer makes the next one a little shorter. Wrong or missed answers cost a heart, and a long run of correct answers wins one back. How far can you get?',
  category: 'arcade',
  pacing: 'solo',
  players: { min: 1, max: 1 },
  duration: { min: 2, max: 10 },
  difficulty: 2,
  teams: 'none',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  common: { fields: ['timeLimitSec'], defaults: { timeLimitSec: 0 }, help: { timeLimitSec: 'No limit means the run lasts until the last heart is gone.' } },
  rules: [
    'You start with three hearts. A wrong answer, or running out of time, costs one.',
    'The timer starts at 15 seconds and gets half a second shorter with every correct answer, down to 6 seconds.',
    'Every 10 correct answers win back a heart, up to the hearts you started with.',
    'The run ends when your last heart is gone. Your score is how many you got right.',
  ],
  thumbnail: { glyph: 'heart', hue: 350, accentHue: 30 },
  status: 'playable',
  tags: ['solo', 'endless', 'practice'],
  accessibility: ['Hearts and time left are given as numbers as well as pictures.', 'Number keys 1 to 6 pick an answer.'],
};

export const settings: SettingField[] = [
  { kind: 'number', key: 'hearts', label: 'Hearts', min: 1, max: 5, step: 1, default: 3, unit: 'hearts' },
  { kind: 'toggle', key: 'restores', label: 'Win hearts back', help: 'Every 10 correct answers restore a heart, up to the starting number.', default: true },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'survival-run-hardcore',
      modeId: 'survival-run',
      title: 'Hardcore Run',
      tagline: 'One heart. No second chances.',
      changes: 'You have a single heart and cannot win any back, so the first wrong or missed answer ends the run.',
      status: 'playable',
      thumbnail: { hue: 275 },
    },
    settings: { hearts: 1, restores: false },
    locked: ['hearts', 'restores'],
  },
];
