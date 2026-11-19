import { computeGameReward, type GameRewardInput } from '../progression/rewards.ts';
import type { EconomyRules } from './config.ts';

/*
 * What a rule change means for a player, in games a person can picture (D58). The economy room
 * shows these side by side before anything is saved: "a player who answers 8 of 10 and comes 2nd
 * earns 97 Sparks instead of 82". Pure, so the maths is tested on its own and is the same maths
 * the server pays with (computeGameReward).
 */

export interface PreviewScenario {
  id: string;
  /** A plain sentence about the player, e.g. "answers 8 of 10 and comes 2nd of 5". */
  who: string;
  input: Omit<GameRewardInput, 'sparksToday'>;
}

export const PREVIEW_SCENARIOS: PreviewScenario[] = [
  { id: 'second', who: 'answers 8 of 10 and comes 2nd of 5 in a class game', input: { rank: 2, humans: 5, answered: 10, correct: 8, solo: false, outcome: 'competitive' } },
  { id: 'winner', who: 'answers 10 of 10 and wins a class game of 25', input: { rank: 1, humans: 25, answered: 10, correct: 10, solo: false, outcome: 'competitive' } },
  { id: 'middle', who: 'answers 5 of 10 and comes 12th of 25', input: { rank: 12, humans: 25, answered: 10, correct: 5, solo: false, outcome: 'competitive' } },
  { id: 'team', who: 'answers 7 of 10 in a team game the class wins', input: { rank: 1, humans: 25, answered: 10, correct: 7, solo: false, outcome: 'coop-win' } },
  { id: 'solo', who: 'answers 8 of 10 playing on their own', input: { rank: 1, humans: 1, answered: 10, correct: 8, solo: true, outcome: 'competitive' } },
  { id: 'idle', who: 'joins but answers only 2 questions', input: { rank: 20, humans: 25, answered: 2, correct: 1, solo: false, outcome: 'competitive' } },
];

export interface PreviewRow {
  id: string;
  who: string;
  before: { sparks: number; xp: number };
  after: { sparks: number; xp: number };
}

export interface RulesPreview {
  rows: PreviewRow[];
  /** Games like the first scenario a player needs to reach the daily cap, before and after. Null when a game pays nothing. */
  gamesToCap: { before: number | null; after: number | null };
  /** A ready-made sentence for the first scenario, the one people ask about. */
  headline: string;
  /** A boost is left out of the rows (they show a normal day); this says so when one is set. */
  boostNote: string | null;
}

function gamesToCap(rules: EconomyRules, s: PreviewScenario): number | null {
  const one = computeGameReward(rules, { ...s.input, sparksToday: 0 }).sparks;
  if (one <= 0) return null;
  return Math.ceil(rules.game.dailySparkCap / one);
}

export function previewRules(before: EconomyRules, after: EconomyRules, scenarios: PreviewScenario[] = PREVIEW_SCENARIOS): RulesPreview {
  const rows = scenarios.map((s) => {
    const a = computeGameReward(before, { ...s.input, sparksToday: 0 });
    const b = computeGameReward(after, { ...s.input, sparksToday: 0 });
    return { id: s.id, who: s.who, before: { sparks: a.sparks, xp: a.xp }, after: { sparks: b.sparks, xp: b.xp } };
  });
  const first = rows[0]!;
  const headline =
    first.before.sparks === first.after.sparks
      ? `A player who ${first.who} still earns ${first.after.sparks} Sparks.`
      : `A player who ${first.who} earns ${first.after.sparks} Sparks instead of ${first.before.sparks}.`;
  const boost = after.boost;
  return {
    rows,
    gamesToCap: { before: gamesToCap(before, scenarios[0]!), after: gamesToCap(after, scenarios[0]!) },
    headline,
    boostNote: boost ? `These are normal days. While "${boost.label}" runs, game Sparks are multiplied by ${boost.multiplier}, up to the same daily cap.` : null,
  };
}
