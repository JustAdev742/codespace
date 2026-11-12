import { z } from 'zod';
import { cleanText, containsBlockedLanguage } from './validation.ts';
import { GAME_GLYPHS } from './games.ts';

/*
 * Mode Studio: a game someone makes is a blueprint, data and never code.
 * It is built only from the parts listed here. One interpreter in the engine
 * (packages/engine/src/modes/made-game) runs any blueprint that passes
 * `parseBlueprint`. Every size and count is capped, every blueprint has a
 * hard time limit (so every game ends), and nothing in a blueprint touches
 * rewards: a made game pays by the ordinary rules for its pacing.
 */

export const BLUEPRINT_VERSION = 1 as const;
/** The engine mode that runs blueprints. Rooms carry the blueprint itself alongside this id. */
export const MADE_GAME_MODE_ID = 'made-game';
/** Most blueprints one account can keep. */
export const MAX_BLUEPRINTS_PER_MAKER = 40;
/** Largest blueprint the server stores, as JSON. */
export const MAX_BLUEPRINT_BYTES = 6000;

export const BLUEPRINT_KINDS = ['race', 'climb', 'collect', 'build', 'territory', 'survive', 'tug'] as const;
export type BlueprintKind = (typeof BLUEPRINT_KINDS)[number];

export const BLUEPRINT_PACINGS = ['rounds', 'own-pace'] as const;
export type BlueprintPacing = (typeof BLUEPRINT_PACINGS)[number];

export const ANSWER_RULES = ['points', 'steady', 'chance'] as const;
export type AnswerRule = (typeof ANSWER_RULES)[number];

export const BLUEPRINT_ENDINGS = ['most', 'first', 'last', 'together'] as const;
export type BlueprintEnding = (typeof BLUEPRINT_ENDINGS)[number];

export const POWER_UPS = ['double', 'shield', 'leap', 'freeze', 'gust'] as const;
export type PowerUp = (typeof POWER_UPS)[number];

export const BLUEPRINT_EVENTS = ['golden', 'rally'] as const;
export type BlueprintEvent = (typeof BLUEPRINT_EVENTS)[number];

export const BOARD_STYLES = ['bold', 'soft', 'striped'] as const;
export const SCENE_PLACES = ['meadow', 'harbour', 'canyon', 'snowfield', 'old-town'] as const;
export const SCENE_SHAPES = ['straight', 'zigzag', 'loop'] as const;
export const SCENE_PROPS = ['trees', 'rocks', 'crates', 'lamps', 'tents', 'flags'] as const;
export const SCENE_CAMERAS = ['follow', 'overview', 'side'] as const;
export const SCENE_TIMES = ['day', 'dusk', 'night'] as const;
export type ScenePlace = (typeof SCENE_PLACES)[number];

/** Kinds with a 3D scene. Every other kind plays on its 2D board. */
export const KINDS_3D: readonly BlueprintKind[] = ['race', 'climb'];

/** Twist and power-up parts that act on another player: always listed on the game's card. */
export const ACTS_ON_OTHERS_POWERS: readonly PowerUp[] = ['freeze', 'gust'];

/* ------------------------------------------------------------------------------------------------ */
/* Plain-language catalogue (no zod: the browser's cards and the studio read this).                  */
/* ------------------------------------------------------------------------------------------------ */

export interface KindInfo {
  label: string;
  /** For sentences: "a race", "a lives game". */
  noun: string;
  /** One line for the picker. */
  blurb: string;
  /** The default name for what a player gathers. */
  unit: string;
  /** The goal's own setting, for the builder. */
  size: { key: string; label: string; min: number; max: number; step: number; default: number };
  twist: { label: string; help: string };
  endings: readonly BlueprintEnding[];
  teams: 'none' | 'optional' | 'required';
  /** Verb phrase for a gain: "moves you 3 steps". */
  gain: (n: number, unit: string) => string;
}

const plural = (n: number, unit: string) => `${n} ${n === 1 ? singular(unit) : unit}`;

/** "steps" to "step" for one of them. Words that do not end in s are left alone. */
export function singular(unit: string): string {
  if (/ies$/i.test(unit) && unit.length > 4) return unit.slice(0, -3) + 'y';
  if (/[^s]s$/i.test(unit)) return unit.slice(0, -1);
  return unit;
}

export function amountOf(n: number, unit: string): string {
  return plural(n, unit);
}

