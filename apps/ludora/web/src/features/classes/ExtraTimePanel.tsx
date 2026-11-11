import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Hourglass } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { Panel } from '../../ui/primitives.tsx';
import type { ClassMember } from './classData.ts';

const CHOICES = [
  { value: 0, label: 'Usual time' },
  { value: 25, label: 'A quarter more' },
  { value: 50, label: 'Half as much again' },
  { value: 100, label: 'Double time' },
];

/**
 * Extra time for students who need it, set once by the teacher: it follows each student into every
 * live game the teacher hosts for this class. Only the teacher sees it; the student and the class
 * are never told. (In any room, the host can also give extra time from a player's menu.)
 */
export function ExtraTimePanel({ classId, members, archived }: { classId: string; members: ClassMember[]; archived: boolean }) {
  const qc = useQueryClient();
  const key = ['class-extra-time', classId];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<{ extraTime: Record<string, number> }>(`/api/classes/${classId}/extra-time`) });
  const set = async (m: ClassMember, percent: number) => {
    try {
      await api.put(`/api/classes/${classId}/extra-time/${m.id}`, { percent });
      qc.setQueryData<{ extraTime: Record<string, number> }>(key, (old) => ({ extraTime: { ...old?.extraTime, [m.id]: percent } }));
      toast.success(percent ? `${m.displayName} gets extra time in this class's live games.` : `${m.displayName} is back to the usual time.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save that. Check your connection and try again.');
    }
  };
  if (!members.length) return null;
  const given = members.filter((m) => (q.data?.extraTime[m.id] ?? 0) > 0).length;
  return (
    <Panel className="mt-6 flex flex-col gap-3 p-5" aria-labelledby="extra-time-title">
      <div className="flex items-start gap-3">
        <Hourglass className="mt-1 size-5 shrink-0 text-text-3" aria-hidden />
        <div>
          <h2 id="extra-time-title" className="font-display text-2xl leading-tight font-bold">
            Extra time
          </h2>
          <p className="text-sm text-text-2">
            Students with extra time get longer on each timed question in the live games you host for this class. Nobody else can tell, and they see their own longer timer. {given ? `${given} ${given === 1 ? 'student has' : 'students have'} extra time.` : ''}
          </p>
        </div>
      </div>
      {q.isError ? <p className="text-sm font-semibold text-ember">Could not load extra time. Reload the page to try again.</p> : null}
      <ul className="flex flex-col divide-y divide-line" aria-label="Extra time for each student">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0 truncate font-semibold">{m.displayName}</span>
            <select
                aria-label={`Extra time for ${m.displayName}`}
                value={String(q.data?.extraTime[m.id] ?? 0)}
                disabled={archived || !q.data}
                onChange={(e) => void set(m, Number(e.target.value))}
                className="h-11 cursor-pointer rounded-[var(--radius-m)] border border-line-strong bg-raised px-3 font-semibold text-text disabled:opacity-55"
              >
                {CHOICES.map((c) => (
                  <option key={c.value} value={String(c.value)}>
                    {c.label}
                  </option>
                ))}
            </select>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
