import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, LogIn } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useNow } from '../../lib/useNow.ts';
import { buttonClass } from '../../ui/Button.tsx';
import { lessonKeys, startsText } from './data.ts';

/*
 * On a class page: the class's scheduled lessons, "Starts at 10:15", and a Join button once the
 * teacher has opened the room. Nothing opens by itself at the start time.
 */

interface ClassLesson {
  id?: string;
  title: string;
  startsAt: string;
  roomCode: string | null;
}

export function ClassLessons({ classId, teacher }: { classId: string; teacher: boolean }) {
  // Asked again every 20 seconds, so the Join button appears soon after the teacher opens the room.
  const q = useQuery({ queryKey: lessonKeys.forClass(classId), queryFn: () => api.get<{ lessons: ClassLesson[] }>(`/api/lessons/class/${classId}`), refetchInterval: 20_000 });
  const now = useNow(30_000, Boolean(q.data?.lessons.length));
  if (!q.data?.lessons.length) return null;
  return (
    <section aria-labelledby="class-lessons" className="mb-6 rounded-[var(--radius-l)] border border-line bg-raised p-4">
      <h2 id="class-lessons" className="mb-2 flex items-center gap-2 font-display text-2xl font-bold">
        <CalendarClock className="size-6 text-text-3" aria-hidden /> Lessons
      </h2>
      <ul className="flex flex-col gap-2">
        {q.data.lessons.map((l, i) => (
          <li key={l.id ?? i} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-m)] bg-surface-2 px-3 py-2">
            <span className="min-w-0">
              <span className="block font-semibold break-words">{teacher && l.id ? <Link to={`/lessons/${l.id}`}>{l.title}</Link> : l.title}</span>
              <span className="text-sm text-text-2">{startsText(l.startsAt, new Date(now))}</span>
            </span>
            {l.roomCode ? (
              teacher ? (
                <Link to={`/room/${l.roomCode}`} className={buttonClass('primary', 'md')}>
                  Back to the room
                </Link>
              ) : (
                <Link to={`/join/${l.roomCode}`} className={buttonClass('primary', 'md')} aria-label={`Join ${l.title}`}>
                  <LogIn className="size-4" aria-hidden /> Join
                </Link>
              )
            ) : (
              <span className="text-sm text-text-2">{teacher ? 'Open it with Run lesson on its page.' : 'A Join button appears here when your teacher opens it.'}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