export const KIND_INFO: Record<BlueprintKind, KindInfo> = {
  race: {
    label: 'Race',
    noun: 'race',
    blurb: 'Everyone races along a track to the finish.',
    unit: 'steps',
    size: { key: 'length', label: 'Track length', min: 10, max: 60, step: 1, default: 25 },
    twist: { label: 'Shortcuts', help: 'Some spaces are shortcuts: land on one and jump 3 spaces ahead.' },
    endings: ['first', 'most'],
    teams: 'optional',
    gain: (n, u) => `moves you ${plural(n, u)}`,
  },
  climb: {
    label: 'Climb',
    noun: 'climb',
    blurb: 'Climb a mountain. Wrong answers can make you slip.',
    unit: 'metres',
    size: { key: 'height', label: 'Height of the climb', min: 10, max: 60, step: 1, default: 30 },
    twist: { label: 'Ledges', help: 'A ledge every 5 metres: once you reach one, you never slip below it.' },
    endings: ['first', 'most'],
    teams: 'optional',
    gain: (n, u) => `climbs you ${plural(n, u)}`,
  },
  collect: {
    label: 'Collect',
    noun: 'collecting game',
    blurb: 'Open squares on your own grid to find gems.',
    unit: 'gems',
    size: { key: 'goal', label: 'Gems to win', min: 5, max: 60, step: 1, default: 20 },
    twist: { label: 'Traps', help: 'Some squares hide a trap that takes a gem away.' },
    endings: ['first', 'most'],
    teams: 'optional',
    gain: (n) => `gives you ${n === 1 ? '1 square' : `${n} squares`} to open`,
  },
  build: {
    label: 'Build together',
    noun: 'tower game',
    blurb: 'The whole room builds one tower together.',
    unit: 'bricks',
    size: { key: 'target', label: 'Bricks to finish the tower', min: 10, max: 400, step: 5, default: 120 },
    twist: { label: 'Wind', help: 'Every wrong answer blows one brick off the tower.' },
    endings: ['together', 'most'],
    teams: 'none',
    gain: (n, u) => `adds ${plural(n, u)} to the tower`,
  },
  territory: {
    label: 'Territory',
    noun: 'territory game',
    blurb: 'Claim squares on a shared map and hold on to them.',
    unit: 'squares',
    size: { key: 'grid', label: 'Map size (squares a side)', min: 4, max: 8, step: 1, default: 6 },
    twist: { label: 'Steal', help: 'When the map is full, a claim takes a square from the leader.' },
    endings: ['most'],
    teams: 'optional',
    gain: (n, u) => `claims ${plural(n, u)}`,
  },
  survive: {
    label: 'Lives',
    noun: 'lives game',
    blurb: 'Keep your lives: a wrong answer costs one.',
    unit: 'points',
    size: { key: 'lives', label: 'Lives', min: 1, max: 5, step: 1, default: 3 },
    twist: { label: 'Second chance', help: 'Five right answers in a row win back a lost life.' },
    endings: ['last', 'most'],
    teams: 'optional',
    gain: (n, u) => `scores ${plural(n, u)}`,
  },
  tug: {
    label: 'Team tug',
    noun: 'tug of war',
    blurb: 'Two teams pull a rope. Pull the marker to your side.',
    unit: 'pulls',
    size: { key: 'rope', label: 'Rope length to win', min: 5, max: 40, step: 1, default: 15 },
    twist: { label: 'Surge', help: 'Three right answers in a row pull twice as hard.' },
    endings: ['first', 'most'],
    teams: 'required',
    gain: (n, u) => `pulls the rope ${plural(n, u)} your way`,
  },
};

export const ENDING_INFO: Record<BlueprintEnding, { label: string; help: string }> = {
  most: { label: 'Most when time runs out', help: 'Whoever has the most when time or the questions run out wins.' },
  first: { label: 'First to the goal', help: 'The first to reach the goal wins and the game ends.' },
  last: { label: 'Last one standing', help: 'Players are out when their lives run out. The last one in wins.' },
  together: { label: 'Everyone together', help: 'The whole room wins together if it reaches the goal in time.' },
};

