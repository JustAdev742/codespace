import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'classic',
  title: 'Classic',
  tagline: 'Same question, same moment. Fast and right wins.',
  description:
    'The quiz everyone knows. Each question appears for the whole room at once. Correct answers score up to 1,000 points, more for answering quickly, with a bonus for streaks. A leaderboard between questions keeps it tense.',
  category: 'quiz',
  pacing: 'host',
  players: { min: 1, max: 200, recommended: '2 to 60' },
  duration: { min: 5, max: 15 },
  difficulty: 1,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 3,
  rules: [
    'Everyone gets the same question at the same time.',
    'A correct answer is worth 500 points plus up to 500 for speed.',
    'Answer correctly several times in a row for a streak bonus of up to 250.',
    'Partly right answers to select-all, ordering and matching questions earn part of the points.',
    'With teams on, a team scores the average of its players, so team sizes do not matter.',
  ],
  thumbnail: { glyph: 'bolt', hue: 42, accentHue: 255 },
  status: 'playable',
  tags: ['classroom', 'competitive', 'projector'],
  accessibility: ['Every answer has a letter and a shape as well as a colour.', 'Number keys 1 to 6 pick an answer.'],
};

export const settings: SettingField[] = [
  { kind: 'toggle', key: 'speedBonus', label: 'Speed bonus', help: 'Faster correct answers score more.', default: true },
  { kind: 'toggle', key: 'streakBonus', label: 'Streak bonus', help: 'Extra points for correct answers in a row.', default: true },
  { kind: 'toggle', key: 'autoAdvance', label: 'Move on automatically', help: 'Turn off to talk through each answer before moving on.', default: true },
  { kind: 'toggle', key: 'leaderboard', label: 'Leaderboard between questions', default: true },
  {
    kind: 'select',
    key: 'scale',
    label: 'Points',
    options: [
      { value: '1', label: 'Standard' },
      { value: '2', label: 'Double' },
    ],
    default: '1',
  },
  { kind: 'toggle', key: 'suddenDeath', label: 'Sudden death', help: 'A wrong or missed answer knocks a player out.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'classic-lightning',
      modeId: 'classic',
      title: 'Lightning Round',
      tagline: 'Eight seconds a question, double points.',
      changes: 'Questions close after 8 seconds and every score is doubled.',
      status: 'playable',
      thumbnail: { hue: 52 },
    },
    settings: { scale: '2' },
    common: { questionTimeSec: 8 },
    locked: ['scale'],
  },
  {
    meta: {
      id: 'classic-sudden-death',
      modeId: 'classic',
      title: 'Sudden Death',
      tagline: 'One wrong answer and you are out.',
      changes: 'A wrong or missed answer eliminates the player. The game ends when one player is left or the questions run out.',
      status: 'playable',
      thumbnail: { hue: 352 },
    },
    settings: { suddenDeath: true },
    locked: ['suddenDeath'],
  },
  {
    meta: {
      id: 'classic-accuracy',
      modeId: 'classic',
      title: 'Accuracy Marathon',
      tagline: 'No rush. Every correct answer is worth the same.',
      changes: 'No speed or streak bonuses, every question in the set, and a longer timer.',
      status: 'playable',
      thumbnail: { hue: 160 },
    },
    settings: { speedBonus: false, streakBonus: false },
    common: { questionTimeSec: 45, questionLimit: 0 },
    locked: ['speedBonus', 'streakBonus'],
  },
  {
    meta: {
      id: 'classic-teams',
      modeId: 'classic',
      title: 'Team Classic',
      tagline: 'Two or more teams, scored on their average.',
      changes: 'Players are split into teams. Each team scores the average of its players.',
      status: 'playable',
      thumbnail: { hue: 200 },
    },
    common: { teamCount: 2 },
  },
  {
    meta: {
      id: 'classic-discussion',
      modeId: 'classic',
      title: 'Class Discussion',
      tagline: 'The host moves on when the class is ready.',
      changes: 'No leaderboard, no automatic advance and no speed bonus, so there is time to talk about each answer.',
      status: 'playable',
      thumbnail: { hue: 285 },
    },
    settings: { autoAdvance: false, leaderboard: false, speedBonus: false },
    common: { questionTimeSec: 60 },
    locked: ['autoAdvance'],
  },
];
