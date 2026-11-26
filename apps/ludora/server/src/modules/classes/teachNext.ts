import { shownAnswer } from '../analytics/analysis.ts';

/*
 * What a class knows, topic by topic, and what its teacher might do next. Pure arithmetic over
 * first tries, kept apart from the database so it can be unit tested.
 *
 * A topic is what a set says it is about: its topic, or its title when it names none. What a
 * student knows of a topic is judged on their latest first try at each of its questions, so a
 * question got right the second time it came round counts as known, and the old miss stops
 * counting against them.
 *
 * Nothing here is stored. It is counted, each time it is asked for, from the answers Ludora
 * already keeps for reports.
 */

export type Level = 'secure' | 'nearly' | 'learning' | 'started' | 'none';
export const LEVELS: readonly Level[] = ['secure', 'nearly', 'learning', 'started', 'none'];

/** Right first time on at least this share of a topic's questions: secure. */
export const SECURE_AT = 0.8;
/** At least this share: nearly there. Under it: still learning. */
export const NEARLY_AT = 0.5;
/** Questions answered in a topic before a level is named. Fewer says only that a start was made. */
export const ENOUGH_QUESTIONS = 3;
/** A class under this share right is taught the topic again. */
export const RETEACH_UNDER = 0.6;
/** The share of a class that must have answered before the class is judged on a topic. */
export const HEARD_FROM = 1 / 3;
/** Names sent with one step: enough to act on, and never a whole register. */
export const MAX_NAMES = 8;

export interface TopicTry {
  userId: string;
  topic: string;
  /** The set and the question, as one key. */
  question: string;
  correct: boolean;
  at: Date;
  /** The answer in words, when it reduces to a few. Only a wrong one is ever read. */
  given?: string | null;
}

export interface Member {
  id: string;
  displayName: string;
}

export function levelOf(right: number, answered: number): Level {
  if (answered <= 0) return 'none';
  if (answered < ENOUGH_QUESTIONS) return 'started';
  const rate = right / answered;
  return rate >= SECURE_AT ? 'secure' : rate >= NEARLY_AT ? 'nearly' : 'learning';
}

/** Each student's latest first try at each question of each topic. */
export function latestTries(tries: readonly TopicTry[]): TopicTry[] {
  const by = new Map<string, TopicTry>();
  for (const t of tries) {
    const key = `${t.userId}\u0000${t.topic}\u0000${t.question}`;
    const cur = by.get(key);
    if (!cur || t.at.getTime() >= cur.at.getTime()) by.set(key, t);
  }
  return [...by.values()];
}

export interface TopicCell {
  level: Level;
  right: number;
  answered: number;
}

export interface TopicSummary {
  topic: string;
  /** Over every member's latest tries. */
  right: number;
  answered: number;
  rate: number | null;
  /** Members with at least one answer in it. */
  students: number;
  levels: Record<Level, number>;
  lastAt: Date | null;
}

export interface MasteryMap {
  /** The topic played most recently first. */
  topics: TopicSummary[];
  /** Every member, in the order given, with one cell for each topic in the order above. */
  students: { id: string; displayName: string; cells: TopicCell[] }[];
}

/** The class's map: every member against every topic it has played. Answers by anyone who is not a member are left out. */
export function masteryMap(members: readonly Member[], tries: readonly TopicTry[]): MasteryMap {
  const ids = new Set(members.map((m) => m.id));
  const latest = latestTries(tries.filter((t) => ids.has(t.userId)));
  const cells = new Map<string, Map<string, { right: number; answered: number }>>();
  const lastAt = new Map<string, Date>();
  for (const t of latest) {
    const byStudent = cells.get(t.topic) ?? new Map<string, { right: number; answered: number }>();
    const c = byStudent.get(t.userId) ?? { right: 0, answered: 0 };
    c.answered++;
    if (t.correct) c.right++;
    byStudent.set(t.userId, c);
    cells.set(t.topic, byStudent);
    const seen = lastAt.get(t.topic);
    if (!seen || t.at > seen) lastAt.set(t.topic, t.at);
  }
  const order = [...cells.keys()].sort((a, b) => lastAt.get(b)!.getTime() - lastAt.get(a)!.getTime() || a.localeCompare(b));
  const cellOf = (topic: string, userId: string): TopicCell => {
    const c = cells.get(topic)?.get(userId) ?? { right: 0, answered: 0 };
    return { level: levelOf(c.right, c.answered), right: c.right, answered: c.answered };
  };
  const topics = order.map((topic): TopicSummary => {
    const levels: Record<Level, number> = { secure: 0, nearly: 0, learning: 0, started: 0, none: 0 };
    let right = 0;
    let answered = 0;
    let students = 0;
    for (const m of members) {
      const c = cellOf(topic, m.id);
      levels[c.level]++;
      right += c.right;
      answered += c.answered;
      if (c.answered) students++;
    }
    return { topic, right, answered, rate: answered ? right / answered : null, students, levels, lastAt: lastAt.get(topic) ?? null };
  });
  return { topics, students: members.map((m) => ({ id: m.id, displayName: m.displayName, cells: order.map((topic) => cellOf(topic, m.id)) })) };
}

