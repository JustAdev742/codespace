import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'tug-of-war',
  title: 'Tug of War',
  tagline: 'Two sides, one rope. Every correct answer is a pull.',
  description:
    'The room splits into two sides and every correct answer pulls the knot towards your end. Drag it into your end zone to win, or be ahead when time runs out. Team size never decides it: each pull is worth (players on the smaller side) ÷ (players on your side), a full space on the smaller side and a little less on a bigger one, so both sides pull at the same rate when they answer equally well.',
  category: 'party',
  pacing: 'self',
  players: { min: 2, max: 200, recommended: '4 to 60' },
  duration: { min: 3, max: 8 },
  difficulty: 1,
  teams: 'required',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  common: { fields: ['timeLimitSec'], defaults: { timeLimitSec: 300 } },
  rules: [
    'Two sides pull one rope. The knot starts in the middle, 20 spaces from each end.',
    'Every correct answer pulls the knot towards your end.',
    'A pull is worth (players on the smaller side) ÷ (players on your side): one space on the smaller side, a little less on a bigger one.',
    'Drag the knot into your end zone to win.',
    'When time runs out, the side the knot leans towards wins. Dead level is a draw.',
    'With more than two teams, teams take turns joining the left and right sides.',
    'Players are ranked by how many pulls they made.',
  ],
  thumbnail: { glyph: 'rope', hue: 200, accentHue: 42 },
  status: 'playable',
  tags: ['teams', 'projector', 'self-paced', 'classroom'],
  accessibility: ['The knot position is written as text ("6 spaces towards the Comets") as well as drawn.', 'Each side is named and patterned, never shown by colour alone.'],
};

export const settings: SettingField[] = [
  { kind: 'number', key: 'ropeLength', label: 'Spaces from the middle to each end', min: 8, max: 60, step: 1, default: 20, unit: 'spaces' },
  { kind: 'toggle', key: 'slack', label: 'Slippery rope', help: 'Wrong answers let the rope slip half a pull towards the other side.', default: false },
  { kind: 'toggle', key: 'heave', label: 'Heave', help: 'Every third correct answer in a row pulls twice as far.', default: false },
  { kind: 'toggle', key: 'underdog', label: 'Underdog grip', help: 'The side the knot leans away from pulls 50% harder.', default: false },
  { kind: 'toggle', key: 'surge', label: 'Final surge', help: 'In the last 30 seconds every pull counts double.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'tug-of-war-marathon',
      modeId: 'tug-of-war',
      title: 'Marathon Tug',
      tagline: 'Twice the rope and eight minutes on the clock.',
      changes: 'The knot starts 40 spaces from each end instead of 20, and the game lasts up to eight minutes, so stamina beats a quick burst.',
      status: 'playable',
      thumbnail: { hue: 160 },
    },
    settings: { ropeLength: 40 },
    common: { timeLimitSec: 480 },
    locked: ['ropeLength', 'timeLimitSec'],
  },
  {
    meta: {
      id: 'tug-of-war-slack',
      modeId: 'tug-of-war',
      title: 'Slippery Rope',
      tagline: 'Wrong answers let the rope slip back.',
      changes: 'Every wrong answer lets the rope slip half a pull towards the other side, so careless guessing helps the other team.',
      status: 'playable',
      thumbnail: { hue: 300 },
    },
    settings: { slack: true },
    locked: ['slack'],
  },
  {
    meta: {
      id: 'tug-of-war-heave-ho',
      modeId: 'tug-of-war',
      title: 'Heave Ho',
      tagline: 'Three right in a row and you heave twice as hard.',
      changes: 'Every third correct answer in a row is a heave that pulls the rope twice as far, so a player on a streak moves the knot faster.',
      status: 'playable',
      thumbnail: { hue: 30, accentHue: 200 },
    },
    settings: { heave: true },
    locked: ['heave'],
  },
  {
    meta: {
      id: 'tug-of-war-underdog',
      modeId: 'tug-of-war',
      title: 'Underdog Rope',
      tagline: 'The side that is behind pulls harder.',
      changes: 'Whichever side the knot is leaning away from pulls 50% harder, so a side that falls behind can always fight back.',
      status: 'playable',
      thumbnail: { hue: 130, accentHue: 30 },
    },
    settings: { underdog: true },
    locked: ['underdog'],
  },
  {
    meta: {
      id: 'tug-of-war-final-surge',
      modeId: 'tug-of-war',
      title: 'Final Surge',
      tagline: 'Every pull counts double in the last 30 seconds.',
      changes: 'In the last 30 seconds before time runs out every pull counts double, so a side that is behind can still win it at the end.',
      status: 'playable',
      thumbnail: { hue: 0, accentHue: 45 },
    },
    settings: { surge: true },
    locked: ['surge'],
  },
];
