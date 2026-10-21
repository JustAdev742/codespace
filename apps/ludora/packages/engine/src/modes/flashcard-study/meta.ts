import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'flashcard-study',
  title: 'Flashcard Study',
  tagline: 'Turn the card, be honest, and master the whole set.',
  description:
    'A study session built for remembering. Every question becomes a card: read the front, turn it over, then say whether you knew it. Cards you know move up a box and come back less often; cards you missed come back soon. Keep going until every card is mastered.',
  category: 'learning',
  pacing: 'solo',
  players: { min: 1, max: 1 },
  duration: { min: 3, max: 15 },
  difficulty: 1,
  teams: 'none',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match', 'flashcard'],
  minQuestions: 1,
  common: { fields: ['timeLimitSec', 'questionLimit'], defaults: { timeLimitSec: 600 } },
  rules: [
    'Every question is a card with the question on the front and the answer on the back.',
    'Think of the answer, turn the card over, then choose "Knew it" or "Not yet". Be honest: it is how the cards learn what you need.',
    '"Knew it" moves a card up a box. A card that reaches box 3 is mastered and leaves the pile.',
    '"Not yet" sends a card back to box 1, and it comes back again soon.',
    'The session ends when every card is mastered or time runs out.',
  ],
  thumbnail: { glyph: 'layers', hue: 150, accentHue: 262 },
  status: 'playable',
  tags: ['study', 'revision', 'solo'],
  accessibility: ['Space turns the card over; 1 or N means "Not yet" and 2 or K means "Knew it".'],
};

export const settings: SettingField[] = [
  { kind: 'toggle', key: 'quick', label: 'Quick review', help: 'Knowing a card once masters it.', default: false },
  {
    kind: 'toggle',
    key: 'reverse',
    label: 'Answer side first',
    help: 'See the answer and recall the question. Cards whose answer is a picture, a number, a list or true or false stay the usual way round.',
    default: false,
  },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'flashcard-study-quick',
      modeId: 'flashcard-study',
      title: 'Quick Review',
      tagline: 'Know a card once and it is done.',
      changes: 'One "Knew it" masters a card, so a quick run through the set before a test.',
      status: 'playable',
      thumbnail: { hue: 190 },
    },
    settings: { quick: true },
    locked: ['quick'],
  },
  {
    meta: {
      id: 'flashcard-study-back-to-front',
      modeId: 'flashcard-study',
      title: 'Back to Front',
      tagline: 'See the answer, recall the question.',
      changes: 'Cards are turned around: the front shows the answer and you recall the term or question it belongs to. Cards whose answer is a picture, a number, a list or true or false stay the usual way round.',
      status: 'playable',
      thumbnail: { hue: 210, accentHue: 150 },
    },
    settings: { reverse: true },
    locked: ['reverse'],
  },
];
