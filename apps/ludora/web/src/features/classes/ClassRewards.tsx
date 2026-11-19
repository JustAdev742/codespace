import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Gift } from 'lucide-react';
import { api, ApiError, newRequestKey } from '../../lib/api.ts';
import { formatDate, formatNumber, plural } from '../../lib/format.ts';
import { CurrencyIcon } from '../../art/icons.tsx';
import { EmptyState, ErrorNotice, Field, Input, ProgressBar, Select, Skeleton, Textarea } from '../../ui/primitives.tsx';
import { Segmented } from '../../ui/Segmented.tsx';
import { Button } from '../../ui/Button.tsx';

/*
 * Class rewards (D58), the Rewards tab of a class. A teacher gives Sparks to one student or the
 * whole class with a reason the students see, out of the class's weekly budget (set by Ludora's
 * economy managers). Students cannot give Sparks to each other; this is the teacher's alone.
 */

interface RewardsData {
  budget: number;
  maxPerStudent: number;
  /** The most one student can be given in a week, across every class they are in. */
  weeklyPerStudent: number;
  used: number;
  left: number;
  resetsAt: string;
  students: { id: string; name: string; thisWeek: number; room: number }[];
  recent: { batchId: string; teacherName: string; note: string; amount: number; students: number; wholeClass: boolean; studentName: string | null; at: string }[];
}

const QUICK_REASONS = ['Great effort', 'Kind to others', 'Helped a classmate', 'Brilliant answer', 'Great teamwork'];