export const POWER_INFO: Record<PowerUp, { label: string; help: string; others: boolean }> = {
  double: { label: 'Double', help: 'Your next right answer counts twice.', others: false },
  shield: { label: 'Shield', help: 'Your next wrong answer costs you nothing.', others: false },
  leap: { label: 'Leap', help: 'Gain 2 straight away.', others: false },
  freeze: { label: 'Freeze', help: 'The leader gains nothing from their next right answer.', others: true },
  gust: { label: 'Gust', help: 'Everyone ahead of you loses 1.', others: true },
};

export const EVENT_INFO: Record<BlueprintEvent, { label: string; help: string }> = {
  golden: { label: 'Golden round', help: 'Every gain counts double for a while.' },
  rally: { label: 'Rally', help: 'Players in the back half get 1 extra for each right answer for a while.' },
};

export const PLACE_INFO: Record<ScenePlace, { label: string }> = {
  meadow: { label: 'Meadow' },
  harbour: { label: 'Harbour' },
  canyon: { label: 'Canyon' },
  snowfield: { label: 'Snowfield' },
  'old-town': { label: 'Old town' },
};

/* ------------------------------------------------------------------------------------------------ */
/* The schema.                                                                                      */
/* ------------------------------------------------------------------------------------------------ */

const filtered = (min: number, max: number, what: string) =>
  z
    .string()
    .transform((s) => cleanText(s))
    .pipe(
      z
        .string()
        .min(min, min > 0 ? `${what.charAt(0).toUpperCase()}${what.slice(1)} needs at least ${min} characters.` : undefined)
        .max(max, `Keep ${what} to ${max} characters or fewer.`)
        .refine((s) => !containsBlockedLanguage(s), `Reword ${what}: some of it is not allowed.`),
    );

const int = (min: number, max: number, what: string) =>
  z
    .number({ error: `${what} must be a number.` })
    .int(`${what} must be a whole number.`)
    .min(min, `${what} must be at least ${min}.`)
    .max(max, `${what} must be at most ${max}.`);

const uniqueList = <T extends string>(values: readonly [T, ...T[]], max: number, what: string) =>
  z
    .array(z.enum(values))
    .max(max, `Choose at most ${max} ${what}.`)
    .refine((a) => new Set(a).size === a.length, `Choose each of the ${what} only once.`);

const kindSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('race'), length: int(10, 60, 'Track length'), twist: z.boolean() }),
  z.object({ type: z.literal('climb'), height: int(10, 60, 'Height'), twist: z.boolean() }),
  z.object({ type: z.literal('collect'), goal: int(5, 60, 'Gems to win'), twist: z.boolean() }),
  z.object({ type: z.literal('build'), target: int(10, 400, 'Bricks to finish'), twist: z.boolean() }),
  z.object({ type: z.literal('territory'), grid: int(4, 8, 'Map size'), twist: z.boolean() }),
  z.object({ type: z.literal('survive'), lives: int(1, 5, 'Lives'), twist: z.boolean() }),
  z.object({ type: z.literal('tug'), rope: int(5, 40, 'Rope length'), twist: z.boolean() }),
]);

const outcomeSchema = z.object({
  label: filtered(2, 20, 'each surprise’s name'),
  weight: int(1, 10, 'Each surprise’s chance'),
  amount: int(0, 10, 'Each surprise’s amount'),
});

export const blueprintSchema = z.object({
  v: z.literal(BLUEPRINT_VERSION),
  name: filtered(3, 40, 'the name'),
  /** What players gather, in the plural ("steps", "coins"). */
  unit: filtered(2, 16, 'the name for points'),
  /** The goal in one sentence. */
  goal: filtered(0, 120, 'the goal'),
  howTo: z.array(filtered(3, 90, 'each how-to-play line')).max(4, 'Write at most 4 how-to-play lines.'),
  pacing: z.enum(BLUEPRINT_PACINGS),
  kind: kindSchema,
  answer: z.object({
    rule: z.enum(ANSWER_RULES),
    right: int(1, 10, 'A right answer’s gain'),
    wrong: int(0, 5, 'A wrong answer’s cost'),
    speed: int(0, 5, 'The quick-answer bonus'),
    streak: int(0, 5, 'The streak bonus'),
    outcomes: z.array(outcomeSchema).max(4, 'Have at most 4 surprises.'),
  }),
  extras: z.object({
    powers: uniqueList(POWER_UPS, 5, 'power-ups'),
    powerEvery: int(2, 8, 'Right answers per power-up'),
    events: uniqueList(BLUEPRINT_EVENTS, 2, 'events'),
  }),
  end: z.object({
    type: z.enum(BLUEPRINT_ENDINGS),
    timeLimitSec: int(60, 900, 'The time limit'),
    questions: int(5, 50, 'The number of questions'),
    questionTimeSec: int(5, 60, 'Time per question'),
  }),
  look: z.object({
    style: z.enum(BOARD_STYLES),
    hue: int(0, 359, 'Colour'),
    accent: int(0, 359, 'Second colour'),
    dimension: z.enum(['2d', '3d']),
    scene: z.object({
      place: z.enum(SCENE_PLACES),
      shape: z.enum(SCENE_SHAPES),
      props: uniqueList(SCENE_PROPS, 4, 'props'),
      camera: z.enum(SCENE_CAMERAS),
      time: z.enum(SCENE_TIMES),
    }),
  }),
  cover: z.object({ glyph: z.enum(GAME_GLYPHS), hue: int(0, 359, 'Cover colour') }),
}).strict();
export type Blueprint = z.infer<typeof blueprintSchema>;
export type BlueprintInput = z.input<typeof blueprintSchema>;

