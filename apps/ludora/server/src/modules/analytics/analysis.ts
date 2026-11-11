import { containsBlockedLanguage } from '@ludora/shared';

/*
 * What a teacher learns from a finished game, worked out from its saved answers. Pure functions
 * over plain rows, so each is unit tested with hand-checked fixtures (server/test/report-analysis.test.ts).
 *
 * Counting rules, the same everywhere in reports:
 * - A question counts once per player, judged on their first try. Retries in puzzle modes
 *   ('attempt') add to the attempts count only; self-graded flashcards ('self') never count as
 *   right or wrong. Practice bots are never saved with the answers.
 * - Poll votes are never saved as answers, so they stay out of accuracy by construction.
 */

export type AnswerKind = 'answer' | 'attempt' | 'self';

export interface AnswerRow {
  id: number;
  playerKey: string;
  questionId: string;
  correct: boolean;
  responseMs: number;
  kind: string;
  given: string | null;
}

export interface PlayerRow {
  playerKey: string;
  name: string;
  isBot: boolean;
  isGuest: boolean;
  teamId: string | null;
  answered: number;
  correct: number;
  leftEarly: boolean;
  score: number;
}

export interface WrongAnswer {
  text: string;
  count: number;
}

export interface QuestionAnalysis {
  questionId: string;
  /** Players who answered it (first tries). */
  players: number;
  right: number;
  /** Share of players right first time, 0-1. */
  firstTryRate: number;
  /** Every try, retries included. */
  attempts: number;
  /** Average time on the first try, in ms. 0 when unknown. */
  avgResponseMs: number;
  /** Median time on the first try, in ms. 0 when unknown. */
  medianResponseMs: number;
  /** The most common wrong answer in words, when the question type has words for answers. */
  commonWrong: WrongAnswer | null;
  /** Players whose first try was wrong. */
  wrong: number;
}

export interface TeamRow {
  teamId: string;
  name: string;
  rank: number | null;
  score: number | null;
  label: string | null;
}

const graded = (a: AnswerRow) => a.kind !== 'self';

