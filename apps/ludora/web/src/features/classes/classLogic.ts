/*
 * Pure logic for the class pages, kept apart from React so it can be unit tested:
 * reading a roster from pasted text or a CSV file, the fair picker and team maker
 * on the class tools page, the calendar's month grid, and assignment status.
 */

/* ----------------------------------- Roster ----------------------------------- */

/** Splits one CSV line, honouring double quotes ("Smith, Jo" stays one cell). */
export function csvCells(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === ';' || c === '\t') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const FIRST_NAME_HEADER = /^(first[ _-]?name|forename|given[ _-]?name|preferred[ _-]?name)$/i;
const NAME_HEADER = /^(name|student|student[ _-]?name|pupil|pupil[ _-]?name|full[ _-]?name)$/i;

/**
 * First names from a pasted list or a CSV export from a school system. One name per
 * line; in a CSV, the "First name" column (or "Name", or else the first column). A
 * full name keeps only its first word, since class logins use first names. Blank
 * lines and a header row are skipped.
 */
export function parseNames(text: string): string[] {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!lines.length) return [];
  const csv = lines.some((l) => /[,;\t]/.test(l));
  if (!csv) return lines.map((l) => l.trim().replace(/^"|"$/g, '').trim()).filter(Boolean);
  const head = csvCells(lines[0]!);
  let col = head.findIndex((h) => FIRST_NAME_HEADER.test(h));
  let full = false;
  if (col < 0) {
    col = head.findIndex((h) => NAME_HEADER.test(h));
    full = col >= 0;
  }
  const hasHeader = col >= 0 || head.some((h) => /name|surname|class|year|email/i.test(h));
  if (col < 0) {
    col = 0;
    full = true;
  }
  return (hasHeader ? lines.slice(1) : lines)
    .map((l) => csvCells(l)[col] ?? '')
    .map((cell) => (full && cell.includes(',') ? (cell.split(',')[1] ?? cell) : cell).trim())
    .map((cell) => (full ? (cell.split(/\s+/)[0] ?? '') : cell))
    .filter(Boolean);
}

/* ------------------------------- Picker and teams ------------------------------- */

/**
 * A fair picker: everyone is picked once before anyone is picked twice. Keeps the
 * names not yet picked this round; when it runs out, a new round starts without the
 * person just picked coming straight back.
 */
export function pickNext(pool: readonly string[], everyone: readonly string[], last: string | null, random: () => number = Math.random): { picked: string | null; pool: string[] } {
  if (!everyone.length) return { picked: null, pool: [] };
  const left = pool.filter((id) => everyone.includes(id));
  if (left.length) {
    const picked = left[Math.floor(random() * left.length)]!;
    return { picked, pool: left.filter((id) => id !== picked) };
  }
  // A new round: everyone is back in, but the person picked last does not open it.
  const openers = everyone.length > 1 ? everyone.filter((id) => id !== last) : [...everyone];
  const picked = openers[Math.floor(random() * openers.length)]!;
  return { picked, pool: everyone.filter((id) => id !== picked) };
}

/** Splits people into n teams whose sizes differ by at most one, in a shuffled order. */
export function makeTeams<T>(people: readonly T[], n: number, random: () => number = Math.random): T[][] {
  const count = Math.max(1, Math.min(Math.floor(n), people.length || 1));
  const order = [...people];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const teams: T[][] = Array.from({ length: count }, () => []);
  order.forEach((p, i) => teams[i % count]!.push(p));
  return teams;
}

/* ----------------------------------- Calendar ----------------------------------- */

export interface CalendarDay {
  /** YYYY-MM-DD in local time. */
  key: string;
  date: Date;
  inMonth: boolean;
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The weeks (Monday first) covering a month, as whole weeks. */
export function monthGrid(year: number, month: number): CalendarDay[][] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const weeks: CalendarDay[][] = [];
  const cur = new Date(start);
  do {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({
        key: dayKey(cur),
        date: new Date(cur),
        inMonth: cur.getMonth() === month,
      });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  } while (cur.getMonth() === month);
  return weeks;
}

/* ---------------------------------- Assignments ---------------------------------- */

export type StudentWork = 'todo' | 'dueSoon' | 'overdue' | 'done' | 'closed' | 'used';

const SOON_MS = 2 * 86_400_000;

/** Where an assignment stands for a student, for their to-do list and reminders. */
export function studentWork(
  a: {
    dueAt: string | null;
    closesAt: string | null;
    blocked: string | null;
    mine: { plays: number } | null;
    maxAttempts: number | null;
  },
  now: number,
): StudentWork {
  if (a.closesAt && Date.parse(a.closesAt) <= now) return 'closed';
  if (a.mine) return a.maxAttempts !== null && a.mine.plays >= a.maxAttempts ? 'used' : 'done';
  if (a.dueAt) {
    const due = Date.parse(a.dueAt);
    if (due < now) return 'overdue';
    if (due - now <= SOON_MS) return 'dueSoon';
  }
  return 'todo';
}
