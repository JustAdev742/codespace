import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, BarChart3, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { EVENT_DECOR, HOUSE_EMBLEMS, MAX_HOUSES, houseFill, type HouseEmblem, type SchoolSettings } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { formatNumber } from '../../lib/format.ts';
import { Badge, EmptyState, ErrorNotice, Field, Input, PageHeader, Panel, Select, Skeleton, Switch, TabPanel, Tabs, Textarea } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { BackLink, errorText, usePageTitle } from '../reports/reportUi.tsx';
import { EMBLEM_ICONS, EMBLEM_NAMES, HouseChip, HouseCrest } from './emblems.tsx';
import { dayText, type Notice } from './schoolData.ts';

/*
 * /school/manage, for school staff (the school_staff role, or administrators): houses, the
 * school's rules and values, house cups, notices, school events, sorting students, and usage.
 * Every change is checked, rate limited and audited on the server; this page only asks.
 */

interface ManageData {
  settings: SchoolSettings;
  houses: { id: string; name: string; hue: number; emblem: HouseEmblem; archived: boolean; members: number }[];
}

const fieldErrors = (e: unknown) => (e instanceof ApiError ? e.fields : {});
const HUES = [0, 20, 40, 60, 100, 140, 170, 195, 215, 245, 275, 310, 335];

function HouseForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [hue, setHue] = useState(215);
  const [emblem, setEmblem] = useState<HouseEmblem>('shield');
  const add = useMutation({
    mutationFn: () => api.post('/api/school/houses', { name, hue, emblem }),
    onSuccess: () => {
      toast.success(`${name} added`);
      setName('');
      void qc.invalidateQueries({ queryKey: ['school'] });
      onDone();
    },
  });
  const errs = fieldErrors(add.error);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-labelledby="add-house">
      <h3 id="add-house" className="font-display text-xl font-bold text-text">
        Add a house
      </h3>
      <div className="flex items-center gap-3">
        <HouseCrest house={{ name, hue, emblem }} size={56} />
        <div className="min-w-0 flex-1">
          <Field label="Name" error={errs.name}>
            {(p) => <Input {...p} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />}
          </Field>
        </div>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-text">Colour</legend>
        <div className="flex flex-wrap gap-1.5">
          {HUES.map((h) => (
            <label key={h} className="relative grid size-11 cursor-pointer place-items-center rounded-[var(--radius-m)] has-[:checked]:ring-2 has-[:checked]:ring-[var(--focus)] has-[:focus-visible]:outline-2" style={{ background: houseFill(h) }}>
              <input type="radio" name="hue" className="sr-only" checked={hue === h} onChange={() => setHue(h)} aria-label={`Colour ${HUES.indexOf(h) + 1} of ${HUES.length}`} />
              {hue === h ? <span className="size-3 rounded-full bg-on-accent" aria-hidden /> : null}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-text">Emblem</legend>
        <div className="flex flex-wrap gap-1.5">
          {HOUSE_EMBLEMS.map((em) => {
            const Icon = EMBLEM_ICONS[em];
            return (
              <label key={em} className="grid size-11 cursor-pointer place-items-center rounded-[var(--radius-m)] border border-line text-text-2 has-[:checked]:border-[var(--focus)] has-[:checked]:bg-surface-3 has-[:checked]:text-text has-[:focus-visible]:outline-2">
                <input type="radio" name="emblem" className="sr-only" checked={emblem === em} onChange={() => setEmblem(em)} aria-label={EMBLEM_NAMES[em]} />
                <Icon className="size-5" aria-hidden />
              </label>
            );
          })}
        </div>
      </fieldset>
      {add.isError && !Object.keys(errs).length ? <ErrorNotice title="Not added" message={errorText(add.error, 'The house could not be added.')} /> : null}
      <div>
        <Button type="submit" variant="primary" icon={<Plus className="size-4" />} loading={add.isPending} disabled={name.trim().length < 2}>
          Add house
        </Button>
      </div>
    </form>
  );
}

function HousesTab({ data }: { data: ManageData }) {
  const qc = useQueryClient();
  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/api/school/houses/${id}`),
    onSuccess: () => {
      toast.success('House retired');
      void qc.invalidateQueries({ queryKey: ['school'] });
    },
    onError: (e) => toast.error(errorText(e, 'The house could not be retired.')),
  });
  const active = data.houses.filter((h) => !h.archived);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="houses-list">
        <h2 id="houses-list" className="font-display text-2xl font-bold text-text">
          Houses
        </h2>
        {!active.length ? <p className="text-text-2">No houses yet. Add the school’s houses: up to {MAX_HOUSES}, so a house match can seat them all.</p> : null}
        <ul className="flex flex-col divide-y divide-line">
          {active.map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-3">
              <HouseCrest house={h} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-text">{h.name}</p>
                <p className="text-sm text-text-3">{h.members} students</p>
              </div>
              <Button size="sm" icon={<Archive className="size-4" />} onClick={() => window.confirm(`Retire ${h.name}? Its students will have no house. Its points stay in past cups.`) && archive.mutate(h.id)}>
                Retire
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="p-4 sm:p-5">{active.length < MAX_HOUSES ? <HouseForm onDone={() => {}} /> : <p className="text-text-2">The school has {MAX_HOUSES} houses, the most a team game can seat.</p>}</Panel>
    </div>
  );
}

function SettingsTab({ data }: { data: ManageData }) {
  const qc = useQueryClient();
  const [s, setS] = useState<SchoolSettings>(data.settings);
  const [valuesText, setValuesText] = useState(data.settings.values.join('\n'));
  const save = useMutation({
    mutationFn: () => api.patch('/api/school/settings', { ...s, values: valuesText.split('\n').map((v) => v.trim()).filter(Boolean) }),
    onSuccess: () => {
      toast.success('School settings saved');
      void qc.invalidateQueries({ queryKey: ['school'] });
    },
  });
  const errs = fieldErrors(save.error);
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [s.timeZone];
  const num = (k: 'dailyCap' | 'pointsPerCorrect' | 'meritPoints' | 'meritsPerTeacherPerDay') => (e: React.ChangeEvent<HTMLInputElement>) => setS((x) => ({ ...x, [k]: Math.max(0, Math.round(Number(e.target.value) || 0)) }));
  return (
    <Panel className="flex max-w-2xl flex-col gap-4 p-4 sm:p-5" aria-labelledby="school-rules">
      <h2 id="school-rules" className="font-display text-2xl font-bold text-text">
        School rules
      </h2>
      <Switch checked={s.houseChoice} onCheckedChange={(v) => setS((x) => ({ ...x, houseChoice: v }))} label="Students choose their own house" description="Once, if they have none. Teachers can always set or change a house." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="House points for each right answer" error={errs.pointsPerCorrect}>
          {(p) => <Input {...p} type="number" min={1} max={10} value={s.pointsPerCorrect} onChange={num('pointsPerCorrect')} />}
        </Field>
        <Field label="Most house points a student earns from games in a day" hint="So one keen player cannot swing it." error={errs.dailyCap}>
          {(p) => <Input {...p} type="number" min={1} max={500} value={s.dailyCap} onChange={num('dailyCap')} />}
        </Field>
        <Field label="House points for a merit" error={errs.meritPoints}>
          {(p) => <Input {...p} type="number" min={0} max={50} value={s.meritPoints} onChange={num('meritPoints')} />}
        </Field>
        <Field label="Merits each teacher can give in a day" error={errs.meritsPerTeacherPerDay}>
          {(p) => <Input {...p} type="number" min={1} max={100} value={s.meritsPerTeacherPerDay} onChange={num('meritsPerTeacherPerDay')} />}
        </Field>
      </div>
      <Field label="The school’s values" hint="One on each line, up to 8. Merits are given for these." error={errs.values}>
        {(p) => <Textarea {...p} rows={4} value={valuesText} onChange={(e) => setValuesText(e.target.value)} />}
      </Field>
      <Field label="Time zone" hint="Days, weeks, cups and sport days follow it." error={errs.timeZone}>
        {(p) => (
          <Select {...p} value={s.timeZone} onChange={(e) => setS((x) => ({ ...x, timeZone: e.target.value }))}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {save.isError && !Object.keys(errs).length ? <ErrorNotice title="Not saved" message={errorText(save.error, 'The settings could not be saved.')} /> : null}
      <div>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
          Save settings
        </Button>
      </div>
    </Panel>
  );
}

function CupsTab() {
  const qc = useQueryClient();
  const cups = useQuery({ queryKey: ['school', 'cups'], queryFn: () => api.get<{ current: { id: string; name: string; startsOn: string; endsOn: string } | null; upcoming: { id: string; name: string; startsOn: string; endsOn: string }[] }>('/api/school/cups') });
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(new Date(Date.now() + 70 * 86_400_000).toISOString().slice(0, 10));
  const add = useMutation({
    mutationFn: () => api.post('/api/school/cups', { name, startsOn, endsOn }),
    onSuccess: () => {
      toast.success(`${name} scheduled`);
      setName('');
      void qc.invalidateQueries({ queryKey: ['school'] });
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/school/cups/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['school'] }),
    onError: (e) => toast.error(errorText(e, 'The cup could not be removed.')),
  });
  const errs = fieldErrors(add.error);
  const list = [...(cups.data?.current ? [cups.data.current] : []), ...(cups.data?.upcoming ?? [])];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="cups-list">
        <h2 id="cups-list" className="font-display text-2xl font-bold text-text">
          Current and coming cups
        </h2>
        {cups.isPending ? <Skeleton className="h-20" /> : !list.length ? <p className="text-text-2">No cups scheduled. Finished cups go to the hall of fame by themselves.</p> : null}
        <ul className="flex flex-col divide-y divide-line">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-text">{c.name}</p>
                <p className="text-sm text-text-3">
                  {dayText(c.startsOn)} to {dayText(c.endsOn)}
                </p>
              </div>
              {c.id === cups.data?.current?.id ? <Badge tone="mint">On now</Badge> : null}
              <Button size="sm" icon={<Trash2 className="size-4" />} aria-label={`Remove ${c.name}`} onClick={() => window.confirm(`Remove ${c.name}?`) && del.mutate(c.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="flex flex-col gap-4 p-4 sm:p-5" aria-labelledby="new-cup">
        <h2 id="new-cup" className="font-display text-2xl font-bold text-text">
          New house cup
        </h2>
        <Field label="Name" error={errs.name}>
          {(p) => <Input {...p} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Term 1 House Cup" />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First day" error={errs.startsOn}>
            {(p) => <Input {...p} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />}
          </Field>
          <Field label="Last day" error={errs.endsOn}>
            {(p) => <Input {...p} type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />}
          </Field>
        </div>
        {add.isError && !Object.keys(errs).length ? <ErrorNotice title="Not scheduled" message={errorText(add.error, 'The cup could not be scheduled.')} /> : null}
        <div>
          <Button variant="primary" loading={add.isPending} disabled={name.trim().length < 3} onClick={() => add.mutate()}>
            Schedule cup
          </Button>
        </div>
      </Panel>
    </div>
  );
}

/** Notices and events share a shape: a title, a line, an audience or decoration, and dates. */
function DatedForm({ kind }: { kind: 'notice' | 'event' }) {
  const qc = useQueryClient();
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Notice['audience']>('everyone');
  const [decor, setDecor] = useState<string>('bunting');
  const [startsAt, setStartsAt] = useState(local(new Date()));
  const [endsAt, setEndsAt] = useState(local(new Date(Date.now() + (kind === 'notice' ? 7 : 1) * 86_400_000)));
  const path = kind === 'notice' ? '/api/school/notices' : '/api/school/events';
  const add = useMutation({
    mutationFn: () => api.post(path, kind === 'notice' ? { title, body, audience, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() } : { title, message: body, decor, hue: 140, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() }),
    onSuccess: () => {
      toast.success(kind === 'notice' ? 'Notice scheduled' : 'Event scheduled');
      setTitle('');
      setBody('');
      void qc.invalidateQueries({ queryKey: ['school'] });
    },
  });
  const errs = fieldErrors(add.error);
  return (
    <Panel className="flex flex-col gap-4 p-4 sm:p-5" aria-labelledby={`new-${kind}`}>
      <h2 id={`new-${kind}`} className="font-display text-2xl font-bold text-text">
        {kind === 'notice' ? 'New notice' : 'New school event'}
      </h2>
      <Field label={kind === 'notice' ? 'Title' : 'Event name'} error={errs.title}>
        {(p) => <Input {...p} value={title} maxLength={kind === 'notice' ? 80 : 40} onChange={(e) => setTitle(e.target.value)} />}
      </Field>
      <Field label={kind === 'notice' ? 'Notice' : 'A line about it (optional)'} error={errs.body ?? errs.message}>
        {(p) => <Textarea {...p} rows={3} maxLength={kind === 'notice' ? 400 : 120} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      {kind === 'notice' ? (
        <Field label="Who sees it" error={errs.audience}>
          {(p) => (
            <Select {...p} value={audience} onChange={(e) => setAudience(e.target.value as Notice['audience'])}>
              <option value="everyone">Everyone</option>
              <option value="students">Students</option>
              <option value="teachers">Teachers and staff</option>
            </Select>
          )}
        </Field>
      ) : (
        <Field label="Lobby decorations on the day" error={errs.decor}>
          {(p) => (
            <Select {...p} value={decor} onChange={(e) => setDecor(e.target.value)}>
              {EVENT_DECOR.map((d) => (
                <option key={d} value={d}>
                  {d[0]!.toUpperCase() + d.slice(1)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Starts" error={errs.startsAt}>
          {(p) => <Input {...p} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />}
        </Field>
        <Field label="Ends" error={errs.endsAt}>
          {(p) => <Input {...p} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />}
        </Field>
      </div>
      {kind === 'event' ? <p className="text-sm text-text-3">Everyone sees a countdown on their home page for the two weeks before it.</p> : null}
      {add.isError && !Object.keys(errs).length ? <ErrorNotice title="Not scheduled" message={errorText(add.error, 'That could not be scheduled.')} /> : null}
      <div>
        <Button variant="primary" loading={add.isPending} disabled={title.trim().length < 3} onClick={() => add.mutate()}>
          Schedule
        </Button>
      </div>
    </Panel>
  );
}

function DatedList({ kind }: { kind: 'notice' | 'event' }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['school', kind === 'notice' ? 'notices-all' : 'events-all'], queryFn: () => api.get<{ notices?: Notice[]; events?: { id: string; title: string; startsAt: string; endsAt: string; decor: string }[] }>(kind === 'notice' ? '/api/school/notices/all' : '/api/school/events') });
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`${kind === 'notice' ? '/api/school/notices' : '/api/school/events'}/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['school'] }),
  });
  const rows = (kind === 'notice' ? list.data?.notices : list.data?.events) ?? [];
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby={`${kind}-list`}>
      <h2 id={`${kind}-list`} className="font-display text-2xl font-bold text-text">
        {kind === 'notice' ? 'Notices' : 'School events'}
      </h2>
      {list.isPending ? <Skeleton className="h-20" /> : !rows.length ? <p className="text-text-2">{kind === 'notice' ? 'No notices showing or scheduled.' : 'No events coming up.'}</p> : null}
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-text">{r.title}</p>
              <p className="text-sm text-text-3">
                {when(r.startsAt)} to {when(r.endsAt)}
                {'audience' in r ? `, ${r.audience === 'teachers' ? 'teachers and staff' : r.audience}` : ''}
              </p>
            </div>
            <Button size="sm" icon={<Trash2 className="size-4" />} aria-label={`Delete ${r.title}`} onClick={() => del.mutate(r.id)}>
              Delete
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function StudentsTab({ data }: { data: ManageData }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [unhoused, setUnhoused] = useState(true);
  const list = useQuery({ queryKey: ['school', 'students', q, unhoused], queryFn: () => api.get<{ students: { id: string; displayName: string; houseId: string | null }[] }>(`/api/school/students?q=${encodeURIComponent(q)}&unhoused=${unhoused ? 'true' : ''}`) });
  const houses = data.houses.filter((h) => !h.archived);
  const set = useMutation({
    mutationFn: ({ id, houseId }: { id: string; houseId: string | null }) => api.put(`/api/school/students/${id}/house`, { houseId }),
    onSuccess: () => {
      toast.success('House saved');
      void qc.invalidateQueries({ queryKey: ['school', 'students'] });
    },
  });
  return (
    <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="sort-students">
      <h2 id="sort-students" className="font-display text-2xl font-bold text-text">
        Sort students
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <Field label="Search by display name">{(p) => <Input {...p} type="search" value={q} onChange={(e) => setQ(e.target.value)} />}</Field>
        </div>
        <Switch checked={unhoused} onCheckedChange={setUnhoused} label="Only students without a house" />
      </div>
      {list.isPending ? <Skeleton className="h-32" /> : !list.data?.students.length ? <p className="text-text-2">No students match.</p> : null}
      <ul className="flex flex-col divide-y divide-line">
        {list.data?.students.map((s) => {
          const house = houses.find((h) => h.id === s.houseId);
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1 basis-40 truncate font-semibold text-text">{s.displayName}</span>
              {house ? <HouseChip house={house} /> : null}
              <Select aria-label={`House for ${s.displayName}`} className="w-full sm:w-48" value={s.houseId ?? ''} onChange={(e) => set.mutate({ id: s.id, houseId: e.target.value || null })}>
                <option value="">No house</option>
                {houses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </Select>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

interface Usage {
  weeks: { week: string; games: number; players: number }[];
  activeClasses: { week: number; month: number; total: number };
  topSets: { setId: string | null; title: string; games: number; players: number }[];
  housed: number;
}

function UsageTab() {
  const usage = useQuery({ queryKey: ['school', 'usage'], queryFn: () => api.get<Usage>('/api/school/usage') });
  if (usage.isPending) return <Skeleton className="h-64" />;
  if (usage.isError) return <ErrorNotice message={errorText(usage.error, 'Usage did not load.')} onRetry={() => void usage.refetch()} />;
  const u = usage.data;
  const top = Math.max(1, ...u.weeks.map((w) => w.games));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Classes playing this week', u.activeClasses.week, `of ${u.activeClasses.total} classes`],
          ['Classes playing this month', u.activeClasses.month, `of ${u.activeClasses.total} classes`],
          ['Students in a house', u.housed, 'across the school'],
        ].map(([label, n, sub]) => (
          <Panel key={label as string} className="p-4">
            <p className="text-sm font-semibold text-text-3">{label}</p>
            <p className="font-display text-4xl font-extrabold text-text tabular">{formatNumber(n as number)}</p>
            <p className="text-sm text-text-3">{sub}</p>
          </Panel>
        ))}
      </div>
      <Panel className="p-4 sm:p-5" aria-labelledby="games-week">
        <h2 id="games-week" className="mb-3 font-display text-2xl font-bold text-text">
          Live games each week
        </h2>
        <ol className="flex flex-col gap-2" aria-label="Live games each week, oldest first">
          {u.weeks.map((w) => (
            <li key={w.week} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm">
              <span className="text-text-2">From {dayText(w.week)}</span>
              <span className="h-3 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                <span className="block h-full rounded-full bg-sky" style={{ width: `${(w.games / top) * 100}%` }} />
              </span>
              <span className="font-semibold text-text tabular">
                {w.games} {w.games === 1 ? 'game' : 'games'}, {w.players} players
              </span>
            </li>
          ))}
        </ol>
      </Panel>
      <Panel className="p-4 sm:p-5" aria-labelledby="top-sets">
        <h2 id="top-sets" className="mb-3 font-display text-2xl font-bold text-text">
          Most-played sets, last 30 days
        </h2>
        {!u.topSets.length ? <p className="text-text-2">No games in the last 30 days.</p> : null}
        <ol className="flex flex-col divide-y divide-line">
          {u.topSets.map((s, i) => (
            <li key={`${s.setId}-${i}`} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-text">
                {i + 1}. {s.title}
              </span>
              <span className="shrink-0 text-sm text-text-2 tabular">
                {s.games} games, {s.players} players
              </span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

export default function Manage() {
  usePageTitle('Run the school');
  const me = useMe();
  const manage = Boolean(me.data?.permissions.includes('school.manage'));
  const usage = Boolean(me.data?.permissions.includes('school.view'));
  const data = useQuery({ queryKey: ['school', 'settings'], queryFn: () => api.get<ManageData>('/api/school/settings'), enabled: manage });
  const [tab, setTab] = useState(manage ? 'houses' : 'usage');
  if (!me.data) return <Skeleton className="h-96" />;
  if (!manage && !usage) {
    return (
      <>
        <BackLink to="/school">School</BackLink>
        <EmptyState icon={<BarChart3 />} title="For school staff">
          Running the school’s houses, cups and notices needs the school staff role. An administrator can grant it.
        </EmptyState>
      </>
    );
  }
  const items = [
    ...(manage
      ? [
          { value: 'houses', label: 'Houses' },
          { value: 'students', label: 'Students' },
          { value: 'rules', label: 'Rules and values' },
          { value: 'cups', label: 'Cups' },
          { value: 'notices', label: 'Notices' },
          { value: 'events', label: 'Events' },
        ]
      : []),
    { value: 'usage', label: 'Usage' },
  ];
  return (
    <>
      <BackLink to="/school">School</BackLink>
      <PageHeader title="Run the school" description="Houses, rules, cups, notices and events for the whole school. Every change is recorded in the audit log." />
      {manage && data.isError ? <ErrorNotice message={errorText(data.error, 'School settings did not load.')} onRetry={() => void data.refetch()} /> : null}
      <Tabs label="Run the school" value={tab} onValueChange={setTab} items={items}>
        {data.data ? (
          <>
            <TabPanel value="houses">
              <HousesTab data={data.data} />
            </TabPanel>
            <TabPanel value="students">
              <StudentsTab data={data.data} />
            </TabPanel>
            <TabPanel value="rules">
              <SettingsTab data={data.data} />
            </TabPanel>
          </>
        ) : manage ? (
          <Skeleton className="h-64" />
        ) : null}
        <TabPanel value="cups">
          <CupsTab />
        </TabPanel>
        <TabPanel value="notices">
          <div className="grid gap-5 lg:grid-cols-2">
            <DatedForm kind="notice" />
            <DatedList kind="notice" />
          </div>
        </TabPanel>
        <TabPanel value="events">
          <div className="grid gap-5 lg:grid-cols-2">
            <DatedForm kind="event" />
            <DatedList kind="event" />
          </div>
        </TabPanel>
        <TabPanel value="usage">{usage ? <UsageTab /> : null}</TabPanel>
      </Tabs>
    </>
  );
}
