import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'quick-draw',
  title: 'Quick Draw',
  tagline: 'One try each. The first right answer takes the round.',
  description:
    'A buzzer race. Everyone gets the same question at the same moment, and the round goes to the first correct answer. You only get one try per question, so a wrong guess locks you out until the next one. Be quick, but be sure.',
  category: 'party',
  pacing: 'host',
  players: { min: 1, max: 200, recommended: '2 to 40' },
  duration: { min: 4, max: 12 },
  difficulty: 1,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 3,
  common: { fields: ['questionTimeSec', 'questionLimit'], defaults: { questionTimeSec: 20, questionLimit: 12 } },
  rules: [
    'Everyone gets the same question at the same moment.',
    'The first correct answer wins the round and scores 1 point.',
    'You get one try per question. A wrong answer locks you out until the next question.',
    'With the penalty on, a wrong answer also costs a point. Scores never drop below 0.',
    'With a target set, the first player to reach it wins straight away. Otherwise every question is played and the most points wins.',
    'With teams on, every round a player wins counts for their team.',
  ],
  thumbnail: { glyph: 'stopwatch', hue: 14, accentHue: 48 },
  status: 'playable',
  tags: ['buzzer', 'competitive', 'projector'],
  accessibility: [
    'Every answer has a letter and a shape as well as a colour.',
    'Number keys 1 to 6 pick an answer.',
    'The round winner is announced in words, not only shown.',
  ],
};

export const settings: SettingField[] = [
  { kind: 'toggle', key: 'penalty', label: 'Wrong answers cost a point', help: 'Scores never drop below 0.', default: false },
  { kind: 'number', key: 'target', label: 'Points to win', help: '0 plays every question; the most points wins.', min: 0, max: 20, step: 1, default: 0, unit: 'points' },
  { kind: 'toggle', key: 'autoAdvance', label: 'Move on automatically', help: 'Turn off to talk through each answer before moving on.', default: true },
  { kind: 'toggle', key: 'teamTry', label: 'One try per team', help: 'With teams on, a wrong answer locks the whole team out of that question.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'quick-draw-first-to-5',
      modeId: 'quick-draw',
      title: 'First to Five',
      tagline: 'Win five rounds and the game is yours.',
      changes: 'The first player to win five rounds wins the game on the spot. Every question in the set stays in play until then.',
      status: 'playable',
      thumbnail: { hue: 32 },
    },
    settings: { target: 5 },
    common: { questionLimit: 0 },
    locked: ['target'],
  },
  {
    meta: {
      id: 'quick-draw-steady',
      modeId: 'quick-draw',
      title: 'Steady Hand',
      tagline: 'Guess wrong and you lose a point.',
      changes: 'A wrong answer costs a point as well as your chance at the round, so only answer when you are sure.',
      status: 'playable',
      thumbnail: { hue: 196 },
    },
    settings: { penalty: true },
    locked: ['penalty'],
  },
  {
    meta: {
      id: 'quick-draw-one-voice',
      modeId: 'quick-draw',
      title: 'One Voice',
      tagline: 'One try per team. Whoever answers speaks for everyone.',
      changes: 'Players are split into teams, and each team gets one try per question: if anyone on your team answers wrong, the whole team is locked out until the next question. Every round a player wins counts for their team.',
      status: 'playable',
      thumbnail: { hue: 205, accentHue: 14 },
    },
    settings: { teamTry: true },
    common: { teamCount: 2 },
    locked: ['teamTry'],
  },
];
