import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { Dialog, Field, Select, Spinner } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { useClassList } from '../classes/classData.ts';
import { lessonKeys, type RunReport } from './data.ts';

/*
 * Homework from a lesson: any of its sets as an assignment for a class, in two clicks (open this,
 * then Set). Played alone as Time Attack (or flashcards for a set too short for it), due in a week;
 * the class page's own assignment route checks that the teacher teaches the class.
 */

const DAY = 86_400_000;

export function HomeworkDialog({ runId, classId, open, onOpenChange }: { runId: string; classId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const report = useQuery({ queryKey: lessonKeys.report(runId), queryFn: () => api.get<RunReport>(`/api/lessons/runs/${runId}`), enabled: open });
  const classes = useClassList(open);
  const teaching = (classes.data?.teaching ?? []).filter((c) => !c.archived);
  const [chosen, setChosen] = useState(classId ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!chosen && teaching[0]) setChosen(classId ?? teaching[0].id);
  }, [chosen, teaching, classId]);
  const className = teaching.find((c) => c.id === chosen)?.name ?? 'the class';

  const assign = async (set: { id: string; title: string; modeId: string }) => {
    setBusy(set.id);
    setError(null);
    const body = { setId: set.id, title: `Homework: ${set.title}`.slice(0, 80), dueAt: new Date(Date.now() + 7 * DAY).toISOString(), instructions: `From the lesson "${report.data?.lesson.title ?? ''}".`.slice(0, 500) };
    try {
      // Time Attack, or flashcards for a set too short for it (the server says which).
      await api.post(`/api/classes/${chosen}/assignments`, { ...body, modeId: set.modeId });
      setDone((d) => ({ ...d, [set.id]: className }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The homework could not be set. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Set homework" description="Any set from this lesson, played alone as Time Attack (or flashcards for a short set), due in a week. Change the details later on the class page.">
      {report.isPending || classes.isPending ? (
        <Spinner label="Loading the lesson's sets" />
      ) : teaching.length === 0 ? (
        <p>Make a class on the Classes page first, then set homework for it.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Class">
            {(p) => (
              <Select {...p} value={chosen} onChange={(e) => setChosen(e.target.value)}>
                {teaching.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {report.data?.sets.length ? (
            <ul className="flex flex-col gap-2" aria-label="Sets in this lesson">
              {report.data.sets.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-m)] border border-line bg-surface-2 px-3 py-2">
                  <span className="min-w-0 font-semibold break-words">{s.title}</span>
                  {done[s.id] ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold" role="status">
                      <CheckCircle2 className="size-4 text-glim" aria-hidden /> Set for {done[s.id]}
                    </span>
                  ) : (
                    <Button size="sm" variant="primary" loading={busy === s.id} onClick={() => void assign(s)} aria-label={`Set ${s.title} as homework`}>
                      Set
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>This lesson has no sets you can assign.</p>
          )}
          {error ? (
            <p role="alert" className="font-semibold">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
