import { z } from 'zod';
import { cleanText, containsBlockedLanguage } from './validation.ts';

/*
 * Game Maker rules: the part of a blueprint that lets a maker build the game they have in mind
 * instead of only choosing parts. A rule is "when something happens, if these hold, do these",
 * every piece taken from the catalogues below and run by the made-game interpreter. A maker can
 * also give the game its own numbers (coins, health, keys, a round counter), kept for each
 * player, each team or the whole game, and use them in rules.
 *
 * It is data, never code: nothing here is evaluated. Everything is capped: how many numbers and
 * rules, how many conditions and actions in a rule, every amount, and how often a rule can work in
 * one game. Rules never stop a game from ending (the time limit always applies) and never touch
 * rewards.
 */

export const MAX_VARS = 6;
export const MAX_RULES = 16;
export const MAX_RULE_IFS = 2;
export const MAX_RULE_DOS = 3;
/** A rule works at most this many times for each player in one game. */
export const RULE_FIRES_PER_PLAYER = 30;
/** A rule's actions for the whole room (an event, double points, a message to everyone) work at most this many times in one game. */
export const RULE_FIRES_ROOM = 10;
export const VAR_MAX = 999;

export const VAR_SCOPES = ['player', 'team', 'game'] as const;
export type VarScope = (typeof VAR_SCOPES)[number];

export const RULE_TRIGGERS = [
  'start',
  'right',
  'wrong',
  'quick',
  'streak',
  'miss-streak',
  'every',
  'reach',
  'runs-out',
  'halfway',
  'lead',
  'power',
  'round-start',
  'round-end',
  'minutes-left',
] as const;
export type RuleTrigger = (typeof RULE_TRIGGERS)[number];

export const RULE_CONDITIONS = ['at-least', 'at-most', 'first', 'last', 'team', 'chance', 'minutes-left'] as const;
export type RuleCondition = (typeof RULE_CONDITIONS)[number];

export const RULE_ACTIONS = [
  'gain',
  'lose',
  'add',
  'take',
  'set',
  'everyone-gain',
  'behind-gain',
  'ahead-lose',
  'leader-lose',
  'power',
  'shield',
  'freeze-leader',
  'golden',
  'rally',
  'double',
  'life',
  'lose-life',
  'swap-leader',
  'win',
  'end',
  'say',
] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

/** The only words a rule can put on screen: a fixed list, so nothing a maker types is shown during play. */
export const RULE_MESSAGES = [
  'Nice one!',
  'Watch out!',
  'Halfway there!',
  'Keep going!',
  'So close!',
  'Bonus time!',
  'Sudden death!',
  'Last chance!',
  'New leader!',
  'Big moment!',
  'Power up!',
  'Ouch!',
] as const;
export type RuleMessage = (typeof RULE_MESSAGES)[number];

/** Triggers that belong to the whole room, not one player. Their player actions apply to each player in turn. */
export const ROOM_TRIGGERS: readonly RuleTrigger[] = ['start', 'round-start', 'round-end', 'minutes-left'];
/** Triggers that only happen when everyone answers together. */
export const ROUNDS_TRIGGERS: readonly RuleTrigger[] = ['round-start', 'round-end'];
/** Actions that change the whole room once, however many players a rule works for. */
export const ROOM_ACTIONS: readonly RuleAction[] = ['everyone-gain', 'golden', 'rally', 'double', 'end'];
/** Actions that act on another player: listed on the game's card, and kept out of games played together where they harm. */
export const OTHERS_ACTIONS: readonly RuleAction[] = ['behind-gain', 'ahead-lose', 'leader-lose', 'freeze-leader', 'swap-leader'];
export const HARMFUL_ACTIONS: readonly RuleAction[] = ['ahead-lose', 'leader-lose', 'freeze-leader', 'swap-leader'];

