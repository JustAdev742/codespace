import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarHeart, Trash2 } from 'lucide-react';
import { EVENT_DECOR, classEventSchema, type EventDecor } from '@ludora/shared';
import type { Decor } from '@ludora/content/seasons';
import { api, ApiError } from '../../lib/api.ts';
import { Stage } from '../../ui/Stage.tsx';
import { EmptyState, Field, Input, Panel, Select } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { SeasonGarland } from '../season/SeasonGarland.tsx';
import { classKeys, type ClassEvent } from './classData.ts';

/*
 * A school's own events, set by the teacher for their class. The teacher
 * types the school's name, each event's name, dates and a line about it, and
 * picks its decorations; students see it on their home page while it is on.
 * Nothing here is invented by Ludora: no school's dates, crest or logo.
 */

const DECOR_LABEL: Record<EventDecor, string> = {
  bunting: 'Bunting',
  lights: 'Fairy lights',
  fireworks: 'Fireworks',
  lanterns: 'Lanterns',
  confetti: 'Confetti',
  eggs: 'Painted eggs',
  books: 'Books',
  stars: 'Stars',
  leaves: 'Leaves',
  blossoms: 'Blossoms',
  sun: 'Sunshine',
  rain: 'Raindrops',
  bats: 'Friendly ghosts',
  snow: 'Snowflakes',
};

/** `datetime-local` works in the teacher's own time zone. */
const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : '');
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const eventTheme = (e: Pick<ClassEvent, 'hue' | 'decor'>) => ({ hue: e.hue, accentHue: (e.hue + 40) % 360, decor: [e.decor as Decor] });

/** One event as students see it: its decorations across the top and the teacher's words. */
export function EventCard({ e, school, onDelete }: { e: ClassEvent; school: string | null; onDelete?: () => void }) {
  const on = Date.parse(e.startsAt) <= Date.now();
  return (
    <li>
      <Stage className="rounded-[var(--radius-l)] px-4 pt-[64px] pb-4">
        <SeasonGarland theme={eventTheme(e)} />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            {school ? <p className="text-sm text-text-2">{school}</p> : null}
            <p className="font-display text-2xl leading-tight font-bold">{e.title}</p>
            {e.message ? <p className="text-sm text-text-2">{e.message}</p> : null}
            <p className="mt-1 text-xs text-text-3">{on ? `On now, until ${when(e.endsAt)}` : `${when(e.startsAt)} to ${when(e.endsAt)}`}</p>
          </div>
          {onDelete ? <Button size="sm" variant="ghost" onClick={onDelete} icon={<Trash2 className="size-4" aria-hidden />} aria-label={`Remove ${e.title}`} /> : null}
        </div>
      </Stage>
    </li>
  );
}

export function SchoolEventsPanel({ classId, schoolName, events, archived }: { classId: string; schoolName: string | null; events: ClassEvent[]; archived: boolean }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: classKeys.all });
  const [school, setSchool] = useState(schoolName ?? '');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [decor, setDecor] = useState<EventDecor>('bunting');
  const [hue, setHue] = useState(140);
  const [start, setStart] = useState(() => toLocal(new Date(Date.now() + 86_400_000)));
  const [end, setEnd] = useState(() => toLocal(new Date(Date.now() + 2 * 86_400_000)));
  const draft = { title, message, decor, hue, startsAt: fromLocal(start), endsAt: fromLocal(end) };
  const parsed = classEventSchema.safeParse(draft);
  const problem = parsed.success ? null : (parsed.error.issues[0]?.message ?? null);

  const saveSchool = useMutation({
    mutationFn: () => api.patch(`/api/classes/${classId}`, { schoolName: school.trim() || null }),
    onSuccess: async () => {
      toast.success('School name saved');
      await refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not save the school name.'),
  });
  const add = useMutation({
    mutationFn: () => api.post(`/api/classes/${classId}/events`, draft),
    onSuccess: async () => {
      toast.success(`${title.trim()} is on the calendar. Students see it on their home page while it is on.`);
      setTitle('');
      setMessage('');
      await refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not add the event.'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/classes/${classId}/events/${id}`),
    onSuccess: async () => {
      toast.success('Event removed');
      await refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not remove the event.'),
  });

  return (
    <div className="flex flex-col gap-5">
      <Panel className="flex flex-col gap-3 p-4">
        <Field label="School name" hint="Shown with your class's events, as you type it. Leave it empty to show the class name instead.">
          {(p) => <Input value={school} onChange={(e) => setSchool(e.target.value)} maxLength={60} placeholder="For example, Kenthurst Public School" {...p} />}
        </Field>
        <div>
          <Button size="sm" disabled={school.trim() === (schoolName ?? '')} loading={saveSchool.isPending} onClick={() => saveSchool.mutate()}>
            Save school name
          </Button>
        </div>
      </Panel>

      {events.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {events.map((e) => (
            <EventCard key={e.id} e={e} school={schoolName} onDelete={() => remove.mutate(e.id)} />
          ))}
        </ul>
      ) : (
        <EmptyState icon={<CalendarHeart className="size-8" />} title="No events coming up">
          Add your school's own days: a carnival, a Book Week parade, a house day. Students see them on their home page while they are on.
        </EmptyState>
      )}

      {archived ? (
        <p className="text-sm text-text-3">Unarchive the class to add events.</p>
      ) : (
        <Panel className="flex flex-col gap-3 p-4">
          <h3 className="font-display text-xl font-bold">Add an event</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Name">{(p) => <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} placeholder="Athletics Carnival" {...p} />}</Field>
            <Field label="A line for students (optional)">{(p) => <Input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={120} placeholder="Wear your house colours!" {...p} />}</Field>
            <Field label="Decorations">
              {(p) => (
                <Select value={decor} onChange={(e) => setDecor(e.target.value as EventDecor)} {...p}>
                  {EVENT_DECOR.map((d) => (
                    <option key={d} value={d}>
                      {DECOR_LABEL[d]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={`Colour: ${hue}`}>{(p) => <input type="range" min={0} max={359} value={hue} onChange={(e) => setHue(Number(e.target.value))} className="h-11 w-full accent-[var(--lantern)]" {...p} />}</Field>
            <Field label="Starts">{(p) => <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} {...p} />}</Field>
            <Field label="Ends" hint="A month at most.">
              {(p) => <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} {...p} />}
            </Field>
          </div>
          <ul className="list-none">
            <EventCard e={{ id: 'preview', title: title || 'Your event', message, decor, hue, startsAt: draft.startsAt || new Date().toISOString(), endsAt: draft.endsAt || new Date().toISOString() }} school={schoolName} />
          </ul>
          {title && problem ? <p className="text-sm text-ember">{problem}</p> : null}
          <div>
            <Button variant="primary" disabled={!parsed.success} loading={add.isPending} onClick={() => add.mutate()}>
              Add event
            </Button>
          </div>
        </Panel>
      )}
    </div>
  );
}
