import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'lantern-out',
  title: 'Lantern Out',
  tagline: 'Keep your lanterns lit. Every miss blows one out.',
  description:
    'A survival quiz. Everyone starts with a row of lanterns, and every wrong or missed answer blows one out. Lose them all and you are out, but revival rounds give knocked-out players the chance to relight a lantern and climb back in. The last lantern burning wins.',
  category: 'quiz',
  pacing: 'host',
  players: { min: 1, max: 200, recommended: '3 to 60' },
  duration: { min: 5, max: 15 },
  difficulty: 1,
  teams: 'optional',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 3,
  rules: [
    'Everyone starts with the same number of lanterns.',
    'A wrong or missed answer blows out one of your lanterns. When none are left, you are out.',
    'Every few questions there is a revival round (never on the last question): only players who are out may answer, and a correct answer relights one lantern.',
    'Correct answers also score points, more for answering quickly.',
    'The game ends when one player is left, when every lantern is out, or when the questions run out.',
    'Survivors rank by lanterns left, then points. Players who went out later rank above those who went out earlier.',
    'Players who join late start with one lantern.',
    'With teams on, the team with the biggest share of its lanterns still lit wins.',
  ],
  thumbnail: { glyph: 'lantern', hue: 38, accentHue: 262 },
  status: 'playable',
  tags: ['survival', 'classroom', 'projector'],
  accessibility: ['Lanterns left are always written as a number as well as drawn.', 'Every answer has a letter and a shape as well as a colour.'],
};

export const settings: SettingField[] = [
  { kind: 'number', key: 'lives', label: 'Lanterns each', min: 1, max: 5, step: 1, default: 3, unit: 'lanterns' },
  { kind: 'number', key: 'reviveEvery', label: 'Revival round every', help: 'Questions between revival rounds. 0 turns them off.', min: 0, max: 10, step: 1, default: 4, unit: 'questions' },
  { kind: 'toggle', key: 'autoAdvance', label: 'Move on automatically', help: 'Turn off to talk through each answer before moving on.', default: true },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'lantern-out-one-flame',
      modeId: 'lantern-out',
      title: 'One Flame',
      tagline: 'A single lantern each. Revival every third question.',
      changes: 'Everyone has just one lantern, so the first miss puts you out, but every third question is a revival round.',
      status: 'playable',
      thumbnail: { hue: 18 },
    },
    settings: { lives: 1, reviveEvery: 3 },
    locked: ['lives', 'reviveEvery'],
  },
  {
    meta: {
      id: 'lantern-out-no-revival',
      modeId: 'lantern-out',
      title: 'Last Light',
      tagline: 'No second chances. Once you are out, you stay out.',
      changes: 'There are no revival rounds: a player whose lanterns are all out stays out for the rest of the game.',
      status: 'playable',
      thumbnail: { hue: 250 },
    },
    settings: { reviveEvery: 0 },
    locked: ['reviveEvery'],
  },
];
