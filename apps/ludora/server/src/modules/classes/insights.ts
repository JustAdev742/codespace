/*
 * Pure arithmetic behind the class gradebook and insights, kept apart from the
 * database so it can be unit tested.
 */

export interface Play {
  correct: number;
  answered: number;
  score: number;
  endedAt: Date;
}

export interface GradeCell {
  attempts: number;
  best: { correct: number; answered: number; score: number; accuracy: number | null } | null;
  /** Every attempt finished after the due date. */
  late: boolean;
  lastPlayedAt: string | null;
}

/** A student's results at one assignment: their best play (most right, then highest score), and whether it was all late. */
export function gradeCell(plays: readonly Play[], dueAt: Date | null): GradeCell {
  if (!plays.length) return { attempts: 0, best: null, late: false, lastPlayedAt: null };
  let best = plays[0]!;
  for (const p of plays) if (p.correct > best.correct || (p.correct === best.correct && p.score > best.score)) best = p;
  const last = plays.reduce((a, p) => (p.endedAt > a.endedAt ? p : a), plays[0]!);
  return {
    attempts: plays.length,
    best: { correct: best.correct, answered: best.answered, score: best.score, accuracy: best.answered ? best.correct / best.answered : null },
    late: Boolean(dueAt && plays.every((p) => p.endedAt > dueAt)),
    lastPlayedAt: last.endedAt.toISOString(),
  };
}

export type WorkStatus = 'done' | 'late' | 'overdue' | 'todo';

/** Done, done late, overdue (not played and past due) or still to do. */
export function studentStatus(cell: GradeCell, dueAt: Date | null, now: Date): WorkStatus {
  if (cell.attempts > 0) return cell.late ? 'late' : 'done';
  return dueAt && dueAt < now ? 'overdue' : 'todo';
}

export interface FirstTry {
  gameId: string;
  userId: string;
  setId: string | null;
  questionId: string;
  correct: boolean;
  at: Date;
}

export function firstTryRate(tries: readonly FirstTry[]): number | null {
  return tries.length ? tries.filter((t) => t.correct).length / tries.length : null;
}

export interface Missed {
  setId: string | null;
  questionId: string;
  /** First tries at this question across the games given. */
  tries: number;
  wrong: number;
  rate: number;
}

/** Questions with at least one wrong first try, lowest right-first-time rate first, then the most often missed. */
export function mostMissed(tries: readonly FirstTry[]): Missed[] {
  const by = new Map<string, Missed>();
  for (const t of tries) {
    const key = `${t.setId ?? ''}\u0000${t.questionId}`;
    const cur = by.get(key) ?? { setId: t.setId, questionId: t.questionId, tries: 0, wrong: 0, rate: 0 };
    cur.tries++;
    if (!t.correct) cur.wrong++;
    by.set(key, cur);
  }
  return [...by.values()]
    .filter((m) => m.wrong > 0)
    .map((m) => ({ ...m, rate: (m.tries - m.wrong) / m.tries }))
    .sort((a, b) => a.rate - b.rate || b.wrong - a.wrong || a.questionId.localeCompare(b.questionId));
}

export interface HelpEntry {
  id: string;
  displayName: string;
  /** Right first time across their recent answers (0-1). */
  rate: number;
  answers: number;
  missed: { setId: string | null; questionId: string }[];
}

/** At least this many recent answers before a student is judged, so one unlucky question does not flag anyone. */
export const MIN_ANSWERS = 5;

/** Students whose recent right-first-time rate is under the threshold, lowest first, with the questions they missed most recently. */
export function needsAHand(members: readonly { id: string; displayName: string }[], recent: readonly FirstTry[], threshold: number): HelpEntry[] {
  const out: HelpEntry[] = [];
  for (const m of members) {
    const mine = recent.filter((t) => t.userId === m.id);
    if (mine.length < MIN_ANSWERS) continue;
    const rate = firstTryRate(mine)!;
    if (rate >= threshold) continue;
    const seen = new Set<string>();
    const missed = [...mine]
      .filter((t) => !t.correct)
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .filter((t) => {
        const k = `${t.setId}\u0000${t.questionId}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((t) => ({ setId: t.setId, questionId: t.questionId }));
    out.push({ id: m.id, displayName: m.displayName, rate, answers: mine.length, missed });
  }
  return out.sort((a, b) => a.rate - b.rate);
}

/** The Monday (UTC) of the week a time falls in, as YYYY-MM-DD. */
export function weekOf(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}
