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
  common: { fields: ['questionTimeSec', 'questionLimit'], defaults: { questionTimeSec: 20, questionLimit: 20 } },
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
  { kind: 'toggle', key: 'kindling', label: 'Kindling', help: 'Every third correct answer in a row relights a lantern, up to the number you started with.', default: false },
  { kind: 'toggle', key: 'slowest', label: 'Slowest flame', help: 'When two or more players answer correctly, the slowest of them loses a lantern too.', default: false },
  { kind: 'toggle', key: 'lastTeam', label: 'Last team standing', help: 'With teams on, the game ends when only one team still has a lantern lit, and that team wins.', default: false },
  {
    kind: 'toggle',
    key: 'vigil',
    label: 'Play together',
    help: 'The room wins together if at least half the players still have a lantern lit at the end. The game no longer stops when one player is left.',
    default: false,
  },
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
  {
    meta: {
      id: 'lantern-out-kindling',
      modeId: 'lantern-out',
      title: 'Kindling',
      tagline: 'Three right in a row relights a lantern.',
      changes: 'Every third correct answer in a row relights one of your lanterns, up to the number you started with, so a good run can undo earlier mistakes.',
      status: 'playable',
      thumbnail: { hue: 28, accentHue: 140 },
    },
    settings: { kindling: true },
    locked: ['kindling'],
  },
  {
    meta: {
      id: 'lantern-out-flicker-rush',
      modeId: 'lantern-out',
      title: 'Flicker Rush',
      tagline: 'Right but slowest? Your lantern still flickers out.',
      changes: 'Being right is not always enough: whenever two or more players answer a question correctly, the slowest of them loses a lantern too.',
      status: 'playable',
      thumbnail: { hue: 50, accentHue: 350 },
    },
    settings: { slowest: true },
    locked: ['slowest'],
  },
  {
    meta: {
      id: 'lantern-out-last-team',
      modeId: 'lantern-out',
      title: 'Last Team Lit',
      tagline: 'The last team with a lantern burning wins.',
      changes: 'Players are split into teams. The game ends as soon as only one team still has a lantern lit, and that team wins. Teams that went out later rank above teams that went out earlier.',
      status: 'playable',
      thumbnail: { hue: 220, accentHue: 38 },
    },
    settings: { lastTeam: true },
    common: { teamCount: 2 },
    locked: ['lastTeam'],
  },
  {
    meta: {
      id: 'lantern-out-night-vigil',
      modeId: 'lantern-out',
      title: 'Night Vigil',
      tagline: 'Keep half the room lit and everyone wins.',
      changes: 'Everyone plays together: the room wins if at least half the players still have a lantern lit when the questions run out. The game no longer ends when one player is left.',
      status: 'playable',
      thumbnail: { hue: 245, accentHue: 45 },
    },
    settings: { vigil: true },
    locked: ['vigil'],
  },
];
