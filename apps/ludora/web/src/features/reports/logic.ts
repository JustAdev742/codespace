import type { CsvCell } from './csv.ts';

/*
 * Pure pieces of the teacher's reports, kept apart from React so they are unit tested
 * (logic.test.ts): comparing two games, the filters in the address, the CSV rows, and
 * the weeks of the term overview.
 */

export interface WrongAnswer {
  text: string;
  count: number;
}

/** How one question went in one game, as GET /api/games/:id/report gives it. */
export interface QuestionRow {
  questionId: string;
  prompt: string;
  type: string;
  players: number;
  right: number;
  wrong: number;
  firstTryRate: number;
  attempts: number;
  avgResponseMs: number;
  medianResponseMs: number;
  commonWrong: WrongAnswer | null;
}

export type Membership = 'class' | 'account' | 'guest' | 'bot';

export const MEMBERSHIP_LABEL: Record<Membership, string> = {
  class: 'Your student',
  account: 'Signed in',
  guest: 'Guest',
  bot: 'Bot',
};

/* ------------------------------------ compare ------------------------------------ */

export type Change = 'improved' | 'declined' | 'same';

export interface ComparedQuestion {
  questionId: string;
  prompt: string;
  before: number;
  after: number;
  /** After minus before, in whole percentage points. */
  points: number;
  change: Change;
  beforeWrong: WrongAnswer | null;
  afterWrong: WrongAnswer | null;
}

/** A change counts once it is at least this many percentage points. Smaller moves are noise in a class. */
export const CHANGE_POINTS = 10;

const rate = (qs: readonly QuestionRow[]) => {
  const players = qs.reduce((n, q) => n + q.players, 0);
  return players ? qs.reduce((n, q) => n + q.right, 0) / players : null;
};

/**
 * Two games of the same set, before and after teaching. Questions asked in both are compared
 * (right first time); the rest are listed as only in one game. Overall accuracy is over the
 * questions both games asked, so a longer second game does not skew it.
 */
export function compareGames(before: readonly QuestionRow[], after: readonly QuestionRow[]) {
  const afterBy = new Map(after.map((q) => [q.questionId, q]));
  const beforeBy = new Map(before.map((q) => [q.questionId, q]));
  const both: ComparedQuestion[] = [];
  for (const b of before) {
    const a = afterBy.get(b.questionId);
    if (!a) continue;
    const points = Math.round(a.firstTryRate * 100) - Math.round(b.firstTryRate * 100);
    both.push({
      questionId: b.questionId,
      prompt: a.prompt || b.prompt,
      before: b.firstTryRate,
      after: a.firstTryRate,
      points,
      change: points >= CHANGE_POINTS ? 'improved' : points <= -CHANGE_POINTS ? 'declined' : 'same',
      beforeWrong: b.commonWrong,
      afterWrong: a.commonWrong,
    });
  }
  both.sort((x, y) => y.points - x.points || x.prompt.localeCompare(y.prompt));
  const shared = new Set(both.map((q) => q.questionId));
  return {
    questions: both,
    improved: both.filter((q) => q.change === 'improved').length,
    declined: both.filter((q) => q.change === 'declined').length,
    same: both.filter((q) => q.change === 'same').length,
    before: rate(before.filter((q) => shared.has(q.questionId))),
    after: rate(after.filter((q) => shared.has(q.questionId))),
    onlyBefore: before.filter((q) => !afterBy.has(q.questionId)),
    onlyAfter: after.filter((q) => !beforeBy.has(q.questionId)),
  };
}

/* -------------------------------- filters in the address -------------------------------- */

export interface ReportFilters {
  q: string;
  classId: string;
  setId: string;
  modeId: string;
  from: string;
  to: string;
  sort: 'newest' | 'oldest' | 'accuracy' | 'players';
}

export const SORTS: { value: ReportFilters['sort']; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'accuracy', label: 'Lowest accuracy first' },
  { value: 'players', label: 'Most players first' },
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The filters from the page address, with anything unexpected dropped. */
export function readFilters(params: URLSearchParams): ReportFilters {
  const sort = params.get('sort');
  const date = (k: string) => {
    const v = params.get(k) ?? '';
    return DATE.test(v) ? v : '';
  };
  return {
    q: (params.get('q') ?? '').slice(0, 80),
    classId: params.get('class') ?? '',
    setId: params.get('set') ?? '',
    modeId: params.get('mode') ?? '',
    from: date('from'),
    to: date('to'),
    sort: SORTS.some((s) => s.value === sort) ? (sort as ReportFilters['sort']) : 'newest',
  };
}