export interface BlueprintProblem {
  /** Where in the builder: "kind", "answer.outcomes", "end.type", "look.dimension". */
  path: string;
  message: string;
}

export type BlueprintParse = { ok: true; blueprint: Blueprint } | { ok: false; problems: BlueprintProblem[] };

/** The goal number of a blueprint's kind: track length, height, gems, bricks, squares, lives or rope. */
export function kindSize(kind: Blueprint['kind']): number {
  switch (kind.type) {
    case 'race':
      return kind.length;
    case 'climb':
      return kind.height;
    case 'collect':
      return kind.goal;
    case 'build':
      return kind.target;
    case 'territory':
      return kind.grid;
    case 'survive':
      return kind.lives;
    case 'tug':
      return kind.rope;
  }
}

/** Rules that need more than one field. Each message says what to change. */
export function blueprintRuleProblems(bp: Blueprint): BlueprintProblem[] {
  const out: BlueprintProblem[] = [];
  const info = KIND_INFO[bp.kind.type];
  if (!info.endings.includes(bp.end.type)) {
    out.push({
      path: 'end.type',
      message: `A ${info.noun} cannot end with “${ENDING_INFO[bp.end.type].label.toLowerCase()}”. Choose ${info.endings.map((e) => `“${ENDING_INFO[e].label.toLowerCase()}”`).join(' or ')}.`,
    });
  }
  if (bp.answer.rule === 'chance') {
    if (bp.answer.outcomes.length < 2) out.push({ path: 'answer.outcomes', message: 'A surprise needs at least 2 outcomes to choose between. Add another.' });
    if (bp.answer.outcomes.length && bp.answer.outcomes.every((o) => o.amount === 0)) out.push({ path: 'answer.outcomes', message: 'At least one surprise must give something. Give one an amount above 0.' });
  }
  const cooperative = bp.kind.type === 'build' || bp.end.type === 'together';
  const harmful = bp.extras.powers.filter((p) => ACTS_ON_OTHERS_POWERS.includes(p));
  if (cooperative && harmful.length) {
    out.push({ path: 'extras.powers', message: `${harmful.map((p) => POWER_INFO[p].label).join(' and ')} work${harmful.length === 1 ? 's' : ''} against other players, which does not fit a game everyone plays together. Take ${harmful.length === 1 ? 'it' : 'them'} out.` });
  }
  if (bp.look.dimension === '3d' && !KINDS_3D.includes(bp.kind.type)) {
    out.push({ path: 'look.dimension', message: `3D scenes are ready for races and climbs. Choose 2D for a ${info.noun}.` });
  }
  return out;
}

/**
 * Check a blueprint from anywhere (the studio, a saved row, an AI draft). Returns the cleaned
 * blueprint, or every problem in words a maker can act on.
 */
export function parseBlueprint(input: unknown): BlueprintParse {
  if (input && typeof input === 'object') {
    try {
      if (JSON.stringify(input).length > MAX_BLUEPRINT_BYTES) return { ok: false, problems: [{ path: '', message: 'This game is too big to save. Shorten its words.' }] };
    } catch {
      return { ok: false, problems: [{ path: '', message: 'This game could not be read.' }] };
    }
  }
  const r = blueprintSchema.safeParse(input);
  if (!r.success) {
    const problems = r.error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: friendlyIssue(i) }));
    return { ok: false, problems: dedupe(problems) };
  }
  const rules = blueprintRuleProblems(r.data);
  return rules.length ? { ok: false, problems: rules } : { ok: true, blueprint: r.data };
}

