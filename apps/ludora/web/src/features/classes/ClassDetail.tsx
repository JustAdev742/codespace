import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, ClipboardList, Copy, KeyRound, LogOut, Pencil, Play, Plus, RefreshCw, School, Search, Trash2, UserMinus, Users } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { useNow } from '../../lib/useNow.ts';
import { plural, timeAgo } from '../../lib/format.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { Badge, Dialog, EmptyState, ErrorNotice, Field, Input, PageHeader, Panel, ProgressBar, SectionTitle, TabPanel, Tabs } from '../../ui/primitives.tsx';
import { Button, ButtonLink, IconButton } from '../../ui/Button.tsx';
import { BackLink, dateText, dateTimeText, errorText, hasStatus, NoValue, TableBox, Th, usePageTitle } from '../reports/reportUi.tsx';
import { AssignmentDialog } from './AssignmentDialog.tsx';
import { EventCard, SchoolEventsPanel } from './SchoolEvents.tsx';
import { CodeTicket } from '../auth/RecoveryCodeDialog.tsx';
import {
  classKeys,
  copyText,
  useAccountState,
  useClassDetail,
  useModeInfo,
  type ClassMember,
  type MyResult,
  type StudentAssignment,
  type StudentClassDetail,
  type TeacherAssignment,
  type TeacherClassDetail,
} from './classData.ts';
import { ClassAccountGate, ClassPageSkeleton, ConfirmDialog, DueLabel, JoinCode } from './classUi.tsx';

/*
 * /classes/:id. The teacher manages the class: join code, roster and
 * assignments. A student sees the assignments, their own results and a
 * Play button; never anyone else's results (the API only returns theirs).
 */

const artClass = 'h-14 w-20 shrink-0 overflow-hidden rounded-[var(--radius-m)]';

/* ------------------------------- Teacher view ------------------------------- */

function JoinCodePanel({ code, onNewCode }: { code: string; onNewCode: () => void }) {
  return (
    <Panel className="mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="font-sans text-sm font-semibold text-text-2">Join code</h2>
        <JoinCode code={code} className="mt-1 block text-[2.75rem] leading-none sm:text-[3.5rem]" />
        <p className="mt-2 text-sm text-text-3">Students choose Join a class on their Classes page and type this code.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button icon={<Copy className="size-4" />} onClick={() => void copyText(code, 'Join code copied')}>
          Copy code
        </Button>
        <Button variant="ghost" icon={<RefreshCw className="size-4" />} onClick={onNewCode}>
          New code
        </Button>
      </div>
    </Panel>
  );
}

function TeacherAssignmentRow({ a, classId, now, onEdit, onDelete }: { a: TeacherAssignment; classId: string; now: number; onEdit: () => void; onDelete: () => void }) {
  const info = useModeInfo()(a.modeId, a.variantId);
  return (
    <li className="relative flex flex-col gap-4 rounded-[var(--radius-l)] border border-line bg-raised p-4 transition-colors hover:border-line-strong hover:bg-surface-2 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <ModeArt thumb={info.thumb} className={artClass} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl leading-tight font-bold break-words">
            <Link to={`/classes/${classId}/assignments/${a.id}`} className="text-text no-underline after:absolute after:inset-0 after:rounded-[var(--radius-l)]">
              {a.title}
              <span className="sr-only">, open the report</span>
            </Link>
          </h3>
          <p className="mt-0.5 text-sm break-words text-text-2">
            {a.setTitle}, {info.title}
          </p>
          <p className="mt-1.5 text-sm">
            <DueLabel dueAt={a.dueAt} now={now} />
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 md:w-80">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
            <span className="text-text-2">Started</span>
            <span className="font-display text-lg leading-none font-bold text-text tabular">
              {a.started} of {a.of}
            </span>
          </div>
          <ProgressBar value={a.started} max={a.of} label={`${a.title}: ${a.started} of ${a.of} students started`} />
        </div>
        <div className="relative z-10 flex items-center gap-1">
          <IconButton label={`Edit ${a.title}`} onClick={onEdit}>
            <Pencil className="size-4" />
          </IconButton>
          <IconButton label={`Delete ${a.title}`} onClick={onDelete}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>
    </li>
  );
}

