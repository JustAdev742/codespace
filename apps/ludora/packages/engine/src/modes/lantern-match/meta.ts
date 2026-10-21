import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'lantern-match',
  title: 'Lantern Match',
  tagline: 'Turn over two cards. Find each question and its answer.',
  description:
    'A memory game made from your questions. Every card on your board is either a question or its answer, and they all start face down. Turn over two at a time to find the pairs that belong together. Clear a board and a fresh one is dealt, until the time runs out.',
  category: 'puzzle',
  pacing: 'self',
  players: { min: 1, max: 200, recommended: '1 to 40' },
  duration: { min: 3, max: 8 },
  difficulty: 1,
  teams: 'optional',
  questionTypes: ['mcq', 'short', 'numeric', 'flashcard'],
  minQuestions: 4,
  common: { fields: ['timeLimitSec'], defaults: { timeLimitSec: 240 } },
  rules: [
    'Everyone has their own board. Each card is a question or an answer, face down.',
    'Question cards have a lantern on the back and answer cards have a Glim, so you always know which kind you are turning over.',
    'Turn over two cards. A question and its own answer stay face up as a matched pair.',
    'Cards that do not belong together stay showing until your next turn, then flip back over. Try to remember them.',
    'Clear your board and a new one is dealt. The most pairs when time runs out wins, and fewer misses breaks a tie.',
  ],
  thumbnail: { glyph: 'lantern', hue: 262, accentHue: 42 },
  status: 'playable',
  tags: ['memory', 'self-paced', 'projector'],
  accessibility: [
    'Every card is a button that reads out whether it is a question or an answer, and what it says once turned over.',
    'Question and answer cards differ by picture and label, not only by colour.',
  ],
};

export const settings: SettingField[] = [
  { kind: 'number', key: 'pairs', label: 'Pairs on each board', min: 4, max: 10, step: 1, default: 6, unit: 'pairs' },
  { kind: 'toggle', key: 'sprint', label: 'Sprint', help: 'The game ends as soon as one player clears their first board. That player wins.', default: false },
  { kind: 'number', key: 'missCost', label: 'Lose a pair every', help: 'Every this many misses costs one of the pairs you have found. 0 turns it off.', min: 0, max: 5, step: 1, default: 0, unit: 'misses' },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'lantern-match-big',
      modeId: 'lantern-match',
      title: 'Big Board',
      tagline: 'Twenty cards to remember on every board.',
      changes: 'Every board has 10 pairs (20 cards) instead of 6, so there is much more to remember.',
      status: 'playable',
      thumbnail: { hue: 222 },
    },
    settings: { pairs: 10 },
    locked: ['pairs'],
  },
  {
    meta: {
      id: 'lantern-match-sprint',
      modeId: 'lantern-match',
      title: 'Lantern Sprint',
      tagline: 'First to clear a board wins.',
      changes: 'The game ends the moment one player clears their first board, and that player wins.',
      status: 'playable',
      thumbnail: { hue: 16 },
    },
    settings: { sprint: true },
    locked: ['sprint'],
  },
  {
    meta: {
      id: 'lantern-match-careful',
      modeId: 'lantern-match',
      title: 'Careful Match',
      tagline: 'Every third miss costs a pair you have found.',
      changes: 'Every third miss costs you one of the pairs you have already found, so turning cards over at random no longer pays: remember what you have seen.',
      status: 'playable',
      thumbnail: { hue: 180, accentHue: 350 },
    },
    settings: { missCost: 3 },
    locked: ['missCost'],
  },
];
