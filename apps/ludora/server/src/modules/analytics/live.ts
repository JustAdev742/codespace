import { analyseQuestions, firstTries, type AnswerRow, type WrongAnswer } from './analysis.ts';

/*
 * Insight while a game is still being played: what a teacher would otherwise learn from the report
 * afterwards, in time to do something about it. Which question the class found hardest, the wrong
 * answer most of them gave (the misconception worth a word now), and who might need someone to come
 * over. It is worked out from the answers the room already holds for the report; nothing more is
 * collected, and nothing is kept: it lasts as long as the game.
 *
 * Two rules hold whatever is shown:
 *  - Nothing about the question still open. In a game played in rounds the room does not yet know
 *    who is right, and no screen may say (D61).
 *  - It is for the teacher. The room sends it to the host and to nobody else, and the web app shows
 *    names only on the teacher's own remote, never on the big screen.
 */

export interface LiveAnswer {
  playerId: string;
  qid: string;
  correct: boolean;
  responseMs: number;
  kind?: string;
  given?: string | null;
}

export interface LiveQuestion {
  questionId: string;
  prompt: string;
  /** Players who answered it, and how many were right first time. */
  players: number;
  right: number;
  /** The wrong answer most of them gave, in words, when one was shared. */
  commonWrong: WrongAnswer | null;
}

export type CheckInReason = 'run' | 'low';

export interface LiveCheckIn {
  playerId: string;
  name: string;
  answered: number;
  correct: number;
  /** First tries wrong in a row, up to now. */
  wrongRun: number;
  reason: CheckInReason;
}

export interface LiveInsight {
  /** The class so far: first tries, and how many were right. */
  answered: number;
  right: number;
  /** The questions the class found hardest so far, hardest first (at most five; only ones at least two answered). */
  hardest: LiveQuestion[];
  /** Worth a word now: the most recent question where at least two players gave the same wrong answer, if there is one. */
  talkAbout: LiveQuestion | null;
  /** Who might need someone to come over (at most eight, most in need first). */
  checkIn: LiveCheckIn[];
}

/** Three first tries wrong in a row. */
export const RUN_TO_FLAG = 3;
/** Under half right, once at least this many have been answered. */
export const LOW_AFTER = 4;

export function liveInsight(input: { answers: readonly LiveAnswer[]; openQid: string | null; players: readonly { id: string; name: string; isBot: boolean }[]; promptOf: (qid: string) => string }): LiveInsight {
  const people = new Map(input.players.filter((p) => !p.isBot).map((p) => [p.id, p] as const));
  // Answers to the question still open are left out altogether, as are a practice bot's.
  const rows: AnswerRow[] = input.answers
    .filter((a) => a.qid !== input.openQid && people.has(a.playerId))
    .map((a, i) => ({ id: i, playerKey: a.playerId, questionId: a.qid, correct: a.correct, responseMs: a.responseMs, kind: a.kind ?? 'answer', given: a.given ?? null }));
  const tries = firstTries(rows);
  const analysed = analyseQuestions(rows);
  const asLive = (q: (typeof analysed)[number]): LiveQuestion => ({ questionId: q.questionId, prompt: input.promptOf(q.questionId), players: q.players, right: q.right, commonWrong: q.commonWrong });
  const hardest = analysed.filter((q) => q.players >= 2 && q.right < q.players).slice(0, 5).map(asLive);

  // The latest question with a shared wrong answer: the order the class met the questions is the order of first answers.
  const order: string[] = [];
  for (const t of tries) if (!order.includes(t.questionId)) order.push(t.questionId);
  // Shared means at least two players gave it: one child's slip is theirs, not the class's.
  const shared = new Map(analysed.filter((q) => (q.commonWrong?.count ?? 0) >= 2).map((q) => [q.questionId, q] as const));
  let talkAbout: LiveQuestion | null = null;
  for (let i = order.length - 1; i >= 0 && !talkAbout; i--) {
    const q = shared.get(order[i]!);
    if (q) talkAbout = asLive(q);
  }

  const per = new Map<string, { answered: number; correct: number; wrongRun: number }>();
  for (const t of tries) {
    const s = per.get(t.playerKey) ?? { answered: 0, correct: 0, wrongRun: 0 };
    s.answered++;
    if (t.correct) {
      s.correct++;
      s.wrongRun = 0;
    } else s.wrongRun++;
    per.set(t.playerKey, s);
  }
  const checkIn: LiveCheckIn[] = [];
  for (const [id, s] of per) {
    const reason: CheckInReason | null = s.wrongRun >= RUN_TO_FLAG ? 'run' : s.answered >= LOW_AFTER && s.correct / s.answered < 0.5 ? 'low' : null;
    if (reason) checkIn.push({ playerId: id, name: people.get(id)!.name, answered: s.answered, correct: s.correct, wrongRun: s.wrongRun, reason });
  }
  checkIn.sort((a, b) => b.wrongRun - a.wrongRun || a.correct / a.answered - b.correct / b.answered || a.name.localeCompare(b.name));
  return { answered: tries.length, right: tries.filter((t) => t.correct).length, hardest, talkAbout, checkIn: checkIn.slice(0, 8) };
}
