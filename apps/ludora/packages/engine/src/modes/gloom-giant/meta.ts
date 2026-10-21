import type { ModeMeta, SettingField } from '@ludora/shared';
import type { ModeVariant } from '../../sdk/types.ts';

export const meta: ModeMeta = {
  id: 'gloom-giant',
  title: 'Gloom Giant',
  tagline: 'The whole room against one giant. Answer right to hit it, answer wrong and it hits back.',
  description:
    'Everyone teams up to bring down the Gloom Giant. Every correct answer strikes it, streaks and lucky critical hits strike harder, but every wrong answer lets the giant smash the shield you all share. Bring its health to zero before the shield breaks or time runs out, and the whole room wins together.',
  category: 'party',
  pacing: 'self',
  players: { min: 1, max: 200, recommended: '4 to 60' },
  duration: { min: 1, max: 5 },
  difficulty: 1,
  teams: 'none',
  questionTypes: ['mcq', 'multi', 'truefalse', 'short', 'numeric', 'order', 'match'],
  minQuestions: 5,
  common: { fields: ['timeLimitSec'], defaults: { timeLimitSec: 300 } },
  rules: [
    'The giant has 12 health for every player. It grows if someone joins late.',
    'A correct answer deals 1 damage, plus 1 on a streak of three or more, plus 1 on a lucky critical hit (1 in 10).',
    'A wrong answer lets the giant strike the shared shield for 1. Below half health it is enraged and strikes for 2.',
    'The shield starts at 5, plus 3 for every player. Hosts can make it thinner.',
    'Bring the giant down to zero and everyone wins. If the shield breaks or time runs out, everyone loses.',
    'The results rank players by the damage they dealt.',
  ],
  thumbnail: { glyph: 'ghost', hue: 262, accentHue: 330 },
  status: 'playable',
  tags: ['co-operative', 'boss battle', 'projector', 'self-paced'],
  accessibility: ['Health and shield are written as numbers as well as drawn as bars.', 'Hits and strikes are listed as text on the big screen.'],
};

export const settings: SettingField[] = [
  { kind: 'number', key: 'hpPerPlayer', label: 'Giant health per player', min: 4, max: 40, step: 1, default: 12 },
  {
    kind: 'number',
    key: 'shieldBase',
    label: 'Starting shield',
    help: 'Before the extra shield for the size of the room.',
    min: 1,
    max: 30,
    step: 1,
    default: 5,
  },
  {
    kind: 'select',
    key: 'shieldPerPlayer',
    label: 'Extra shield for the size of the room',
    help: 'Big rooms make more wrong answers. A sturdier shield gives a big class a fair chance.',
    options: [
      { value: 'half', label: '1 for every two players' },
      { value: '1', label: '1 per player' },
      { value: '2', label: '2 per player' },
      { value: '3', label: '3 per player' },
    ],
    // Simulated rooms almost never won with less: at 80% accuracy, 12 players won 0% with half a shield per player and about 85% with 3.
    default: '3',
  },
  { kind: 'toggle', key: 'regen', label: 'Healing giant', help: 'Every 15 seconds the giant heals 1 health for every player.', default: false },
  { kind: 'toggle', key: 'mending', label: 'Shield mending', help: 'Every fifth correct answer in a row mends the shield by 1, up to its starting strength.', default: false },
  { kind: 'toggle', key: 'swift', label: 'Swift strikes', help: 'A correct answer within 6 seconds is a critical hit, and there are no lucky ones.', default: false },
];

export const variants: ModeVariant[] = [
  {
    meta: {
      id: 'gloom-giant-hard',
      modeId: 'gloom-giant',
      title: 'Gloom Titan',
      tagline: 'A tougher giant and a thinner shield.',
      changes: 'The giant has 16 health for every player instead of 12, and the shield starts at 3 instead of 5. The extra shield for the size of the room is the same.',
      status: 'playable',
      thumbnail: { hue: 345, accentHue: 270 },
    },
    settings: { hpPerPlayer: 16, shieldBase: 3 },
    locked: ['hpPerPlayer', 'shieldBase'],
  },
  {
    meta: {
      id: 'gloom-giant-quick',
      modeId: 'gloom-giant',
      title: 'Gloom Skirmish',
      tagline: 'A smaller giant, three minutes on the clock.',
      changes: 'The giant has 8 health for every player instead of 12, and the room has three minutes to bring it down.',
      status: 'playable',
      thumbnail: { hue: 210, accentHue: 50 },
    },
    settings: { hpPerPlayer: 8 },
    common: { timeLimitSec: 180 },
    locked: ['hpPerPlayer', 'timeLimitSec'],
  },
  {
    meta: {
      id: 'gloom-giant-healing',
      modeId: 'gloom-giant',
      title: 'Healing Gloom',
      tagline: 'The giant heals itself. Keep the hits coming.',
      changes: 'Every 15 seconds the giant heals 1 health for every player in the room, so a slow or hesitant room loses ground it has already won.',
      status: 'playable',
      thumbnail: { hue: 280, accentHue: 140 },
    },
    settings: { regen: true },
    locked: ['regen'],
  },
  {
    meta: {
      id: 'gloom-giant-menders',
      modeId: 'gloom-giant',
      title: 'Glim Menders',
      tagline: 'Long streaks mend the shield.',
      changes: 'Every fifth correct answer in a row mends the team shield by 1, up to the strength it started with, so steady players undo the damage from wrong answers.',
      status: 'playable',
      thumbnail: { glyph: 'shield', hue: 200, accentHue: 280 },
    },
    settings: { mending: true },
    locked: ['mending'],
  },
  {
    meta: {
      id: 'gloom-giant-swift',
      modeId: 'gloom-giant',
      title: 'Swift Strikes',
      tagline: 'Fast answers land critical hits.',
      changes: 'Critical hits are earned, not lucky: a correct answer given within 6 seconds of its question appearing is always a critical hit, and a slower one never is.',
      status: 'playable',
      thumbnail: { glyph: 'sword', hue: 350, accentHue: 50 },
    },
    settings: { swift: true },
    locked: ['swift'],
  },
];
