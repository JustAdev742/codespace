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
  HARMFUL_ACTIONS,
  RULE_ACTIONS,
  RULE_MESSAGES,
  singular,
  type Blueprint,
  type GameRule,
  type GameVar,
  type Rng,
  type RuleAction,
  type RuleTrigger,
} from '@ludora/shared';

/*
 * Random blueprints for the Mode Studio fuzz test. `randomBlueprint` makes one that should pass
 * validation, drawing every part from its whole range; `breakBlueprint` makes one that must not.
 */

const some = <T>(rng: Rng, items: readonly T[], max: number): T[] => rng.shuffle(items).slice(0, rng.int(0, Math.min(max, items.length)));

export function randomBlueprint(rng: Rng, withLogic = true): Blueprint {
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
  const bp: Blueprint = {
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
  // Drawn last, so the parts above come out as they did before rules existed.
  if (withLogic && rng.chance(0.6)) Object.assign(bp, randomLogic(rng, bp));
  return bp;
}

const VAR_NAMES = ['coins', 'keys', 'health', 'stars', 'energy', 'flags', 'rounds', 'shells'];
const GOAL_KINDS = ['race', 'climb', 'collect'];
const UNIT_KINDS = ['race', 'climb', 'collect', 'survive'];

/** Random numbers and rules that pass the check, drawn from the whole catalogue. */
export function randomLogic(rng: Rng, bp: Blueprint): { vars?: GameVar[]; rules: GameRule[] } {
  const unit = bp.unit.toLowerCase();
  const vars: GameVar[] = rng
    .shuffle(VAR_NAMES.filter((n) => n !== unit && n !== singular(unit)))
    .slice(0, rng.int(0, 3))
    .map((name) => {
      const start = rng.int(0, 10);
      return { name, scope: rng.pick(['player', 'player', 'player', 'team', 'game'] as const), start, max: rng.chance(0.5) ? 999 : rng.int(Math.max(1, start), 50) };
    });
  const playerVars = vars.filter((v) => v.scope === 'player');
  const minutes = bp.end.timeLimitSec / 60;
  const cooperative = bp.kind.type === 'build' || bp.end.type === 'together';
  const triggers: RuleTrigger[] = ['start', 'right', 'wrong', 'quick', 'streak', 'miss-streak', 'every', 'reach', 'lead', 'power'];
  if (playerVars.length) triggers.push('runs-out');
  if (GOAL_KINDS.includes(bp.kind.type)) triggers.push('halfway');
  if (bp.pacing === 'rounds') triggers.push('round-start', 'round-end');
  if (minutes > 1) triggers.push('minutes-left');
  const rules: GameRule[] = Array.from({ length: rng.int(1, 8) }, () => {
    const type = rng.pick(triggers);
    const when: GameRule['when'] = { type };
    if (type === 'streak' || type === 'miss-streak') when.n = rng.int(2, 10);
    if (type === 'every') when.n = rng.int(2, 20);
    if (type === 'minutes-left') when.n = rng.int(1, Math.ceil(minutes) - 1);
    if (type === 'reach') {
      when.n = rng.int(1, 30);
      if (playerVars.length && rng.chance(0.5)) when.var = rng.pick(playerVars).name;
    }
    if (type === 'runs-out') when.var = rng.pick(playerVars).name;
    const room = ['start', 'round-start', 'round-end', 'minutes-left'].includes(type);
    const ifs: GameRule['if'] = Array.from({ length: rng.int(0, 2) }, () => {
      const c = rng.pick(['at-least', 'at-most', 'first', 'last', 'team', 'chance', 'minutes-left'] as const);
      if (c === 'at-least' || c === 'at-most') {
        const v = vars.length && rng.chance(0.6) ? rng.pick(vars).name : undefined;
        return v ? { type: c, n: rng.int(0, 20), var: v } : { type: c, n: rng.int(0, 20) };
      }
      if (c === 'team') return { type: c, n: rng.int(1, 4) };
      if (c === 'chance') return { type: c, n: rng.int(1, 99) };
      if (c === 'minutes-left' && minutes > 1) return { type: c, n: rng.int(1, Math.ceil(minutes) - 1) };
      return { type: c === 'minutes-left' ? 'first' : c };
    });
    const actions = RULE_ACTIONS.filter((a: RuleAction) => {
      if (cooperative && HARMFUL_ACTIONS.includes(a)) return false;
      if ((a === 'life' || a === 'lose-life') && bp.kind.type !== 'survive') return false;
      if (a === 'swap-leader' && !UNIT_KINDS.includes(bp.kind.type)) return false;
      if (a === 'win' && (cooperative || room)) return false;
      if ((a === 'add' || a === 'take' || a === 'set') && !vars.length) return false;
      // Ending the game is allowed but rare, so most games run their course.
      if ((a === 'end' || a === 'win') && rng.chance(0.85)) return false;
      return true;
    });
    const dos: GameRule['do'] = Array.from({ length: rng.int(1, 3) }, () => {
      const a = rng.pick(actions);
      if (a === 'gain' || a === 'lose' || a === 'everyone-gain' || a === 'behind-gain' || a === 'ahead-lose' || a === 'leader-lose') return { type: a, n: rng.int(1, 10) };
      if (a === 'add' || a === 'take') return { type: a, n: rng.int(1, 100), var: rng.pick(vars).name };
      if (a === 'set') return { type: a, n: rng.int(0, 60), var: rng.pick(vars).name };
      if (a === 'power') return { type: a, power: rng.pick(POWER_UPS.filter((p) => !(cooperative && ACTS_ON_OTHERS_POWERS.includes(p)))) };
      if (a === 'say') return { type: a, message: rng.pick(RULE_MESSAGES) };
      return { type: a };
    });
    return { when, if: ifs, do: dos };
  });
  return vars.length ? { vars, rules } : { rules };
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
  { what: 'a rule using a number the game does not have', path: 'rules.0', apply: (bp) => ({ ...bp, vars: [], rules: [{ when: { type: 'right' }, if: [], do: [{ type: 'add', n: 1, var: 'gold' }] }] }) },
  { what: 'too many rules', path: 'rules', apply: (bp) => ({ ...bp, rules: Array.from({ length: 40 }, () => ({ when: { type: 'right' }, if: [], do: [{ type: 'gain', n: 1 }] })) }) },
  { what: 'a huge rule amount', path: 'rules.0', apply: (bp) => ({ ...bp, rules: [{ when: { type: 'right' }, if: [], do: [{ type: 'gain', n: 500 }] }] }) },
  { what: 'an unknown rule action', path: 'rules.0.do.0.type', apply: (bp) => ({ ...bp, rules: [{ when: { type: 'right' }, if: [], do: [{ type: 'run-code', n: 1 }] }] }) },
  { what: 'a rule with code in it', path: 'rules.0', apply: (bp) => ({ ...bp, rules: [{ when: { type: 'right' }, if: [], do: [{ type: 'gain', n: 1, script: 'alert(1)' }] }] }) },
  { what: 'a message of its own', path: 'rules.0', apply: (bp) => ({ ...bp, rules: [{ when: { type: 'right' }, if: [], do: [{ type: 'say', message: 'You are rubbish' }] }] }) },
  { what: 'a rule that never stops', path: 'rules.0', apply: (bp) => ({ ...bp, rules: [{ when: { type: 'every', n: 0 }, if: [], do: [{ type: 'gain', n: 1 }] }] }) },
  { what: 'a rude number name', path: 'vars.0.name', apply: (bp) => ({ ...bp, vars: [{ name: 'crap', scope: 'player', start: 0, max: 10 }] }) },
  { what: 'too many numbers', path: 'vars', apply: (bp) => ({ ...bp, vars: ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg'].map((name) => ({ name, scope: 'player', start: 0, max: 10 })) }) },
  { what: 'a rule acting on others in a game played together', path: 'rules.0', apply: (bp) => ({ ...bp, kind: { type: 'build', target: 50, twist: false }, end: { ...bp.end, type: 'together' }, extras: { ...bp.extras, powers: [] }, look: { ...bp.look, dimension: '2d' }, rules: [{ when: { type: 'right' }, if: [], do: [{ type: 'leader-lose', n: 2 }] }] }) },
];
