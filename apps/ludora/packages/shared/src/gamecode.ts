import {
  BLUEPRINT_KINDS,
  BOARD_STYLES,
  KIND_INFO,
  POWER_UPS,
  SCENE_PLACES,
  SCENE_PROPS,
  SCENE_SHAPES,
  SCENE_TIMES,
  STARTER_BLUEPRINTS,
  blankBlueprint,
  kindSize,
  normaliseBlueprint,
  parseBlueprint,
  type Blueprint,
  type BlueprintKind,
  type BlueprintProblem,
} from './blueprint.ts';
import { GAME_GLYPHS } from './games.ts';
import {
  MAX_RULE_DOS,
  RULE_MESSAGES,
  ROOM_TRIGGERS,
  VAR_MAX,
  type GameRule,
  type GameVar,
  type RuleDo,
  type RuleIf,
  type RuleWhen,
  type VarScope,
} from './gamerules.ts';

/*
 * Game code: the Game Maker's own small language. One statement a line, read like a sentence,
 * forgiving about capitals and spacing, with comments after #. It is never run: `fromCode` reads
 * it into a blueprint, which `parseBlueprint` checks like any other, and the made-game interpreter
 * plays. `toCode` writes any blueprint as code, and reading that back gives the same blueprint
 * (in its plain form, `normaliseBlueprint`). Problems name their line, say what is wrong in words
 * and offer the nearest thing that would work.
 *
 *   game "Meadow dash"
 *   race to 30 steps
 *   questions: own pace, 40 each, 20 seconds each
 *   right answer: move 2 steps
 *   when a player gets 3 right in a row: gain 2 steps
 */

/* ---------------------------------------------------------------------------------------------- */
/* Words.                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, no: 0, none: 0, one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, hundred: 100,
};

/** A whole number from digits or a word ("3", "three"). */
function num(word: string | undefined): number | null {
  if (word === undefined) return null;
  const w = word.toLowerCase().replace(/[.,;:!)]+$/, '');
  if (/^-?\d+$/.test(w)) return Number(w);
  if (w in NUMBER_WORDS && w !== 'a' && w !== 'an' && w !== 'no' && w !== 'none') return NUMBER_WORDS[w]!;
  return null;
}
const NUM = String.raw`\b(\d+|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|hundred)(?![a-z]))`;

export const NAMED_HUES: Record<string, number> = { red: 0, orange: 25, yellow: 45, lime: 90, green: 140, teal: 170, sky: 190, blue: 210, indigo: 240, purple: 280, pink: 320, rose: 350 };
const hueWord = (h: number) => Object.entries(NAMED_HUES).find(([, v]) => v === h)?.[0] ?? String(h);
function hueOf(word: string | undefined): number | null {
  if (!word) return null;
  const w = word.toLowerCase();
  if (w in NAMED_HUES) return NAMED_HUES[w]!;
  return num(w);
}

const KIND_RIGHT_VERB: Record<BlueprintKind, string> = { race: 'move', climb: 'climb', collect: 'open', build: 'add', territory: 'claim', survive: 'score', tug: 'pull' };
const TWIST_WORD: Record<BlueprintKind, string> = { race: 'shortcuts', climb: 'ledges', collect: 'traps', build: 'wind', territory: 'steal', survive: 'second chance', tug: 'surge' };
const ENDING_CODE = { first: 'first to the goal', most: 'most when time runs out', last: 'last one standing', together: 'everyone together' } as const;
const CAMERA_CODE = { follow: 'behind your Glim', overview: 'from above', side: 'from the side' } as const;
const EVENT_CODE = { golden: 'golden round', rally: 'rally' } as const;

/** Simple words go in a line as they are; anything else is quoted. */
const plainWord = (s: string) => /^[A-Za-z][A-Za-z' -]*[A-Za-z]$/.test(s) && !/\s{2}/.test(s);
const quote = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Edit distance, for "did you mean". */
export function distance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  // Optimal string alignment: a swap of two letters next to each other counts as one slip.
  let before: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j]!, before[j - 2]! + 1);
    }
    before = prev;
    prev = cur;
  }
  return prev[n]!;
}

