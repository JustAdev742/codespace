import {
  ACTS_ON_OTHERS_POWERS,
  BLUEPRINT_EVENTS,
  BLUEPRINT_KINDS,
  BOARD_STYLES,
  GAME_GLYPHS,
  KIND_INFO,
  KINDS_3D,
  POWER_UPS,
  SCENE_CAMERAS,
  SCENE_PLACES,
  SCENE_PROPS,
  SCENE_SHAPES,
  SCENE_TIMES,
  type Blueprint,
  type Rng,
} from '@ludora/shared';

/*
 * Random blueprints for the Mode Studio fuzz test. `randomBlueprint` makes one that should pass
 * validation, drawing every part from its whole range; `breakBlueprint` makes one that must not.
 */

const some = <T>(rng: Rng, items: readonly T[], max: number): T[] => rng.shuffle(items).slice(0, rng.int(0, Math.min(max, items.length)));

export function randomBlueprint(rng: Rng): Blueprint {
  const type = rng.pick(BLUEPRINT_KINDS);
  const info = KIND_INFO[type];
  const sizeVal = rng.int(info.size.min, info.size.max);
  const kind = { type, [info.size.key]: sizeVal, twist: rng.chance(0.5) } as Blueprint['kind'];
  const ending = rng.pick(info.endings);
  const rule = rng.pick(['points', 'steady', 'chance'] as const);
  const outcomes =
    rule === 'chance'
      ? Array.from({ length: rng.int(2, 4) }, (_, i) => ({ label: `Prize ${i + 1}`, weight: rng.int(1, 10), amount: i === 0 ? rng.int(1, 10) : rng.int(0, 10) }))
      : [];
  const cooperative = type === 'build' || ending === 'together';
  const powers = some(rng, POWER_UPS.filter((p) => !(cooperative && ACTS_ON_OTHERS_POWERS.includes(p))), 5);
  return {
    v: 1,
    name: `Fuzz game ${rng.int(1, 9999)}`,
    unit: rng.pick(['steps', 'coins', 'stars', 'points', 'bricks']),
    goal: rng.chance(0.5) ? 'Win the game.' : '',
    howTo: some(rng, ['Answer to move.', 'Be quick.', 'Watch the board.', 'Help your team.'], 4),
    pacing: rng.pick(['rounds', 'own-pace'] as const),
    kind,
    answer: { rule, right: rng.int(1, 10), wrong: rng.int(0, 5), speed: rng.int(0, 5), streak: rng.int(0, 5), outcomes },
    extras: { powers, powerEvery: rng.int(2, 8), events: some(rng, BLUEPRINT_EVENTS, 2) },
    end: { type: ending, timeLimitSec: rng.int(60, 900), questions: rng.int(5, 50), questionTimeSec: rng.int(5, 60) },
    look: {
      style: rng.pick(BOARD_STYLES),
      hue: rng.int(0, 359),
      accent: rng.int(0, 359),
      dimension: KINDS_3D.includes(type) && rng.chance(0.5) ? '3d' : '2d',
      scene: { place: rng.pick(SCENE_PLACES), shape: rng.pick(SCENE_SHAPES), props: some(rng, SCENE_PROPS, 4), camera: rng.pick(SCENE_CAMERAS), time: rng.pick(SCENE_TIMES) },
    },
    cover: { glyph: rng.pick(GAME_GLYPHS), hue: rng.int(0, 359) },
  };
}

/** One way of breaking a blueprint, and the part of the builder it breaks. */
export const BREAKERS: readonly { what: string; path: string; apply: (bp: Blueprint) => unknown }[] = [
  { what: 'no name', path: 'name', apply: (bp) => ({ ...bp, name: '' }) },
  { what: 'a rude name', path: 'name', apply: (bp) => ({ ...bp, name: 'Sh1t race' }) },
  { what: 'a long unit', path: 'unit', apply: (bp) => ({ ...bp, unit: 'x'.repeat(40) }) },
  { what: 'a huge track', path: 'kind.length', apply: (bp) => ({ ...bp, kind: { type: 'race', length: 5000, twist: false } }) },
  { what: 'an unknown kind', path: 'kind', apply: (bp) => ({ ...bp, kind: { type: 'maze', size: 3 } }) },
  { what: 'no time limit', path: 'end.timeLimitSec', apply: (bp) => ({ ...bp, end: { ...bp.end, timeLimitSec: 0 } }) },
  { what: 'endless questions', path: 'end.questions', apply: (bp) => ({ ...bp, end: { ...bp.end, questions: 100000 } }) },
  { what: 'a fractional gain', path: 'answer.right', apply: (bp) => ({ ...bp, answer: { ...bp.answer, right: 2.5 } }) },
  { what: 'a gain as text', path: 'answer.right', apply: (bp) => ({ ...bp, answer: { ...bp.answer, right: '9999' } }) },
  { what: 'too many power-ups', path: 'extras.powers', apply: (bp) => ({ ...bp, extras: { ...bp.extras, powers: ['double', 'double'] } }) },
  { what: 'an unknown power-up', path: 'extras.powers', apply: (bp) => ({ ...bp, extras: { ...bp.extras, powers: ['chaos'] } }) },
  { what: 'one surprise', path: 'answer.outcomes', apply: (bp) => ({ ...bp, answer: { ...bp.answer, rule: 'chance', outcomes: [{ label: 'Only', weight: 1, amount: 2 }] } }) },
  { what: 'empty surprises', path: 'answer.outcomes', apply: (bp) => ({ ...bp, answer: { ...bp.answer, rule: 'chance', outcomes: [{ label: 'Nil', weight: 1, amount: 0 }, { label: 'Zip', weight: 1, amount: 0 }] } }) },
  { what: 'last standing in a race', path: 'end.type', apply: (bp) => ({ ...bp, kind: { type: 'race', length: 20, twist: false }, end: { ...bp.end, type: 'last' } }) },
  { what: 'freeze in a tower', path: 'extras.powers', apply: (bp) => ({ ...bp, kind: { type: 'build', target: 50, twist: false }, end: { ...bp.end, type: 'together' }, extras: { ...bp.extras, powers: ['freeze'] } }) },
  { what: '3D territory', path: 'look.dimension', apply: (bp) => ({ ...bp, kind: { type: 'territory', grid: 5, twist: false }, end: { ...bp.end, type: 'most' }, look: { ...bp.look, dimension: '3d' } }) },
  { what: 'a reward setting', path: '', apply: (bp) => ({ ...bp, rewards: { sparks: 9999 } }) },
  { what: 'code in the words', path: 'name', apply: (bp) => ({ ...bp, name: { toString: 'alert(1)' } }) },
  { what: 'an old version', path: 'v', apply: (bp) => ({ ...bp, v: 2 }) },
  { what: 'a giant blueprint', path: '', apply: (bp) => ({ ...bp, howTo: Array.from({ length: 200 }, () => 'x'.repeat(80)) }) },
];
