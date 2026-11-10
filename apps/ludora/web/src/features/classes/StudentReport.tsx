import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Award, Lock, NotebookPen, Printer, UserRound } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { duration, plural } from '../../lib/format.ts';
import { Badge, EmptyState, ErrorNotice, Field, PageHeader, Panel, SectionTitle, Textarea } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { BackLink, dateText, dateTimeText, errorText, hasStatus, NoValue, percent, questionTypeLabel, RateBar, StatRow, StatTile, usePageTitle } from '../reports/reportUi.tsx';
import { classKeys, useAccountState, useClassDetail, useStudentReport, type StudentReportData, type WorkStatus } from './classData.ts';
import { ClassAccountGate, ClassPageSkeleton } from './classUi.tsx';
import { CertificateDialog } from './Certificate.tsx';
import { subjectLabel } from './gradeUi.tsx';
import { PrintSheet, usePrinting } from './PrintSheet.tsx';

/*
 * /classes/:id/students/:uid. One student's progress in the class: every
 * assignment with its result and whether it improved, accuracy by subject and by
 * question type, and the trend week by week. For the class's teacher, or for the
 * student themself (the server leaves out the teacher's private note and the
 * username for them). Printable for a parent meeting; teachers can also print a
 * certificate.
 */

const STATUS: Record<WorkStatus, { label: string; tone: 'mint' | 'coral' | 'amber' | 'neutral' }> = {
  done: { label: 'Done', tone: 'mint' },
  late: { label: 'Done late', tone: 'amber' },
  overdue: { label: 'Not done, past due', tone: 'coral' },
  todo: { label: 'To do', tone: 'neutral' },
};

function Growth({ first, last, attempts }: { first: number | null; last: number | null; attempts: number }) {
  if (attempts < 2 || first === null || last === null) return null;
  const diff = Math.round((last - first) * 100);
  return (
    <span className="text-xs text-text-2">
      First try {percent(first)}, latest {percent(last)}
      {diff ? ` (${diff > 0 ? 'up' : 'down'} ${Math.abs(diff)} points)` : ' (the same)'}
    </span>
  );
}

function Trend({ weekly }: { weekly: StudentReportData['weekly'] }) {
  if (!weekly.length) return <p className="text-sm text-text-3">The trend shows once this student has played.</p>;
  const shown = weekly.slice(-12);
  return (
    <>
      <div className="flex h-40 items-end gap-2" aria-hidden>
        {shown.map((w) => (
          <div key={w.weekOf} className="flex w-14 shrink-0 flex-col items-center gap-1">
            <span className="font-display text-sm font-bold text-text tabular">{w.rate === null ? '' : percent(w.rate)}</span>
            <div className="flex h-28 w-10 items-end rounded-[var(--radius-s)] bg-sunken shadow-[inset_0_0_0_1px_var(--line)]">
              <div className="w-full rounded-[var(--radius-s)] bg-[var(--floodlight)]" style={{ height: `${Math.round((w.rate ?? 0) * 100)}%` }} />
            </div>
            <span className="text-xs whitespace-nowrap text-text-3">{dateText(w.weekOf)}</span>
          </div>
        ))}
      </div>
      <ul className="sr-only">
        {shown.map((w) => (
          <li key={w.weekOf}>
            Week of {dateText(w.weekOf)}: {w.rate === null ? 'no answers' : `${percent(w.rate)} right`}, {plural(w.games, 'game')}
          </li>
        ))}
      </ul>
    </>
  );
}