/** Each player's first graded try at each question, in the order they were given. */
export function firstTries(answers: readonly AnswerRow[]): AnswerRow[] {
  const seen = new Set<string>();
  const out: AnswerRow[] = [];
  for (const a of [...answers].sort((x, y) => x.id - y.id)) {
    if (!graded(a)) continue;
    const key = `${a.playerKey}\u0000${a.questionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/** The middle value. Times leave out zeros (unknown); counts keep them (`keepZeros`). */
export function median(values: readonly number[], keepZeros = false): number {
  const v = values.filter((x) => Number.isFinite(x) && (keepZeros ? x >= 0 : x > 0)).sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : Math.round((v[mid - 1]! + v[mid]!) / 2);
}

/** A wrong answer fit to show a teacher: words Ludora does not allow are left out. */
export function shownAnswer(given: string | null): string | null {
  const t = given?.replace(/\s+/g, ' ').trim();
  if (!t || containsBlockedLanguage(t)) return null;
  return t.slice(0, 80);
}

/** How every question went. Hardest first; among equals, the one more players answered. */
export function analyseQuestions(answers: readonly AnswerRow[]): QuestionAnalysis[] {
  const tries = firstTries(answers);
  const attempts = new Map<string, number>();
  for (const a of answers) if (graded(a)) attempts.set(a.questionId, (attempts.get(a.questionId) ?? 0) + 1);
  const per = new Map<string, { rows: AnswerRow[] }>();
  for (const a of tries) {
    const q = per.get(a.questionId) ?? { rows: [] };
    q.rows.push(a);
    per.set(a.questionId, q);
  }
  const out: QuestionAnalysis[] = [];
  for (const [questionId, { rows }] of per) {
    const right = rows.filter((r) => r.correct).length;
    const wrongs = new Map<string, WrongAnswer>();
    for (const r of rows) {
      if (r.correct) continue;
      const text = shownAnswer(r.given);
      if (!text) continue;
      const key = text.toLowerCase();
      const w = wrongs.get(key) ?? { text, count: 0 };
      w.count++;
      wrongs.set(key, w);
    }
    const commonWrong = [...wrongs.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))[0] ?? null;
    const times = rows.map((r) => r.responseMs).filter((ms) => ms > 0);
    out.push({
      questionId,
      players: rows.length,
      right,
      firstTryRate: rows.length ? right / rows.length : 0,
      attempts: attempts.get(questionId) ?? rows.length,
      avgResponseMs: times.length ? Math.round(times.reduce((n, x) => n + x, 0) / times.length) : 0,
      medianResponseMs: median(times),
      commonWrong,
      wrong: rows.length - right,
    });
  }
  return out.sort((a, b) => a.firstTryRate - b.firstTryRate || b.players - a.players || a.questionId.localeCompare(b.questionId));
}

/**
 * Misconceptions worth teaching to: questions where one wrong answer was given by at least two
 * players, or by a quarter of those who answered. Most-chosen wrong answer first.
 */
export function misconceptions(questions: readonly QuestionAnalysis[]): QuestionAnalysis[] {
  return questions
    .filter((q) => q.commonWrong && (q.commonWrong.count >= 2 || q.commonWrong.count / Math.max(1, q.players) >= 0.25))
    .sort((a, b) => b.commonWrong!.count - a.commonWrong!.count || a.firstTryRate - b.firstTryRate);
}

/** The hardest and easiest questions. A question in one list is never in the other. */
export function hardestAndEasiest(questions: readonly QuestionAnalysis[], n = 3): { hardest: QuestionAnalysis[]; easiest: QuestionAnalysis[] } {
  const sorted = [...questions].sort((a, b) => a.firstTryRate - b.firstTryRate || b.players - a.players || a.questionId.localeCompare(b.questionId));
  const count = Math.min(n, Math.floor(sorted.length / 2));
  return { hardest: sorted.slice(0, count), easiest: sorted.slice(sorted.length - count).reverse() };
}

export interface ParticipationRow {
  playerKey: string;
  name: string;
  /** Different questions this player answered. */
  answered: number;
  leftEarly: boolean;
  /** Under half of the questions most players answered. */
  fewAnswers: boolean;
}

/**
 * Who answered fewer than half the questions, and who left early. "Half" is measured against
 * what most players answered (the median), so in self-paced modes, where everyone sees a
 * different number of questions, a steady player is not flagged for not racing.
 */
export function participation(players: readonly PlayerRow[], answers: readonly AnswerRow[]): { expected: number; rows: ParticipationRow[] } {
  const people = players.filter((p) => !p.isBot);
  const tries = firstTries(answers);
  const counts = new Map<string, number>();
  for (const a of tries) counts.set(a.playerKey, (counts.get(a.playerKey) ?? 0) + 1);
  const expected = median(people.map((p) => counts.get(p.playerKey) ?? 0), true);
  const rows = people
    .map((p) => {
      const answered = counts.get(p.playerKey) ?? 0;
      return { playerKey: p.playerKey, name: p.name, answered, leftEarly: p.leftEarly, fewAnswers: expected > 0 && answered < expected / 2 };
    })
    .filter((r) => r.leftEarly || r.fewAnswers)
    .sort((a, b) => a.answered - b.answered || a.name.localeCompare(b.name));
  return { expected, rows };
}

export interface GuessRow {
  playerKey: string;
  name: string;
  /** Wrong first tries much faster than the class took on the same question. */
  fastWrong: number;
  answered: number;
}

/** A wrong answer counts as very fast under this share of the question's median time, and never above 4 seconds. */
export const FAST_SHARE = 0.4;
export const FAST_CAP_MS = 4000;

/**
 * "Possibly guessing": players with at least three very fast wrong answers that make up at least a
 * third of what they answered. A prompt to check in, not a verdict; questions answered by fewer
 * than three players are skipped because their median time means little.
 */
export function possiblyGuessing(players: readonly PlayerRow[], answers: readonly AnswerRow[], questions: readonly QuestionAnalysis[]): GuessRow[] {
  const medians = new Map(questions.filter((q) => q.players >= 3 && q.medianResponseMs > 0).map((q) => [q.questionId, q.medianResponseMs]));
  const tries = firstTries(answers);
  const per = new Map<string, { fast: number; answered: number }>();
  for (const a of tries) {
    const p = per.get(a.playerKey) ?? { fast: 0, answered: 0 };
    p.answered++;
    const m = medians.get(a.questionId);
    if (!a.correct && m && a.responseMs > 0 && a.responseMs < Math.min(m * FAST_SHARE, FAST_CAP_MS)) p.fast++;
    per.set(a.playerKey, p);
  }
  return players
    .filter((p) => !p.isBot)
    .map((p) => ({ playerKey: p.playerKey, name: p.name, fastWrong: per.get(p.playerKey)?.fast ?? 0, answered: per.get(p.playerKey)?.answered ?? 0 }))
    .filter((r) => r.fastWrong >= 3 && r.fastWrong / r.answered >= 1 / 3)
    .sort((a, b) => b.fastWrong - a.fastWrong || a.name.localeCompare(b.name));
}

export interface TeamReport {
  teamId: string;
  name: string;
  rank: number | null;
  score: number | null;
  label: string | null;
  members: number;
  answered: number;
  correct: number;
  /** Right first time across the team's members, 0-1, or null with no answers. */
  rate: number | null;
}

/** Each team's players and accuracy next to the team's result. Teams with no players are left out. */
export function teamReport(players: readonly PlayerRow[], teams: readonly TeamRow[], answers: readonly AnswerRow[]): TeamReport[] {
  if (!teams.length) return [];
  const tries = firstTries(answers);
  const teamOf = new Map(players.map((p) => [p.playerKey, p.teamId]));
  return teams
    .map((t) => {
      const mine = tries.filter((a) => teamOf.get(a.playerKey) === t.teamId);
      const correct = mine.filter((a) => a.correct).length;
      return {
        teamId: t.teamId,
        name: t.name,
        rank: t.rank,
        score: t.score,
        label: t.label,
        members: players.filter((p) => p.teamId === t.teamId && !p.isBot).length,
        answered: mine.length,
        correct,
        rate: mine.length ? correct / mine.length : null,
      };
    })
    .filter((t) => t.members > 0)
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.name.localeCompare(b.name));
}

export interface PaceRow {
  playerKey: string;
  name: string;
  answered: number;
  correct: number;
  /** Questions answered per minute of the game. */
  perMinute: number;
}

/** Self-paced modes: how many questions each player got through, and how fast. Most answered first. */
export function pace(players: readonly PlayerRow[], answers: readonly AnswerRow[], durationMs: number): PaceRow[] {
  const tries = firstTries(answers);
  const minutes = Math.max(durationMs, 1) / 60_000;
  return players
    .filter((p) => !p.isBot)
    .map((p) => {
      const mine = tries.filter((a) => a.playerKey === p.playerKey);
      return { playerKey: p.playerKey, name: p.name, answered: mine.length, correct: mine.filter((a) => a.correct).length, perMinute: Math.round((mine.length / minutes) * 10) / 10 };
    })
    .sort((a, b) => b.answered - a.answered || b.correct - a.correct || a.name.localeCompare(b.name));
}

export interface SetQuestionPlay {
  gameId: string;
  endedAt: string;
  questionId: string;
  players: number;
  right: number;
  avgResponseMs: number;
  commonWrong: WrongAnswer | null;
}

export type RewriteReason = 'too_hard' | 'too_easy' | 'one_wrong_answer' | 'slow';

export interface SetQuestionSummary {
  questionId: string;
  games: number;
  players: number;
  rate: number;
  avgResponseMs: number;
  /** Right first time in each game it was played, oldest first. */
  history: { gameId: string; endedAt: string; rate: number; players: number }[];
  commonWrong: WrongAnswer | null;
  reasons: RewriteReason[];
}

/** Enough answers to judge a question by: fewer and nothing is flagged. */
export const MIN_PLAYERS_TO_JUDGE = 8;

/**
 * One set across every game a teacher hosted with it: how each question has done, and which to
 * look at again. Flags, each needing at least eight answers: almost nobody gets it (under 25%),
 * everybody does (95% and over, after two games or more), one wrong answer took half the players
 * or more (a misleading choice or a misconception), or it took players twice as long as the set's
 * typical question.
 */
export function setPerformance(plays: readonly SetQuestionPlay[]): SetQuestionSummary[] {
  const per = new Map<string, SetQuestionPlay[]>();
  for (const p of plays) per.set(p.questionId, [...(per.get(p.questionId) ?? []), p]);
  const summaries = [...per].map(([questionId, rows]) => {
    const players = rows.reduce((n, r) => n + r.players, 0);
    const right = rows.reduce((n, r) => n + r.right, 0);
    const timeWeight = rows.reduce((n, r) => n + (r.avgResponseMs > 0 ? r.players : 0), 0);
    const avgResponseMs = timeWeight ? Math.round(rows.reduce((n, r) => n + (r.avgResponseMs > 0 ? r.avgResponseMs * r.players : 0), 0) / timeWeight) : 0;
    const wrongs = new Map<string, WrongAnswer>();
    for (const r of rows) {
      if (!r.commonWrong) continue;
      const key = r.commonWrong.text.toLowerCase();
      const w = wrongs.get(key) ?? { text: r.commonWrong.text, count: 0 };
      w.count += r.commonWrong.count;
      wrongs.set(key, w);
    }
    const commonWrong = [...wrongs.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))[0] ?? null;
    const history = [...rows].sort((a, b) => a.endedAt.localeCompare(b.endedAt)).map((r) => ({ gameId: r.gameId, endedAt: r.endedAt, rate: r.players ? r.right / r.players : 0, players: r.players }));
    return { questionId, games: new Set(rows.map((r) => r.gameId)).size, players, rate: players ? right / players : 0, avgResponseMs, history, commonWrong, reasons: [] as RewriteReason[] };
  });
  const typical = median(summaries.map((s) => s.avgResponseMs));
  for (const s of summaries) {
    if (s.players < MIN_PLAYERS_TO_JUDGE) continue;
    if (s.rate < 0.25) s.reasons.push('too_hard');
    if (s.rate >= 0.95 && s.games >= 2) s.reasons.push('too_easy');
    if (s.commonWrong && s.commonWrong.count / s.players >= 0.5) s.reasons.push('one_wrong_answer');
    if (typical > 0 && summaries.length >= 3 && s.avgResponseMs > typical * 2) s.reasons.push('slow');
  }
  return summaries.sort((a, b) => b.reasons.length - a.reasons.length || a.rate - b.rate || a.questionId.localeCompare(b.questionId));
}

/** The oldest end time a host's retention setting keeps: games that ended before it are removed. */
export function retentionCutoff(months: number, now = new Date()): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}