function friendlyIssue(i: z.core.$ZodIssue): string {
  // Our own messages are written for people; zod's generic ones are replaced.
  if (i.code === 'custom' || i.code === 'too_small' || i.code === 'too_big' || (i.code === 'invalid_type' && i.message && !i.message.startsWith('Invalid'))) {
    if (i.message && !/^(Invalid|Too (small|big)|Expected)/.test(i.message)) return i.message;
  }
  const where = i.path.map(String).join('.');
  if (i.code === 'unrecognized_keys') return `A made game cannot have ${i.keys.map((k) => `“${k}”`).join(', ')}. Only the parts in the studio can be used.`;
  if (i.code === 'invalid_union' || i.path[0] === 'kind') return 'Choose what the game is about: race, climb, collect, build, territory, lives or tug.';
  if (i.code === 'invalid_value') return `Choose one of the options for ${labelFor(where)}.`;
  return `Check ${labelFor(where)}.`;
}

const PATH_LABELS: Record<string, string> = {
  v: 'the version',
  name: 'the name',
  unit: 'the name for points',
  goal: 'the goal',
  pacing: 'how questions arrive',
  'answer.rule': 'what an answer does',
  'end.type': 'how it ends',
  'look.style': 'the board style',
  'look.dimension': '2D or 3D',
  'look.scene.place': 'the place',
  'look.scene.shape': 'the track shape',
  'look.scene.camera': 'the camera',
  'look.scene.time': 'the time of day',
  'cover.glyph': 'the cover picture',
};

function labelFor(path: string): string {
  if (PATH_LABELS[path]) return PATH_LABELS[path]!;
  const top = path.split('.').slice(0, 2).join('.');
  return PATH_LABELS[top] ?? (path || 'the game');
}