function NoteEditor({ classId, uid, note }: { classId: string; uid: string; note: StudentReportData['note'] }) {
  const qc = useQueryClient();
  const [text, setText] = useState(note?.body ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put(`/api/classes/${classId}/students/${uid}/note`, {
        body: text,
      });
      toast.success(text.trim() ? 'Note saved' : 'Note deleted');
      await qc.invalidateQueries({ queryKey: classKeys.detail(classId) });
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.body ?? err.message) : 'The note was not saved. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="note-title">
      <h2 id="note-title" className="flex items-center gap-2 font-display text-2xl font-bold text-text">
        <Lock className="size-5 text-text-3" aria-hidden />
        Your private note
      </h2>
      <form onSubmit={save} noValidate className="flex flex-col gap-2">
        <Field
          label="Note"
          hint={`Only you see this. Never shown to the student, it is in your data download, and it is deleted with the class or when the student leaves it. ${text.length} of 2,000 characters.${note ? ` Saved ${dateTimeText(note.updatedAt)}.` : ''}`}
          error={error ?? undefined}
        >
          {(p) => <Textarea {...p} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={4} placeholder="For example: sits at the front; finds fractions hard; check in after half term." />}
        </Field>
        <div>
          <Button type="submit" size="sm" variant="primary" icon={<NotebookPen className="size-4" aria-hidden />} loading={busy}>
            Save note
          </Button>
        </div>
      </form>
    </Panel>
  );
}