function Roster({ members, onRemove, onHelp }: { members: ClassMember[]; onRemove: (m: ClassMember) => void; onHelp: (m: ClassMember) => void }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? members.filter((m) => m.displayName.toLowerCase().includes(t) || (m.username ?? '').toLowerCase().includes(t)) : members;
  }, [members, q]);
  if (!members.length) {
    return (
      <EmptyState icon={<Users className="size-8" />} title="No students yet">
        Share the join code. Students choose Join a class on their Classes page and type it in.
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {members.length > 8 ? (
        <label className="relative block sm:max-w-xs">
          <span className="sr-only">Find a student</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a student" className="h-10 pl-9" />
        </label>
      ) : null}
      <TableBox caption="Students in this class" minWidth={720}>
        <thead className="bg-surface-2">
          <tr>
            <Th>Student</Th>
            <Th align="right">Level</Th>
            <Th>Joined</Th>
            <Th>Last seen</Th>
            <Th align="right">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {shown.map((m) => (
            <tr key={m.id} className="border-t border-line">
              <td className="px-3 py-2.5">
                <div className="font-semibold break-words text-text">{m.displayName}</div>
                {m.username ? <div className="text-xs text-text-3">@{m.username}</div> : null}
              </td>
              <td className="px-3 py-2.5 text-right text-text tabular">{m.level}</td>
              <td className="px-3 py-2.5 whitespace-nowrap text-text-2">
                <time dateTime={m.joinedAt}>{dateText(m.joinedAt)}</time>
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap text-text-2">
                {m.lastSeenAt ? (
                  <time dateTime={m.lastSeenAt} title={dateTimeText(m.lastSeenAt)}>
                    {timeAgo(m.lastSeenAt)}
                  </time>
                ) : (
                  <NoValue label="Not seen yet" />
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" icon={<KeyRound className="size-4" aria-hidden />} onClick={() => onHelp(m)}>
                    Sign-in help<span className="sr-only"> for {m.displayName}</span>
                  </Button>
                  <Button size="sm" variant="ghost" icon={<UserMinus className="size-4" />} onClick={() => onRemove(m)} aria-label={`Remove ${m.displayName} from the class`}>
                    Remove
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {shown.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-text-3">
                No students match “{q.trim()}”.
              </td>
            </tr>
          ) : null}
        </tbody>
      </TableBox>
    </div>
  );
}

function RenameForm({ classId, name, onDone }: { classId: string; name: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (next: string) => api.patch(`/api/classes/${classId}`, { name: next }),
    onSuccess: async () => {
      toast.success('Class renamed');
      await qc.invalidateQueries({ queryKey: classKeys.all });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? (err.fields.name ?? err.message) : 'Could not rename the class. Check your connection and try again.'),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = value.trim();
    if (next.length < 2) {
      setError('Class names need at least 2 characters.');
      return;
    }
    if (next === name) {
      onDone();
      return;
    }
    save.mutate(next);
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <Field label="Class name" error={error ?? undefined}>
        {(p) => (
          <Input
            {...p}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
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
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save name
        </Button>
      </div>
    </form>
  );
}

function TeacherView({ data }: { data: TeacherClassDetail }) {
  const qc = useQueryClient();
  const now = useNow(60_000);
  const cls = data.class;
  const [tab, setTab] = useState('assignments');
  const [renaming, setRenaming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [newCode, setNewCode] = useState(false);
  const [editor, setEditor] = useState<{ editing: TeacherAssignment | null } | null>(null);
  const [deleting, setDeleting] = useState<TeacherAssignment | null>(null);
  const [removing, setRemoving] = useState<ClassMember | null>(null);
  const [helping, setHelping] = useState<ClassMember | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: classKeys.all });

  const unarchive = useMutation({
    mutationFn: () => api.patch(`/api/classes/${cls.id}`, { archived: false }),
    onSuccess: async () => {
      toast.success('Class unarchived. Its join code works again.');
      await refresh();
    },
    onError: (err) => toast.error(errorText(err, 'Could not unarchive the class. Check your connection and try again.')),
  });

  return (
    <>
      <BackLink to="/classes">All classes</BackLink>
      <PageHeader
        title={<span className="break-words">{cls.name}</span>}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {plural(data.memberCount, 'student')}, {plural(data.assignments.length, 'assignment')}
            {cls.archived ? <Badge>Archived</Badge> : null}
          </span>
        }
        actions={
          <>
            <Button size="sm" icon={<Pencil className="size-4" />} onClick={() => setRenaming(true)}>
              Rename
            </Button>
            {cls.archived ? (
              <Button size="sm" icon={<ArchiveRestore className="size-4" />} loading={unarchive.isPending} onClick={() => unarchive.mutate()}>
                Unarchive
              </Button>
            ) : (
              <Button size="sm" icon={<Archive className="size-4" />} onClick={() => setArchiving(true)}>
                Archive
              </Button>
            )}
          </>
        }
      />

      {cls.archived ? (
        <div className="mb-6 rounded-[var(--radius-l)] border border-line bg-surface-2 px-4 py-3 text-sm text-text-2">
          <p className="font-semibold text-text">This class is archived.</p>
          <p>Students cannot join it or play its assignments, and it is not on their list of classes. You can still see its reports. Unarchive it to use it again.</p>
        </div>
      ) : (
        <JoinCodePanel code={cls.joinCode} onNewCode={() => setNewCode(true)} />
      )}

      <Tabs
        value={tab}
        onValueChange={setTab}
        label="Class sections"
        items={[
          { value: 'assignments', label: 'Assignments', count: data.assignments.length },
          { value: 'students', label: 'Students', count: data.memberCount },
          { value: 'events', label: 'School and events', count: data.events.length },
        ]}
      >
        <TabPanel value="events" className="focus-visible:outline-offset-4">
          <SchoolEventsPanel classId={cls.id} schoolName={cls.schoolName} events={data.events} archived={cls.archived} />
        </TabPanel>
        <TabPanel value="assignments" className="focus-visible:outline-offset-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[60ch] text-sm text-text-2">Students play each assignment on their own, as often as they like. Open one to see how every student did.</p>
            {cls.archived ? (
              <p className="text-sm text-text-3">Unarchive the class to add assignments.</p>
            ) : (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditor({ editing: null })}>
                New assignment
              </Button>
            )}
          </div>
          {data.assignments.length === 0 ? (
            <EmptyState icon={<ClipboardList className="size-8" />} title={cls.archived ? 'No assignments' : 'No assignments yet'}>
              {cls.archived
                ? 'This class has no assignments.'
                : 'Pick a question set and a game mode that works with one player. Students see it in this class and play it in their own time.'}
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.assignments.map((a) => (
                <TeacherAssignmentRow key={a.id} a={a} classId={cls.id} now={now} onEdit={() => setEditor({ editing: a })} onDelete={() => setDeleting(a)} />
              ))}
            </ul>
          )}
        </TabPanel>
        <TabPanel value="students" className="focus-visible:outline-offset-4">
          <Roster members={data.members} onRemove={setRemoving} onHelp={setHelping} />
        </TabPanel>
      </Tabs>

      <Dialog open={renaming} onOpenChange={setRenaming} title="Rename class" description="Students see the new name straight away.">
        <RenameForm classId={cls.id} name={cls.name} onDone={() => setRenaming(false)} />
      </Dialog>

      <AssignmentDialog classId={cls.id} open={editor !== null} onOpenChange={(open) => !open && setEditor(null)} editing={editor?.editing ?? null} />

      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title="Archive this class?"
        description="Students will not be able to join it or play its assignments, and it leaves their list of classes. You keep its reports, and you can unarchive it at any time."
        confirmLabel="Archive class"
        variant="primary"
        onConfirm={async () => {
          await api.patch(`/api/classes/${cls.id}`, { archived: true });
          toast.success('Class archived');
          await refresh();
        }}
      />

      <ConfirmDialog
        open={newCode}
        onOpenChange={setNewCode}
        title="Make a new join code?"
        description={`The code ${cls.joinCode} stops working straight away. Students already in the class stay in it.`}
        confirmLabel="Make a new code"
        variant="primary"
        onConfirm={async () => {
          const res = await api.post<{ ok: true; joinCode: string }>(`/api/classes/${cls.id}/code`);
          toast.success(`New join code: ${res.joinCode}`);
          await refresh();
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this assignment?"
        description={`“${deleting?.title ?? ''}” disappears for students and its report is deleted. This cannot be undone.`}
        confirmLabel="Delete assignment"
        onConfirm={async () => {
          if (!deleting) return;
          await api.delete(`/api/classes/${cls.id}/assignments/${deleting.id}`);
          toast.success('Assignment deleted');
          await refresh();
        }}
      />

      <SignInHelpDialog classId={cls.id} student={helping} onClose={() => setHelping(null)} />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.displayName ?? 'this student'}?`}
        description={`They will no longer see ${cls.name} or its assignments, and they drop out of its reports. They can join again with the join code.`}
        confirmLabel="Remove student"
        onConfirm={async () => {
          if (!removing) return;
          await api.delete(`/api/classes/${cls.id}/members/${removing.id}`);
          toast.success(`${removing.displayName} removed from the class`);
          await refresh();
        }}
      />
    </>
  );
}

/**
 * Sign-in help (D38): a new recovery code for a student who cannot sign in and has lost theirs.
 * Shown once. The student uses it on the recovery page, like their own code.
 */
function SignInHelpDialog({ classId, student, onClose }: { classId: string; student: ClassMember | null; onClose: () => void }) {
  const [result, setResult] = useState<{ code: string; username: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const name = student?.displayName ?? 'this student';
  const close = () => {
    onClose();
    setResult(null);
    setProblem(null);
  };
  const make = async () => {
    if (!student) return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await api.post<{ recoveryCode: string; username: string }>(`/api/classes/${classId}/members/${student.id}/recovery-code`);
      setResult({ code: res.recoveryCode, username: res.username });
    } catch (err) {
      setProblem(errorText(err, 'The code was not made. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={student !== null}
      onOpenChange={(open) => !open && !busy && close()}
      title={`Help ${name} sign in`}
      description={result ? undefined : `If ${name} cannot sign in and has lost their recovery code, make them a new one. Their old code stops working, and they will see that you made it.`}
      footer={
        result ? (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" icon={<KeyRound className="size-4" aria-hidden />} loading={busy} onClick={() => void make()}>
              Make a recovery code
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-4">
          <CodeTicket code={result.code} label={`Recovery code for ${name}`} />
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-text">
            <li>On the sign-in page, they choose Forgot your password?</li>
            <li>
              They enter their username, <strong className="font-semibold">{result.username}</strong>, this code and a new password.
            </li>
          </ol>
          <p className="text-sm text-text-2">Give it to them privately. It works once, and it will not be shown again.</p>
        </div>
      ) : problem ? (
        <p role="alert" className="text-sm font-semibold text-ember">
          {problem}
        </p>
      ) : null}
    </Dialog>
  );
}

/* ------------------------------- Student view ------------------------------- */

function MyResultText({ mine }: { mine: MyResult | null }) {
  if (!mine) return <p className="text-sm text-text-3">Not played yet</p>;
  return (
    <div className="text-sm sm:text-right">
      {/* Best right answers and most answered can come from different plays, so only one play shows both. */}
      <p className="font-display text-xl leading-tight font-bold text-text tabular">{mine.plays === 1 ? `${mine.bestCorrect} of ${mine.bestAnswered} right` : `Best: ${mine.bestCorrect} right`}</p>
      <p className="text-text-3">
        {mine.plays === 1 ? 'Played' : `Played ${mine.plays} times, most recently`} <time dateTime={mine.lastPlayedAt}>{timeAgo(mine.lastPlayedAt)}</time>
      </p>
    </div>
  );
}

function StudentAssignmentRow({ a, now, archived, starting, onPlay }: { a: StudentAssignment; now: number; archived: boolean; starting: string | null; onPlay: () => void }) {
  const info = useModeInfo()(a.modeId, a.variantId);
  const label = a.mine ? 'Play again' : 'Play';
  return (
    <li className="flex flex-col gap-4 rounded-[var(--radius-l)] border border-line bg-raised p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <ModeArt thumb={info.thumb} className={artClass} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl leading-tight font-bold break-words">{a.title}</h3>
          <p className="mt-0.5 text-sm break-words text-text-2">
            {a.setTitle}, {info.title}
          </p>
          {a.instructions ? <p className="mt-2 text-sm break-words whitespace-pre-line text-text">{a.instructions}</p> : null}
          <p className="mt-2 text-sm">
            <DueLabel dueAt={a.dueAt} now={now} quietWhenPast={Boolean(a.mine)} />
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-line pt-3 sm:flex-col sm:items-end sm:justify-center sm:border-0 sm:pt-0">
        <MyResultText mine={a.mine} />
        <Button
          variant={a.mine ? 'secondary' : 'primary'}
          icon={<Play className="size-4" />}
          loading={starting === a.id}
          disabled={archived || (starting !== null && starting !== a.id)}
          onClick={onPlay}
          aria-label={`${label}: ${a.title}`}
        >
          {label}
        </Button>
      </div>
    </li>
  );
}

function StudentView({ data }: { data: StudentClassDetail }) {
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const now = useNow(60_000);
  const cls = data.class;
  const [leaving, setLeaving] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  const play = async (a: StudentAssignment) => {
    setStarting(a.id);
    try {
      const res = await api.post<{ code: string }>(`/api/assignments/${a.id}/play`);
      navigate(`/room/${res.code}`);
    } catch (err) {
      setStarting(null);
      toast.error(errorText(err, 'Could not start the assignment. Check your connection and try again.'));
    }
  };

  return (
    <>
      <BackLink to="/classes">All classes</BackLink>
      <PageHeader
        title={<span className="break-words">{cls.name}</span>}
        description={`${cls.schoolName ? `${cls.schoolName}. ` : ''}Taught by ${cls.teacher}`}
        actions={
          <Button size="sm" variant="ghost" icon={<LogOut className="size-4" />} onClick={() => setLeaving(true)}>
            Leave class
          </Button>
        }
      />
      {cls.archived ? (
        <div className="mb-6 rounded-[var(--radius-l)] border border-line bg-surface-2 px-4 py-3 text-sm text-text-2">
          <p className="font-semibold text-text">This class is archived.</p>
          <p>Its assignments cannot be played right now. Your results so far are kept.</p>
        </div>
      ) : null}
      {data.events.length ? (
        <section className="mb-6">
          <SectionTitle>Events</SectionTitle>
          <ul className="grid gap-3 md:grid-cols-2">
            {data.events.map((e) => (
              <EventCard key={e.id} e={e} school={cls.schoolName} />
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <SectionTitle>Assignments</SectionTitle>
        {data.assignments.length === 0 ? (
          <EmptyState icon={<ClipboardList className="size-8" />} title="No assignments yet">
            When {cls.teacher} sets one, it shows up here.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.assignments.map((a) => (
              <StudentAssignmentRow key={a.id} a={a} now={now} archived={cls.archived} starting={starting} onPlay={() => void play(a)} />
            ))}
          </ul>
        )}
      </section>
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Leave this class?"
        description={`You will stop seeing ${cls.name} and its assignments. To come back, you need the join code from ${cls.teacher}.`}
        confirmLabel="Leave class"
        onConfirm={async () => {
          const userId = me.data?.user?.id;
          if (!userId) throw new ApiError(401, 'unauthenticated', 'Sign in again to leave the class.');
          await api.delete(`/api/classes/${cls.id}/members/${userId}`);
          toast.success(`You left ${cls.name}`);
          void qc.invalidateQueries({ queryKey: classKeys.list });
          navigate('/classes');
        }}
      />
    </>
  );
}

/* ---------------------------------- Page ------------------------------------ */

export default function ClassDetailPage() {
  const { id = '' } = useParams();
  const account = useAccountState();
  const detail = useClassDetail(id, account === 'account');
  usePageTitle(detail.data?.class.name ?? 'Class');

  if (account === 'loading' || (account === 'account' && detail.isPending)) return <ClassPageSkeleton />;
  if (account === 'signedOut' || hasStatus(detail.error, 401)) {
    return (
      <>
        <PageHeader title="Class" />
        <ClassAccountGate state="signedOut" next={`/classes/${id}`} />
      </>
    );
  }
  if (account === 'guest' || hasStatus(detail.error, 403)) {
    return (
      <>
        <PageHeader title="Class" />
        <ClassAccountGate state="guest" next={`/classes/${id}`} message={hasStatus(detail.error, 403) ? errorText(detail.error, '') : undefined} />
      </>
    );
  }
  if (hasStatus(detail.error, 400, 404)) {
    return (
      <>
        <PageHeader title="Class" />
        <EmptyState icon={<School className="size-8" />} title="Class not found" action={<ButtonLink to="/classes">All classes</ButtonLink>}>
          {errorText(detail.error, 'That class does not exist.')} You may have left it, or the link may be wrong.
        </EmptyState>
      </>
    );
  }
  if (!detail.data) {
    return (
      <>
        <BackLink to="/classes">All classes</BackLink>
        <PageHeader title="Class" />
        <ErrorNotice message={errorText(detail.error, 'This class could not be loaded. Check your connection and try again.')} onRetry={() => void detail.refetch()} />
      </>
    );
  }
  return detail.data.role === 'teacher' ? <TeacherView data={detail.data} /> : <StudentView data={detail.data} />;
}
