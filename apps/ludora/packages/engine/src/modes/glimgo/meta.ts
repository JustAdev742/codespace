import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'glimgo',
  title: 'Glimgo',
  tagline: 'Bingo where the calls are questions. Find the answer on your card.',
  description:
    'Everyone gets their own card of answers. Each call is a question, shown without its answer: find the square that answers it and tap it before the call moves on. Tap the wrong square and you are locked out for a few seconds. Complete a line first to win.',
  category: 'party',
  pacing: 'host',
  players: { min: 1, max: 200, recommended: '3 to 40' },
  duration: { min: 4, max: 12 },
  difficulty: 1,
  teams: 'none',
  // Every card square is a short answer; other question types are converted where they can be.
  questionTypes: ['mcq', 'short', 'numeric', 'flashcard'],
  minQuestions: 8,
  common: { fields: ['questionLimit'], defaults: { questionLimit: 24 }, help: { questionLimit: 'How many calls at most. Each question can be called twice.' } },
  rules: [
    'Everyone gets their own card of answers from the question set: 4 by 4 when the set has at least 16 different answers, otherwise 3 by 3.',
    'Each call shows a question without its answer. Tap the square on your card that answers it.',
    'Tap a square that does not answer the call and you are locked out of marking for a few seconds.',
    'A call lasts a set time, then the answer is shown and the next call comes up.',
    'The first player to complete a line (or two lines, or the whole card, depending on the game) wins.',
    'If the calls run out first, the player with the most marked squares wins.',
    'When a set has too few different answers, cards get a free square in the middle.',
  ],
  thumbnail: { glyph: 'bingo', hue: 160, accentHue: 42 },
  status: 'playable',
  tags: ['bingo', 'projector', 'vocabulary'],
  accessibility: ['Every square is a button with its answer as its label.', 'Marked squares show a tick as well as a colour.'],
};

export const settings: SettingField[] = [
  {
    kind: 'select',
    key: 'win',
    label: 'To win',
    options: [
      { value: 'line', label: 'One line' },
      { value: 'two-lines', label: 'Two lines' },
      { value: 'full', label: 'The whole card' },
    ],
    default: 'line',
  },
  {
    kind: 'select',
    key: 'cardSize',
    label: 'Card size',
    help: 'A 4 by 4 card needs at least 15 different answers in the set.',
    options: [
      { value: 'auto', label: 'Automatic' },
      { value: '3', label: '3 by 3' },
      { value: '4', label: '4 by 4' },
    ],
    default: 'auto',
  },
  { kind: 'number', key: 'callSeconds', label: 'Time per call', min: 5, max: 60, step: 1, default: 15, unit: 'seconds' },
  { kind: 'number', key: 'lockoutSeconds', label: 'Lockout after a wrong square', help: '0 turns the lockout off.', min: 0, max: 15, step: 1, default: 5, unit: 'seconds' },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'glimgo-blackout',
      modeId: 'glimgo',
      title: 'Glimgo Blackout',
      tagline: 'Fill the whole card to win.',
      changes: 'One line is not enough: the winner is the first player to mark every square on their card.',
      status: 'playable',
      thumbnail: { hue: 240 },
    },
    settings: { win: 'full' },
    locked: ['win'],
  },
  {
    meta: {
      id: 'glimgo-speed',
      modeId: 'glimgo',
      title: 'Speed Glimgo',
      tagline: 'Eight seconds a call. Think fast.',
      changes: 'Each call lasts only 8 seconds before the answer is shown and the next call comes up.',
      status: 'playable',
      thumbnail: { hue: 52 },
    },
    settings: { callSeconds: 8 },
    locked: ['callSeconds'],
  },
];
