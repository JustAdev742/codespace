import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GraduationCap, LogOut, Pencil, Plus, Trash2, UserMinus, Users } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { Badge, Dialog, EmptyState, Field, Input, Panel, SectionTitle } from '../../ui/primitives.tsx';
import { Button, IconButton } from '../../ui/Button.tsx';
import { errorText } from '../reports/reportUi.tsx';
import { ConfirmDialog } from './classUi.tsx';
import { classKeys, type ClassGroup, type ClassMember, type ClassTeacher, type TeacherAssignment } from './classData.ts';

/*
 * Co-teachers and groups on a class's page (finish). The server decides who may do what: only
 * the class's owner adds or removes teachers; both teachers make and change groups. A teacher is
 * added by their exact username, and an unknown name gets the same answer as a student's.
 */

/** The class's teachers, adding one by username (the owner), or leaving (a co-teacher). */
export function TeachersPanel({ classId, className, teachers, owner, myId, archived }: { classId: string; className: string; teachers: ClassTeacher[]; owner: boolean; myId: string | undefined; archived: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ClassTeacher | null>(null);
  const add = useMutation({
    mutationFn: () => api.post<{ teacher: ClassTeacher }>(`/api/classes/${classId}/teachers`, { username: username.trim() }),
    onSuccess: async (res) => {
      toast.success(`${res.teacher.displayName} now teaches ${className}`);
      setUsername('');
      setError(null);
      await qc.invalidateQueries({ queryKey: classKeys.all });
    },
    onError: (err) => setError(err instanceof ApiError ? (err.fields.username ?? err.message) : 'That did not save. Check your connection and try again.'),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return setError('Type their username.');
    add.mutate();
  };
  const leaving = removing?.id === myId;
  return (
    <Panel className="mt-6 p-4 sm:p-5" aria-labelledby="teachers-title">
      <h2 id="teachers-title" className="mb-1 flex items-center gap-2 font-display text-2xl font-bold">
        <GraduationCap className="size-5 text-text-2" aria-hidden />
        Teachers
      </h2>
      <p className="mb-3 max-w-[60ch] text-sm text-text-2">Every teacher here can set work, see reports and notes, and host games for the class. Only the teacher who made the class adds or removes teachers and archives it.</p>
      <ul className="mb-4 flex flex-col gap-2" aria-label="Teachers of this class">
        {teachers.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-m)] bg-surface-2 px-3 py-2">
            <span className="min-w-0 flex-1 font-semibold break-words">
              {t.displayName}
              {t.id === myId ? <span className="font-normal text-text-2"> (you)</span> : null}
            </span>
            {t.owner ? <Badge tone="sky">Made the class</Badge> : <Badge>Co-teacher</Badge>}
            {!t.owner && (owner || t.id === myId) ? (
              <Button size="sm" variant="ghost" icon={t.id === myId ? <LogOut className="size-4" aria-hidden /> : <UserMinus className="size-4" aria-hidden />} onClick={() => setRemoving(t)}>
                {t.id === myId ? 'Leave class' : <span>
                    Remove<span className="sr-only"> {t.displayName}</span>
                  </span>}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {owner && !archived ? (
        <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-56">
            <Field label="Add a teacher by username" hint="The name they sign in with, exactly. They get a notification." error={error ?? undefined}>
              {(p) => <Input {...p} value={username} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={40} onChange={(e) => setUsername(e.target.value)} />}
            </Field>
          </div>
          <Button type="submit" icon={<Plus className="size-4" aria-hidden />} loading={add.isPending} className="mb-[1.6rem]">
            Add teacher
          </Button>
        </form>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={leaving ? `Leave ${className}?` : `Remove ${removing?.displayName ?? 'this teacher'}?`}
        description={leaving ? 'You will no longer see this class, its reports or its students. The teacher who made it can add you again.' : `${removing?.displayName ?? 'They'} will no longer see ${className}, its reports or its students.`}
        confirmLabel={leaving ? 'Leave class' : 'Remove teacher'}
        onConfirm={async () => {
          if (!removing) return;
          await api.delete(`/api/classes/${classId}/teachers/${removing.id}`);
          toast.success(leaving ? `You left ${className}` : `${removing.displayName} removed`);
          await qc.invalidateQueries({ queryKey: classKeys.all });
          if (leaving) navigate('/classes');
        }}
      />
    </Panel>
  );
}

/** Name and members of a group, in a dialog: a checklist of the class's students. */
function GroupDialog({ classId, group, members, open, onOpenChange }: { classId: string; group: ClassGroup | null; members: ClassMember[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={group ? `Edit ${group.name}` : 'New group'} description="A reading group, a table, a set: you can give work to one group, and only its students see it.">
      {open ? <GroupForm classId={classId} group={group} members={members} onDone={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function GroupForm({ classId, group, members, onDone }: { classId: string; group: ClassGroup | null; members: ClassMember[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(group?.name ?? '');
  const [picked, setPicked] = useState<Set<string>>(new Set(group?.memberIds ?? []));
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), memberIds: [...picked] };
      return group ? api.patch(`/api/classes/${classId}/groups/${group.id}`, body) : api.post(`/api/classes/${classId}/groups`, body);
    },
    onSuccess: async () => {
      toast.success(group ? 'Group saved' : `Group ${name.trim()} made`);
      await qc.invalidateQueries({ queryKey: classKeys.all });
      onDone();
    },
    onError: (err) => setError(err instanceof ApiError ? (err.fields.name ?? err.message) : 'That did not save. Check your connection and try again.'),
  });
  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the group a name.');
    save.mutate();
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label="Name" hint="Students in the group see this name." error={error ?? undefined}>
        {(p) => <Input {...p} value={name} maxLength={40} autoComplete="off" onChange={(e) => setName(e.target.value)} />}
      </Field>
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-sm font-semibold text-text">Students ({picked.size} chosen)</legend>
        {members.length ? (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-[var(--radius-m)] border border-line p-2">
            {members.map((m) => (
              <li key={m.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-s)] px-2 hover:bg-surface-2">
                  <input type="checkbox" className="size-5 shrink-0 accent-[var(--lantern)]" checked={picked.has(m.id)} onChange={() => toggle(m.id)} />
                  <span className="min-w-0 break-words">{m.displayName}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-2">No students have joined yet. You can make the group now and add them later.</p>
        )}
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {group ? 'Save group' : 'Make group'}
        </Button>
      </div>
    </form>
  );
}

/** The class's groups: who is in each and how much work is set for it; make, edit and delete. */
export function GroupsPanel({ classId, groups, members, assignments, archived }: { classId: string; groups: ClassGroup[]; members: ClassMember[]; assignments: TeacherAssignment[]; archived: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ group: ClassGroup | null } | null>(null);
  const [deleting, setDeleting] = useState<ClassGroup | null>(null);
  const nameOf = new Map(members.map((m) => [m.id, m.displayName]));
  const workFor = (g: ClassGroup) => assignments.filter((a) => a.groupId === g.id).length;
  return (
    <section aria-labelledby="groups-title">
      <SectionTitle
        action={
          !archived ? (
            <Button variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing({ group: null })}>
              New group
            </Button>
          ) : undefined
        }
      >
        <span id="groups-title">Groups</span>
      </SectionTitle>
      <p className="mb-4 max-w-[60ch] text-sm text-text-2">Make groups inside the class, such as reading groups or tables, then give an assignment to one group when you set it. A student sees only the whole class’s work and their own group’s, and only the names of their own groups.</p>
      {groups.length === 0 ? (
        <EmptyState icon={<Users className="size-8" />} title="No groups yet">
          Groups are optional. Without them, every assignment is for the whole class.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label="Groups">
          {groups.map((g) => {
            const work = workFor(g);
            return (
              <li key={g.id} className="flex flex-col gap-2 rounded-[var(--radius-l)] border border-line bg-raised p-4">
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 font-display text-xl leading-tight font-bold break-words">{g.name}</h3>
                  {!archived ? (
                    <>
                      <IconButton label={`Edit ${g.name}`} onClick={() => setEditing({ group: g })}>
                        <Pencil className="size-4" aria-hidden />
                      </IconButton>
                      <IconButton label={`Delete ${g.name}`} onClick={() => setDeleting(g)}>
                        <Trash2 className="size-4" aria-hidden />
                      </IconButton>
                    </>
                  ) : null}
                </div>
                <p className="text-sm text-text-2">
                  {plural(g.memberIds.length, 'student')}
                  {work ? `, ${plural(work, 'assignment')} set for it` : ''}
                </p>
                {g.memberIds.length ? (
                  <p className="text-sm break-words text-text">
                    {g.memberIds
                      .map((id) => nameOf.get(id))
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                ) : (
                  <p className="text-sm text-text-3">Nobody yet. Edit the group to add students.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <GroupDialog classId={classId} group={editing?.group ?? null} members={members} open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'this group'}?`}
        description={deleting && workFor(deleting) ? `${plural(workFor(deleting), 'assignment')} set for this group must go to the whole class or be deleted first, so it will not be deleted yet.` : 'Its students stay in the class. This cannot be undone.'}
        confirmLabel="Delete group"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api.delete(`/api/classes/${classId}/groups/${deleting.id}`);
            toast.success(`${deleting.name} deleted`);
          } catch (err) {
            toast.error(errorText(err, 'The group was not deleted. Try again.'));
          }
          await qc.invalidateQueries({ queryKey: classKeys.all });
        }}
      />
    </section>
  );
}
