/*
 * The teacher's day, worked out from rows the routes have already checked the teacher may see.
 * Pure: no I/O, so it can be tested with plain values.
 */

export interface DueWork {
  id: string;
  classId: string;
  className: string;
  title: string;
  dueAt: Date | null;
  /** Students the work is for. */
  students: number;
  /** Of those, how many have played it at least once. */
  done: number;
}

export interface TodayWork {
  dueToday: DueWork[];
  dueSoon: DueWork[];
  /** Past their due date in the last fortnight, with someone still to play. */
  followUp: DueWork[];
}

const DAY = 86_400_000;

/** Sorts work into due today (between from and to), due in the next week, and overdue with someone missing. */
export function sortWork(work: readonly DueWork[], from: Date, to: Date): TodayWork {
  const dueToday: DueWork[] = [];
  const dueSoon: DueWork[] = [];
  const followUp: DueWork[] = [];
  for (const w of work) {
    if (!w.dueAt) continue;
    const t = w.dueAt.getTime();
    if (t >= from.getTime() && t < to.getTime()) dueToday.push(w);
    else if (t >= to.getTime() && t < to.getTime() + 7 * DAY) dueSoon.push(w);
    else if (t < from.getTime() && t >= from.getTime() - 14 * DAY && w.done < w.students) followUp.push(w);
  }
  const byDue = (a: DueWork, b: DueWork) => a.dueAt!.getTime() - b.dueAt!.getTime() || a.title.localeCompare(b.title);
  // The most students still missing first: that is where a reminder does the most.
  followUp.sort((a, b) => b.students - b.done - (a.students - a.done) || byDue(a, b));
  return { dueToday: dueToday.sort(byDue), dueSoon: dueSoon.sort(byDue), followUp: followUp.slice(0, 10) };
}

/** The tools' saved state, cleaned: picked ids that are still in the class, and the scoreboard. */
export function cleanToolState(state: { picked: string[]; scores: { id: string; label: string; points: number }[] }, memberIds: ReadonlySet<string>) {
  const picked = [...new Set(state.picked.filter((id) => memberIds.has(id)))];
  return { picked, scores: state.scores };
}
