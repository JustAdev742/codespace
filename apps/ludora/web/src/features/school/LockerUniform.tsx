import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DEFAULT_SCHOOL_DRESS, type AccessoryArt, type GlimArt, type SchoolDress } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { schoolLook } from '../../lib/school.ts';
import { Panel } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { UniformPicker } from './UniformPicker.tsx';
import { WEEKDAYS, schoolKeys, useSchoolMe } from './schoolData.ts';

/*
 * The school uniform in the Locker, with a live preview on your own buddy (the same choice as in
 * Settings), and your sport days: on those weekdays your Glim wears sport uniform without asking.
 * Only on a school's copy that dresses Glims in uniform.
 */
export function LockerUniform({ preview }: { preview: { art: GlimArt; accessories?: AccessoryArt[] } | null }) {
  const me = useMe();
  const qc = useQueryClient();
  const mine = useSchoolMe();
  const [days, setDays] = useState<number[]>([]);
  useEffect(() => {
    if (mine.data) setDays(mine.data.sportDays);
  }, [mine.data]);
  const save = useMutation({
    mutationFn: (school: Partial<SchoolDress>) => api.patch('/api/me/preferences', { school }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not save your uniform.'),
  });
  const saveDays = useMutation({
    mutationFn: (next: number[] | null) => api.put('/api/school/me/sport-days', { days: next }),
    onSuccess: () => {
      toast.success('Sport days saved');
      void qc.invalidateQueries({ queryKey: schoolKeys.me });
      void qc.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not save your sport days.'),
  });
  const user = me.data?.user;
  if (schoolLook() !== 'hills-grammar' || !user || user.isGuest) return null;
  const dress = { ...DEFAULT_SCHOOL_DRESS, ...user.preferences.school };
  return (
    <Panel id="uniform" className="flex flex-col gap-4 p-4" aria-labelledby="locker-uniform">
      <div>
        <h2 id="locker-uniform" className="font-display text-2xl leading-tight font-bold">
          School uniform
        </h2>
        <p className="text-sm text-text-3">Other players see the uniform, never your year.</p>
      </div>
      <UniformPicker value={dress} onChange={(school) => save.mutate(school)} preview={preview} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold text-text">Sport days</legend>
        <p className="text-sm text-text-3">{mine.data?.sportToday ? 'Today is a sport day, so your Glim is in sport uniform.' : mine.data && !mine.data.ownSportDays && mine.data.sportDays.length ? 'Your teacher set these for your class. Choose your own to change them.' : 'Your Glim wears sport uniform on these days by itself.'}</p>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d) => (
            <label key={d.value} className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[var(--radius-m)] border border-line px-2.5 font-semibold has-[:checked]:border-[var(--focus)] has-[:checked]:bg-surface-3 has-[:focus-visible]:outline-2">
              <input type="checkbox" className="sr-only" checked={days.includes(d.value)} onChange={(e) => setDays((all) => (e.target.checked ? [...all, d.value].sort() : all.filter((x) => x !== d.value)))} />
              <span aria-hidden>{d.short}</span>
              <span className="sr-only">{d.long}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" loading={saveDays.isPending} onClick={() => saveDays.mutate(days)}>
            Save sport days
          </Button>
          {mine.data?.ownSportDays ? (
            <Button size="sm" onClick={() => saveDays.mutate(null)}>
              Use my class’s days
            </Button>
          ) : null}
        </div>
      </fieldset>
    </Panel>
  );
}