function dedupe(problems: BlueprintProblem[]): BlueprintProblem[] {
  const seen = new Set<string>();
  return problems.filter((p) => {
    const k = `${p.path}|${p.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ------------------------------------------------------------------------------------------------ */
/* Words about a blueprint.                                                                          */
/* ------------------------------------------------------------------------------------------------ */

/** The chance of each surprise, in whole per cent, adding up to 100. */
export function outcomeOdds(outcomes: readonly { weight: number }[]): number[] {
  const total = outcomes.reduce((a, o) => a + o.weight, 0);
  if (!total) return outcomes.map(() => 0);
  const raw = outcomes.map((o) => (o.weight / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floors[i]!++;
    left--;
  }
  return floors;
}

/** Plain sentences for what acts on other players. Empty when nothing does. */
export function actsOnOthers(bp: Blueprint): string[] {
  const out: string[] = [];
  for (const p of bp.extras.powers) if (POWER_INFO[p].others) out.push(`${POWER_INFO[p].label} power-up: ${POWER_INFO[p].help.charAt(0).toLowerCase()}${POWER_INFO[p].help.slice(1)}`);
  if (bp.kind.type === 'territory' && bp.kind.twist) out.push('Steal: when the map is full, a claim takes a square from the leader.');
  return out;
}

function minutes(sec: number): string {
  if (sec % 60 === 0) return sec === 60 ? '1 minute' : `${sec / 60} minutes`;
  return `${Math.floor(sec / 60)} min ${sec % 60} s`;
}

/**
 * The rules in plain words, one sentence per line, as the studio shows them while a maker builds
 * ("First to 30 steps wins. A right answer moves you 3 steps..."). The host's how-to-play uses them too.
 */
export function describeBlueprint(bp: Blueprint): string[] {
  const info = KIND_INFO[bp.kind.type];
  const u = bp.unit;
  const size = kindSize(bp.kind);
  const lines: string[] = [];
  // How it is won.
  switch (bp.end.type) {
    case 'first':
      lines.push(
        bp.kind.type === 'tug'
          ? `The first team to pull the marker ${plural(size, u)} to their side wins.`
          : bp.kind.type === 'collect'
            ? `First to ${plural(size, u)} wins.`
            : `First to ${plural(size, u)} wins.`,
      );
      break;
    case 'most':
      lines.push(bp.kind.type === 'tug' ? 'The team ahead when time or the questions run out wins.' : `Most ${u} when time or the questions run out wins.`);
      break;
    case 'last':
      lines.push(`Everyone starts with ${size === 1 ? '1 life' : `${size} lives`}. The last player still in wins.`);
      break;
    case 'together':
      lines.push(`Everyone wins together by building to ${plural(size, u)} before time runs out.`);
      break;
  }
  // What an answer does.
  const a = bp.answer;
  if (a.rule === 'chance' && a.outcomes.length) {
    const odds = outcomeOdds(a.outcomes);
    lines.push(`A right answer opens a surprise: ${a.outcomes.map((o, i) => `${o.label} (${odds[i]}%, ${o.amount === 0 ? 'nothing' : plural(o.amount, u)})`).join(', ')}.`);
  } else {
    let s = `A right answer ${info.gain(a.right, u)}`;
    const extras: string[] = [];
    if (a.rule === 'points' && a.speed > 0) extras.push(`up to ${a.speed} more for a quick answer`);
    if (a.rule === 'points' && a.streak > 0) extras.push(`1 more for each answer in a row, up to ${a.streak} more`);
    if (extras.length) s += `, plus ${extras.join(' and ')}`;
    lines.push(`${s}.`);
  }
  if (bp.kind.type === 'survive') lines.push(a.wrong > 0 ? `A wrong answer costs a life and ${plural(a.wrong, u)}.` : 'A wrong answer costs a life.');
  else if (bp.kind.type === 'build') {
    if (a.wrong > 0) lines.push(`A wrong answer takes ${plural(a.wrong, u)} off the tower.`);
  } else if (bp.kind.type === 'tug') {
    if (a.wrong > 0) lines.push(`A wrong answer lets the rope slip ${plural(a.wrong, u)} the other way.`);
  } else if (bp.kind.type === 'collect') {
    if (a.wrong > 0) lines.push(`A wrong answer drops ${plural(a.wrong, u)}.`);
  } else if (bp.kind.type === 'territory') {
    if (a.wrong > 0) lines.push(`A wrong answer gives up ${plural(a.wrong, u)}.`);
  } else if (a.wrong > 0) lines.push(`A wrong answer costs ${plural(a.wrong, u)}.`);
  if (bp.kind.type === 'collect') lines.push(`Each square you open on your grid hides up to 3 ${u}.`);
  if (bp.kind.type === 'territory') lines.push(`The map has ${bp.kind.grid * bp.kind.grid} squares.`);
  if (bp.kind.type === 'build' && bp.end.type === 'most') lines.push(`The tower needs ${plural(size, u)}. Whoever adds the most wins.`);
  if (bp.kind.type === 'survive' && bp.end.type === 'most') lines.push(`Everyone starts with ${size === 1 ? '1 life' : `${size} lives`}.`);
  if (bp.kind.twist) lines.push(`${info.twist.label}: ${info.twist.help.charAt(0).toLowerCase()}${info.twist.help.slice(1)}`);
  // Power-ups and events.
  if (bp.extras.powers.length) {
    lines.push(`Every ${bp.extras.powerEvery} right answers earns a power-up, in turn: ${bp.extras.powers.map((p) => `${POWER_INFO[p].label} (${POWER_INFO[p].help.replace(/\.$/, '').toLowerCase()})`).join(', ')}.`);
  }
  if (bp.extras.events.length) {
    const when = bp.pacing === 'rounds' ? 'Every fourth question' : 'Every minute, for 20 seconds,';
    lines.push(`${when} brings ${bp.extras.events.map((e) => `a ${EVENT_INFO[e].label.toLowerCase()} (${EVENT_INFO[e].help.replace(/ for a while\.$/, '').replace(/\.$/, '').toLowerCase()})`).join(' or ')}.`);
  }
  // How questions arrive and how long it lasts.
  lines.push(
    bp.pacing === 'rounds'
      ? `Everyone answers the same question at the same time: up to ${bp.end.questions} questions, ${bp.end.questionTimeSec} seconds each.`
      : `Everyone answers at their own pace, up to ${bp.end.questions} questions each.`,
  );
  lines.push(`The game lasts at most ${minutes(bp.end.timeLimitSec)}.`);
  if (bp.kind.type === 'tug') lines.push('Played in teams.');
  return lines;
}

/** One line for a card. */
export function blueprintTagline(bp: Blueprint): string {
  return bp.goal || describeBlueprint(bp)[0]!;
}

/* ------------------------------------------------------------------------------------------------ */
/* Starting points.                                                                                  */
/* ------------------------------------------------------------------------------------------------ */

const LOOK = { style: 'bold', hue: 210, accent: 45, dimension: '2d', scene: { place: 'meadow', shape: 'zigzag', props: ['trees', 'rocks'], camera: 'follow', time: 'day' } } as const;

function bp(p: Omit<Blueprint, 'v' | 'look'> & { look?: Partial<Blueprint['look']> }): Blueprint {
  return JSON.parse(JSON.stringify({ v: BLUEPRINT_VERSION, ...p, look: { ...LOOK, ...p.look } })) as Blueprint;
}

const ANSWER: Blueprint['answer'] = { rule: 'steady', right: 2, wrong: 0, speed: 0, streak: 0, outcomes: [] };
const EXTRAS: Blueprint['extras'] = { powers: [], powerEvery: 4, events: [] };
const END: Blueprint['end'] = { type: 'most', timeLimitSec: 300, questions: 20, questionTimeSec: 20 };

/** The gallery's starting points: each a complete game that plays as it is. */
export const STARTER_BLUEPRINTS: readonly { id: string; blueprint: Blueprint }[] = [
  {
    id: 'meadow-dash',
    blueprint: bp({
      name: 'Meadow dash',
      unit: 'steps',
      goal: 'Race across the meadow to the finish flag.',
      howTo: ['Answer to move.', 'Quick answers move you further.'],
      pacing: 'own-pace',
      kind: { type: 'race', length: 30, twist: true },
      answer: { ...ANSWER, rule: 'points', right: 2, speed: 2, streak: 0, outcomes: [] },
      extras: { ...EXTRAS, powers: ['double', 'leap'], powerEvery: 4, events: [] },
      end: { ...END, type: 'first', timeLimitSec: 300, questions: 40 },
      look: { dimension: '3d', hue: 140, accent: 45, scene: { place: 'meadow', shape: 'zigzag', props: ['trees', 'flags'], camera: 'follow', time: 'day' } },
      cover: { glyph: 'flag', hue: 140 },
    }),
  },
  {
    id: 'canyon-climb',
    blueprint: bp({
      name: 'Canyon climb',
      unit: 'metres',
      goal: 'Climb the canyon wall. Do not slip.',
      howTo: ['Right answers climb.', 'Wrong answers slip you down.'],
      pacing: 'rounds',
      kind: { type: 'climb', height: 24, twist: true },
      answer: { ...ANSWER, rule: 'points', right: 2, wrong: 1, speed: 1, streak: 2, outcomes: [] },
      extras: { ...EXTRAS, powers: ['shield'], powerEvery: 3, events: ['golden'] },
      end: { ...END, type: 'first', questions: 20, questionTimeSec: 20, timeLimitSec: 600 },
      look: { dimension: '3d', hue: 25, accent: 200, scene: { place: 'canyon', shape: 'zigzag', props: ['rocks', 'flags'], camera: 'side', time: 'dusk' } },
      cover: { glyph: 'mountain', hue: 25 },
    }),
  },
  {
    id: 'gem-hunt',
    blueprint: bp({
      name: 'Gem hunt',
      unit: 'gems',
      goal: 'Open squares on your grid and find the most gems.',
      howTo: ['Each right answer lets you open a square.', 'Some squares hold more gems than others.'],
      pacing: 'own-pace',
      kind: { type: 'collect', goal: 20, twist: false },
      answer: { ...ANSWER, rule: 'steady', right: 1 },
      extras: { ...EXTRAS, powers: ['double'], powerEvery: 4, events: ['rally'] },
      end: { ...END, type: 'most', timeLimitSec: 300, questions: 30 },
      look: { style: 'soft', hue: 280, accent: 170 },
      cover: { glyph: 'chest', hue: 280 },
    }),
  },
  {
    id: 'tower-team',
    blueprint: bp({
      name: 'Tower of the class',
      unit: 'bricks',
      goal: 'Build the tower together before the bell.',
      howTo: ['Every right answer adds bricks to one tower.', 'The whole class wins together.'],
      pacing: 'rounds',
      kind: { type: 'build', target: 60, twist: true },
      answer: { ...ANSWER, rule: 'points', right: 2, speed: 1, streak: 1 },
      extras: { ...EXTRAS, powers: ['double', 'leap'], powerEvery: 3, events: ['golden'] },
      end: { ...END, type: 'together', questions: 15, questionTimeSec: 20, timeLimitSec: 600 },
      look: { style: 'striped', hue: 45, accent: 210 },
      cover: { glyph: 'castle', hue: 45 },
    }),
  },
  {
    id: 'island-claim',
    blueprint: bp({
      name: 'Island claim',
      unit: 'squares',
      goal: 'Hold the most of the island when time is up.',
      howTo: ['Right answers claim squares next to yours.', 'When the island is full, claims steal from the leader.'],
      pacing: 'own-pace',
      kind: { type: 'territory', grid: 6, twist: true },
      answer: { ...ANSWER, rule: 'chance', right: 1, outcomes: [{ label: 'One square', weight: 6, amount: 1 }, { label: 'Two squares', weight: 3, amount: 2 }, { label: 'Big claim', weight: 1, amount: 4 }] },
      extras: { ...EXTRAS, powers: ['gust'], powerEvery: 5 },
      end: { ...END, type: 'most', timeLimitSec: 240, questions: 30 },
      look: { style: 'bold', hue: 190, accent: 30 },
      cover: { glyph: 'map', hue: 190 },
    }),
  },
  {
    id: 'three-lives',
    blueprint: bp({
      name: 'Three lives',
      unit: 'points',
      goal: 'Keep your lives. The last one in wins.',
      howTo: ['A wrong answer costs a life.', 'Five right in a row wins one back.'],
      pacing: 'rounds',
      kind: { type: 'survive', lives: 3, twist: true },
      answer: { ...ANSWER, rule: 'points', right: 3, speed: 2, streak: 0 },
      extras: { ...EXTRAS, powers: ['shield'], powerEvery: 4 },
      end: { ...END, type: 'last', questions: 25, questionTimeSec: 15, timeLimitSec: 600 },
      look: { style: 'bold', hue: 350, accent: 45 },
      cover: { glyph: 'heart', hue: 350 },
    }),
  },
  {
    id: 'rope-pull',
    blueprint: bp({
      name: 'Rope pull',
      unit: 'pulls',
      goal: 'Pull the marker over to your team’s side.',
      howTo: ['Every right answer pulls for your team.', 'Three in a row pull twice as hard.'],
      pacing: 'own-pace',
      kind: { type: 'tug', rope: 15, twist: true },
      answer: { ...ANSWER, rule: 'steady', right: 1 },
      extras: { ...EXTRAS },
      end: { ...END, type: 'first', timeLimitSec: 240, questions: 40 },
      look: { style: 'striped', hue: 10, accent: 210 },
      cover: { glyph: 'shield', hue: 10 },
    }),
  },
];

/** A blank game: the smallest complete blueprint, for "start from nothing". */
export function blankBlueprint(): Blueprint {
  return bp({
    name: 'My game',
    unit: 'points',
    goal: '',
    howTo: [],
    pacing: 'rounds',
    kind: { type: 'race', length: 20, twist: false },
    answer: { ...ANSWER, outcomes: [] },
    extras: { powers: [], powerEvery: 4, events: [] },
    end: { ...END },
    cover: { glyph: 'spark', hue: 210 },
  });
}

/** The size key, twist and default unit change with the kind; keep everything else the maker chose. */
export function withKind(prev: Blueprint, type: BlueprintKind): Blueprint {
  const info = KIND_INFO[type];
  const kind = { type, [info.size.key]: info.size.default, twist: false } as Blueprint['kind'];
  const oldDefault = KIND_INFO[prev.kind.type].unit;
  const next: Blueprint = { ...prev, kind, unit: prev.unit === oldDefault ? info.unit : prev.unit };
  if (!info.endings.includes(next.end.type)) next.end = { ...next.end, type: info.endings[0]! };
  if (next.look.dimension === '3d' && !KINDS_3D.includes(type)) next.look = { ...next.look, dimension: '2d' };
  if (type === 'build' || next.end.type === 'together') next.extras = { ...next.extras, powers: next.extras.powers.filter((p) => !POWER_INFO[p].others) };
  return next;
}
