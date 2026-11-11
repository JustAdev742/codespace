import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { Award } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api.ts';
import { Dialog, EmptyState, ErrorNotice, Field, Input, PageHeader, Panel, Select, Skeleton } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { PlayerAvatar } from '../social/parts.tsx';
import { BackLink, errorText, hasStatus, usePageTitle } from '../reports/reportUi.tsx';
import { HouseChip } from './emblems.tsx';
import { WEEKDAYS, useSchool, type ClassRoster } from './schoolData.ts';

/*
 * /school/classes/:id, for the class's teacher: each student's house (a change is saved at once),
 * a merit for one of the school's values, and the class's sport days.
 */

function MeritDialog({ student, roster, onClose }: { student: { id: string; displayName: string }; roster: ClassRoster; onClose: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(roster.merits.values[0] ?? '');
  const [note, setNote] = useState('');
  const give = useMutation({
    mutationFn: () => api.post<{ merit: { points: number } }>('/api/school/merits', { studentId: student.id, value, note }),
    onSuccess: (r) => {
      toast.success(`Merit given to ${student.displayName}${r.merit.points ? `: ${r.merit.points} house points` : ''}`);
      void qc.invalidateQueries({ queryKey: ['school', 'class', roster.class.id] });
      onClose();
    },
  });
  const left = roster.merits.limit - roster.merits.givenToday;
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`A merit for ${student.displayName}`}
      description={`For one of the school’s values. You can give ${left} more today. Merits earn house points, never Sparks or anything in a game.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={give.isPending} disabled={!value || left <= 0} onClick={() => give.mutate()}>
            Give merit
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Value">
          {(p) => (
            <Select {...p} value={value} onChange={(e) => setValue(e.target.value)}>
              {roster.merits.values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="What for (optional)" hint="The student sees this. 120 characters at most.">
          {(p) => <Input {...p} value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {give.isError ? <ErrorNotice title="Not given" message={errorText(give.error, 'The merit could not be given.')} /> : null}
      </div>
    </Dialog>
  );
}

function SportDays({ roster }: { roster: ClassRoster }) {
  const qc = useQueryClient();
  const [days, setDays] = useState<number[]>(roster.sportDays);
  const save = useMutation({
    mutationFn: () => api.put(`/api/school/classes/${roster.class.id}/sport-days`, { days }),
    onSuccess: () => {
      toast.success('Sport days saved');
      void qc.invalidateQueries({ queryKey: ['school', 'class', roster.class.id] });
    },
    onError: (e) => toast.error(errorText(e, 'Sport days could not be saved.')),
  });
  return (
    <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="sport-days">
      <h2 id="sport-days" className="font-display text-2xl font-bold text-text">
        Sport days
      </h2>
      <p className="text-sm text-text-2">On these days the class’s Glims wear sport uniform without anyone changing it. A student’s own sport days, set in their Locker, come first.</p>
      <fieldset>
        <legend className="sr-only">Weekdays with sport</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => (
            <label key={d.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-m)] border border-line px-3 has-[:checked]:border-[var(--focus)] has-[:checked]:bg-surface-3">
              <input type="checkbox" className="size-5 accent-[var(--lantern)]" checked={days.includes(d.value)} onChange={(e) => setDays((all) => (e.target.checked ? [...all, d.value].sort() : all.filter((x) => x !== d.value)))} />
              <span className="font-semibold">{d.long}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
          Save sport days
        </Button>
      </div>
    </Panel>
  );
}

export default function ClassHouses() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const school = useSchool();
  const q = useQuery({ queryKey: ['school', 'class', id], queryFn: () => api.get<ClassRoster>(`/api/school/classes/${id}`) });
  usePageTitle(q.data ? `${q.data.class.name}: houses` : 'Class houses');
  const [merit, setMerit] = useState<{ id: string; displayName: string } | null>(null);
  const setHouse = useMutation({
    mutationFn: ({ studentId, houseId }: { studentId: string; houseId: string | null }) => api.put(`/api/school/students/${studentId}/house`, { houseId }),
    onSuccess: (_r, v) => {
      const name = q.data?.students.find((s) => s.id === v.studentId)?.displayName ?? 'Student';
      const house = school.data?.houses.find((h) => h.id === v.houseId);
      toast.success(house ? `${name} is in ${house.name}` : `${name} has no house now`);
      void qc.invalidateQueries({ queryKey: ['school', 'class', id] });
    },
    onError: (e) => toast.error(errorText(e, 'The house could not be saved.')),
  });
  if (q.isPending || school.isPending) return <Skeleton className="h-96" />;
  if (q.isError) return <ErrorNotice title={hasStatus(q.error, 403, 404) ? 'Not your class' : 'That did not load'} message={errorText(q.error, 'Try again in a moment.')} />;
  const roster = q.data;
  const houses = school.data?.houses ?? [];
  return (
    <>
      <BackLink to="/school/classes">My classes</BackLink>
      <PageHeader title={roster.class.name} description="Put each student in a house, give merits, and set the class’s sport days." />
      <div className="flex flex-col gap-5">
        <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="class-houses">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="class-houses" className="font-display text-2xl font-bold text-text">
              Students
            </h2>
            <p className="text-sm text-text-3">
              Merits today: {roster.merits.givenToday} of {roster.merits.limit}
            </p>
          </div>
          {!houses.length ? <p className="text-text-2">This school has no houses yet. School staff set them up under Run the school.</p> : null}
          {!roster.students.length ? (
            <EmptyState title="No students yet">Students join with the class code on the Classes page.</EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {roster.students.map((s) => {
                const house = houses.find((h) => h.id === s.houseId);
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                    <PlayerAvatar avatar={s.avatar} size={44} />
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate font-semibold text-text">{s.displayName}</p>
                      {house ? <HouseChip house={house} /> : <p className="text-xs text-text-3">No house</p>}
                    </div>
                    {houses.length ? (
                      <Select aria-label={`House for ${s.displayName}`} className="w-full sm:w-48" value={s.houseId ?? ''} onChange={(e) => setHouse.mutate({ studentId: s.id, houseId: e.target.value || null })}>
                        <option value="">No house</option>
                        {houses.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                      </Select>
                    ) : null}
                    <Button size="sm" icon={<Award className="size-4" />} disabled={!roster.merits.values.length || roster.merits.givenToday >= roster.merits.limit} onClick={() => setMerit(s)} aria-label={`Give ${s.displayName} a merit`}>
                      Merit
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {!roster.merits.values.length ? <p className="text-sm text-text-3">Merits need the school’s values. School staff name them under Run the school.</p> : null}
        </Panel>
        <SportDays roster={roster} />
      </div>
      {merit ? <MeritDialog student={merit} roster={roster} onClose={() => setMerit(null)} /> : null}
    </>
  );
}
