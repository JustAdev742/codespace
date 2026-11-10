import { containsBlockedLanguage, type AwardView, type Feeling, type HostReportView, type QuestionReportView } from '@ludora/shared';
import type { AnswerRecord, EngineResults, EngineStanding } from '@ludora/engine';

/*
 * What the room works out from a finished game's answers, on the server: the podium awards
 * everyone sees, and the class summary only the host sees. Pure functions, so they are tested on
 * their own and the playable demo runs them too.
 */

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/** Graded answers in the order given, each player's first try at each question only. */
function firstTries(answers: readonly AnswerRecord[]): AnswerRecord[] {
  const seen = new Set<string>();
  const out: AnswerRecord[] = [];
  for (const a of [...answers].sort((x, y) => x.at - y.at)) {
    if ((a.kind ?? 'answer') === 'self') continue;
    const key = `${a.playerId}\u0000${a.qid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/**
 * Awards beyond the top three: longest streak, fastest right answer, most improved (second half of
 * a player's answers against the first) and best comeback (place on right answers at half time
 * against the final place). Each needs enough play to mean something; bots never win one while a
 * person could.
 */
export function computeAwards(r: Pick<EngineResults, 'answers' | 'standings' | 'durationMs'>, bots: ReadonlySet<string> = new Set()): AwardView[] {
  const names = new Map(r.standings.map((s) => [s.playerId, s.name]));
  const people = r.standings.filter((s) => !bots.has(s.playerId));
  const eligible = new Set((people.length ? people : r.standings).map((s) => s.playerId));
  const answers = r.answers.filter((a) => eligible.has(a.playerId) && names.has(a.playerId));
  const graded = answers.filter((a) => (a.kind ?? 'answer') === 'answer').sort((x, y) => x.at - y.at);
  const awards: AwardView[] = [];
  const award = (kind: AwardView['kind'], playerId: string, detail: string) => awards.push({ kind, playerId, name: names.get(playerId) ?? 'Player', detail });

  // Longest streak of right answers in a row (at least 3).
  const run = new Map<string, number>();
  let streak: { id: string; n: number } | null = null;
  for (const a of graded) {
    const n = a.correct ? (run.get(a.playerId) ?? 0) + 1 : 0;
    run.set(a.playerId, n);
    if (n >= 3 && (!streak || n > streak.n)) streak = { id: a.playerId, n };
  }
  if (streak) award('streak', streak.id, `${streak.n} right in a row`);

  // Fastest right answer (a real answer, not a guess in under a quarter of a second).
  let fastest: AnswerRecord | null = null;
  for (const a of graded) if (a.correct && a.responseMs >= 250 && (!fastest || a.responseMs < fastest.responseMs)) fastest = a;
  if (fastest) award('fastest', fastest.playerId, `Right in ${(fastest.responseMs / 1000).toFixed(1)} seconds`);

  // Most improved: right answers in the second half of their own answers against the first half (at least 4 answers).
  const tries = firstTries(answers);
  const byPlayer = new Map<string, AnswerRecord[]>();
  for (const a of tries) byPlayer.set(a.playerId, [...(byPlayer.get(a.playerId) ?? []), a]);
  let improved: { id: string; from: number; to: number } | null = null;
  for (const [id, list] of byPlayer) {
    if (list.length < 4) continue;
    const half = Math.floor(list.length / 2);
    const rate = (xs: AnswerRecord[]) => xs.filter((a) => a.correct).length / xs.length;
    const from = rate(list.slice(0, half));
    const to = rate(list.slice(half));
    if (to - from >= 0.2 && (!improved || to - from > improved.to - improved.from)) improved = { id, from, to };
  }
  if (improved) award('improved', improved.id, `From ${Math.round(improved.from * 100)}% to ${Math.round(improved.to * 100)}% right`);

  // Best comeback: place on right answers at half time against the final place (up at least 2 places).
  const mid = r.durationMs / 2;
  const atHalf = new Map<string, number>();
  for (const a of tries) if (a.at <= mid && a.correct) atHalf.set(a.playerId, (atHalf.get(a.playerId) ?? 0) + 1);
  const ranked = (people.length ? people : r.standings).slice();
  const halfOrder = ranked.slice().sort((x, y) => (atHalf.get(y.playerId) ?? 0) - (atHalf.get(x.playerId) ?? 0));
  const halfRank = new Map<string, number>();
  halfOrder.forEach((s, i) => {
    const prev = halfOrder[i - 1];
    halfRank.set(s.playerId, prev && (atHalf.get(prev.playerId) ?? 0) === (atHalf.get(s.playerId) ?? 0) ? halfRank.get(prev.playerId)! : i + 1);
  });
  let comeback: { s: EngineStanding; from: number; to: number } | null = null;
  if (tries.some((a) => a.at > mid) && ranked.length >= 3) {
    // Final places among the people, so bots in between do not count as places climbed.
    const finalOrder = ranked.slice().sort((a, b) => a.rank - b.rank);
    finalOrder.forEach((s, i) => {
      const prev = finalOrder[i - 1];
      const to = prev && prev.rank === s.rank ? finalOrder.findIndex((x) => x.rank === s.rank) + 1 : i + 1;
      const from = halfRank.get(s.playerId) ?? ranked.length;
      if (from - to >= 2 && (!comeback || from - to > comeback.from - comeback.to)) comeback = { s, from, to };
    });
  }
  const cb = comeback as { s: EngineStanding; from: number; to: number } | null;
  if (cb) award('comeback', cb.s.playerId, `From ${ordinal(cb.from)} to ${ordinal(cb.to)}`);
  return awards;
}

/** The questions most players got wrong at the first try, hardest first. Questions everyone got right are left out. */
export function missedQuestionIds(answers: readonly AnswerRecord[], limit: number): string[] {
  const stats = new Map<string, { n: number; right: number; first: number }>();
  firstTries(answers).forEach((a, i) => {
    const s = stats.get(a.qid) ?? { n: 0, right: 0, first: i };
    s.n++;
    if (a.correct) s.right++;
    stats.set(a.qid, s);
  });
  return [...stats]
    .filter(([, s]) => s.right < s.n)
    .sort((a, b) => a[1].right / a[1].n - b[1].right / b[1].n || a[1].first - b[1].first)
    .slice(0, limit)
    .map(([id]) => id);
}

/** The class summary for the teacher: accuracy, each question, the most common wrong answers, who may need a hand. */
export function hostReport(
  answers: readonly AnswerRecord[],
  standings: readonly Pick<EngineStanding, 'playerId' | 'name'>[],
  prompt: (qid: string) => string,
  threshold: number,
  feelings: Record<Feeling, number> | null,
): HostReportView {
  const tries = firstTries(answers);
  const order: string[] = [];
  const per = new Map<string, { answered: number; right: number; ms: number; wrong: Map<string, { text: string; count: number }> }>();
  for (const a of tries) {
    let q = per.get(a.qid);
    if (!q) {
      q = { answered: 0, right: 0, ms: 0, wrong: new Map() };
      per.set(a.qid, q);
      order.push(a.qid);
    }
    q.answered++;
    q.ms += Math.max(0, a.responseMs);
    if (a.correct) q.right++;
    else if (a.given && !containsBlockedLanguage(a.given)) {
      const key = a.given.trim().toLowerCase();
      const w = q.wrong.get(key) ?? { text: a.given.trim(), count: 0 };
      w.count++;
      q.wrong.set(key, w);
    }
  }
  const questions: QuestionReportView[] = order.map((qid) => {
    const q = per.get(qid)!;
    const top = [...q.wrong.values()].sort((a, b) => b.count - a.count)[0] ?? null;
    return { qid, prompt: prompt(qid), answered: q.answered, right: q.right, commonWrong: top, avgMs: q.answered ? Math.round(q.ms / q.answered) : 0 };
  });
  const players = new Map<string, { right: number; answered: number }>();
  for (const a of tries) {
    const p = players.get(a.playerId) ?? { right: 0, answered: 0 };
    p.answered++;
    if (a.correct) p.right++;
    players.set(a.playerId, p);
  }
  const needHelp = standings
    .map((s) => ({ playerId: s.playerId, name: s.name, ...(players.get(s.playerId) ?? { right: 0, answered: 0 }) }))
    .filter((p) => p.answered >= 3 && p.right / p.answered < threshold)
    .sort((a, b) => a.right / a.answered - b.right / b.answered || a.name.localeCompare(b.name));
  return {
    answered: tries.length,
    right: tries.filter((a) => a.correct).length,
    questions,
    needHelp,
    threshold,
    feelings,
  };
}