/** The address for a set of filters: only what is set, so a plain list keeps a plain address. */
export function writeFilters(f: ReportFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.classId) p.set('class', f.classId);
  if (f.setId) p.set('set', f.setId);
  if (f.modeId) p.set('mode', f.modeId);
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.sort !== 'newest') p.set('sort', f.sort);
  return p;
}

/** The API query for the filters and a page offset. */
export function apiQuery(f: ReportFilters, offset: number): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.classId) p.set('classId', f.classId);
  if (f.setId) p.set('setId', f.setId);
  if (f.modeId) p.set('modeId', f.modeId);
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  p.set('sort', f.sort);
  if (offset) p.set('offset', String(offset));
  return p.toString();
}

export function activeFilterCount(f: ReportFilters): number {
  return [f.q.trim(), f.classId, f.setId, f.modeId, f.from, f.to].filter(Boolean).length;
}

/* ----------------------------------------- CSV ----------------------------------------- */

export interface AnswerLine {
  /** The player's key in this game ("p3"): per game, never an account. */
  playerKey: string;
  player: string;
  membership: Membership;
  team: string | null;
  prompt: string;
  type: string;
  given: string | null;
  correct: boolean;
  kind: string;
  tryNumber: number;
  responseMs: number;
}

const secondsCell = (ms: number) => (ms > 0 ? Math.round(ms / 100) / 10 : null);
const KIND_LABEL: Record<string, string> = { answer: 'Answer', attempt: 'Another try', self: 'Marked by the player' };

/** Every answer in a game, one row each, in the order they were given. */
export function answersCsv(lines: readonly AnswerLine[], typeLabel: (t: string) => string | null): CsvCell[][] {
  return [
    ['Player', 'Player is', 'Team', 'Question', 'Question type', 'Answer given', 'Right', 'Try', 'Kind', 'Time (s)'],
    ...lines.map((l) => [l.player, MEMBERSHIP_LABEL[l.membership], l.team ?? '', l.prompt, typeLabel(l.type) ?? '', l.given ?? '', l.kind === 'self' ? '' : l.correct ? 'Yes' : 'No', l.tryNumber, KIND_LABEL[l.kind] ?? l.kind, secondsCell(l.responseMs)]),
  ];
}

/** The question analysis, hardest first: what the report's question table shows. */
export function questionsCsv(questions: readonly QuestionRow[], typeLabel: (t: string) => string | null): CsvCell[][] {
  return [
    ['Question', 'Question type', 'Players', 'Right first time', 'Wrong first time', 'Right first time (%)', 'Most common wrong answer', 'Chosen by', 'Attempts', 'Average time (s)', 'Median time (s)'],
    ...questions.map((q) => [q.prompt, typeLabel(q.type) ?? '', q.players, q.right, q.wrong, Math.round(q.firstTryRate * 100), q.commonWrong?.text ?? '', q.commonWrong?.count ?? null, q.attempts, secondsCell(q.avgResponseMs), secondsCell(q.medianResponseMs)]),
  ];
}

/* ------------------------------------- term overview ------------------------------------- */

export interface WeekRow {
  weekOf: string;
  games: number;
  correct: number;
  answered: number;
}

const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

/** Monday of the week a date falls in (YYYY-MM-DD in, YYYY-MM-DD out), the way the server groups weeks. */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return iso(d);
}

/** Every week from the first to the last, with empty weeks filled in so a chart shows the gaps. */
export function fillWeeks(rows: readonly WeekRow[], fromDay: string, toDay: string): WeekRow[] {
  const by = new Map(rows.map((r) => [r.weekOf, r]));
  const out: WeekRow[] = [];
  const end = mondayOf(toDay);
  for (let d = new Date(`${mondayOf(fromDay)}T00:00:00Z`); iso(d) <= end && out.length < 60; d.setUTCDate(d.getUTCDate() + 7)) {
    const k = iso(d);
    out.push(by.get(k) ?? { weekOf: k, games: 0, correct: 0, answered: 0 });
  }
  return out;
}

/**
 * The start of the school term a date is in, by the usual English terms: autumn from 1 September,
 * spring from 1 January, summer from 15 April.
 */
export function termStart(today: Date): string {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();
  if (m >= 9) return `${y}-09-01`;
  if (m > 4 || (m === 4 && d >= 15)) return `${y}-04-15`;
  return `${y}-01-01`;
}

/** The start of the school year (1 September) a date is in. */
export function schoolYearStart(today: Date): string {
  const y = today.getFullYear();
  return today.getMonth() + 1 >= 9 ? `${y}-09-01` : `${y - 1}-09-01`;
}

export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A share as a whole percentage, or null when there is nothing to divide. */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}
