import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, ArrowRightLeft, BarChart3, ClipboardList, Copy, KeyRound, LogOut, NotebookPen, Pencil, Play, Plus, RefreshCw, School, Search, Trash2, UserMinus, UserPlus, Users, Wrench } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { useNow } from '../../lib/useNow.ts';
import { plural, timeAgo } from '../../lib/format.ts';
import { ModeArt } from '../../art/ModeArt.tsx';
import { Badge, Dialog, EmptyState, ErrorNotice, Field, Input, PageHeader, Panel, ProgressBar, SectionTitle, Select, TabPanel, Tabs } from '../../ui/primitives.tsx';
import { Button, ButtonLink, IconButton } from '../../ui/Button.tsx';
import { BackLink, dateText, dateTimeText, errorText, hasStatus, NoValue, TableBox, Th, usePageTitle } from '../reports/reportUi.tsx';
import { AssignmentDialog } from './AssignmentDialog.tsx';
import { EventCard, SchoolEventsPanel } from './SchoolEvents.tsx';
import { CodeTicket } from '../auth/RecoveryCodeDialog.tsx';
import { PlayerAvatar } from '../social/parts.tsx';
import { GoalCard, MyBadges, Notices, WeeklyBoard } from './Board.tsx';
import { ClassCalendar } from './Calendar.tsx';
import { ClassLoginsDialog, ResetPasscodeDialog } from './ClassLogins.tsx';
import { LiveGames } from './LiveGames.tsx';
import { ClassLessons } from '../lessons/ClassLessons.tsx';
import { GradebookPanel } from './Gradebook.tsx';
import { InsightsPanel } from './Insights.tsx';
import { studentWork, type StudentWork } from './classLogic.ts';
import {
  classKeys,
  copyText,
  useAccountState,
  useClassDetail,
  useClassList,
  useModeInfo,
  type ClassMember,
  type MyResult,
  type StudentAssignment,
  type StudentClassDetail,
  type TeacherAssignment,
  type TeacherClassDetail,
} from './classData.ts';
import { ClassAccountGate, ClassPageSkeleton, ConfirmDialog, DueLabel, JoinCode } from './classUi.tsx';
import { ExtraTimePanel } from './ExtraTimePanel.tsx';
import { GroupsPanel, TeachersPanel } from './GroupsAndTeachers.tsx';

/*
 * /classes/:id. The teacher manages the class: join code, roster (with class
 * logins, bulk moves and private notes), assignments, the gradebook, insights,
 * the noticeboard and goal, and a calendar. A student sees the notices, the goal,
 * their assignments with where each stands, their own results and a Play button;
 * never anyone else's results (the API only returns theirs).
 */

/** The options a teacher set on an assignment, in a short line. */
function OptionsText({
  a,
  now,
}: {
  a: {
    opensAt: string | null;
    closesAt: string | null;
    maxAttempts: number | null;
  };
  now: number;
}) {
  const parts: string[] = [];
  if (a.opensAt) parts.push(Date.parse(a.opensAt) > now ? `Opens ${dateTimeText(a.opensAt)}` : `Opened ${dateText(a.opensAt)}`);
  if (a.closesAt) parts.push(Date.parse(a.closesAt) > now ? `Closes ${dateTimeText(a.closesAt)}` : 'Closed');
  if (a.maxAttempts !== null) parts.push(a.maxAttempts === 1 ? 'One try' : `${a.maxAttempts} tries each`);
  if (!parts.length) return null;
  return <p className="mt-1 text-sm text-text-2">{parts.join('. ')}.</p>;
}

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
        <ModeArt thumb={info.thumb} mode={info.mode?.meta} variant={info.variant?.meta} className={artClass} />
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
          {a.groupName ? (
            <p className="mt-1.5">
              <Badge tone="mint">
                <Users className="size-3.5" aria-hidden /> For {a.groupName} only
              </Badge>
            </p>
          ) : null}
          <OptionsText a={a} now={now} />
          {a.opensAt && Date.parse(a.opensAt) > now ? (
            <p className="mt-1.5">
              <Badge tone="sky">Scheduled: students cannot see it yet</Badge>
            </p>
          ) : null}
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

