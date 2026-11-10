import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Award, Megaphone, Target, Trash2, Trophy } from 'lucide-react';
import type { AvatarLite } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { formatNumber, timeAgo, untilText } from '../../lib/format.ts';
import { Dialog, ErrorNotice, Field, Input, Panel, ProgressBar, Skeleton, Switch, Textarea } from '../../ui/primitives.tsx';
import { Button, IconButton } from '../../ui/Button.tsx';
import { PlayerAvatar } from '../social/parts.tsx';
import { dateTimeText, errorText } from '../reports/reportUi.tsx';
import { classKeys, fromLocalInput, toLocalInput, type ClassGoal, type ClassNotice } from './classData.ts';
import { ConfirmDialog } from './classUi.tsx';

/*
 * The class board: the teacher's notices (students read them and cannot reply),
 * the class goal with its progress bar and badge, and the weekly leaderboard,
 * which the teacher can turn off. Display names and Glims only.
 */

function Section({ id, title, icon, children, action }: { id: string; title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby={id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="flex items-center gap-2 font-display text-2xl font-bold text-text">
          <span className="grid size-9 place-items-center rounded-[var(--radius-m)] bg-surface-3 text-text-2" aria-hidden>
            {icon}
          </span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </Panel>
  );
}

/* ---------------------------------- Notices ---------------------------------- */

export function Notices({ classId, notices, teacher, archived }: { classId: string; notices: ClassNotice[]; teacher: boolean; archived?: boolean }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<ClassNotice | null>(null);
  if (!teacher && !notices.length) return null;
  const post = async (e: FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 2) {
      setError('Write at least 2 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/classes/${classId}/notices`, { body: text });
      setText('');
      toast.success('Notice posted');
      await qc.invalidateQueries({ queryKey: classKeys.detail(classId) });
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.body ?? err.message) : 'The notice was not posted. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section id="notices-title" title="Noticeboard" icon={<Megaphone className="size-5" />}>
      {teacher && !archived ? (
        <form onSubmit={post} noValidate className="flex flex-col gap-2">
          <Field label="New notice" hint={`Students see it on the class page and cannot reply. ${text.length} of 280 characters.`} error={error ?? undefined}>
            {(p) => <Textarea {...p} value={text} onChange={(e) => setText(e.target.value)} maxLength={280} rows={2} placeholder="Spelling test on Friday. Practise the Week 4 words." />}
          </Field>
          <div>
            <Button type="submit" variant="primary" size="sm" loading={busy}>
              Post notice
            </Button>
          </div>
        </form>
      ) : null}
      {notices.length === 0 ? (
        <p className="text-sm text-text-3">No notices yet.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Notices, newest first">
          {notices.map((n) => (
            <li key={n.id} className="flex items-start gap-3 rounded-[var(--radius-m)] border-l-4 border-lantern bg-surface-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="break-words whitespace-pre-line text-text">{n.body}</p>
                <p className="mt-1 text-xs text-text-3">
                  <time dateTime={n.createdAt} title={dateTimeText(n.createdAt)}>
                    {timeAgo(n.createdAt)}
                  </time>
                </p>
              </div>
              {teacher ? (
                <IconButton label="Delete this notice" size="sm" onClick={() => setRemoving(n)}>
                  <Trash2 className="size-4" />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Delete this notice?"
        description="Students stop seeing it straight away."
        confirmLabel="Delete notice"
        onConfirm={async () => {
          if (!removing) return;
          await api.delete(`/api/classes/${classId}/notices/${removing.id}`);
          toast.success('Notice deleted');
          await qc.invalidateQueries({ queryKey: classKeys.detail(classId) });
        }}
      />
    </Section>
  );
}

/* ------------------------------------ Goal ------------------------------------ */

function nextFriday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  d.setHours(15, 30, 0, 0);
  return toLocalInput(d.toISOString());
}

function GoalForm({ classId, onDone }: { classId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('Right answers this week');
  const [target, setTarget] = useState('200');
  const [ends, setEnds] = useState(nextFriday());
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const endsAt = fromLocalInput(ends);
    const n = Number(target);
    const local: Record<string, string> = {};
    if (title.trim().length < 2) local.title = 'Give the goal a name of at least 2 characters.';
    if (!Number.isInteger(n) || n < 10) local.target = 'Aim for at least 10 right answers.';
    if (!endsAt) local.endsAt = 'Enter a full date and time.';
    setFields(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      await api.put(`/api/classes/${classId}/goal`, {
        title,
        target: n,
        endsAt,
      });
      toast.success('Class goal set');
      await qc.invalidateQueries({ queryKey: classKeys.detail(classId) });
      onDone();
    } catch (err) {
      setFields(
        err instanceof ApiError
          ? { form: err.message, ...err.fields }
          : {
              form: 'The goal was not saved. Check your connection and try again.',
            },
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label="Name" error={fields.title}>
        {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />}
      </Field>
      <Field label="Right answers to reach" hint="Counted from every member’s right answers in this class’s assignments." error={fields.target}>
        {(p) => <Input {...p} type="number" inputMode="numeric" min={10} max={100000} value={target} onChange={(e) => setTarget(e.target.value)} className="w-40" />}
      </Field>
      <Field label="Ends" error={fields.endsAt}>
        {(p) => <Input {...p} type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} className="w-auto sm:max-w-xs" />}
      </Field>
      <p className="text-sm text-text-2">Reaching it gives everyone in the class a badge on this page. It never gives Sparks, items or anything that helps in a game. A new goal replaces the current one.</p>
      {fields.form ? <ErrorNotice title="Not saved" message={fields.form} /> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Set goal
        </Button>
      </div>
    </form>
  );
}

export function GoalCard({ classId, goal, teacher, archived }: { classId: string; goal: ClassGoal | null; teacher: boolean; archived?: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [ending, setEnding] = useState(false);
  if (!teacher && !goal) return null;
  const ended = goal ? Date.parse(goal.endsAt) <= Date.now() : false;
  return (
    <Section
      id="goal-title"
      title="Class goal"
      icon={<Target className="size-5" />}
      action={
        teacher && !archived ? (
          <div className="flex gap-1">
            <Button size="sm" onClick={() => setEditing(true)}>
              {goal ? 'New goal' : 'Set a goal'}
            </Button>
            {goal && !ended ? (
              <Button size="sm" variant="ghost" onClick={() => setEnding(true)}>
                End
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      {!goal ? (
        <p className="text-sm text-text-2">A shared target, such as 200 right answers by Friday, with a progress bar everyone in the class sees.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold break-words text-text">{goal.title}</p>
            <p className="font-display text-2xl leading-none font-extrabold text-text tabular">
              {formatNumber(Math.min(goal.progress, goal.target))}
              <span className="text-base font-bold text-text-2"> of {formatNumber(goal.target)}</span>
            </p>
          </div>
          <ProgressBar value={goal.progress} max={goal.target} tone={goal.reachedAt ? 'mint' : 'amber'} label={`${goal.title}: ${goal.progress} of ${goal.target} right answers`} />
          <p className="text-sm text-text-2" aria-live="polite">
            {goal.reachedAt ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-text">
                <Award className="size-4" aria-hidden />
                Reached {timeAgo(goal.reachedAt)}. {goal.badge ? 'You earned the class badge.' : teacher ? 'Everyone in the class got the badge.' : ''}
              </span>
            ) : ended ? (
              'This goal has ended.'
            ) : (
              `${formatNumber(goal.target - goal.progress)} to go, ${untilText(goal.endsAt)} left.`
            )}
          </p>
        </div>
      )}
      <Dialog open={editing} onOpenChange={setEditing} title={goal ? 'New class goal' : 'Set a class goal'} description="Everyone in the class works towards it together.">
        <GoalForm classId={classId} onDone={() => setEditing(false)} />
      </Dialog>
      <ConfirmDialog
        open={ending}
        onOpenChange={setEnding}
        title="End this goal?"
        description="It comes off the class page. Badges already earned stay with the students."
        confirmLabel="End goal"
        variant="primary"
        onConfirm={async () => {
          await api.delete(`/api/classes/${classId}/goal`);
          toast.success('Goal ended');
          await qc.invalidateQueries({ queryKey: classKeys.detail(classId) });
        }}
      />
    </Section>
  );
}

/** The student's own class badges, from goals the class reached. */
export function MyBadges({ classId }: { classId: string }) {
  const q = useQuery({
    queryKey: [...classKeys.detail(classId), 'badges'],
    queryFn: () =>
      api.get<{
        badges: { title: string; target: number; awardedAt: string }[];
      }>(`/api/classes/${classId}/badges`),
  });
  const badges = q.data?.badges ?? [];
  if (!badges.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Your class badges">
      {badges.map((b) => (
        <li key={`${b.title}-${b.awardedAt}`} className="inline-flex items-center gap-2 rounded-[var(--radius-m)] bg-surface-2 py-1.5 pr-3 pl-1.5 text-sm">
          <span className="grid size-7 place-items-center rounded-[var(--radius-s)] bg-lantern text-on-accent" aria-hidden>
            <Award className="size-4" />
          </span>
          <span>
            <span className="font-semibold break-words text-text">{b.title}</span>
            <span className="block text-xs text-text-3">{formatNumber(b.target)} right, together</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------- Leaderboard --------------------------------- */

interface BoardEntry {
  rank: number;
  id?: string;
  displayName: string;
  avatar: AvatarLite | null;
  score: number;
  games: number;
  me: boolean;
}

export function WeeklyBoard({ classId, on, teacher }: { classId: string; on: boolean; teacher: boolean }) {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const shown = on || teacher;
  const q = useQuery({
    queryKey: [...classKeys.detail(classId), 'board'],
    queryFn: () => api.get<{ entries: BoardEntry[] }>(`/api/leaderboards?scope=class&period=week&classId=${encodeURIComponent(classId)}`),
    enabled: shown,
  });
  if (!shown) return null;
  const toggle = async (next: boolean) => {
    setSaving(true);
    try {
      await api.patch(`/api/classes/${classId}`, { leaderboardOn: next });
      toast.success(next ? 'Students can see the weekly leaderboard' : 'The weekly leaderboard is off for students');
      await qc.invalidateQueries({ queryKey: classKeys.detail(classId) });
    } catch (err) {
      toast.error(errorText(err, 'That did not save. Check your connection and try again.'));
    } finally {
      setSaving(false);
    }
  };
  const entries = (q.data?.entries ?? []).slice(0, 10);
  return (
    <Section id="board-title" title="This week" icon={<Trophy className="size-5" />}>
      {teacher ? (
        <Switch
          checked={on}
          onCheckedChange={(v) => void toggle(v)}
          disabled={saving}
          label="Show students the weekly leaderboard"
          description="Right answers this week, in any game. Display names only. When it is off, only you can see it."
        />
      ) : null}
      {q.isPending ? (
        <Skeleton className="h-32" />
      ) : q.isError ? (
        <ErrorNotice message={errorText(q.error, 'The leaderboard did not load.')} onRetry={() => void q.refetch()} />
      ) : entries.length === 0 ? (
        <p className="text-sm text-text-3">Nobody has played this week yet.</p>
      ) : (
        <ol className="flex flex-col gap-1.5" aria-label="Weekly leaderboard">
          {entries.map((e) => (
            <li key={`${e.rank}-${e.displayName}`} className={`flex items-center gap-3 rounded-[var(--radius-m)] px-2.5 py-1.5 ${e.me ? 'bg-lantern/15 ring-1 ring-lantern' : 'bg-surface-2'}`}>
              <span className="w-7 text-center font-display text-xl font-extrabold text-text tabular">{e.rank}</span>
              <PlayerAvatar avatar={e.avatar} size={32} />
              <span className="min-w-0 flex-1 font-semibold break-words text-text">
                {e.displayName}
                {e.me ? <span className="font-normal text-text-2"> (you)</span> : null}
              </span>
              <span className="font-display text-lg font-bold text-text tabular">{formatNumber(e.score)}</span>
              <span className="sr-only">right answers</span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