/** The report itself: on screen, and again on paper. */
function ReportBody({ data, paper = false }: { data: StudentReportData; paper?: boolean }) {
  const s = data.summary;
  return (
    <div className="flex flex-col gap-6">
      {paper ? (
        <header>
          <p className="text-sm">
            {data.class.schoolName ? `${data.class.schoolName}, ` : ''}
            {data.class.name}, taught by {data.class.teacher}
          </p>
          <h1 className="font-display text-4xl font-bold">{data.student.displayName}: progress report</h1>
          <p className="text-sm">
            Printed{' '}
            {new Date().toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}{' '}
            from Ludora.
          </p>
        </header>
      ) : null}
      <StatRow label="Summary">
        <StatTile label="Assignments done" value={`${s.done} of ${s.assignments}`}>
          {s.late ? `${plural(s.late, 'was', 'were')} late.` : 'None late.'}
        </StatTile>
        <StatTile label="Right answers" value={s.accuracy === null ? <NoValue label="No games yet" /> : percent(s.accuracy)}>
          Across every game in this class.
        </StatTile>
        <StatTile label="Games played" value={data.weekly.reduce((n, w) => n + w.games, 0)}>
          Every try at this class’s assignments.
        </StatTile>
        <StatTile label="Time on task" value={duration(s.timeMs)}>
          In this class’s assignments.
        </StatTile>
      </StatRow>

      <section className="print-avoid-break">
        <SectionTitle>Assignments</SectionTitle>
        {data.assignments.length === 0 ? (
          <p className="text-sm text-text-3">No assignments yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.assignments.map((a) => (
              <li key={a.id} className="print-avoid-break flex flex-col gap-2 rounded-[var(--radius-m)] border border-line bg-raised p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold break-words text-text">{a.title}</p>
                  <p className="text-sm break-words text-text-2">
                    {a.setTitle}
                    {a.dueAt ? `, due ${dateText(a.dueAt)}` : ''}
                    {a.attempts ? `, ${plural(a.attempts, 'try', 'tries')}` : ''}
                  </p>
                  <Growth first={a.firstAccuracy} last={a.lastAccuracy} attempts={a.attempts} />
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  {a.best && a.best.accuracy !== null ? <RateBar rate={a.best.accuracy} /> : null}
                  <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="print-avoid-break">
          <SectionTitle>By subject</SectionTitle>
          {data.bySubject.length === 0 ? (
            <p className="text-sm text-text-3">Shows once this student has played.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.bySubject.map((b) => (
                <li key={b.subject} className="flex items-center justify-between gap-3">
                  <span className="text-text">
                    {subjectLabel(b.subject)}
                    <span className="block text-xs text-text-3">
                      {b.correct} of {b.answered} right
                    </span>
                  </span>
                  {b.rate === null ? <NoValue /> : <RateBar rate={b.rate} />}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="print-avoid-break">
          <SectionTitle>By question type</SectionTitle>
          {data.byType.length === 0 ? (
            <p className="text-sm text-text-3">Shows once this student has answered.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.byType.map((b) => (
                <li key={b.type} className="flex items-center justify-between gap-3">
                  <span className="text-text">
                    {questionTypeLabel(b.type) ?? 'Other'}
                    <span className="block text-xs text-text-3">Right first time, {plural(b.answers, 'answer')}</span>
                  </span>
                  <RateBar rate={b.rate} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="print-avoid-break">
        <SectionTitle>Week by week</SectionTitle>
        <Trend weekly={data.weekly} />
      </section>
    </div>
  );
}

export default function StudentReport() {
  const { id = '', uid = '' } = useParams();
  const account = useAccountState();
  const enabled = account === 'account';
  const report = useStudentReport(id, uid, enabled);
  const cls = useClassDetail(id, enabled && report.isSuccess);
  const p = usePrinting();
  const [certificate, setCertificate] = useState(false);
  usePageTitle(report.data ? `${report.data.student.displayName}: report` : 'Student report');
  const here = `/classes/${id}/students/${uid}`;

  if (account === 'loading' || (enabled && report.isPending)) return <ClassPageSkeleton />;
  if (account === 'signedOut' || hasStatus(report.error, 401)) return <ClassAccountGate state="signedOut" next={here} />;
  if (account === 'guest') return <ClassAccountGate state="guest" next={here} />;
  if (hasStatus(report.error, 403)) {
    return (
      <EmptyState icon={<Lock className="size-8" />} title="This report is private" action={<ButtonLink to={`/classes/${id}`}>Back to the class</ButtonLink>}>
        {errorText(report.error, "Only the teacher can see a classmate's report.")}
      </EmptyState>
    );
  }
  if (hasStatus(report.error, 400, 404)) {
    return (
      <EmptyState icon={<UserRound className="size-8" />} title="Report not found" action={<ButtonLink to={id ? `/classes/${id}` : '/classes'}>Back to the class</ButtonLink>}>
        {errorText(report.error, 'That student is not in this class.')}
      </EmptyState>
    );
  }
  if (!report.data) return <ErrorNotice message={errorText(report.error, 'The report could not be loaded.')} onRetry={() => void report.refetch()} />;

  const data = report.data;
  const teacher = 'note' in data;
  const member = cls.data?.role === 'teacher' ? cls.data.members.find((m) => m.id === uid) : undefined;
  return (
    <>
      <BackLink to={`/classes/${id}`}>{data.class.name}</BackLink>
      <PageHeader
        eyebrow={teacher ? 'Student report' : 'Your progress'}
        title={<span className="break-words">{data.student.displayName}</span>}
        description={
          <>
            {data.class.name}, taught by {data.class.teacher}.{data.student.username ? ` Username ${data.student.username}.` : ''}
          </>
        }
        actions={
          <>
            <Button size="sm" icon={<Printer className="size-4" aria-hidden />} onClick={p.print}>
              Print report
            </Button>
            {teacher ? (
              <Button size="sm" icon={<Award className="size-4" aria-hidden />} onClick={() => setCertificate(true)}>
                Certificate
              </Button>
            ) : null}
          </>
        }
      />
      <ReportBody data={data} />
      {teacher ? (
        <div className="mt-8">
          <NoteEditor key={data.note?.updatedAt ?? 'none'} classId={id} uid={uid} note={data.note ?? null} />
        </div>
      ) : null}
      {p.printing ? (
        <PrintSheet onDone={p.done} label="Student report">
          <ReportBody data={data} paper />
        </PrintSheet>
      ) : null}
      {teacher ? (
        <CertificateDialog
          open={certificate}
          onOpenChange={setCertificate}
          student={data.student.displayName}
          avatar={member?.avatar ?? null}
          className={data.class.name}
          schoolName={data.class.schoolName}
          teacher={data.class.teacher}
        />
      ) : null}
    </>
  );
}
