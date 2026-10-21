import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'word-scramble',
  title: 'Word Scramble',
  tagline: 'The answer is in the tiles. Put the letters back in order.',
  description:
    'Every answer arrives as a jumble of letter tiles. Read the question, then tap the tiles in order (or type) to spell the answer. Longer words are worth more, and a hint shows the next letter when you are stuck. Answers that cannot be scrambled, such as numbers, are asked as ordinary questions.',
  category: 'puzzle',
  pacing: 'self',
  players: { min: 1, max: 200, recommended: '1 to 40' },
  duration: { min: 3, max: 8 },
  difficulty: 2,
  teams: 'optional',
  questionTypes: ['short', 'mcq', 'truefalse', 'numeric', 'multi', 'order', 'match'],
  minQuestions: 4,
  common: { fields: ['timeLimitSec', 'questionLimit', 'questionTimeSec'], defaults: { timeLimitSec: 240 }, help: { questionTimeSec: 'Only used when the word timer is on.' } },
  rules: [
    'The letters of each answer are shuffled into tiles. Spaces between words stay as gaps.',
    'Tap the tiles in order to spell the answer, or type it. Capitals and punctuation do not matter.',
    'A word is worth 10 points for each letter. A hint shows the next letter for 10 points, up to half the letters.',
    'Not sure? Skip the word. It counts as wrong and shows you the answer.',
    'Numbers, very short or very long answers, and true-or-false, select-all, ordering and matching questions are asked as ordinary questions, worth 50 points.',
    'Everyone has every word once. The game ends when everyone has finished or time runs out.',
  ],
  thumbnail: { glyph: 'letters', hue: 172, accentHue: 300 },
  status: 'playable',
  tags: ['spelling', 'vocabulary', 'self-paced'],
  accessibility: ['Type the letters on a keyboard to pick tiles; Backspace takes the last one back and Enter checks.', 'Every word can be typed instead of tapped.'],
};

export const settings: SettingField[] = [
  { kind: 'toggle', key: 'hints', label: 'Hints', help: 'Show the next letter for 10 points, up to half the letters of a word.', default: true },
  {
    kind: 'toggle',
    key: 'wordTimer',
    label: 'Timer on every word',
    help: 'Each word must be solved within the seconds-per-question limit. Running out counts as wrong.',
    default: false,
  },
  { kind: 'toggle', key: 'oneTry', label: 'One try per word', help: 'A wrong spelling ends the word.', default: false },
  { kind: 'toggle', key: 'secondChance', label: 'Second chances', help: 'Every word you skip or get wrong comes back once after your last word, for half points.', default: false },
  { kind: 'toggle', key: 'streak', label: 'Spelling streak', help: 'Words solved in a row are worth more: double for the second, triple from the third on.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'word-scramble-no-hints',
      modeId: 'word-scramble',
      title: 'No Peeking',
      tagline: 'Word Scramble with no hints at all.',
      changes: 'Hints are switched off. Every letter is down to you.',
      status: 'playable',
      thumbnail: { hue: 300 },
    },
    settings: { hints: false },
    locked: ['hints'],
  },
  {
    meta: {
      id: 'word-scramble-timed',
      modeId: 'word-scramble',
      title: 'Scramble Rush',
      tagline: 'Twenty seconds to crack each word.',
      changes: 'Every word has a 20-second timer. A word that is not solved in time counts as wrong.',
      status: 'playable',
      thumbnail: { hue: 24 },
    },
    settings: { wordTimer: true },
    common: { questionTimeSec: 20 },
    locked: ['wordTimer', 'questionTimeSec'],
  },
  {
    meta: {
      id: 'word-scramble-first-spell',
      modeId: 'word-scramble',
      title: 'First Spell',
      tagline: 'One go at every word. Check before the last tile.',
      changes: 'You get one go at each word: a wrong spelling ends it and shows the answer, so think before the last tile goes down.',
      status: 'playable',
      thumbnail: { hue: 330, accentHue: 172 },
    },
    settings: { oneTry: true },
    locked: ['oneTry'],
  },
  {
    meta: {
      id: 'word-scramble-second-chances',
      modeId: 'word-scramble',
      title: 'Second Chances',
      tagline: 'Missed words come back at the end.',
      changes: 'Every word you skip or get wrong comes back once after your last word, worth half points, so you finish having seen every answer twice.',
      status: 'playable',
      thumbnail: { hue: 150, accentHue: 300 },
    },
    settings: { secondChance: true },
    locked: ['secondChance'],
  },
  {
    meta: {
      id: 'word-scramble-spelling-streak',
      modeId: 'word-scramble',
      title: 'Spelling Streak',
      tagline: 'Solve words in a row to multiply their points.',
      changes: 'Words solved in a row are worth more: the second in a row scores double and every one after that triple. Skipping or missing a word breaks the streak.',
      status: 'playable',
      thumbnail: { hue: 45, accentHue: 172 },
    },
    settings: { streak: true },
    locked: ['streak'],
  },
];
