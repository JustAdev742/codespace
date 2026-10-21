import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'confidence',
  title: 'Confidence',
  tagline: 'Read the question, say how sure you are, then answer.',
  description:
    'Before the choices appear you see only the question, and you decide how sure you are: guessing, fairly sure or certain. Being right when certain pays the most, but being wrong when certain costs points. It teaches calibration: knowing how well you really know something.',
  category: 'learning',
  pacing: 'host',
  players: { min: 1, max: 200, recommended: '1 to 60' },
  duration: { min: 5, max: 15 },
  difficulty: 2,
  teams: 'optional',
  // Order and match questions make no sense without their items, so they are left out.
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric'],
  minQuestions: 3,
  common: { fields: ['questionTimeSec', 'questionLimit'], defaults: { questionTimeSec: 20, questionLimit: 12 } },
  rules: [
    'Each question starts with just the question, without the answers.',
    'Choose how sure you are: 1 (guessing), 2 (fairly sure) or 3 (certain). If you do not choose, you are guessing.',
    'Then the answers appear and you answer as normal.',
    'A correct answer scores 100 points for each level of confidence: 100, 200 or 300.',
    'A wrong or missed answer costs 50 points for each level above guessing: nothing, 50 or 100. Your score never drops below 0.',
    'After each question you see how sure everyone was and how often each level was right.',
    'With teams on, a team scores the average of its players.',
  ],
  thumbnail: { glyph: 'scales', hue: 262, accentHue: 160 },
  status: 'playable',
  tags: ['calibration', 'classroom', 'reflection'],
  accessibility: ['Number keys 1 to 3 choose your confidence.', 'Every answer has a letter and a shape as well as a colour.'],
};

export const settings: SettingField[] = [
  { kind: 'number', key: 'wagerSeconds', label: 'Time to choose confidence', min: 3, max: 20, step: 1, default: 6, unit: 'seconds' },
  { kind: 'toggle', key: 'highStakes', label: 'High stakes', help: 'A wrong answer costs 100 points for every level of confidence.', default: false },
  { kind: 'toggle', key: 'autoAdvance', label: 'Move on automatically', help: 'Turn off to talk through each answer before moving on.', default: true },
  { kind: 'toggle', key: 'leaderboard', label: 'Leaderboard between questions', default: true },
  { kind: 'toggle', key: 'returning', label: 'Returning questions', help: 'Questions fewer than half the players got right come back once at the end.', default: false },
  { kind: 'toggle', key: 'risingStakes', label: 'Rising stakes', help: 'Every stake goes up after every four questions: double, then triple, and so on.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'confidence-high-stakes',
      modeId: 'confidence',
      title: 'High Stakes',
      tagline: 'Being wrong costs as much as being right pays.',
      changes: 'A wrong or missed answer costs 100 points for every level of confidence, so even a guess costs 100.',
      status: 'playable',
      thumbnail: { hue: 340 },
    },
    settings: { highStakes: true },
    locked: ['highStakes'],
  },
  {
    meta: {
      id: 'confidence-returning-comets',
      modeId: 'confidence',
      title: 'Returning Comets',
      tagline: 'The questions most of the room missed come round again.',
      changes: 'When fewer than half the players get a question right, it comes back once at the end of the game, with a fresh choice of how sure you are.',
      status: 'playable',
      thumbnail: { glyph: 'comet', hue: 250, accentHue: 160 },
    },
    settings: { returning: true },
    locked: ['returning'],
  },
  {
    meta: {
      id: 'confidence-rising-stakes',
      modeId: 'confidence',
      title: 'Rising Stakes',
      tagline: 'The stakes climb every four questions.',
      changes: 'Every stake, won or lost, goes up every four questions: double from question 5, triple from question 9, and so on, so being certain late in the game can win or lose far more than early on.',
      status: 'playable',
      thumbnail: { hue: 300, accentHue: 45 },
    },
    settings: { risingStakes: true },
    locked: ['risingStakes'],
  },
];
