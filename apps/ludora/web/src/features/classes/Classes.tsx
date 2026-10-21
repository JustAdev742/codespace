import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronRight, Copy, Info, Plus, School } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { Badge, Dialog, EmptyState, ErrorNotice, Field, Input, PageHeader, Panel, SectionTitle, Skeleton } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { errorText, hasStatus, usePageTitle } from '../reports/reportUi.tsx';
import { classKeys, copyText, useAccountState, useClassList, type MemberClass, type TeachingClass } from './classData.ts';
import { ClassAccountGate, ClassIcon, JoinCode } from './classUi.tsx';

/*
 * /classes. Teachers see the classes they run and make new ones; everyone
 * can join a class with its code and open the classes they are in.
 */

function ClassCard({ c }: { c: TeachingClass }) {
  return (
    <li className="relative flex flex-col gap-3 rounded-[var(--radius-m)] border border-line bg-raised p-4 transition-colors hover:border-line-strong">
      <div className="flex items-start gap-3">
        <ClassIcon />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg leading-tight font-bold break-words">
            <Link to={`/classes/${c.id}`} className="text-text no-underline after:absolute after:inset-0 after:rounded-[var(--radius-m)]">
              {c.name}
            </Link>
          </h3>
          <p className="mt-0.5 text-sm text-text-2">
            {plural(c.members, 'student')}, {plural(c.assignments, 'assignment')}
          </p>
        </div>
        {c.archived ? <Badge>Archived</Badge> : null}
      </div>
      {c.archived ? (
        <p className="mt-auto text-sm text-text-3">Students cannot join it or play its assignments while it is archived.</p>
      ) : (
        <div className="relative z-10 mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[12px] bg-surface-2 py-1.5 pr-1.5 pl-3">
          <span className="text-xs text-text-3">Join code</span>
          <JoinCode code={c.joinCode} className="text-lg" />
          <Button size="sm" variant="ghost" className="ml-auto" icon={<Copy className="size-4" />} onClick={() => void copyText(c.joinCode, 'Join code copied')} aria-label={`Copy the join code for ${c.name}`}>
            Copy
          </Button>
        </div>
      )}
    </li>
  );
}