export function ClassRewards({ classId, archived }: { classId: string; archived: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['class', classId, 'rewards'], queryFn: () => api.get<RewardsData>(`/api/classes/${classId}/rewards`) });
  const [who, setWho] = useState<'one' | 'all'>('one');
  const [studentId, setStudentId] = useState('');
  const [amount, setAmount] = useState('10');
  const [note, setNote] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  const give = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<{ students: number; skipped: number; amountEach: number; total: number; left: number; replayed: boolean }>(`/api/classes/${classId}/rewards`, body),
    onSuccess: async (r) => {
      keyRef.current = null;
      setNote('');
      setError(null);
      const leftOut = r.skipped ? ` ${plural(r.skipped, 'student')} ${r.skipped === 1 ? 'was' : 'were'} left out: they have had the most a student can be given this week.` : '';
      toast.success(r.replayed ? 'That reward was already given.' : r.students === 1 && !r.skipped ? `Gave ${r.amountEach} Sparks. ${r.left} left this week.` : `Gave ${r.amountEach} Sparks each to ${plural(r.students, 'student')}. ${r.left} left this week.${leftOut}`);
      await qc.invalidateQueries({ queryKey: ['class', classId, 'rewards'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err : new ApiError(0, 'internal', 'The reward was not given. Try again.')),
  });

  if (q.isError) return <ErrorNotice message="Class rewards did not load." onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-72" />;
  const d = q.data;
  const n = /^\d+$/.test(amount.trim()) ? Number(amount) : NaN;
  const chosen = d.students.find((s) => s.id === studentId);
  // A whole-class reward leaves out students who have had the week's limit, so it only counts those with room.
  const count = who === 'all' ? (Number.isFinite(n) ? d.students.filter((s) => s.room >= n).length : d.students.length) : studentId ? 1 : 0;
  const leftOut = who === 'all' && Number.isFinite(n) ? d.students.length - count : 0;
  const total = Number.isFinite(n) ? n * count : 0;
  const amountErr =
    amount && !(n >= 1 && n <= d.maxPerStudent)
      ? `Give from 1 to ${d.maxPerStudent} Sparks to each student.`
      : who === 'one' && chosen && n > chosen.room
        ? chosen.room > 0
          ? `${chosen.name} can be given ${chosen.room} more this week. A student can have up to ${d.weeklyPerStudent} a week.`
          : `${chosen.name} has had this week's limit of ${d.weeklyPerStudent} Sparks. It starts again on Monday.`
        : total > d.left
          ? `That is ${total} Sparks and this class has ${d.left} left this week.`
          : who === 'all' && d.students.length > 0 && count === 0
            ? `Every student has had close to this week's limit of ${d.weeklyPerStudent} Sparks.`
            : undefined;
  const noteOk = note.trim().length >= 3;
  const ready = !archived && count > 0 && n >= 1 && n <= d.maxPerStudent && !(who === 'one' && chosen && n > chosen.room) && total <= d.left && noteOk && !give.isPending;
  const studentName = chosen?.name;
  const label = !count ? 'Give Sparks' : who === 'all' ? `Give ${Number.isFinite(n) ? n : 0} Sparks each to ${plural(count, 'student')}` : `Give ${Number.isFinite(n) ? n : 0} Sparks to ${studentName}`;

  const submit = () => {
    if (!ready) return;
    const body = { ...(who === 'all' ? { wholeClass: true } : { studentId }), amount: n, note: note.trim() };
    const sig = JSON.stringify(body);
    if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: newRequestKey('reward') };
    give.mutate({ ...body, requestKey: keyRef.current.key });
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <section aria-labelledby="rewards-give" className="panel flex min-w-0 flex-col gap-4 rounded-[var(--radius-l)] p-4 sm:p-5">
        <div>
          <h2 id="rewards-give" className="font-display text-2xl leading-tight font-bold">
            Give Sparks
          </h2>
          <p className="mt-1 text-sm text-text-2">For effort, kindness or good work. Students see who gave it and why, in their Wallet. Only you and other teachers of this class can give them.</p>
        </div>
        <div>
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold text-text">This week's budget</span>
            <span className="inline-flex items-center gap-1 font-display text-lg font-bold tabular">
              <CurrencyIcon code="sparks" size={16} />
              {formatNumber(d.left)} left of {formatNumber(d.budget)}
            </span>
          </div>
          <ProgressBar value={d.used} max={Math.max(1, d.budget)} label="Sparks given this week" />
          <p className="mt-1.5 text-xs text-text-3">It starts again every Monday. {formatNumber(d.used)} given so far this week.</p>
        </div>
        {archived ? (
          <p className="rounded-[var(--radius-m)] border border-line bg-surface-2 px-3 py-2 text-sm text-text-2">This class is archived, so rewards are paused.</p>
        ) : !d.students.length ? (
          <EmptyState icon={<Gift />} title="No students yet">
            When students join the class you can reward them here.
          </EmptyState>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-text" aria-hidden>
                Who
              </span>
              <Segmented
                label="Who gets the reward"
                value={who}
                onChange={setWho}
                options={[
                  { value: 'one', label: 'One student' },
                  { value: 'all', label: `Whole class (${d.students.length})` },
                ]}
              />
            </div>
            {who === 'one' ? (
              <Field label="Student">
                {(p) => (
                  <Select {...p} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                    <option value="">Choose a student</option>
                    {d.students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.room === 0 ? " (has had this week's limit)" : s.thisWeek ? ` (${s.thisWeek} this week)` : ''}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : null}
            <Field label={who === 'all' ? 'Sparks for each student' : 'Sparks'} error={amountErr ?? error?.fields.amount} hint={who === 'all' && Number.isFinite(n) && n > 0 ? `${formatNumber(total)} from the budget in all.${leftOut ? ` ${plural(leftOut, 'student')} will be left out: they have had this week's limit of ${d.weeklyPerStudent}.` : ''}` : `Up to ${d.maxPerStudent} at a time, and ${d.weeklyPerStudent} a week for each student.`}>
              {(p) => <Input {...p} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoComplete="off" className="max-w-[10rem]" />}
            </Field>
            <Field label="What it is for" hint="Students see this. Keep it short and kind." error={error?.fields.note}>
              {(p) => <Textarea {...p} rows={2} maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} />}
            </Field>
            <div className="-mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick reasons">
              {QUICK_REASONS.map((r) => (
                <button key={r} type="button" onClick={() => setNote(r)} aria-pressed={note === r} className="min-h-11 rounded-full border border-line-strong px-3 text-sm font-semibold text-text-2 hover:bg-surface-2 aria-pressed:bg-text aria-pressed:text-bg sm:min-h-9">
                  {r}
                </button>
              ))}
            </div>
            {error && !error.fields.amount && !error.fields.note ? <ErrorNotice title="Not given" message={error.message} /> : null}
            <div>
              <Button type="submit" variant="primary" icon={<Gift className="size-4" aria-hidden />} disabled={!ready} loading={give.isPending}>
                {label}
              </Button>
            </div>
          </form>
        )}
      </section>

      <section aria-labelledby="rewards-recent" className="panel min-w-0 rounded-[var(--radius-l)] p-4 sm:p-5">
        <h2 id="rewards-recent" className="mb-1 font-display text-2xl leading-tight font-bold">
          Given lately
        </h2>
        <p className="mb-3 text-sm text-text-2">The latest rewards in this class, newest first.</p>
        {d.recent.length ? (
          <ul className="flex flex-col gap-2">
            {d.recent.map((r) => (
              <li key={r.batchId} className="rounded-[var(--radius-m)] border border-line px-3 py-2.5">
                <p className="text-[15px] text-text">
                  <span className="font-semibold">{r.teacherName}</span> gave {r.amount} Sparks {r.wholeClass ? `each to the whole class (${r.students})` : r.students === 1 ? `to ${r.studentName ?? 'a student'}` : `each to ${r.students} students`}
                </p>
                <p className="text-sm break-words text-text-2">"{r.note}"</p>
                <p className="mt-0.5 text-xs text-text-3">{formatDate(r.at, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-3">No rewards given yet.</p>
        )}
      </section>
    </div>
  );
}