export type Verdict = 'reteach' | 'practise' | 'moveOn' | 'unseen';

export interface HardQuestion {
  question: string;
  right: number;
  tries: number;
  /** The wrong answer at least two students gave, in words, when one was shared. */
  commonWrong: { text: string; count: number } | null;
}

export interface NextStep {
  verdict: Verdict;
  topic: string;
  rate: number | null;
  /** Members who have answered in it, and the size of the class. */
  students: number;
  of: number;
  /** Still learning it (under half right, from enough questions), lowest first: who to sit with. At most eight names. */
  group: { id: string; displayName: string; right: number; answered: number }[];
  groupSize: number;
  /** Members who have not played it at all. At most eight names. */
  notYet: Member[];
  notYetCount: number;
  /** The questions the class found hardest in it (at most three; only ones somebody missed). */
  hardest: HardQuestion[];
}

const ORDER: Record<Verdict, number> = { reteach: 0, practise: 1, moveOn: 2, unseen: 3 };

/** How many of a class must have answered before it is judged: a third of it, and never nobody. */
export function heardFrom(classSize: number): number {
  return Math.max(1, Math.ceil(classSize * HEARD_FROM));
}

/**
 * One step for each topic the class has played, the most pressing first: teach it again (the class
 * is under 60%), practise it once more (60% to under 80%), move on (80% or better), or too few
 * have played it to say. A topic the class is past can still name a small group to sit with.
 */
export function teachNext(members: readonly Member[], tries: readonly TopicTry[]): NextStep[] {
  const map = masteryMap(members, tries);
  const ids = new Set(members.map((m) => m.id));
  const latest = latestTries(tries.filter((t) => ids.has(t.userId)));
  const need = heardFrom(members.length);
  const steps = map.topics.map((t, i): NextStep => {
    const cells = map.students.map((s) => ({ id: s.id, displayName: s.displayName, ...s.cells[i]! }));
    const learning = cells.filter((c) => c.level === 'learning').sort((a, b) => a.right / a.answered - b.right / b.answered || a.displayName.localeCompare(b.displayName));
    const notYet = cells.filter((c) => c.level === 'none');
    const judged = t.students >= need && t.answered >= ENOUGH_QUESTIONS && t.rate !== null;
    const verdict: Verdict = !judged ? 'unseen' : t.rate! < RETEACH_UNDER ? 'reteach' : t.rate! < SECURE_AT ? 'practise' : 'moveOn';
    return {
      verdict,
      topic: t.topic,
      rate: t.rate,
      students: t.students,
      of: members.length,
      group: learning.slice(0, MAX_NAMES).map((c) => ({ id: c.id, displayName: c.displayName, right: c.right, answered: c.answered })),
      groupSize: learning.length,
      notYet: notYet.slice(0, MAX_NAMES).map((c) => ({ id: c.id, displayName: c.displayName })),
      notYetCount: notYet.length,
      hardest: hardestIn(latest.filter((x) => x.topic === t.topic)),
    };
  });
  // Lowest first among topics to teach again or practise; among topics to move on from, one with a group to sit with first.
  return steps.sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict] || (a.verdict === 'moveOn' ? b.groupSize - a.groupSize : 0) || (a.rate ?? 1) - (b.rate ?? 1) || a.topic.localeCompare(b.topic));
}

/** A topic's hardest questions on latest tries: lowest share right first, then the one more students met. */
export function hardestIn(latest: readonly TopicTry[], max = 3): HardQuestion[] {
  const by = new Map<string, { right: number; tries: number; wrongs: Map<string, { text: string; count: number }> }>();
  for (const t of latest) {
    const q = by.get(t.question) ?? { right: 0, tries: 0, wrongs: new Map<string, { text: string; count: number }>() };
    q.tries++;
    if (t.correct) q.right++;
    else {
      // Words Ludora does not allow are never repeated to a teacher, as in a report.
      const text = shownAnswer(t.given ?? null);
      if (text) {
        const w = q.wrongs.get(text.toLowerCase()) ?? { text, count: 0 };
        w.count++;
        q.wrongs.set(text.toLowerCase(), w);
      }
    }
    by.set(t.question, q);
  }
  return [...by]
    .filter(([, q]) => q.right < q.tries)
    .map(([question, q]) => {
      const top = [...q.wrongs.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))[0];
      return { question, right: q.right, tries: q.tries, commonWrong: top && top.count >= 2 ? top : null };
    })
    .sort((a, b) => a.right / a.tries - b.right / b.tries || b.tries - a.tries || a.question.localeCompare(b.question))
    .slice(0, max);
}

/** One student's row of the map, for their own report: the topics they have played, the one played most recently first. */
export function studentTopics(userId: string, tries: readonly TopicTry[]): { topic: string; level: Level; right: number; answered: number }[] {
  const map = masteryMap([{ id: userId, displayName: '' }], tries);
  return map.topics.map((t, i) => ({ topic: t.topic, ...map.students[0]!.cells[i]! }));
}