/** The closest of some words, if close enough to be a likely slip. */
export function nearest(word: string, options: readonly string[]): string | null {
  const w = word.toLowerCase();
  let best: string | null = null;
  let bestD = Infinity;
  for (const o of options) {
    const d = distance(w, o.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  if (best === null) return null;
  return bestD <= Math.max(1, Math.floor(Math.min(w.length, best.length) / 3)) ? best : null;
}

/* ---------------------------------------------------------------------------------------------- */
/* Lines.                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

/** A line split into its statement and its comment. Quotes are respected. */
export function splitComment(line: string): { code: string; comment: string } {
  let closer: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (closer) {
      if (c === '\\' && closer === '"') i++;
      else if (c === closer) closer = null;
      continue;
    }
    if (c === '"') closer = '"';
    else if (c === '“') closer = '”';
    else if (c === '#' || (c === '/' && line[i + 1] === '/')) return { code: line.slice(0, i), comment: line.slice(i) };
  }
  return { code: line, comment: '' };
}

/** The text of a quoted string, or the rest of the line when it has no quotes. */
function stringValue(rest: string): string {
  const t = rest.trim();
  const m = /^["“](.*)["”]$/.exec(t);
  if (!m) return t;
  return m[1]!.replace(/\\(["\\])/g, '$1');
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

export interface CodeFix {
  /** A replacement for the whole line. */
  text: string;
  /** What the fix does, for its button: "Use “steps”". */
  label: string;
}
export interface CodeProblem {
  /** 1-based line, or null when the problem is with the game as a whole. */
  line: number | null;
  message: string;
  fix?: CodeFix;
}

/** What one line of code is: its statement key (for keeping lines in step with the forms). */
export interface CodeLine {
  key: string | null;
}

export type CodeResult =
  | { ok: true; blueprint: Blueprint; problems: []; lines: CodeLine[] }
  | { ok: false; blueprint: null; problems: CodeProblem[]; lines: CodeLine[] };

/** Statement heads, for completions and "did you mean". */
export const STATEMENT_HEADS = [
  'game', 'goal', 'how to play', 'race to', 'climb to', 'collect', 'build a tower of', 'claim a', 'lives', 'tug of war to', 'points are called', 'twist:',
  'questions:', 'right answer:', 'quick answer:', 'streak bonus:', 'wrong answer:', 'surprise', 'every', 'events:', 'wins:', 'stops after', 'looks:',
  'camera:', 'props:', 'board:', 'cover:', 'each player has', 'each team has', 'the game has', 'when',
] as const;
const HEAD_WORDS = ['game', 'goal', 'how', 'race', 'climb', 'collect', 'build', 'claim', 'lives', 'tug', 'points', 'twist', 'questions', 'right', 'quick', 'streak', 'wrong', 'surprise', 'every', 'events', 'wins', 'stops', 'looks', 'camera', 'props', 'board', 'cover', 'each', 'the', 'when'];

class LineError extends Error {
  constructor(
    message: string,
    public fix?: CodeFix,
    /** A word to swap in the line for the fix: [what was written, what would work]. */
    public replace?: [string, string],
  ) {
    super(message);
  }
}

/** "Did you mean" for one wrong word in a line: the message and the fixed line. */
function wrongWord(line: string, word: string, options: readonly string[], what: string): LineError {
  const near = nearest(word, options);
  if (near) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return new LineError(`I do not know “${word}”. Did you mean “${near}”?`, { text: line.replace(re, near), label: `Use “${near}”` });
  }
  return new LineError(`I do not know “${word}” as ${what}. You can use ${listWords(options)}.`);
}

function listWords(options: readonly string[]): string {
  const shown = options.slice(0, 8).map((o) => `“${o}”`);
  if (options.length > 8) return `${shown.join(', ')} and more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} or ${shown[shown.length - 1]}` : shown.join('');
}

/** Words of a list ("double, leap and shield"): lower case, without "and", brackets or punctuation. */
function listOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[()[\].]/g, ' ')
    .split(/,|\band\b|\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

/* ---------------------------------------------------------------------------------------------- */
/* Reading code.                                                                                   */
/* ---------------------------------------------------------------------------------------------- */

interface Draft {
  bp: Blueprint;
  unitSet: boolean;
  kindSet: boolean;
  rightSet: boolean;
  seen: Map<string, number>;
  outcomes: { label: string; weight: number; amount: number }[];
  howTo: string[];
  vars: GameVar[];
  rules: GameRule[];
  /** Line of each how-to, surprise, number and rule, for problems from the check. */
  multi: Record<'howTo' | 'outcome' | 'var' | 'rule', number[]>;
  speedLine: number | null;
  streakLine: number | null;
}

const once = (d: Draft, key: string, line: number, what: string) => {
  const before = d.seen.get(key);
  if (before !== undefined) throw new LineError(`${what} is already set on line ${before}. Keep one of the two lines.`);
  d.seen.set(key, line);
};

/** The kind statement: "race to 30 steps", "collect 20 gems", "3 lives", "claim a 6 by 6 map". */
function readKind(code: string): { type: BlueprintKind; size: number; unit: string | null } | null {
  const s = squash(code);
  const l = s.toLowerCase();
  let m: RegExpExecArray | null;
  const unitOf = (rest: string | undefined) => {
    const u = rest ? stringValue(rest.trim()) : '';
    return u ? u : null;
  };
  if ((m = new RegExp(`^race(?: to| of)? ${NUM}\\b(.*)$`, 'i').exec(s))) return { type: 'race', size: num(m[1])!, unit: unitOf(m[2]) };
  if ((m = new RegExp(`^climb(?: to| of)? ${NUM}\\b(.*)$`, 'i').exec(s))) return { type: 'climb', size: num(m[1])!, unit: unitOf(m[2]) };
  if ((m = new RegExp(`^collect(?: to)? ${NUM}\\b(.*)$`, 'i').exec(s))) return { type: 'collect', size: num(m[1])!, unit: unitOf(m[2]) };
  if ((m = new RegExp(`^build(?: a tower)?(?: of| to)? ${NUM}\\b(.*)$`, 'i').exec(s))) return { type: 'build', size: num(m[1])!, unit: unitOf(m[2]) };
  if ((m = new RegExp(`^(?:claim(?: a)?|territory|map)(?: of)? ${NUM}(?: by ${NUM})?(?: map| squares?)?$`, 'i').exec(s))) return { type: 'territory', size: num(m[1])!, unit: null };
  if ((m = new RegExp(`^${NUM} (?:lives?|life)$`, "i").exec(s)) || (m = new RegExp(`^lives:? ${NUM}$`, "i").exec(s))) return { type: 'survive', size: num(m[1])!, unit: null };
  if ((m = new RegExp(`^tug(?: of war)?,?(?: to| of)? ${NUM}\\b(.*)$`, 'i').exec(s))) return { type: 'tug', size: num(m[1])!, unit: unitOf(m[2]) };
  void l;
  return null;
}

function readWhen(text: string, d: Draft): RuleWhen {
  const t = squash(text).toLowerCase().replace(/^when\s+/, '');
  let m: RegExpExecArray | null;
  if (/^(the )?game (starts|begins)$|^start$/.test(t)) return { type: 'start' };
  if ((m = new RegExp(`${NUM} (?:right|correct)(?: answers?)? in a row`).exec(t))) return { type: 'streak', n: num(m[1])! };
  if ((m = new RegExp(`${NUM} wrong(?: answers?)? in a row`).exec(t))) return { type: 'miss-streak', n: num(m[1])! };
  if (/quick|fast/.test(t)) return { type: 'quick' };
  if (/(answers?|gets?) (it |one |a question )?(right|correctly)|right answer/.test(t)) return { type: 'right' };
  if (/(answers?|gets?) (it |one |a question )?wrong|wrong answer/.test(t)) return { type: 'wrong' };
  if ((m = new RegExp(`^every ${NUM} questions?`).exec(t))) return { type: 'every', n: num(m[1])! };
  if ((m = new RegExp(`reach(?:es)? (?:a score of )?${NUM}(?: (.+))?$`).exec(t))) {
    const word = m[2]?.trim();
    const v = word ? varRef(word, d, true) : undefined;
    return v ? { type: 'reach', n: num(m[1])!, var: v } : { type: 'reach', n: num(m[1])! };
  }
  if ((m = /runs? out of (\w+)/.exec(t))) return { type: 'runs-out', var: varRef(m[1]!, d, false) ?? m[1]! };
  if (/halfway/.test(t)) return { type: 'halfway' };
  if (/(takes?|goes? into) the lead/.test(t)) return { type: 'lead' };
  if (/uses? a power/.test(t)) return { type: 'power' };
  if (/round (starts|begins)/.test(t)) return { type: 'round-start' };
  if (/round (ends|finishes)/.test(t)) return { type: 'round-end' };
  if ((m = new RegExp(`${NUM} minutes? (?:is |are )?left`).exec(t))) return { type: 'minutes-left', n: num(m[1])! };
  const near = nearest(t, WHEN_EXAMPLES.map((w) => w.replace(/^when /, '')));
  if (near) throw new LineError(`I do not understand “when ${t}”. Did you mean “when ${near}”?`, { text: '', label: `Use “when ${near}”` }, [t, near]);
  throw new LineError(`I do not understand “when ${t}”. Try “when a player answers right” or “every 5 questions”.`);
}

/** A number the game keeps, by name; the score's own words give undefined (the score). */
function varRef(word: string, d: Draft, allowScore: boolean): string | undefined {
  const w = word.toLowerCase().replace(/^(their|the|his|her|my|your) /, '').trim();
  if (allowScore && (w === 'score' || w === 'points' || w === d.bp.unit.toLowerCase() || w === singularOf(d.bp.unit.toLowerCase()))) return undefined;
  const names = d.vars.map((v) => v.name);
  if (names.includes(w)) return w;
  const sing = names.find((n) => singularOf(n) === w);
  if (sing) return sing;
  const near = nearest(w, allowScore ? [...names, 'score'] : names);
  if (near) throw new LineError(`The game has no number called “${w}”. Did you mean “${near}”?`, { text: '', label: `Use “${near}”` }, [w, near]);
  throw new LineError(`The game has no number called “${w}”. Add it with a line such as “each player has 0 ${w}”.`);
}
const singularOf = (w: string) => (w.endsWith('ies') && w.length > 4 ? `${w.slice(0, -3)}y` : /[^s]s$/.test(w) ? w.slice(0, -1) : w);

function readIf(text: string, d: Draft): RuleIf {
  const t = squash(text).toLowerCase().replace(/^(if|and)\s+/, '');
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^(?:their |the |your )?([a-z]+) (?:is|are) (?:at least ${NUM}|${NUM} or more)$`).exec(t))) {
    const v = varRef(m[1]!, d, true);
    return v ? { type: 'at-least', n: num(m[2] ?? m[3])!, var: v } : { type: 'at-least', n: num(m[2] ?? m[3])! };
  }
  if ((m = new RegExp(`^(?:their |the |your )?([a-z]+) (?:is|are) (?:at most ${NUM}|${NUM} or (?:less|fewer))$`).exec(t))) {
    const v = varRef(m[1]!, d, true);
    return v ? { type: 'at-most', n: num(m[2] ?? m[3])!, var: v } : { type: 'at-most', n: num(m[2] ?? m[3])! };
  }
  if (/first place|in the lead|winning/.test(t)) return { type: 'first' };
  if (/last place|^(they are )?last$|losing/.test(t)) return { type: 'last' };
  if ((m = new RegExp(`on team ${NUM}`).exec(t))) return { type: 'team', n: num(m[1])! };
  if ((m = /(\d+)\s*(?:%|percent)(?: chance)?/.exec(t))) return { type: 'chance', n: Number(m[1]) };
  if ((m = new RegExp(`(?:in the last ${NUM} minutes?|${NUM} minutes? or less (?:is |are )?left|minutes left (?:is )?at most ${NUM})`).exec(t))) return { type: 'minutes-left', n: num(m[1] ?? m[2] ?? m[3])! };
  throw new LineError(`I do not understand the condition “${t}”. Try “coins is at least 5”, “in last place” or “in the last 2 minutes”.`);
}

function readDo(text: string, d: Draft): RuleDo {
  const raw = squash(text);
  const t = raw.toLowerCase().replace(/^(then |they |each player )/, '');
  let m: RegExpExecArray | null;
  if ((m = /^say:? (.+)$/.exec(t))) {
    const said = stringValue(raw.slice(raw.toLowerCase().indexOf('say') + 3).replace(/^:/, '')).toLowerCase().replace(/[^a-z ]/g, '').trim();
    const hit = RULE_MESSAGES.find((msg) => msg.toLowerCase().replace(/[^a-z ]/g, '').trim() === said);
    if (hit) return { type: 'say', message: hit };
    const near = nearest(said, RULE_MESSAGES.map((x) => x.toLowerCase().replace(/[^a-z ]/g, '').trim()));
    const pick = near ? RULE_MESSAGES.find((x) => x.toLowerCase().replace(/[^a-z ]/g, '').trim() === near) : null;
    throw new LineError(`A game can only say one of Ludora’s messages, so nobody’s words appear during play. ${pick ? `Did you mean “${pick}”?` : `Try ${listWords(RULE_MESSAGES)}.`}`);
  }
  if ((m = new RegExp(`^everyone behind(?: them)? (?:gains?|gets?|moves?) ${NUM}`).exec(t))) return { type: 'behind-gain', n: num(m[1])! };
  if ((m = new RegExp(`^everyone ahead(?: of them)? (?:loses?|drops?) ${NUM}`).exec(t))) return { type: 'ahead-lose', n: num(m[1])! };
  if ((m = new RegExp(`^everyone (?:gains?|gets?|moves?) ${NUM}`).exec(t))) return { type: 'everyone-gain', n: num(m[1])! };
  if ((m = new RegExp(`^the leader (?:loses?|drops?) ${NUM}`).exec(t))) return { type: 'leader-lose', n: num(m[1])! };
  if (t.startsWith('freeze the leader')) return { type: 'freeze-leader' };
  if (/^swap(?: places| scores?| \w+)? with the leader/.test(t)) return { type: 'swap-leader' };
  if (/golden/.test(t)) return { type: 'golden' };
  if (t.startsWith('rally')) return { type: 'rally' };
  if (/double points|points count double|^double score/.test(t)) return { type: 'double' };
  if (/^(gain|get|win) (a|one|an extra) life|life back/.test(t)) return { type: 'life' };
  if (/^lose (a|one) life/.test(t)) return { type: 'lose-life' };
  if ((m = /^get (?:a |an )?(?:power-?up:? )?(\w+)(?: power-?up)$|^get a power-?up:? (\w+)$/.exec(t))) {
    const p = (m[1] ?? m[2])!;
    if ((POWER_UPS as readonly string[]).includes(p)) return { type: 'power', power: p as RuleDo['power'] & string };
    throw wrongWord(raw, p, POWER_UPS, 'a power-up');
  }
  if (/^(get a shield|shield them|protect them)/.test(t)) return { type: 'shield' };
  if (/^(win|wins|they win|win the game)$/.test(t)) return { type: 'win' };
  if (/end the game|game ends|game over/.test(t)) return { type: 'end' };
  if ((m = new RegExp(`^set (?:their |the )?([a-z]+) to ${NUM}$`).exec(t))) return { type: 'set', var: varRef(m[1]!, d, false)!, n: num(m[2])! };
  if ((m = new RegExp(`^(add|give|get|gain|move|score|climb|claim|pull|open) ${NUM}(?: (.+))?$`).exec(t))) {
    const word = m[3]?.trim();
    const v = word && !/^(more|extra|steps?|squares?)$/.test(word) ? varRef(word.replace(/^(to|more) /, ''), d, true) : undefined;
    return v ? { type: 'add', n: num(m[2])!, var: v } : { type: 'gain', n: num(m[2])! };
  }
  if ((m = new RegExp(`^(take|spend|remove|lose|drop|slip|go back) ${NUM}(?: (.+))?$`).exec(t))) {
    const word = m[3]?.trim();
    const v = word ? varRef(word.replace(/^(from|of) /, ''), d, true) : undefined;
    return v ? { type: 'take', n: num(m[2])!, var: v } : { type: 'lose', n: num(m[2])! };
  }
  if ((m = new RegExp(`^([a-z]+) ?([+-]) ?${NUM}$`).exec(t))) {
    const v = varRef(m[1]!, d, true);
    if (!v) return { type: m[2] === '+' ? 'gain' : 'lose', n: num(m[3])! };
    return { type: m[2] === '+' ? 'add' : 'take', n: num(m[3])!, var: v };
  }
  const first = t.split(' ')[0] ?? t;
  const near = nearest(first, DO_WORDS);
  throw new LineError(
    near && near !== first ? `I do not know how to “${first}”. Did you mean “${near}”?` : `I do not know how to “${t}”. Try “gain 2”, “add 1 coins”, “golden round” or “say "Nice one!"”.`,
  );
}
const DO_WORDS = ['gain', 'lose', 'add', 'take', 'set', 'everyone', 'freeze', 'swap', 'golden', 'rally', 'double', 'get', 'win', 'end', 'say', 'spend', 'give'];

/** Split "a and b, and c" outside quotes. */
function splitAnd(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  const s = text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '"' || c === '“' || c === '”') inQuote = !inQuote;
    if (!inQuote) {
      if (c === ',') {
        out.push(cur);
        cur = '';
        continue;
      }
      const rest = s.slice(i).toLowerCase();
      if (/^\sand\s/.test(rest) && (i === 0 || s[i] === ' ')) {
        out.push(cur);
        cur = '';
        i += 4;
        continue;
      }
    }
    cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim().replace(/^and\s+/i, '')).filter(Boolean);
}

function readRule(code: string, d: Draft): GameRule {
  const s = squash(code);
  const colon = (() => {
    let inQuote = false;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '"') inQuote = !inQuote;
      else if (!inQuote && s[i] === ':') return i;
    }
    return -1;
  })();
  if (colon < 0) throw new LineError('A rule needs a colon between when it happens and what it does, such as “when a player answers right: gain 1”.', { text: `${s}: gain 1`, label: 'Add “: gain 1”' });
  const left = s.slice(0, colon);
  const right = s.slice(colon + 1).trim();
  const ifAt = left.search(/,?\s+if\s+/i);
  const whenText = ifAt >= 0 ? left.slice(0, ifAt) : left;
  const ifText = ifAt >= 0 ? left.slice(ifAt).replace(/^,?\s+if\s+/i, '') : '';
  const when = readWhen(whenText, d);
  const ifs = ifText ? splitAnd(ifText).map((c) => readIf(c, d)) : [];
  if (!right) throw new LineError('Say what the rule does after the colon, such as “gain 1”.', { text: `${s} gain 1`, label: 'Add “gain 1”' });
  const dos = splitAnd(right).map((x) => readDo(x, d));
  if (dos.length > MAX_RULE_DOS) throw new LineError(`A rule can do at most ${MAX_RULE_DOS} things. Split it into two rules.`);
  return { when, if: ifs, do: dos };
}

function readVar(code: string): GameVar | null {
  const s = squash(code).toLowerCase();
  const m = new RegExp(`^(each player|every player|each team|every team|the game|game) (?:has|keeps|counts) ${NUM} ([a-z]+)(?:,? (?:up to|at most|max) ${NUM})?$`).exec(s);
  if (!m) return null;
  const scope: VarScope = m[1]!.endsWith('player') ? 'player' : m[1]!.endsWith('team') ? 'team' : 'game';
  return { name: m[3]!, scope, start: num(m[2])!, max: m[4] ? num(m[4])! : VAR_MAX };
}

/** Read game code into a checked blueprint, or every problem with its line. */
export function fromCode(text: string): CodeResult {
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n');
  const lines: CodeLine[] = rawLines.map(() => ({ key: null }));
  const problems: CodeProblem[] = [];
  const base = blankBlueprint();
  const d: Draft = { bp: base, unitSet: false, kindSet: false, rightSet: false, seen: new Map(), outcomes: [], howTo: [], vars: [], rules: [], multi: { howTo: [], outcome: [], var: [], rule: [] }, speedLine: null, streakLine: null };
  if (rawLines.length > 200) return { ok: false, blueprint: null, problems: [{ line: null, message: 'This code is too long. A game fits in 200 lines.' }], lines };

  // First the numbers the game keeps, the kind and the score's name, so rules and answers on any line can use them.
  rawLines.forEach((raw, i) => {
    const code = squash(splitComment(raw).code);
    if (!code) return;
    const v = readVar(code);
    if (v) {
      lines[i]!.key = `var:${d.vars.length}`;
      d.vars.push(v);
      d.multi.var.push(i + 1);
    }
  });
  const order: { i: number; code: string }[] = [];
  rawLines.forEach((raw, i) => {
    const code = squash(splitComment(raw).code);
    if (code && !lines[i]!.key) order.push({ i, code });
  });
  // The kind first (it sets the defaults for the score's name).
  const kindFirst = [...order].sort((a, b) => Number(Boolean(readKind(b.code))) - Number(Boolean(readKind(a.code))));
  for (const { i, code } of kindFirst) {
    try {
      const key = readStatement(code, i + 1, d);
      lines[i]!.key = key;
    } catch (e) {
      if (e instanceof LineError) {
        let fix = e.fix && e.fix.text ? e.fix : undefined;
        if (e.fix && e.replace) {
          const raw = rawLines[i]!;
          const at = raw.toLowerCase().indexOf(e.replace[0].toLowerCase());
          if (at >= 0) fix = { label: e.fix.label, text: raw.slice(0, at) + e.replace[1] + raw.slice(at + e.replace[0].length) };
        }
        problems.push({ line: i + 1, message: `Line ${i + 1}: ${e.message}`, ...(fix ? { fix } : {}) });
      } else throw e;
    }
  }
  problems.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  if (problems.length) return { ok: false, blueprint: null, problems, lines };

  const bp = d.bp;
  bp.howTo = d.howTo;
  if (d.outcomes.length) {
    if (d.speedLine) problems.push({ line: d.speedLine, message: `Line ${d.speedLine}: a game with surprises has no quick-answer bonus. Take one of them out.` });
    if (d.streakLine) problems.push({ line: d.streakLine, message: `Line ${d.streakLine}: a game with surprises has no streak bonus. Take one of them out.` });
    bp.answer = { ...bp.answer, rule: 'chance', outcomes: d.outcomes };
  } else if (bp.answer.speed > 0 || bp.answer.streak > 0) bp.answer = { ...bp.answer, rule: 'points' };
  else bp.answer = { ...bp.answer, rule: 'steady' };
  if (d.vars.length) bp.vars = d.vars;
  if (d.rules.length) bp.rules = d.rules;
  if (problems.length) return { ok: false, blueprint: null, problems, lines };
  const checked = parseBlueprint(bp);
  if (!checked.ok) return { ok: false, blueprint: null, problems: checked.problems.map((p) => placeProblem(p, d, lines)), lines };
  return { ok: true, blueprint: normaliseBlueprint(checked.blueprint), problems: [], lines };
}

/** Which statement holds each part of a blueprint, for problems found by the check. */
const PATH_KEYS: [RegExp, string][] = [
  [/^name/, 'name'],
  [/^unit/, 'unit'],
  [/^goal/, 'goal'],
  [/^kind\.twist/, 'twist'],
  [/^kind/, 'kind'],
  [/^pacing/, 'questions'],
  [/^answer\.right/, 'right'],
  [/^answer\.rule/, 'right'],
  [/^answer\.wrong/, 'wrong'],
  [/^answer\.speed/, 'quick'],
  [/^answer\.streak/, 'streak'],
  [/^extras\.(powers|powerEvery)/, 'powers'],
  [/^extras\.events/, 'events'],
  [/^end\.type/, 'wins'],
  [/^end\.timeLimitSec/, 'time'],
  [/^end\.(questions|questionTimeSec)/, 'questions'],
  [/^look\.scene\.camera/, 'camera'],
  [/^look\.scene\.props/, 'props'],
  [/^look\.(dimension|scene)/, 'looks'],
  [/^look/, 'board'],
  [/^cover/, 'cover'],
];

function placeProblem(p: BlueprintProblem, d: Draft, lines: CodeLine[]): CodeProblem {
  let line: number | null = null;
  const m = /^(howTo|answer\.outcomes|vars|rules)\.(\d+)/.exec(p.path);
  if (m) {
    const list = m[1] === 'howTo' ? d.multi.howTo : m[1] === 'vars' ? d.multi.var : m[1] === 'rules' ? d.multi.rule : d.multi.outcome;
    line = list[Number(m[2])] ?? null;
  } else if (p.path === 'answer.outcomes') line = d.multi.outcome[0] ?? null;
  else {
    const key = PATH_KEYS.find(([re]) => re.test(p.path))?.[1];
    if (key) {
      const at = lines.findIndex((l) => l.key === key || (key === 'unit' && l.key === 'kind'));
      line = at >= 0 ? at + 1 : null;
    }
  }
  return { line, message: line ? `Line ${line}: ${p.message}` : p.message };
}

/** Reads one statement into the draft. Returns its key. */
function readStatement(code: string, line: number, d: Draft): string {
  const s = squash(code);
  const l = s.toLowerCase();
  const bp = d.bp;
  let m: RegExpExecArray | null;

  if ((m = /^(?:game|name|title)\b:?\s*(.*)$/i.exec(s)) && !/^game (has|keeps|counts)/i.test(s)) {
    once(d, 'name', line, 'The name');
    bp.name = stringValue(m[1]!);
    return 'name';
  }
  if ((m = /^goal\b:?\s*(.*)$/i.exec(s))) {
    once(d, 'goal', line, 'The goal');
    bp.goal = stringValue(m[1]!);
    return 'goal';
  }
  if ((m = /^how to play\b:?\s*(.*)$/i.exec(s))) {
    d.howTo.push(stringValue(m[1]!));
    d.multi.howTo.push(line);
    return `howTo:${d.howTo.length - 1}`;
  }
  const kind = readKind(s);
  if (kind) {
    once(d, 'kind', line, 'What the game is about');
    const info = KIND_INFO[kind.type];
    bp.kind = { type: kind.type, [info.size.key]: kind.size, twist: bp.kind.twist } as Blueprint['kind'];
    d.kindSet = true;
    if (kind.unit) {
      once(d, 'unit', line, 'The score’s name');
      bp.unit = kind.unit;
      d.unitSet = true;
    } else if (!d.unitSet) bp.unit = info.unit;
    return 'kind';
  }
  if ((m = /^(?:points|score|the score) (?:are|is) called:?\s*(.+)$/i.exec(s))) {
    once(d, 'unit', line, 'The score’s name');
    bp.unit = stringValue(m[1]!);
    d.unitSet = true;
    return 'unit';
  }
  if ((m = /^twist\b:?\s*(.*)$/i.exec(s))) {
    once(d, 'twist', line, 'The twist');
    const w = m[1]!.trim().toLowerCase().replace(/\.$/, '');
    if (/^(none|no|off|nothing)$/.test(w)) bp.kind = { ...bp.kind, twist: false };
    else if (w === TWIST_WORD[bp.kind.type] || /^(yes|on)$/.test(w) || singularOf(w) === singularOf(TWIST_WORD[bp.kind.type])) bp.kind = { ...bp.kind, twist: true };
    else {
      const other = BLUEPRINT_KINDS.find((k) => TWIST_WORD[k] === w || singularOf(TWIST_WORD[k]) === singularOf(w));
      if (other) throw new LineError(`${cap(TWIST_WORD[other])} is the twist for a ${KIND_INFO[other].noun}. A ${KIND_INFO[bp.kind.type].noun}’s twist is ${TWIST_WORD[bp.kind.type]}.`, { text: `twist: ${TWIST_WORD[bp.kind.type]}`, label: `Use “${TWIST_WORD[bp.kind.type]}”` });
      const near = nearest(w, [TWIST_WORD[bp.kind.type]]);
      throw new LineError(
        near ? `I do not know the twist “${w}”. Did you mean “${near}”?` : `A ${KIND_INFO[bp.kind.type].noun}’s twist is ${TWIST_WORD[bp.kind.type]}. Write “twist: ${TWIST_WORD[bp.kind.type]}” or take the line out.`,
        { text: `twist: ${TWIST_WORD[bp.kind.type]}`, label: `Use “${TWIST_WORD[bp.kind.type]}”` },
      );
    }
    return 'twist';
  }
  if ((m = /^questions?\b:?\s*(.*)$/i.exec(s))) {
    once(d, 'questions', line, 'How questions arrive');
    const rest = m[1]!.toLowerCase();
    if (/own pace|own|each at|self/.test(rest)) bp.pacing = 'own-pace';
    else if (/together|rounds?|same time|everyone/.test(rest)) bp.pacing = 'rounds';
    else throw new LineError('Say how questions arrive: “together” (everyone the same question at once) or “own pace”.', { text: `questions: together, ${bp.end.questions} questions, ${bp.end.questionTimeSec} seconds each`, label: 'Use “together”' });
    const secs = new RegExp(`${NUM} ?(?:seconds?|secs?|s)\\b`).exec(rest);
    if (secs) bp.end = { ...bp.end, questionTimeSec: num(secs[1])! };
    const noSecs = secs ? rest.replace(secs[0], '') : rest;
    const count = new RegExp(`${NUM}`).exec(noSecs);
    if (count) bp.end = { ...bp.end, questions: num(count[1])! };
    return 'questions';
  }
  if ((m = /^right answers?\b:?\s*(.*)$/i.exec(s))) {
    once(d, 'right', line, 'What a right answer does');
    const n = new RegExp(`${NUM}`).exec(m[1]!.toLowerCase());
    if (/surprise/.test(m[1]!)) return 'right';
    if (!n) throw new LineError(`Say how much a right answer gives, such as “right answer: ${KIND_RIGHT_VERB[bp.kind.type]} 2”.`, { text: `right answer: ${KIND_RIGHT_VERB[bp.kind.type]} 2`, label: 'Use 2' });
    bp.answer = { ...bp.answer, right: num(n[1])! };
    d.rightSet = true;
    return 'right';
  }
  if ((m = /^(?:quick|fast|speed)(?: answers?| bonus)?\b:?\s*(.*)$/i.exec(s))) {
    once(d, 'quick', line, 'The quick-answer bonus');
    const n = new RegExp(`${NUM}`).exec(m[1]!.toLowerCase());
    if (!n && !/nothing|none|no/.test(m[1]!)) throw new LineError('Say the most a quick answer adds, such as “quick answer: up to 2 more”.', { text: 'quick answer: up to 2 more', label: 'Use 2' });
    bp.answer = { ...bp.answer, speed: n ? num(n[1])! : 0 };
    d.speedLine = n && num(n[1])! > 0 ? line : null;
    return 'quick';
  }
  if ((m = /^(?:streak(?: bonus)?|in a row|answers in a row)\b:?\s*(.*)$/i.exec(s))) {
    once(d, 'streak', line, 'The streak bonus');
    const n = new RegExp(`${NUM}`).exec(m[1]!.toLowerCase());
    if (!n && !/nothing|none|no/.test(m[1]!)) throw new LineError('Say the most a streak adds, such as “streak bonus: up to 2 more”.', { text: 'streak bonus: up to 2 more', label: 'Use 2' });
    bp.answer = { ...bp.answer, streak: n ? num(n[1])! : 0 };
    d.streakLine = n && num(n[1])! > 0 ? line : null;
    return 'streak';
  }
  if ((m = /^wrong answers?\b:?\s*(.*)$/i.exec(s))) {
    once(d, 'wrong', line, 'What a wrong answer does');
    const rest = m[1]!.toLowerCase();
    const n = new RegExp(`${NUM}`).exec(rest.replace(/\b(a|one) life\b/, ''));
    if (n) bp.answer = { ...bp.answer, wrong: num(n[1])! };
    else if (/nothing|none|no\b|^0$|life/.test(rest)) bp.answer = { ...bp.answer, wrong: 0 };
    else throw new LineError('Say what a wrong answer costs, such as “wrong answer: lose 1” or “wrong answer: nothing”.', { text: 'wrong answer: nothing', label: 'Use “nothing”' });
    return 'wrong';
  }
  if ((m = /^surprise\b:?\s*("(?:[^"\\]|\\.)*"|“[^”]*”|[^:]+):\s*(.*)$/i.exec(s))) {
    const label = stringValue(m[1]!);
    const rest = m[2]!.toLowerCase();
    const w = new RegExp(`(?:chance|weight)\\s*${NUM}`).exec(rest);
    const g = new RegExp(`(?:gives?|amount|worth)\\s*${NUM}`).exec(rest);
    if (!w || !g) throw new LineError('A surprise needs its chance and what it gives, such as “surprise "Big prize": chance 1, gives 4”.', { text: `surprise ${quote(label)}: chance ${w ? num(w[1]) : 3}, gives ${g ? num(g[1]) : 2}`, label: 'Add the missing part' });
    d.outcomes.push({ label, weight: num(w[1])!, amount: num(g[1])! });
    d.multi.outcome.push(line);
    return `surprise:${d.outcomes.length - 1}`;
  }
  if ((m = new RegExp(`^every ${NUM} (?:right )?answers?\\b:?\\s*(.*)$`, 'i').exec(s)) || (m = new RegExp(`^power-?ups?\\b:?\\s*()(.*)$`, 'i').exec(s))) {
    once(d, 'powers', line, 'The power-ups');
    const every = m[1] ? num(m[1])! : bp.extras.powerEvery;
    const words = listOf(m[2]!).filter((w) => !/^(power-?ups?|a|an|the|power|ups?|get|earns?|every|right|answers?|\d+)$/.test(w));
    const powers: Blueprint['extras']['powers'] = [];
    for (const w of words) {
      if (/^(none|nothing)$/.test(w)) continue;
      if (!(POWER_UPS as readonly string[]).includes(w)) throw wrongWord(s, w, POWER_UPS, 'a power-up');
      powers.push(w as (typeof POWER_UPS)[number]);
    }
    bp.extras = { ...bp.extras, powers, powerEvery: every };
    return 'powers';
  }
  if (new RegExp(`^every ${NUM} questions?`, 'i').test(s) || /^when\b/i.test(s)) {
    d.rules.push(readRule(s, d));
    d.multi.rule.push(line);
    return `rule:${d.rules.length - 1}`;
  }
  if ((m = /^events?\b:?\s*(.*)$/i.exec(s))) {
    once(d, 'events', line, 'The events');
    const rest = m[1]!.toLowerCase();
    const events: Blueprint['extras']['events'] = [];
    for (const part of rest.split(/,|\band\b/).map((x) => x.trim()).filter(Boolean)) {
      if (/^(none|nothing)$/.test(part)) continue;
      if (/golden/.test(part)) events.push('golden');
      else if (/rally/.test(part)) events.push('rally');
      else throw wrongWord(s, part.split(' ')[0]!, ['golden', 'rally'], 'an event');
    }
    bp.extras = { ...bp.extras, events };
    return 'events';
  }
  if ((m = /^(?:wins?|winner|winning|who wins)\b:?\s*(.*)$/i.exec(s))) {
    once(d, 'wins', line, 'Who wins');
    const rest = m[1]!.toLowerCase();
    if (/first/.test(rest)) bp.end = { ...bp.end, type: 'first' };
    else if (/most|highest|top/.test(rest)) bp.end = { ...bp.end, type: 'most' };
    else if (/last|standing/.test(rest)) bp.end = { ...bp.end, type: 'last' };
    else if (/together|everyone|all/.test(rest)) bp.end = { ...bp.end, type: 'together' };
    else throw new LineError('Say who wins: “first to the goal”, “most when time runs out”, “last one standing” or “everyone together”.', { text: 'wins: most when time runs out', label: 'Use “most when time runs out”' });
    return 'wins';
  }
  if ((m = /^(?:stops|ends|lasts)(?: after| at most| for)?\b:?\s*(.*)$/i.exec(s))) {
    once(d, 'time', line, 'How long it lasts');
    const rest = m[1]!.toLowerCase();
    const mins = new RegExp(`${NUM} ?(?:minutes?|mins?|m)\\b`).exec(rest);
    const secs = new RegExp(`${NUM} ?(?:seconds?|secs?|s)\\b`).exec(rest);
    if (!mins && !secs) throw new LineError('Say how long the game lasts, such as “stops after 5 minutes”.', { text: 'stops after 5 minutes', label: 'Use 5 minutes' });
    bp.end = { ...bp.end, timeLimitSec: (mins ? num(mins[1])! * 60 : 0) + (secs ? num(secs[1])! : 0) };
    return 'time';
  }
  if ((m = /^looks?\b:?\s*(.*)$/i.exec(s))) {
    once(d, 'looks', line, 'How it looks');
    const rest = m[1]!.toLowerCase().replace(/old town/g, 'old-town');
    const scene = { ...bp.look.scene };
    let dimension: '2d' | '3d' = '2d';
    for (const w of listOf(rest)) {
      if (w === '2d' || w === 'board') dimension = '2d';
      else if (w === '3d') dimension = '3d';
      else if ((SCENE_PLACES as readonly string[]).includes(w)) scene.place = w as typeof scene.place;
      else if ((SCENE_SHAPES as readonly string[]).includes(w)) scene.shape = w as typeof scene.shape;
      else if ((SCENE_TIMES as readonly string[]).includes(w)) scene.time = w as typeof scene.time;
      else if (w === 'track' || w === 'scene' || w === 'a' || w === 'in' || w === 'the') continue;
      else throw wrongWord(s, w, ['2D', '3D', ...SCENE_PLACES.map((p) => p.replace('-', ' ')), ...SCENE_SHAPES, ...SCENE_TIMES], 'a look');
    }
    bp.look = { ...bp.look, dimension, scene };
    return 'looks';
  }
  if ((m = /^camera\b:?\s*(.*)$/i.exec(s))) {
    once(d, 'camera', line, 'The camera');
    const rest = m[1]!.toLowerCase();
    const camera = /behind|follow/.test(rest) ? 'follow' : /above|overview|top/.test(rest) ? 'overview' : /side/.test(rest) ? 'side' : null;
    if (!camera) throw new LineError('The camera can be “behind your Glim”, “from above” or “from the side”.', { text: 'camera: behind your Glim', label: 'Use “behind your Glim”' });
    bp.look = { ...bp.look, scene: { ...bp.look.scene, camera } };
    return 'camera';
  }
  if ((m = /^props?\b:?\s*(.*)$/i.exec(s))) {
    once(d, 'props', line, 'The props');
    const props: Blueprint['look']['scene']['props'] = [];
    for (const w of listOf(m[1]!)) {
      if (/^(none|nothing)$/.test(w)) continue;
      const p = (SCENE_PROPS as readonly string[]).includes(w) ? w : (SCENE_PROPS as readonly string[]).find((x) => singularOf(x) === w);
      if (!p) throw wrongWord(s, w, SCENE_PROPS, 'a prop');
      props.push(p as (typeof SCENE_PROPS)[number]);
    }
    bp.look = { ...bp.look, scene: { ...bp.look.scene, props } };
    return 'props';
  }
  if ((m = /^board\b:?\s*(.*)$/i.exec(s))) {
    once(d, 'board', line, 'The board');
    const rest = m[1]!.toLowerCase();
    const style = BOARD_STYLES.find((x) => new RegExp(`\\b${x}\\b`).test(rest));
    const second = /second colou?r:?\s*(\w+)/.exec(rest);
    const first = /(?:^|,\s*|\s)colou?r:?\s*(\w+)/.exec(rest.replace(/second colou?r:?\s*\w+/, ''));
    const look = { ...bp.look };
    if (style) look.style = style;
    if (first) {
      const h = hueOf(first[1]);
      if (h === null) throw wrongWord(s, first[1]!, Object.keys(NAMED_HUES), 'a colour');
      look.hue = h;
    }
    if (second) {
      const h = hueOf(second[1]);
      if (h === null) throw wrongWord(s, second[1]!, Object.keys(NAMED_HUES), 'a colour');
      look.accent = h;
    }
    if (!style && !first && !second) {
      const w = listOf(rest)[0] ?? '';
      throw wrongWord(s, w || 'nothing', [...BOARD_STYLES], 'a board style');
    }
    bp.look = look;
    return 'board';
  }
  if ((m = /^cover\b:?\s*(.*)$/i.exec(s))) {
    once(d, 'cover', line, 'The cover');
    const rest = m[1]!.toLowerCase();
    const words = listOf(rest);
    const glyph = words.find((w) => (GAME_GLYPHS as readonly string[]).includes(w));
    const colour = /colou?r:?\s*(\w+)/.exec(rest);
    const cover = { ...bp.cover };
    if (glyph) cover.glyph = glyph as (typeof GAME_GLYPHS)[number];
    else {
      const first = words.find((w) => !/^colou?r$/.test(w) && hueOf(w) === null);
      if (first) throw wrongWord(s, first, GAME_GLYPHS, 'a cover picture');
    }
    if (colour) {
      const h = hueOf(colour[1]);
      if (h === null) throw wrongWord(s, colour[1]!, Object.keys(NAMED_HUES), 'a colour');
      cover.hue = h;
    }
    bp.cover = cover;
    return 'cover';
  }
  if (/^(each|every) (player|team) has|^the game has/i.test(s)) {
    throw new LineError('Write a number for the game to keep like this: “each player has 0 coins”, with one word for its name. You can add “, up to 99”.', { text: 'each player has 0 coins', label: 'Use “each player has 0 coins”' });
  }
  // Nothing matched: find the word that is most likely a slip.
  const first = l.split(' ')[0]!.replace(/:$/, '');
  const near = nearest(first, HEAD_WORDS);
  if (near && near !== first) {
    const fixed = s.replace(new RegExp(`^${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), near);
    return (() => {
      throw new LineError(`I do not know “${first}”. Did you mean “${near}”?`, { text: fixed, label: `Use “${near}”` });
    })();
  }
  if (near === first) {
    const example = EXAMPLES_BY_HEAD[first];
    throw new LineError(`I do not understand this line. ${example ? `Write it like “${example}”.` : 'Open “What you can write” to see every kind of line.'}`, example ? { text: example, label: 'Use the example' } : undefined);
  }
  throw new LineError(`I do not know “${first}”. Open “What you can write” to see every kind of line, or put # in front to make it a note.`, { text: `# ${s}`, label: 'Make it a note' });
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------------------------------------------------------------------------------------------- */
/* Writing code.                                                                                   */
/* ---------------------------------------------------------------------------------------------- */

function unitInline(bp: Blueprint) {
  return plainWord(bp.unit) ? ` ${bp.unit}` : '';
}

function kindLine(bp: Blueprint): string {
  const k = bp.kind;
  const size = kindSize(k);
  const u = unitInline(bp);
  switch (k.type) {
    case 'race':
      return `race to ${size}${u}`;
    case 'climb':
      return `climb to ${size}${u}`;
    case 'collect':
      return `collect ${size}${u}`;
    case 'build':
      return `build a tower of ${size}${u}`;
    case 'territory':
      return `claim a ${size} by ${size} map`;
    case 'survive':
      return `${size} ${size === 1 ? 'life' : 'lives'}`;
    case 'tug':
      return `tug of war to ${size}${u}`;
  }
}

/** Whether the score's name needs its own line (it is not in the kind's line). */
function unitNeedsLine(bp: Blueprint): boolean {
  const inline = bp.kind.type !== 'territory' && bp.kind.type !== 'survive' && plainWord(bp.unit);
  if (inline) return false;
  return bp.unit !== KIND_INFO[bp.kind.type].unit || !plainWord(bp.unit);
}

const amount = (n: number, bp: Blueprint) => (plainWord(bp.unit) ? `${n} ${n === 1 ? singularOf(bp.unit) : bp.unit}` : String(n));

export function whenCode(w: RuleWhen): string {
  switch (w.type) {
    case 'start':
      return 'when the game starts';
    case 'right':
      return 'when a player answers right';
    case 'wrong':
      return 'when a player answers wrong';
    case 'quick':
      return 'when a player answers quickly';
    case 'streak':
      return `when a player gets ${w.n} right in a row`;
    case 'miss-streak':
      return `when a player gets ${w.n} wrong in a row`;
    case 'every':
      return `every ${w.n} questions`;
    case 'reach':
      return w.var ? `when a player reaches ${w.n} ${w.var}` : `when a player reaches a score of ${w.n}`;
    case 'runs-out':
      return `when a player runs out of ${w.var}`;
    case 'halfway':
      return 'when a player gets halfway';
    case 'lead':
      return 'when a player takes the lead';
    case 'power':
      return 'when a player uses a power-up';
    case 'round-start':
      return 'when a round starts';
    case 'round-end':
      return 'when a round ends';
    case 'minutes-left':
      return w.n === 1 ? 'when 1 minute is left' : `when ${w.n} minutes are left`;
  }
}

export function ifCode(c: RuleIf): string {
  switch (c.type) {
    case 'at-least':
      return `${c.var ?? 'score'} is at least ${c.n}`;
    case 'at-most':
      return `${c.var ?? 'score'} is at most ${c.n}`;
    case 'first':
      return 'in first place';
    case 'last':
      return 'in last place';
    case 'team':
      return `on team ${c.n}`;
    case 'chance':
      return `a ${c.n}% chance`;
    case 'minutes-left':
      return `in the last ${c.n} ${c.n === 1 ? 'minute' : 'minutes'}`;
  }
}

export function doCode(a: RuleDo, bp: Blueprint): string {
  switch (a.type) {
    case 'gain':
      return `gain ${amount(a.n ?? 0, bp)}`;
    case 'lose':
      return `lose ${amount(a.n ?? 0, bp)}`;
    case 'add':
      return `add ${a.n} ${a.n === 1 ? singularOf(a.var ?? '') : a.var}`;
    case 'take':
      return `take ${a.n} ${a.n === 1 ? singularOf(a.var ?? '') : a.var}`;
    case 'set':
      return `set ${a.var} to ${a.n}`;
    case 'everyone-gain':
      return `everyone gains ${a.n}`;
    case 'behind-gain':
      return `everyone behind gains ${a.n}`;
    case 'ahead-lose':
      return `everyone ahead loses ${a.n}`;
    case 'leader-lose':
      return `the leader loses ${a.n}`;
    case 'power':
      return `get a ${a.power} power-up`;
    case 'shield':
      return 'get a shield';
    case 'freeze-leader':
      return 'freeze the leader';
    case 'golden':
      return 'golden round';
    case 'rally':
      return 'rally';
    case 'double':
      return 'double points';
    case 'life':
      return 'gain a life';
    case 'lose-life':
      return 'lose a life';
    case 'swap-leader':
      return 'swap with the leader';
    case 'win':
      return 'win';
    case 'end':
      return 'end the game';
    case 'say':
      return `say "${a.message}"`;
  }
}

export function ruleCode(r: GameRule, bp: Blueprint): string {
  const ifs = r.if.length ? `, if ${r.if.map(ifCode).join(' and ')}` : '';
  return `${whenCode(r.when)}${ifs}: ${r.do.map((a) => doCode(a, bp)).join(' and ')}`;
}

export function varCode(v: GameVar): string {
  const who = v.scope === 'player' ? 'each player has' : v.scope === 'team' ? 'each team has' : 'the game has';
  return `${who} ${v.start} ${v.name}${v.max < VAR_MAX ? `, up to ${v.max}` : ''}`;
}

/** Each statement of a blueprint, keyed, in the order game code writes them. */
export function codeStatements(input: Blueprint): { key: string; text: string }[] {
  const bp = normaliseBlueprint(input);
  const out: { key: string; text: string }[] = [];
  const add = (key: string, text: string) => out.push({ key, text });
  add('name', `game ${quote(bp.name)}`);
  if (bp.goal) add('goal', `goal ${quote(bp.goal)}`);
  bp.howTo.forEach((h, i) => add(`howTo:${i}`, `how to play ${quote(h)}`));
  add('kind', kindLine(bp));
  if (unitNeedsLine(bp)) add('unit', `points are called ${plainWord(bp.unit) ? bp.unit : quote(bp.unit)}`);
  if (bp.kind.twist) add('twist', `twist: ${TWIST_WORD[bp.kind.type]}`);
  add('questions', bp.pacing === 'rounds' ? `questions: together, ${bp.end.questions} questions, ${bp.end.questionTimeSec} seconds each` : `questions: own pace, ${bp.end.questions} each, ${bp.end.questionTimeSec} seconds each`);
  if (bp.answer.rule === 'chance') bp.answer.outcomes.forEach((o, i) => add(`surprise:${i}`, `surprise ${quote(o.label)}: chance ${o.weight}, gives ${o.amount}`));
  else {
    const verb = KIND_RIGHT_VERB[bp.kind.type];
    add('right', bp.kind.type === 'collect' ? `right answer: open ${bp.answer.right} ${bp.answer.right === 1 ? 'square' : 'squares'}` : `right answer: ${verb} ${amount(bp.answer.right, bp)}`);
  }
  if (bp.answer.rule === 'points' && bp.answer.speed > 0) add('quick', `quick answer: up to ${bp.answer.speed} more`);
  if (bp.answer.rule === 'points' && bp.answer.streak > 0) add('streak', `streak bonus: up to ${bp.answer.streak} more`);
  if (bp.kind.type === 'survive') add('wrong', bp.answer.wrong ? `wrong answer: lose a life and ${amount(bp.answer.wrong, bp)}` : 'wrong answer: lose a life');
  else add('wrong', bp.answer.wrong ? `wrong answer: lose ${amount(bp.answer.wrong, bp)}` : 'wrong answer: nothing');
  if (bp.extras.powers.length) add('powers', `every ${bp.extras.powerEvery} right answers: power-up (${bp.extras.powers.join(', ')})`);
  if (bp.extras.events.length) add('events', `events: ${bp.extras.events.map((e) => EVENT_CODE[e]).join(', ')}`);
  add('wins', `wins: ${ENDING_CODE[bp.end.type]}`);
  const t = bp.end.timeLimitSec;
  add('time', t % 60 === 0 ? `stops after ${t / 60} ${t === 60 ? 'minute' : 'minutes'}` : t < 60 ? `stops after ${t} seconds` : `stops after ${Math.floor(t / 60)} ${t < 120 ? 'minute' : 'minutes'} ${t % 60} seconds`);
  (bp.vars ?? []).forEach((v, i) => add(`var:${i}`, varCode(v)));
  (bp.rules ?? []).forEach((r, i) => add(`rule:${i}`, ruleCode(r, bp)));
  if (bp.look.dimension === '3d') {
    const sc = bp.look.scene;
    add('looks', `looks: 3D ${sc.place.replace('-', ' ')}, ${sc.shape} track, ${sc.time}`);
    add('camera', `camera: ${CAMERA_CODE[sc.camera]}`);
    add('props', `props: ${sc.props.length ? sc.props.join(', ') : 'none'}`);
  } else add('looks', 'looks: 2D');
  add('board', `board: ${bp.look.style}, colour ${hueWord(bp.look.hue)}, second colour ${hueWord(bp.look.accent)}`);
  add('cover', `cover: ${bp.cover.glyph}, colour ${hueWord(bp.cover.hue)}`);
  return out;
}

/** Group headings game code puts before parts of a game, as comments. */
const SECTION_BEFORE: Record<string, string> = {
  kind: '# What the game is about',
  questions: '# Questions and answers',
  wins: '# Winning',
  vars: '# The game’s own numbers',
  rules: '# Rules',
  looks: '# How it looks',
};

/** Write a blueprint as game code, with a comment before each part. */
export function toCode(bp: Blueprint): string {
  const lines: string[] = [];
  let lastSection = '';
  for (const s of codeStatements(bp)) {
    const sec = s.key.startsWith('var:') ? 'vars' : s.key.startsWith('rule:') ? 'rules' : s.key;
    if (SECTION_BEFORE[sec] && sec !== lastSection) {
      if (lines.length) lines.push('');
      lines.push(SECTION_BEFORE[sec]!);
      lastSection = sec;
    }
    lines.push(s.text);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Rewrite code after a form changed the game, keeping the person's comments, blank lines and
 * line order, and their own wording of every statement that still means the same.
 */
export function mergeCode(oldCode: string, next: Blueprint): string {
  const old = fromCode(oldCode);
  const nextStatements = codeStatements(next);
  const nextByKey = new Map(nextStatements.map((s) => [s.key, s.text]));
  let oldCanon = old.ok ? new Map(codeStatements(old.blueprint).map((s) => [s.key, s.text])) : null;
  // A person's own wording is kept only when their code has the same statements the game would write.
  if (oldCanon) {
    const theirs = new Set(old.lines.map((l) => l.key).filter((k): k is string => k !== null));
    if (theirs.size !== oldCanon.size || [...oldCanon.keys()].some((k) => !theirs.has(k))) oldCanon = null;
  }
  const rawLines = oldCode.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  const out: { key: string | null; text: string }[] = [];
  const placed = new Set<string>();
  rawLines.forEach((raw, i) => {
    const key = old.lines[i]?.key ?? null;
    if (!key) {
      out.push({ key: null, text: raw });
      return;
    }
    const text = nextByKey.get(key);
    if (text === undefined || placed.has(key)) return; // the statement is gone
    placed.add(key);
    const { comment } = splitComment(raw);
    if (oldCanon && oldCanon.get(key) === text) out.push({ key, text: raw });
    else out.push({ key, text: comment ? `${text} ${comment.trim()}` : text });
  });
  // New statements go after the nearest statement before them in the usual order.
  nextStatements.forEach((s, idx) => {
    if (placed.has(s.key)) return;
    let at = -1;
    for (let j = idx - 1; j >= 0 && at < 0; j--) {
      const prevKey = nextStatements[j]!.key;
      const pos = out.map((o) => o.key).lastIndexOf(prevKey);
      if (pos >= 0) at = pos;
    }
    out.splice(at + 1, 0, { key: s.key, text: s.text });
    placed.add(s.key);
  });
  // Drop comment lines left with nothing under them? No: comments are the person's; keep them.
  return `${out.map((o) => o.text).join('\n')}\n`;
}

/** A starting point's code. */
export function starterCode(id: string): string | null {
  const s = STARTER_BLUEPRINTS.find((x) => x.id === id);
  return s ? toCode(s.blueprint) : null;
}

/* ---------------------------------------------------------------------------------------------- */
/* Help: everything you can write, completions and colours.                                       */
/* ---------------------------------------------------------------------------------------------- */

export interface CodeEntry {
  group: string;
  code: string;
  help: string;
}

const WHEN_EXAMPLES = [
  'when a player answers right',
  'when a player answers wrong',
  'when a player answers quickly',
  'when a player gets 3 right in a row',
  'when a player gets 2 wrong in a row',
  'every 5 questions',
  'when a player reaches 10 coins',
  'when a player runs out of health',
  'when a player gets halfway',
  'when a player takes the lead',
  'when a player uses a power-up',
  'when a round starts',
  'when a round ends',
  'when 1 minute is left',
  'when the game starts',
];
const IF_EXAMPLES = ['coins is at least 5', 'score is at most 3', 'in first place', 'in last place', 'on team 1', 'a 30% chance', 'in the last 2 minutes'];
const DO_EXAMPLES = [
  'gain 2', 'lose 1', 'add 1 coins', 'take 3 coins', 'set coins to 0', 'everyone gains 1', 'everyone behind gains 2', 'everyone ahead loses 1', 'the leader loses 2',
  'get a shield power-up', 'get a shield', 'freeze the leader', 'golden round', 'rally', 'double points', 'gain a life', 'lose a life', 'swap with the leader', 'win', 'end the game',
  ...RULE_MESSAGES.map((m) => `say "${m}"`),
];

const EXAMPLES_BY_HEAD: Record<string, string> = {
  game: 'game "My game"',
  goal: 'goal "Reach the top first."',
  how: 'how to play "Answer to move."',
  race: 'race to 30 steps',
  climb: 'climb to 24 metres',
  collect: 'collect 20 gems',
  build: 'build a tower of 60 bricks',
  claim: 'claim a 6 by 6 map',
  lives: '3 lives',
  tug: 'tug of war to 15 pulls',
  points: 'points are called coins',
  twist: 'twist: shortcuts',
  questions: 'questions: together, 20 questions, 20 seconds each',
  right: 'right answer: move 2 steps',
  quick: 'quick answer: up to 2 more',
  streak: 'streak bonus: up to 2 more',
  wrong: 'wrong answer: lose 1',
  surprise: 'surprise "Big prize": chance 1, gives 4',
  every: 'every 4 right answers: power-up (double, shield)',
  events: 'events: golden round, rally',
  wins: 'wins: first to the goal',
  stops: 'stops after 5 minutes',
  looks: 'looks: 3D meadow, zigzag track, day',
  camera: 'camera: behind your Glim',
  props: 'props: trees, flags',
  board: 'board: bold, colour blue, second colour yellow',
  cover: 'cover: flag, colour green',
  each: 'each player has 0 coins',
  the: 'the game has 0 rounds',
  when: 'when a player answers right: gain 1',
};

/** Everything you can write, grouped, each with an example that inserts itself. */
export const CODE_CATALOGUE: readonly CodeEntry[] = [
  { group: 'The game', code: 'game "My game"', help: 'Its name, 3 to 40 characters.' },
  { group: 'The game', code: 'goal "Reach the finish first."', help: 'The goal in one sentence (optional).' },
  { group: 'The game', code: 'how to play "Answer to move."', help: 'A line of help for players. Up to 4.' },
  { group: 'What it is about', code: 'race to 30 steps', help: 'A race along a track, 10 to 60 long. The last word names the score.' },
  { group: 'What it is about', code: 'climb to 24 metres', help: 'A climb, 10 to 60 high.' },
  { group: 'What it is about', code: 'collect 20 gems', help: 'Open squares on your own grid to find gems, 5 to 60 to win.' },
  { group: 'What it is about', code: 'build a tower of 60 bricks', help: 'The whole room builds one tower, 10 to 400 bricks.' },
  { group: 'What it is about', code: 'claim a 6 by 6 map', help: 'Claim squares on a shared map, 4 to 8 a side.' },
  { group: 'What it is about', code: '3 lives', help: 'Keep your lives: a wrong answer costs one. 1 to 5.' },
  { group: 'What it is about', code: 'tug of war to 15 pulls', help: 'Two teams pull a rope, 5 to 40 to win.' },
  { group: 'What it is about', code: 'points are called coins', help: 'What the score is called, in the plural.' },
  ...BLUEPRINT_KINDS.map((k) => ({ group: 'What it is about', code: `twist: ${TWIST_WORD[k]}`, help: `For a ${KIND_INFO[k].noun}: ${KIND_INFO[k].twist.help}` })),
  { group: 'Questions and answers', code: 'questions: together, 20 questions, 20 seconds each', help: 'Everyone answers the same question at once.' },
  { group: 'Questions and answers', code: 'questions: own pace, 30 each, 20 seconds each', help: 'Everyone answers as fast as they like.' },
  { group: 'Questions and answers', code: 'right answer: move 2 steps', help: 'What a right answer gives, 1 to 10.' },
  { group: 'Questions and answers', code: 'quick answer: up to 2 more', help: 'Extra for a quick answer, up to 5.' },
  { group: 'Questions and answers', code: 'streak bonus: up to 2 more', help: '1 more for each right answer in a row, up to 5.' },
  { group: 'Questions and answers', code: 'wrong answer: lose 1', help: 'What a wrong answer costs, 0 to 5. Or “nothing”.' },
  { group: 'Questions and answers', code: 'surprise "Big prize": chance 1, gives 4', help: 'A right answer opens a surprise. Write 2 to 4; players see the chances.' },
  { group: 'Extras', code: 'every 4 right answers: power-up (double, shield)', help: 'Power-ups: double, shield, leap, freeze, gust.' },
  { group: 'Extras', code: 'events: golden round, rally', help: 'Events for everyone, now and then.' },
  { group: 'Winning', code: 'wins: first to the goal', help: 'The first to reach the goal wins.' },
  { group: 'Winning', code: 'wins: most when time runs out', help: 'Whoever has the most at the end wins.' },
  { group: 'Winning', code: 'wins: last one standing', help: 'For a lives game: the last player in wins.' },
  { group: 'Winning', code: 'wins: everyone together', help: 'For a tower: the room wins together.' },
  { group: 'Winning', code: 'stops after 5 minutes', help: 'The longest it lasts, 1 to 15 minutes. Every game ends.' },
  { group: 'Numbers the game keeps', code: 'each player has 0 coins', help: 'A number for each player. Add “, up to 99” for a top.' },
  { group: 'Numbers the game keeps', code: 'each player has 3 health, up to 5', help: 'Use it in rules: “take 1 health”, “when a player runs out of health”.' },
  { group: 'Numbers the game keeps', code: 'each team has 0 flags', help: 'A number for each team.' },
  { group: 'Numbers the game keeps', code: 'the game has 0 rounds', help: 'One number for the whole game, everyone sees it.' },
  ...WHEN_EXAMPLES.map((w) => ({ group: 'Rules: when', code: `${w}: gain 1`, help: 'Starts a rule. After the colon, say what happens.' })),
  ...IF_EXAMPLES.map((c) => ({ group: 'Rules: if', code: `when a player answers right, if ${c}: gain 1`, help: 'Only when this is true. Join two with “and”.' })),
  ...DO_EXAMPLES.filter((x) => !x.startsWith('say') || x === 'say "Nice one!"').map((a) => ({ group: 'Rules: do', code: `when a player answers right: ${a}`, help: 'Do up to 3 things, joined with “and”.' })),
  { group: 'Rules: do', code: 'when a player answers right: say "Nice one!"', help: `Show one of Ludora’s messages: ${RULE_MESSAGES.join(', ')}` },
  { group: 'How it looks', code: 'looks: 2D', help: 'A clear board on every screen.' },
  { group: 'How it looks', code: 'looks: 3D meadow, zigzag track, day', help: `A 3D scene for races and climbs: ${SCENE_PLACES.join(', ').replace('-', ' ')}; straight, zigzag or loop; day, dusk or night.` },
  { group: 'How it looks', code: 'camera: from the side', help: 'In 3D: behind your Glim, from above or from the side.' },
  { group: 'How it looks', code: 'props: trees, flags', help: `In 3D, up to 4: ${SCENE_PROPS.join(', ')}.` },
  { group: 'How it looks', code: 'board: bold, colour blue, second colour yellow', help: `Bold, soft or striped; colours by name (${Object.keys(NAMED_HUES).join(', ')}) or 0 to 359.` },
  { group: 'How it looks', code: 'cover: flag, colour green', help: `The cover picture: ${GAME_GLYPHS.join(', ')}.` },
];

/** Whole lines a person might be typing, for completions. */
function completionLines(names: string[]): string[] {
  const out = new Set<string>();
  for (const e of CODE_CATALOGUE) out.add(e.code);
  for (const v of Object.values(EXAMPLES_BY_HEAD)) out.add(v);
  for (const p of SCENE_PLACES) out.add(`looks: 3D ${p.replace('-', ' ')}, zigzag track, day`);
  for (const k of BLUEPRINT_KINDS) out.add(`twist: ${TWIST_WORD[k]}`);
  for (const g of GAME_GLYPHS) out.add(`cover: ${g}, colour blue`);
  for (const p of POWER_UPS) out.add(`every 4 right answers: power-up (${p})`);
  for (const n of names) {
    out.add(`when a player reaches 10 ${n}`);
    out.add(`when a player runs out of ${n}`);
  }
  return [...out];
}

export interface Completion {
  /** The word or words to add after what is typed. */
  insert: string;
  /** What it shows: the whole line it leads to. */
  label: string;
}

/**
 * Next-word ideas for a line as typed so far (up to the caret). Rule lines complete each part:
 * the trigger, a condition after “if”, and each action after the colon or “and”.
 */
export function completeLine(before: string, code = ''): Completion[] {
  const names = [...code.matchAll(/^\s*(?:each player|each team|the game) has \S+ ([a-z]+)/gim)].map((m) => m[1]!.toLowerCase());
  const typed = before.replace(/^\s+/, '');
  const lower = typed.toLowerCase();
  if (lower.startsWith('#')) return [];
  // Inside a rule after the colon (or "and"): actions.
  const ruleish = /^(when\b|every \S+ questions?)/.test(lower);
  let candidates: string[];
  let stem = lower;
  if (ruleish && lower.includes(':')) {
    const after = lower.slice(lower.indexOf(':') + 1);
    const parts = after.split(/\band\b/);
    stem = parts[parts.length - 1]!.replace(/^\s+/, '');
    candidates = [...DO_EXAMPLES, ...names.flatMap((n) => [`add 1 ${n}`, `take 1 ${n}`, `set ${n} to 0`])];
  } else if (ruleish && /,?\s+if\s+/.test(lower)) {
    const after = lower.slice(lower.search(/\sif\s/) + 4);
    const parts = after.split(/\band\b/);
    stem = parts[parts.length - 1]!.replace(/^\s+/, '');
    candidates = [...IF_EXAMPLES, ...names.map((n) => `${n} is at least 5`)];
  } else if (ruleish || 'when'.startsWith(lower) && lower.length >= 2) {
    candidates = [...WHEN_EXAMPLES, ...names.flatMap((n) => [`when a player reaches 10 ${n}`, `when a player runs out of ${n}`])].map((w) => `${w}:`);
  } else candidates = completionLines(names);
  const seen = new Set<string>();
  const out: Completion[] = [];
  const isNum = (w: string) => num(w) !== null;
  const typedWords = stem.split(' ');
  const done = typedWords.slice(0, -1);
  const partial = typedWords[typedWords.length - 1]!;
  for (const c of candidates) {
    // Word by word, where any number typed stands for the number in the example.
    const words = c.split(' ');
    if (words.length <= done.length) continue;
    let fits = true;
    const shown = [...words];
    for (let i = 0; i < done.length && fits; i++) {
      const cw = words[i]!.toLowerCase();
      if (cw === done[i]) continue;
      if (isNum(done[i]!) && isNum(cw.replace(/[,%]$/, ''))) {
        shown[i] = done[i]! + (cw.match(/[,%]$/)?.[0] ?? '');
        continue;
      }
      fits = false;
    }
    if (!fits) continue;
    const at = words[done.length]!;
    let insert: string;
    if (partial === '') insert = at;
    else if (at.toLowerCase().startsWith(partial) && at.toLowerCase() !== partial) insert = at.slice(partial.length);
    else if (at.toLowerCase() === partial && words[done.length + 1]) insert = ` ${words[done.length + 1]}`;
    else if (isNum(partial) && isNum(at.replace(/[,%]$/, '')) && words[done.length + 1]) {
      shown[done.length] = partial;
      insert = ` ${words[done.length + 1]}`;
    } else continue;
    if (!insert.trim() || seen.has(insert.toLowerCase())) continue;
    seen.add(insert.toLowerCase());
    out.push({ insert, label: shown.join(' ') });
    if (out.length >= 8) break;
  }
  return out;
}

export type CodeToken = { text: string; kind: 'comment' | 'string' | 'number' | 'word' | 'key' | 'plain' };

const KEY_WORDS = new Set([
  'game', 'goal', 'how', 'to', 'play', 'race', 'climb', 'collect', 'build', 'claim', 'lives', 'life', 'tug', 'of', 'war', 'twist', 'questions', 'right', 'answer', 'quick',
  'streak', 'bonus', 'wrong', 'surprise', 'every', 'events', 'wins', 'stops', 'after', 'looks', 'camera', 'props', 'board', 'cover', 'each', 'player', 'team', 'has', 'when', 'if',
  'and', 'the', 'points', 'are', 'called',
]);

/** Colours for the code view: comments, strings, numbers and the words statements start with. */
export function highlightLine(line: string): CodeToken[] {
  const { code, comment } = splitComment(line);
  const out: CodeToken[] = [];
  const re = /("[^"]*"?|“[^”]*”?)|(\b\d+%?)|([A-Za-z][A-Za-z'-]*)|([^"“\dA-Za-z]+)/g;
  let m: RegExpExecArray | null;
  let firstWords = true;
  while ((m = re.exec(code))) {
    if (m[1]) out.push({ text: m[1], kind: 'string' });
    else if (m[2]) out.push({ text: m[2], kind: 'number' });
    else if (m[3]) {
      const w = m[3].toLowerCase();
      out.push({ text: m[3], kind: firstWords && KEY_WORDS.has(w) ? 'key' : 'word' });
      if (!KEY_WORDS.has(w)) firstWords = false;
    } else {
      if (m[4]!.includes(':')) firstWords = true;
      out.push({ text: m[4]!, kind: 'plain' });
    }
  }
  if (comment) out.push({ text: comment, kind: 'comment' });
  return out;
}

/** Every room trigger, for the forms: whose actions apply to each player. */
export const isRoomTrigger = (w: RuleWhen['type']) => ROOM_TRIGGERS.includes(w);