function TeachingSection({ classes, canTeach, onNew }: { classes: TeachingClass[]; canTeach: boolean; onNew: () => void }) {
  const archivedCount = classes.filter((c) => c.archived).length;
  const [view, setView] = useState<'active' | 'archived'>('active');
  const shownView = archivedCount === 0 ? 'active' : view;
  const shown = classes.filter((c) => c.archived === (shownView === 'archived'));
  return (
    <section>
      <SectionTitle>Your classes</SectionTitle>
      {archivedCount > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Show classes">
          {(['active', 'archived'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={shownView === v}
              onClick={() => setView(v)}
              className={`h-9 rounded-full px-4 text-sm font-semibold ${shownView === v ? 'bg-text text-bg' : 'bg-surface-2 text-text-2 hover:text-text'}`}
            >
              {v === 'active' ? `Active (${classes.length - archivedCount})` : `Archived (${archivedCount})`}
            </button>
          ))}
        </div>
      ) : null}
      {classes.length === 0 ? (
        <EmptyState
          icon={<School className="size-8" />}
          title="No classes yet"
          action={
            canTeach ? (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={onNew}>
                New class
              </Button>
            ) : undefined
          }
        >
          Make a class for each group you teach. Students join with its code, then you set assignments from any question set.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon={<School className="size-8" />} title="No active classes">
          Every class you run is archived. Open one to unarchive it, or make a new class.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => (
            <ClassCard key={c.id} c={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function JoinPanel() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const join = useMutation({
    mutationFn: (value: string) => api.post<{ ok: true; class: { id: string; name: string }; alreadyMember: boolean }>('/api/classes/join', { code: value }),
    onSuccess: async (res) => {
      toast.success(res.alreadyMember ? `You are already in ${res.class.name}` : `You joined ${res.class.name}`);
      await qc.invalidateQueries({ queryKey: classKeys.all });
      navigate(`/classes/${res.class.id}`);
    },
    onError: (err) => setError(err instanceof ApiError ? (err.fields.code ?? err.message) : 'Could not join the class. Check your connection and try again.'),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError(code.length ? `Class codes have 6 letters and numbers. You typed ${code.length}.` : 'Type the 6-character code from your teacher.');
      return;
    }
    setError(null);
    join.mutate(code);
  };
  return (
    <Panel className="p-5">
      <h2 className="font-display text-xl font-bold">Join a class</h2>
      <p className="mt-1 mb-4 text-sm text-text-2">Your teacher gives you a code of 6 letters and numbers.</p>
      <form onSubmit={submit} noValidate>
        <Field label="Class code" error={error ?? undefined}>
          {(p) => (
            <div className="flex gap-2">
              <Input
                {...p}
                value={code}
                onChange={(e) => {
                  // Accept pasted codes with spaces or dashes, in any case.
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
                  setError(null);
                }}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="ABC234"
                className="h-12 min-w-0 flex-1 font-display text-xl font-bold tracking-[0.18em] placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal"
              />
              <Button type="submit" variant="primary" size="lg" loading={join.isPending}>
                Join
              </Button>
            </div>
          )}
        </Field>
      </form>
    </Panel>
  );
}

function MemberPanel({ classes }: { classes: MemberClass[] }) {
  return (
    <Panel className="p-5">
      <SectionTitle>Classes you are in</SectionTitle>
      {classes.length === 0 ? (
        <p className="text-sm text-text-2">You are not in any classes yet. When you join one with its code, it shows up here.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {classes.map((c) => (
            <li key={c.id}>
              <Link to={`/classes/${c.id}`} className="flex items-center gap-3 rounded-[12px] bg-surface-2 p-2.5 text-text no-underline transition-colors hover:bg-surface-3">
                <ClassIcon />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold break-words">{c.name}</span>
                  <span className="block text-sm text-text-3 break-words">Taught by {c.teacher}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-text-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TeacherAccountNote() {
  return (
    <p className="flex gap-2 text-sm text-text-3">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        Teaching a class? Classes are made with a teacher account. You can switch to one in{' '}
        <Link to="/settings#account" className="underline underline-offset-2">
          Settings
        </Link>
        .
      </span>
    </p>
  );
}

function NewClassForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (value: string) => api.post<{ ok: true; class: { id: string; name: string; joinCode: string } }>('/api/classes', { name: value }),
    onSuccess: async (res) => {
      toast.success('Class created');
      await qc.invalidateQueries({ queryKey: classKeys.all });
      onDone();
      navigate(`/classes/${res.class.id}`);
    },
    onError: (err) => setError(err instanceof ApiError ? (err.fields.name ?? err.message) : 'Could not make the class. Check your connection and try again.'),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    if (value.length < 2) {
      setError('Class names need at least 2 characters.');
      return;
    }
    create.mutate(value);
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <Field label="Class name" hint="Students see this name. For example, 7B Science." error={error ?? undefined}>
        {(p) => (
          <Input
            {...p}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            maxLength={60}
            autoComplete="off"
            autoFocus
          />
        )}
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          Create class
        </Button>
      </div>
    </form>
  );
}

function ClassesSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span className="sr-only" role="status">
        Loading your classes
      </span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
      <Skeleton className="h-40" />
    </div>
  );
}

export default function Classes() {
  usePageTitle('Classes');
  const account = useAccountState();
  const list = useClassList(account === 'account');
  const [creating, setCreating] = useState(false);

  if (account === 'loading' || (account === 'account' && list.isPending)) {
    return (
      <>
        <PageHeader title="Classes" />
        <ClassesSkeleton />
      </>
    );
  }
  if (account === 'signedOut' || hasStatus(list.error, 401)) {
    return (
      <>
        <PageHeader title="Classes" />
        <ClassAccountGate state="signedOut" next="/classes" />
      </>
    );
  }
  if (account === 'guest' || hasStatus(list.error, 403)) {
    return (
      <>
        <PageHeader title="Classes" />
        <ClassAccountGate state="guest" next="/classes" message={hasStatus(list.error, 403) ? errorText(list.error, '') : undefined} />
      </>
    );
  }
  if (!list.data) {
    return (
      <>
        <PageHeader title="Classes" />
        <ErrorNotice message={errorText(list.error, 'Your classes could not be loaded. Check your connection and try again.')} onRetry={() => void list.refetch()} />
      </>
    );
  }

  const data = list.data;
  const teaches = data.canTeach || data.teaching.length > 0;

  if (teaches) {
    return (
      <>
        <PageHeader
          title="Classes"
          description="Make a class, share its join code, then set assignments and see how each student did."
          actions={
            // With no classes yet, the empty state below carries the same button.
            data.canTeach && data.teaching.length > 0 ? (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                New class
              </Button>
            ) : null
          }
        />
        <div className="flex flex-col gap-8">
          <TeachingSection classes={data.teaching} canTeach={data.canTeach} onNew={() => setCreating(true)} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
            <JoinPanel />
            <MemberPanel classes={data.member} />
          </div>
          {data.canTeach ? (
            <p className="text-sm text-text-3">
              Reports on games you host for a group are in{' '}
              <Link to="/reports" className="underline underline-offset-2">
                Games you hosted
              </Link>
              .
            </p>
          ) : (
            <TeacherAccountNote />
          )}
        </div>
        <Dialog open={creating} onOpenChange={setCreating} title="New class" description="Each class gets its own join code. You can rename it later.">
          <NewClassForm onDone={() => setCreating(false)} />
        </Dialog>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Classes" description="Join your teacher's class with its code. The assignments they set show up in the class." />
      {data.member.length === 0 ? (
        <div className="flex max-w-xl flex-col gap-6">
          <JoinPanel />
          <TeacherAccountNote />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <MemberPanel classes={data.member} />
          <div className="flex flex-col gap-6">
            <JoinPanel />
            <TeacherAccountNote />
          </div>
        </div>
      )}
    </>
  );
}
