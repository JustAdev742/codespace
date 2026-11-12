import { Link } from 'react-router';
import { AlarmClock, CalendarClock } from 'lucide-react';
import { formatDate } from '../../lib/format.ts';
import { nextDue } from './next.ts';

/*
 * On a class's page, for its teacher (making): the next thing due, one press from its report, and
 * the day view. Nothing shows when nothing is due.
 */
export function ClassNextUp({ classId, assignments }: { classId: string; assignments: { id: string; title: string; dueAt: string | null; started: number; of: number }[] }) {
  const next = nextDue(assignments, Date.now());
  if (!next) return null;
  const { item, late } = next;
  const when = formatDate(item.dueAt!, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <section aria-label="Next due" className={`mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-l)] border-l-4 bg-surface-2 px-4 py-3 ${late ? 'border-ember' : 'border-lantern'}`}>
      {late ? <AlarmClock className="size-5 shrink-0 text-text-2" aria-hidden /> : <CalendarClock className="size-5 shrink-0 text-text-2" aria-hidden />}
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{late ? 'Still to play' : 'Next due'}: </span>
        <Link to={`/classes/${classId}/assignments/${item.id}`} className="font-bold break-words">
          {item.title}
        </Link>
        , {late ? 'was due' : 'due'} {when}. {item.started} of {item.of} played.
      </p>
      <Link to="/today" className="text-sm font-semibold">
        Your day
      </Link>
    </section>
  );
}
