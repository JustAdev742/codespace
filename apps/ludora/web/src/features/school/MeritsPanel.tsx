import { useQuery } from '@tanstack/react-query';
import { Award } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { Panel } from '../../ui/primitives.tsx';

/*
 * A student's merits on their profile: how many for each of the school's values. The notes and who
 * gave them show only to the student, their teachers and school staff (the server decides).
 */

interface Merits {
  total: number;
  byValue: { value: string; n: number }[];
  recent: { id: string; value: string; note: string; teacherName: string; createdAt: string }[];
  hidden: boolean;
}

export function MeritsPanel({ userId }: { userId: string }) {
  const q = useQuery({ queryKey: ['school', 'merits', userId], queryFn: () => api.get<Merits>(`/api/school/students/${userId}/merits`), retry: false });
  if (!q.data || q.data.hidden || !q.data.total) return null;
  const m = q.data;
  return (
    <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="merits-title">
      <h2 id="merits-title" className="flex items-center gap-2 font-display text-2xl font-bold text-text">
        <Award className="size-6 text-lantern" aria-hidden />
        Merits
        <span className="font-display text-2xl font-extrabold text-text-2 tabular">{m.total}</span>
      </h2>
      <ul className="flex flex-wrap gap-2" aria-label="Merits by value">
        {m.byValue.map((v) => (
          <li key={v.value} className="inline-flex items-center gap-2 rounded-full bg-surface-3 px-3 py-1 text-sm font-semibold text-text">
            {v.value}
            <span className="rounded-full bg-lantern px-1.5 text-xs font-bold text-on-accent tabular">{v.n}</span>
          </li>
        ))}
      </ul>
      {m.recent.length ? (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {m.recent.map((r) => (
            <li key={r.id} className="py-2">
              <p className="font-semibold text-text">
                {r.value}, from {r.teacherName}
              </p>
              {r.note ? <p className="text-text-2">{r.note}</p> : null}
              <p className="text-xs text-text-3">{new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