function MemberName({ m, classId }: { m: ClassMember; classId: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <PlayerAvatar avatar={m.avatar} size={36} />
      <div className="min-w-0">
        <Link to={`/classes/${classId}/students/${m.id}`} className="font-semibold break-words text-text">
          {m.displayName}
          <span className="sr-only">, open their report</span>
        </Link>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-text-3">
          {m.username ? <span className="break-all">@{m.username}</span> : null}
          {m.classLogin ? <span>Class login</span> : null}
          {m.hasNote ? (
            <span className="inline-flex items-center gap-1">
              <NotebookPen className="size-3" aria-hidden />
              Has your note
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MemberActions({ m, onRemove, onHelp, onReset }: { m: ClassMember; onRemove: (m: ClassMember) => void; onHelp: (m: ClassMember) => void; onReset: (m: ClassMember) => void }) {
  return (
    <>
      {m.classLogin ? (
        <Button size="sm" variant="ghost" icon={<KeyRound className="size-4" aria-hidden />} onClick={() => onReset(m)}>
          Reset passcode<span className="sr-only"> for {m.displayName}</span>
        </Button>
      ) : (
        <Button size="sm" variant="ghost" icon={<KeyRound className="size-4" aria-hidden />} onClick={() => onHelp(m)}>
          Sign-in help<span className="sr-only"> for {m.displayName}</span>
        </Button>
      )}
      <Button size="sm" variant="ghost" icon={<UserMinus className="size-4" />} onClick={() => onRemove(m)} aria-label={`Remove ${m.displayName} from the class`}>
        Remove
      </Button>
    </>
  );
}

function Roster({
  classId,
  className,
  archived,
  members,
  onRemove,
  onHelp,
  onReset,
}: {
  classId: string;
  className: string;
  archived: boolean;
  members: ClassMember[];
  onRemove: (m: ClassMember) => void;
  onHelp: (m: ClassMember) => void;
  onReset: (m: ClassMember) => void;
}) {
  const qc = useQueryClient();
  const list = useClassList(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [logins, setLogins] = useState(false);
  const [bulk, setBulk] = useState<'remove' | 'move' | null>(null);
  const [target, setTarget] = useState('');
  const others = (list.data?.teaching ?? []).filter((c) => c.id !== classId && !c.archived);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? members.filter((m) => m.displayName.toLowerCase().includes(t) || (m.username ?? '').toLowerCase().includes(t)) : members;
  }, [members, q]);
  const chosen = members.filter((m) => selected.has(m.id));
  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allShown = shown.length > 0 && shown.every((m) => selected.has(m.id));
  const toggleAll = () => setSelected(allShown ? new Set([...selected].filter((id) => !shown.some((m) => m.id === id))) : new Set([...selected, ...shown.map((m) => m.id)]));
  const targetClass = others.find((c) => c.id === target);

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-[60ch] text-sm text-text-2">Open a student for their report and your private note. Students with no email can have a class login.</p>
      {!archived ? (
        <Button variant="primary" icon={<UserPlus className="size-4" aria-hidden />} onClick={() => setLogins(true)}>
          Make class logins
        </Button>
      ) : null}
    </div>
  );
  const dialogs = (
    <>
      <ClassLoginsDialog classId={classId} className={className} open={logins} onOpenChange={setLogins} />
      <ConfirmDialog
        open={bulk === 'remove'}
        onOpenChange={(o) => !o && setBulk(null)}
        title={`Remove ${plural(chosen.length, 'student')}?`}
        description={`${chosen.map((m) => m.displayName).join(', ')} will no longer see ${className} or its assignments, and drop out of its reports. Your notes on them are deleted. They can join again with the join code.`}
        confirmLabel={`Remove ${plural(chosen.length, 'student')}`}
        onConfirm={async () => {
          const res = await api.post<{ done: number }>(`/api/classes/${classId}/members/bulk`, { action: 'remove', userIds: chosen.map((m) => m.id) });
          toast.success(`${plural(res.done, 'student')} removed`);
          setSelected(new Set());
          await qc.invalidateQueries({ queryKey: classKeys.all });
        }}
      />
      <ConfirmDialog
        open={bulk === 'move' && Boolean(targetClass)}
        onOpenChange={(o) => !o && setBulk(null)}
        title={`Move ${plural(chosen.length, 'student')} to ${targetClass?.name ?? ''}?`}
        description={`They leave ${className} and join ${targetClass?.name ?? 'the other class'}, with your notes and class logins. Their results here stay in this class's reports.`}
        confirmLabel="Move students"
        variant="primary"
        onConfirm={async () => {
          const res = await api.post<{ done: number; to: { name: string } }>(`/api/classes/${classId}/members/bulk`, {
            action: 'move',
            userIds: chosen.map((m) => m.id),
            toClassId: target,
          });
          toast.success(`${plural(res.done, 'student')} moved to ${res.to.name}`);
          setSelected(new Set());
          await qc.invalidateQueries({ queryKey: classKeys.all });
        }}
      />
    </>
  );

  if (!members.length) {
    return (
      // The dialogs come first in both layouts, so the class logins dialog keeps its cards when the first students arrive.
      <div className="flex flex-col gap-4">
        {dialogs}
        {toolbar}
        <EmptyState icon={<Users className="size-8" />} title="No students yet">
          Share the join code: students choose Join a class on their Classes page and type it in. Or make class logins for students with no email.
        </EmptyState>
      </div>
    );
  }
  const check = (m: ClassMember) => <input type="checkbox" className="size-5 shrink-0 accent-[var(--lantern-deep)]" checked={selected.has(m.id)} onChange={() => toggle(m.id)} aria-label={`Select ${m.displayName}`} />;
  return (
    <div className="flex flex-col gap-3">
      {dialogs}
      {toolbar}
      <div className="flex flex-wrap items-center gap-3">
        {members.length > 8 ? (
          <label className="relative block min-w-0 flex-1 sm:max-w-xs">
            <span className="sr-only">Find a student</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a student" className="h-10 pl-9" />
          </label>
        ) : null}
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-text">
          <input type="checkbox" className="size-5 accent-[var(--lantern-deep)]" checked={allShown} onChange={toggleAll} />
          Select all{q.trim() ? ' shown' : ''}
        </label>
      </div>
      {chosen.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-m)] border border-lantern bg-lantern/[0.08] p-2.5" role="region" aria-label="Selected students">
          <span className="px-1 text-sm font-semibold text-text" aria-live="polite">
            {plural(chosen.length, 'student')} selected
          </span>
          <Button size="sm" icon={<UserMinus className="size-4" aria-hidden />} onClick={() => setBulk('remove')}>
            Remove
          </Button>
          {others.length ? (
            <span className="flex flex-wrap items-center gap-2">
              <Select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Class to move them to" className="h-10 w-auto max-w-[14rem]">
                <option value="">Move to a class…</option>
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Button size="sm" icon={<ArrowRightLeft className="size-4" aria-hidden />} disabled={!target} onClick={() => setBulk('move')}>
                Move
              </Button>
            </span>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}
      {/* On a phone a wide table would hide the actions off to the side, so each student is a card there. */}
      <ul className="flex flex-col gap-2 sm:hidden" aria-label="Students in this class">
        {shown.map((m) => (
          <li key={m.id} className="rounded-[var(--radius-m)] border border-line bg-raised p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <span className="mt-2">{check(m)}</span>
                <MemberName m={m} classId={classId} />
              </div>
              <span className="shrink-0 rounded-[var(--radius-s)] bg-surface-3 px-1.5 font-display text-sm leading-6 font-bold text-text-2 tabular">Lv {m.level}</span>
            </div>
            <p className="mt-1 text-sm text-text-2">
              Joined <time dateTime={m.joinedAt}>{dateText(m.joinedAt)}</time>
              {', '}
              {m.lastSeenAt ? (
                <>
                  seen <time dateTime={m.lastSeenAt}>{timeAgo(m.lastSeenAt)}</time>
                </>
              ) : (
                'not seen yet'
              )}
            </p>
            <div className="mt-2 flex flex-wrap gap-1 border-t border-line pt-2">
              <MemberActions m={m} onRemove={onRemove} onHelp={onHelp} onReset={onReset} />
            </div>
          </li>
        ))}
        {shown.length === 0 ? <li className="px-3 py-6 text-center text-text-3">No students match “{q.trim()}”.</li> : null}
      </ul>
      <div className="hidden sm:block">
        <TableBox caption="Students in this class" minWidth={760}>
          <thead className="bg-surface-2">
            <tr>
              <Th className="w-10">
                <span className="sr-only">Select</span>
              </Th>
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
              <tr key={m.id} className={`border-t border-line ${selected.has(m.id) ? 'bg-lantern/[0.06]' : ''}`}>
                <td className="py-2.5 pl-3">{check(m)}</td>
                <td className="px-3 py-2.5">
                  <MemberName m={m} classId={classId} />
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
                    <MemberActions m={m} onRemove={onRemove} onHelp={onHelp} onReset={onReset} />
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-text-3">
                  No students match “{q.trim()}”.
                </td>
              </tr>
            ) : null}
          </tbody>
        </TableBox>
      </div>
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
  const me = useMe();
  const now = useNow(60_000);
  const cls = data.class;
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'assignments';
  // The tab lives in the address, so Back from a report or a student returns to it.
  const setTab = (next: string) =>
    setParams(
      (p) => {
        if (next === 'assignments') p.delete('tab');
        else p.set('tab', next);
        return p;
      },
      { replace: true },
    );
  const [resetting, setResetting] = useState<ClassMember | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [newCode, setNewCode] = useState(false);
  const [editor, setEditor] = useState<{
    editing: TeacherAssignment | null;
  } | null>(null);
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
            <ButtonLink to={`/classes/${cls.id}/tools`} size="sm" icon={<Wrench className="size-4" aria-hidden />}>
              Class tools
            </ButtonLink>
            <Button size="sm" icon={<Pencil className="size-4" />} onClick={() => setRenaming(true)}>
              Rename
            </Button>
            {/* Archiving is for the teacher who made the class (the server says so too). */}
            {!data.owner ? null : cls.archived ? (
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
      {/* Lessons: scheduled lessons for this class (features/lessons). */}
      <ClassLessons classId={cls.id} teacher />

      <Tabs
        value={tab}
        onValueChange={setTab}
        label="Class sections"
        items={[
          {
            value: 'assignments',
            label: 'Assignments',
            count: data.assignments.length,
          },
          { value: 'students', label: 'Students', count: data.memberCount },
          { value: 'groups', label: 'Groups', count: data.groups.length },
          { value: 'gradebook', label: 'Gradebook' },
          { value: 'insights', label: 'Insights' },
          { value: 'board', label: 'Noticeboard', count: data.notices.length },
          { value: 'calendar', label: 'Calendar' },
          { value: 'live', label: 'Live games' },
          {
            value: 'events',
            label: 'School and events',
            count: data.events.length,
          },
        ]}
      >
        <TabPanel value="gradebook" className="focus-visible:outline-offset-4">
          <GradebookPanel classId={cls.id} className={cls.name} members={data.members} />
        </TabPanel>
        <TabPanel value="insights" className="focus-visible:outline-offset-4">
          <InsightsPanel classId={cls.id} />
        </TabPanel>
        <TabPanel value="board" className="focus-visible:outline-offset-4">
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Notices classId={cls.id} notices={data.notices} teacher archived={cls.archived} />
            <div className="flex flex-col gap-4">
              <GoalCard classId={cls.id} goal={data.goal} teacher archived={cls.archived} />
              <WeeklyBoard classId={cls.id} on={cls.leaderboardOn} teacher />
            </div>
          </div>
        </TabPanel>
        <TabPanel value="live" className="focus-visible:outline-offset-4">
          <LiveGames classId={cls.id} archived={cls.archived} defaults={cls.hostDefaults ?? { generatedNames: false, quiet: false }} />
        </TabPanel>
        <TabPanel value="calendar" className="focus-visible:outline-offset-4">
          <ClassCalendar items={data.assignments} now={now} />
        </TabPanel>
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
          <Roster classId={cls.id} className={cls.name} archived={cls.archived} members={data.members} onRemove={setRemoving} onHelp={setHelping} onReset={setResetting} />
          <ExtraTimePanel classId={cls.id} members={data.members} archived={cls.archived} />
          <TeachersPanel classId={cls.id} className={cls.name} teachers={data.teachers} owner={data.owner} myId={me.data?.user?.id} archived={cls.archived} />
        </TabPanel>
        <TabPanel value="groups" className="focus-visible:outline-offset-4">
          <GroupsPanel classId={cls.id} groups={data.groups} members={data.members} assignments={data.assignments} archived={cls.archived} />
        </TabPanel>
      </Tabs>

      <Dialog open={renaming} onOpenChange={setRenaming} title="Rename class" description="Students see the new name straight away.">
        <RenameForm classId={cls.id} name={cls.name} onDone={() => setRenaming(false)} />
      </Dialog>

      <AssignmentDialog classId={cls.id} open={editor !== null} onOpenChange={(open) => !open && setEditor(null)} editing={editor?.editing ?? null} groups={data.groups} />

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
      <ResetPasscodeDialog classId={cls.id} className={cls.name} student={resetting} onClose={() => setResetting(null)} />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.displayName ?? 'this student'}?`}
        description={`They will no longer see ${cls.name} or its assignments, and they drop out of its reports. Your note on them is deleted. They can join again with the join code.`}
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
  const [result, setResult] = useState<{
    code: string;
    username: string;
  } | null>(null);
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

export const WORK_LABEL: Record<StudentWork, { label: string; tone: 'mint' | 'coral' | 'amber' | 'neutral' | 'sky' }> = {
  todo: { label: 'To do', tone: 'sky' },
  dueSoon: { label: 'Due soon', tone: 'amber' },
  overdue: { label: 'Past due', tone: 'coral' },
  done: { label: 'Done', tone: 'mint' },
  used: { label: 'All tries used', tone: 'neutral' },
  closed: { label: 'Closed', tone: 'neutral' },
};

function StudentAssignmentRow({ a, now, archived, starting, onPlay }: { a: StudentAssignment; now: number; archived: boolean; starting: string | null; onPlay: () => void }) {
  const info = useModeInfo()(a.modeId, a.variantId);
  const label = a.mine ? 'Play again' : 'Play';
  const work = studentWork(a, now);
  const triesLeft = a.maxAttempts !== null ? Math.max(0, a.maxAttempts - (a.mine?.plays ?? 0)) : null;
  return (
    <li className="flex flex-col gap-4 rounded-[var(--radius-l)] border border-line bg-raised p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <ModeArt thumb={info.thumb} mode={info.mode?.meta} variant={info.variant?.meta} className={artClass} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-display text-xl leading-tight font-bold break-words">{a.title}</h3>
            <Badge tone={WORK_LABEL[work].tone}>{WORK_LABEL[work].label}</Badge>
            {a.groupName ? <Badge tone="mint">For {a.groupName}</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm break-words text-text-2">
            {a.setTitle}, {info.title}
          </p>
          {a.instructions ? <p className="mt-2 text-sm break-words whitespace-pre-line text-text">{a.instructions}</p> : null}
          <p className="mt-2 text-sm">
            <DueLabel dueAt={a.dueAt} now={now} quietWhenPast={Boolean(a.mine)} />
          </p>
          {a.closesAt && Date.parse(a.closesAt) > now ? <p className="mt-1 text-sm text-text-2">Closes {dateTimeText(a.closesAt)}. After that it cannot be played.</p> : null}
          {triesLeft !== null && !a.blocked ? <p className="mt-1 text-sm text-text-2">{triesLeft === 1 ? 'One try left.' : `${triesLeft} tries left.`}</p> : null}
          {a.blocked ? <p className="mt-1 text-sm font-semibold text-text">{a.blocked}</p> : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-line pt-3 sm:flex-col sm:items-end sm:justify-center sm:border-0 sm:pt-0">
        <MyResultText mine={a.mine} />
        <Button
          variant={a.mine ? 'secondary' : 'primary'}
          icon={<Play className="size-4" />}
          loading={starting === a.id}
          disabled={archived || Boolean(a.blocked) || (starting !== null && starting !== a.id)}
          onClick={onPlay}
          aria-label={`${label}: ${a.title}`}
        >
          {label}
        </Button>
      </div>
    </li>
  );
}

/** Work still to do first (past due, then soonest due), then what is done or closed. */
function orderForStudent(list: StudentAssignment[], now: number): StudentAssignment[] {
  const rank: Record<StudentWork, number> = {
    overdue: 0,
    dueSoon: 1,
    todo: 2,
    done: 3,
    used: 4,
    closed: 5,
  };
  const due = (a: StudentAssignment) => (a.dueAt ? Date.parse(a.dueAt) : Infinity);
  return [...list].sort((a, b) => rank[studentWork(a, now)] - rank[studentWork(b, now)] || due(a) - due(b));
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
        description={`${cls.schoolName ? `${cls.schoolName}. ` : ''}Taught by ${cls.teacher}${data.myGroups?.length ? `. Your ${data.myGroups.length === 1 ? 'group' : 'groups'}: ${data.myGroups.map((g) => g.name).join(', ')}` : ''}`}
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
      {cls.archived ? null : <ClassLessons classId={cls.id} teacher={false} />}
      {data.notices.length || data.goal || cls.leaderboardOn ? (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.notices.length ? <Notices classId={cls.id} notices={data.notices} teacher={false} /> : null}
          <div className="flex flex-col gap-4">
            <GoalCard classId={cls.id} goal={data.goal} teacher={false} />
            <WeeklyBoard classId={cls.id} on={cls.leaderboardOn} teacher={false} />
          </div>
        </div>
      ) : null}
      <div className="mb-6">
        <MyBadges classId={cls.id} />
      </div>
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
        <SectionTitle
          action={
            me.data?.user ? (
              <ButtonLink to={`/classes/${cls.id}/students/${me.data.user.id}`} size="sm" variant="ghost" icon={<BarChart3 className="size-4" aria-hidden />}>
                Your progress
              </ButtonLink>
            ) : null
          }
        >
          Assignments
        </SectionTitle>
        {data.assignments.length === 0 ? (
          <EmptyState icon={<ClipboardList className="size-8" />} title="No assignments yet">
            When {cls.teacher} sets one, it shows up here.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {orderForStudent(data.assignments, now).map((a) => (
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