/** The number range each part takes, or null when it takes none. */
export const TRIGGER_N: Record<RuleTrigger, [number, number] | null> = {
  start: null,
  right: null,
  wrong: null,
  quick: null,
  streak: [2, 10],
  'miss-streak': [2, 10],
  every: [2, 20],
  reach: [1, VAR_MAX],
  'runs-out': null,
  halfway: null,
  lead: null,
  power: null,
  'round-start': null,
  'round-end': null,
  'minutes-left': [1, 14],
};
export const TRIGGER_VAR: Record<RuleTrigger, 'none' | 'optional' | 'required'> = {
  start: 'none',
  right: 'none',
  wrong: 'none',
  quick: 'none',
  streak: 'none',
  'miss-streak': 'none',
  every: 'none',
  reach: 'optional',
  'runs-out': 'required',
  halfway: 'none',
  lead: 'none',
  power: 'none',
  'round-start': 'none',
  'round-end': 'none',
  'minutes-left': 'none',
};
export const CONDITION_N: Record<RuleCondition, [number, number] | null> = {
  'at-least': [0, VAR_MAX],
  'at-most': [0, VAR_MAX],
  first: null,
  last: null,
  team: [1, 4],
  chance: [1, 99],
  'minutes-left': [1, 14],
};
export const CONDITION_VAR: Record<RuleCondition, 'none' | 'optional'> = {
  'at-least': 'optional',
  'at-most': 'optional',
  first: 'none',
  last: 'none',
  team: 'none',
  chance: 'none',
  'minutes-left': 'none',
};
export const ACTION_N: Record<RuleAction, [number, number] | null> = {
  gain: [1, 10],
  lose: [1, 10],
  add: [1, 100],
  take: [1, 100],
  set: [0, VAR_MAX],
  'everyone-gain': [1, 10],
  'behind-gain': [1, 10],
  'ahead-lose': [1, 10],
  'leader-lose': [1, 10],
  power: null,
  shield: null,
  'freeze-leader': null,
  golden: null,
  rally: null,
  double: null,
  life: null,
  'lose-life': null,
  'swap-leader': null,
  win: null,
  end: null,
  say: null,
};
export const ACTION_VAR: Record<RuleAction, boolean> = Object.fromEntries(RULE_ACTIONS.map((a) => [a, a === 'add' || a === 'take' || a === 'set'])) as Record<RuleAction, boolean>;

/** Words a maker cannot use as the name of a number: they mean something already. */
export const RESERVED_NAMES = new Set([
  'score', 'points', 'lives', 'life', 'game', 'player', 'team', 'everyone', 'leader', 'minutes', 'minute', 'seconds', 'time',
  'questions', 'question', 'when', 'if', 'and', 'or', 'not', 'to', 'up', 'of', 'is', 'at', 'least', 'most', 'a', 'an', 'the', 'win', 'end',
  'chance', 'place', 'first', 'last', 'power', 'shield', 'double', 'leap', 'freeze', 'gust', 'golden', 'rally', 'say', 'every', 'each', 'has',
]);

const POWER_NAMES = ['double', 'shield', 'leap', 'freeze', 'gust'] as const;

const varName = z
  .string()
  .transform((s) => cleanText(s).toLowerCase())
  .pipe(
    z
      .string()
      .regex(/^[a-z]{2,16}$/, 'A number’s name is one word of 2 to 16 letters, such as coins or health.')
      .refine((s) => !RESERVED_NAMES.has(s), 'That word already means something in a game. Choose another name for the number.')
      .refine((s) => !containsBlockedLanguage(s), 'Reword the number’s name: it is not allowed.'),
  );

const n = z.number({ error: 'A rule’s number must be a number.' }).int('A rule’s number must be a whole number.').min(0, 'A rule’s number cannot be below 0.').max(VAR_MAX, `A rule’s number must be at most ${VAR_MAX}.`);

export const gameVarSchema = z
  .object({
    name: varName,
    scope: z.enum(VAR_SCOPES),
    start: z.number().int('A number must start at a whole number.').min(0, 'A number cannot start below 0.').max(VAR_MAX, `A number can start at most at ${VAR_MAX}.`),
    max: z.number().int('A number’s top must be a whole number.').min(1, 'A number’s top must be at least 1.').max(VAR_MAX, `A number’s top can be at most ${VAR_MAX}.`),
  })
  .strict();
export type GameVar = z.infer<typeof gameVarSchema>;

export const ruleSchema = z
  .object({
    when: z.object({ type: z.enum(RULE_TRIGGERS), n: n.optional(), var: varName.optional() }).strict(),
    if: z.array(z.object({ type: z.enum(RULE_CONDITIONS), n: n.optional(), var: varName.optional() }).strict()).max(MAX_RULE_IFS, `A rule can have at most ${MAX_RULE_IFS} conditions.`),
    do: z
      .array(z.object({ type: z.enum(RULE_ACTIONS), n: n.optional(), var: varName.optional(), power: z.enum(POWER_NAMES).optional(), message: z.enum(RULE_MESSAGES).optional() }).strict())
      .min(1, 'A rule needs something to do.')
      .max(MAX_RULE_DOS, `A rule can do at most ${MAX_RULE_DOS} things.`),
  })
  .strict();
export type GameRule = z.infer<typeof ruleSchema>;
export type RuleWhen = GameRule['when'];
export type RuleIf = GameRule['if'][number];
export type RuleDo = GameRule['do'][number];

export const varsSchema = z.array(gameVarSchema).max(MAX_VARS, `A game can have at most ${MAX_VARS} numbers of its own.`);
export const rulesSchema = z.array(ruleSchema).max(MAX_RULES, `A game can have at most ${MAX_RULES} rules.`);
