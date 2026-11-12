import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, ClipboardList, Folder, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { plural } from '../../lib/format.ts';
import type { SetSummary } from '../../lib/queries.ts';
import { Dialog, EmptyState, ErrorNotice, Field, Input, PageHeader, Panel, Select, Skeleton, Tabs, TabPanel } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { ChosenSet } from '../host/pickers.tsx';
import { classKeys, useClassList } from '../classes/classData.ts';
import { usePageTitle } from '../reports/reportUi.tsx';
import { SetPicker } from './SetPicker.tsx';
import { runEach, type EachResult } from './bulk.ts';

/*
 * /make/organise: what is tedious one at a time. The same homework for several classes at once,
 * sets filed in a folder or sent to the bin together, and old classes archived together. Each
 * one is the ordinary request, made once per class or set, so the server checks every one as it
 * always does; anything it refuses is listed with its reason.
 */

type Tab = 'homework' | 'sets' | 'classes';

/** Modes that work for one player on their own, which homework needs. */
const HOMEWORK_MODES = [
  { id: 'classic', title: 'Classic quiz' },
  { id: 'time-attack', title: 'Time Attack' },
  { id: 'survival-run', title: 'Survival Run' },
  { id: 'flashcard-study', title: 'Flashcard Study' },
];

function Results({ results, what, many = `${what}s` }: { results: EachResult[] | null; what: string; many?: string }) {
  if (!results) return null;
  const failed = results.filter((r) => !r.ok);
  return (
    <div role="status" className="rounded-[var(--radius-m)] bg-surface-2 p-3 text-sm">
      <p className="font-semibold">
        {plural(results.length - failed.length, what, many)} done{failed.length ? `, ${failed.length} not done` : ''}.
      </p>
      {failed.length ? (
        <ul className="mt-1 list-disc pl-5">
          {failed.map((f) => (
            <li key={f.id} className="break-words">
              {f.label}: {f.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Homework() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const classes = useClassList(true);
  const presetId = params.get('set');
  const preset = useQuery({ queryKey: ['set', presetId], queryFn: () => api.get<{ set: SetSummary }>(`/api/sets/${presetId}`), enabled: Boolean(presetId) });
  const [picked, setPicked] = useState<SetSummary | null>(null);
  const [cleared, setCleared] = useState(false);
  const set = picked ?? (cleared ? null : (preset.data?.set ?? null));
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState('classic');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<EachResult[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const active = (classes.data?.teaching ?? []).filter((c) => !c.archived);

  const send = async () => {
    if (!set) return setProblem('Choose a question set first.');
    if (!chosen.size) return setProblem('Tick at least one class.');
    const name = (title.trim() || set.title).slice(0, 80);
    if (name.length < 2) return setProblem('Give the homework a title.');
    const dueAt = due ? new Date(due) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) return setProblem('That due date could not be read.');
    setProblem(null);
    setBusy(true);
    const list = active.filter((c) => chosen.has(c.id));
    const r = await runEach(
      list.map((c) => ({ id: c.id, label: c.name })),
      (c) => api.post(`/api/classes/${c.id}/assignments`, { setId: set.id, modeId: mode, title: name, dueAt: dueAt?.toISOString() ?? null }),
    );
    setResults(r);
    setBusy(false);
    void qc.invalidateQueries({ queryKey: classKeys.all });
    const ok = r.filter((x) => x.ok).length;
    if (ok) toast.success(`Set “${name}” for ${plural(ok, 'class', 'classes')}`);
  };

  if (classes.isPending) return <Skeleton className="h-40" />;
  if (classes.isError) return <ErrorNotice message="Your classes could not be loaded." onRetry={() => void classes.refetch()} />;
  if (!active.length)
    return (
      <EmptyState icon={<ClipboardList />} title="Make a class first" action={<ButtonLink to="/classes?new=1" variant="primary">Make a class</ButtonLink>}>
        Homework is set for a class. Students join with a code.
      </EmptyState>
    );
  return (
    <div className="flex flex-col gap-5">
      <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="hw-set">
        <h2 id="hw-set" className="font-display text-2xl font-bold">
          1. The questions
        </h2>
        {set ? (
          <ChosenSet
            set={set}
            onChange={() => {
              setPicked(null);
              setCleared(true);
            }}
            focusOnMount={picked !== null}
          />
        ) : (
          <SetPicker onPick={setPicked} />
        )}
      </Panel>
      <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="hw-classes">
        <h2 id="hw-classes" className="font-display text-2xl font-bold">
          2. The classes
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setChosen(new Set(active.map((c) => c.id)))}>
            Tick all
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setChosen(new Set())}>
            Untick all
          </Button>
        </div>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((c) => (
            <li key={c.id}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-m)] border border-line bg-raised px-3 py-2 hover:bg-surface-2">
                <input type="checkbox" className="size-5 accent-[var(--color-lantern)]" checked={chosen.has(c.id)} onChange={(e) => setChosen((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold break-words">{c.name}</span>
                  <span className="block text-xs text-text-3">{plural(c.members, 'student')}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="hw-details">
        <h2 id="hw-details" className="font-display text-2xl font-bold">
          3. The details
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Title" hint={set ? `Empty uses “${set.title}”.` : undefined}>
            {(p) => <Input {...p} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />}
          </Field>
          <Field label="Game">
            {(p) => (
              <Select {...p} value={mode} onChange={(e) => setMode(e.target.value)}>
                {HOMEWORK_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Due (optional)">{(p) => <Input {...p} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />}</Field>
        </div>
        {problem ? (
          <p role="alert" className="text-sm font-semibold text-rose">
            {problem}
          </p>
        ) : null}
        <div>
          <Button variant="primary" loading={busy} icon={<ClipboardList className="size-4" aria-hidden />} onClick={() => void send()}>
            {chosen.size > 1 ? `Set it for ${chosen.size} classes` : 'Set the homework'}
          </Button>
        </div>
        <Results results={results} what="class" many="classes" />
      </Panel>
    </div>
  );
}

function useMySets() {
  return useQuery({
    queryKey: ['sets', { scope: 'mine', organise: true }],
    queryFn: async () => {
      // Up to 240 sets, five pages of the largest page the list route gives.
      const out: SetSummary[] = [];
      for (let page = 1; page <= 5; page++) {
        const r = await api.get<{ sets: SetSummary[]; total: number }>(`/api/sets?scope=mine&pageSize=48&page=${page}`);
        out.push(...r.sets);
        if (out.length >= r.total) break;
      }
      return out;
    },
  });
}

function Sets() {
  const qc = useQueryClient();
  const sets = useMySets();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [folder, setFolder] = useState('');
  const [filing, setFiling] = useState(false);
  const [binning, setBinning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<EachResult[] | null>(null);
  const list = sets.data ?? [];
  const picked = useMemo(() => list.filter((s) => chosen.has(s.id)), [list, chosen]);
  const run = async (what: 'folder' | 'bin') => {
    setBusy(true);
    const r = await runEach(
      picked.map((s) => ({ id: s.id, label: s.title })),
      (s) => (what === 'folder' ? api.patch(`/api/sets/${s.id}/organise`, { folder: folder.trim() || null }) : api.delete(`/api/sets/${s.id}`)),
    );
    setResults(r);
    setBusy(false);
    setFiling(false);
    setBinning(false);
    setChosen(new Set());
    await qc.invalidateQueries({ queryKey: ['sets'] });
    const ok = r.filter((x) => x.ok).length;
    if (ok) toast.success(what === 'folder' ? `Moved ${plural(ok, 'set')}` : `Sent ${plural(ok, 'set')} to the bin`);
  };
  if (sets.isPending) return <Skeleton className="h-40" />;
  if (sets.isError) return <ErrorNotice message="Your sets could not be loaded." onRetry={() => void sets.refetch()} />;
  if (!list.length)
    return (
      <EmptyState title="You have no sets yet" action={<ButtonLink to="/make/quick" variant="primary">Make a set</ButtonLink>}>
        Sets you make show here.
      </EmptyState>
    );
  return (
    <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-label="Your sets">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setChosen(new Set(list.map((s) => s.id)))}>
          Tick all {list.length}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setChosen(new Set())}>
          Untick all
        </Button>
        <span className="text-sm text-text-2" aria-live="polite">
          {plural(chosen.size, 'set')} ticked
        </span>
        <span className="flex flex-wrap gap-2 sm:ml-auto">
          <Button size="sm" icon={<Folder className="size-4" aria-hidden />} disabled={!chosen.size} onClick={() => setFiling(true)}>
            Put in a folder
          </Button>
          <Button size="sm" variant="danger" icon={<Trash2 className="size-4" aria-hidden />} disabled={!chosen.size} onClick={() => setBinning(true)}>
            Send to the bin
          </Button>
        </span>
      </div>
      <Results results={results} what="set" />
      <ul className="flex flex-col divide-y divide-line">
        {list.map((s) => (
          <li key={s.id}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 px-1 py-2 hover:bg-surface-2">
              <input type="checkbox" className="size-5 accent-[var(--color-lantern)]" checked={chosen.has(s.id)} onChange={(e) => setChosen((c) => { const n = new Set(c); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold break-words">{s.title}</span>
                <span className="block text-xs text-text-3">
                  {plural(s.questionCount, 'question')}
                  {s.folder ? `, in ${s.folder}` : ''}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Dialog
        open={filing}
        onOpenChange={setFiling}
        title={`Put ${plural(chosen.size, 'set')} in a folder`}
        footer={
          <>
            <Button onClick={() => setFiling(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={() => void run('folder')}>
              Move them
            </Button>
          </>
        }
      >
        <Field label="Folder" hint="Leave it empty to take them out of any folder.">
          {(p) => <Input {...p} value={folder} maxLength={40} onChange={(e) => setFolder(e.target.value)} placeholder="Year 7" />}
        </Field>
      </Dialog>
      <Dialog
        open={binning}
        onOpenChange={setBinning}
        title={`Send ${plural(chosen.size, 'set')} to the bin?`}
        description="Sets in the bin can be put back from the library's bin for 30 days."
        footer={
          <>
            <Button onClick={() => setBinning(false)}>Keep them</Button>
            <Button variant="danger" loading={busy} onClick={() => void run('bin')}>
              Send to the bin
            </Button>
          </>
        }
      />
    </Panel>
  );
}

function Classes() {
  const qc = useQueryClient();
  const classes = useClassList(true);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<EachResult[] | null>(null);
  const own = (classes.data?.teaching ?? []).filter((c) => !c.archived && !c.coTeacher);
  const archive = async () => {
    setBusy(true);
    const r = await runEach(
      own.filter((c) => chosen.has(c.id)).map((c) => ({ id: c.id, label: c.name })),
      (c) => api.patch(`/api/classes/${c.id}`, { archived: true }),
    );
    setResults(r);
    setBusy(false);
    setChosen(new Set());
    await qc.invalidateQueries({ queryKey: classKeys.all });
  };
  if (classes.isPending) return <Skeleton className="h-40" />;
  if (classes.isError) return <ErrorNotice message="Your classes could not be loaded." onRetry={() => void classes.refetch()} />;
  if (!own.length)
    return (
      <div className="flex flex-col gap-3">
        <Results results={results} what="class" many="classes" />
        <EmptyState title="No classes to archive">Classes you made and have not archived show here. Archived classes can be brought back from the Classes page.</EmptyState>
      </div>
    );
  return (
    <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-label="Your classes">
      <p className="text-sm text-text-2">End of the year? Archive the classes you no longer teach. Their reports are kept, and you can bring a class back from the Classes page.</p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {own.map((c) => (
          <li key={c.id}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-m)] border border-line bg-raised px-3 py-2 hover:bg-surface-2">
              <input type="checkbox" className="size-5 accent-[var(--color-lantern)]" checked={chosen.has(c.id)} onChange={(e) => setChosen((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />
              <span className="min-w-0 flex-1 font-semibold break-words">{c.name}</span>
            </label>
          </li>
        ))}
      </ul>
      <div>
        <Button icon={<Archive className="size-4" aria-hidden />} disabled={!chosen.size} loading={busy} onClick={() => void archive()}>
          Archive {plural(chosen.size, 'class', 'classes')}
        </Button>
      </div>
      <Results results={results} what="class" many="classes" />
    </Panel>
  );
}

export default function Organise() {
  usePageTitle('Organise in bulk');
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const t = params.get('tab');
  const tab: Tab = t === 'sets' || t === 'classes' ? t : 'homework';
  const teacher = me.data?.user?.accountType === 'teacher';
  if (me.isLoading) return <Skeleton className="h-40" />;
  if (!teacher)
    return (
      <>
        <PageHeader title="Organise in bulk" />
        <EmptyState title="This is for teachers" action={<ButtonLink to="/make">Back to Make</ButtonLink>}>
          Setting homework for classes and organising many sets at once needs a teacher account. You can switch in Settings.
        </EmptyState>
      </>
    );
  return (
    <>
      <PageHeader eyebrow={<Link to="/make">Make</Link>} title="Organise in bulk" description="Do once what would take a dozen clicks: the same homework for several classes, many sets into a folder, old classes archived." />
      <Tabs
        value={tab}
        onValueChange={(v) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', v); return n; }, { replace: true })}
        label="What to organise"
        items={[
          { value: 'homework', label: 'Homework for several classes' },
          { value: 'sets', label: 'Sets' },
          { value: 'classes', label: 'Classes' },
        ]}
      >
        <TabPanel value="homework">
          <Homework />
        </TabPanel>
        <TabPanel value="sets">
          <Sets />
        </TabPanel>
        <TabPanel value="classes">
          <Classes />
        </TabPanel>
      </Tabs>
    </>
  );
}
