import { useMemo, useState } from 'react';
import { ArrowRight, GitCompareArrows, Grid3x3 } from 'lucide-react';
import { duration, plural } from '../../lib/format.ts';
import { Dialog, EmptyState, ErrorNotice, Select, Skeleton } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { ToggleChips } from '../../ui/game.tsx';
import { dateTimeText, errorText, percent, SortTh, TableBox, type SortState } from '../reports/reportUi.tsx';
import { useAttempts, type Attempt, type AttemptsData } from './classData.ts';
import { ResultMark } from './gradeUi.tsx';

/*
 * The mastery grid for an assignment: students down the side, questions across,
 * each cell right or wrong first time (shape and word as well as colour), from
 * each student's first or latest try. Sort by name, by score, or by any question
 * to see who missed it. "Compare tries" puts two of a student's attempts side by
 * side to show growth.
 */

type Which = 'latest' | 'first';
type Student = AttemptsData['students'][number];

const pick = (s: Student, which: Which): Attempt | undefined => (which === 'first' ? s.attempts[0] : s.attempts[s.attempts.length - 1]);
const share = (a: Attempt | undefined) => (a && a.answered ? a.correct / a.answered : null);

export function CompareDialog({ student, questions, onClose }: { student: Student | null; questions: AttemptsData['questions']; onClose: () => void }) {
  const n = student?.attempts.length ?? 0;
  const [pair, setPair] = useState<{ a: number; b: number } | null>(null);
  const a = pair?.a ?? 0;
  const b = pair?.b ?? n - 1;
  const A = student?.attempts[a];
  const B = student?.attempts[b];
  const label = (i: number) => (student ? `Try ${i + 1}, ${dateTimeText(student.attempts[i]!.endedAt)}` : '');
  const close = () => {
    setPair(null);
    onClose();
  };
  const changes = questions.map((q) => ({
    q,
    from: A?.results[q.id],
    to: B?.results[q.id],
  }));
  const nowRight = changes.filter((c) => c.from === 'wrong' && c.to === 'right').length;
  const nowWrong = changes.filter((c) => c.from === 'right' && c.to === 'wrong').length;
  const diff = A && B ? Math.round(((share(B) ?? 0) - (share(A) ?? 0)) * 100) : 0;
  return (
    <Dialog open={student !== null} onOpenChange={(o) => !o && close()} size="lg" title={`Compare ${student?.displayName ?? ''}'s tries`} description="Two attempts at the same set, question by question.">
      {student && A && B ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(['a', 'b'] as const).map((k) => (
              <label key={k} className="flex flex-col gap-1 text-sm font-semibold text-text">
                {k === 'a' ? 'Earlier try' : 'Later try'}
                <Select value={k === 'a' ? a : b} onChange={(e) => setPair({ a, b, [k]: Number(e.target.value) })}>
                  {student.attempts.map((_, i) => (
                    <option key={i} value={i}>
                      {label(i)}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-[var(--radius-m)] bg-surface-2 p-4 text-center">
            {[A, B].map((x, i) => (
              <div key={i} className={i ? 'col-start-3' : ''}>
                <p className="font-display text-3xl leading-none font-extrabold text-text tabular">{percent(share(x) ?? 0)}</p>
                <p className="text-sm text-text-2">
                  {x.correct} of {x.answered} right, {duration(x.durationMs)}
                </p>
              </div>
            ))}
            <ArrowRight className="col-start-2 row-start-1 size-6 text-text-3" aria-hidden />
          </div>
          <p className="text-sm text-text" aria-live="polite">
            {diff > 0 ? `Up ${diff} points. ` : diff < 0 ? `Down ${Math.abs(diff)} points. ` : 'The same score. '}
            {plural(nowRight, 'question')} now right
            {nowWrong ? `, ${plural(nowWrong, 'question')} now wrong` : ''}.
          </p>
          <ul className="flex flex-col gap-1.5">
            {changes.map(({ q, from, to }, i) => (
              <li key={q.id} className="flex items-center gap-3 rounded-[var(--radius-m)] border border-line px-3 py-2">
                <span className="w-7 shrink-0 font-display font-bold text-text-3 tabular">Q{i + 1}</span>
                <span className="min-w-0 flex-1 text-sm break-words text-text">{q.prompt}</span>
                <ResultMark result={from} label={`Q${i + 1}, earlier`} />
                <ArrowRight className="size-4 shrink-0 text-text-3" aria-hidden />
                <ResultMark result={to} label={`Q${i + 1}, later`} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Dialog>
  );
}

export function MasteryGrid({ classId, aid }: { classId: string; aid: string }) {
  const q = useAttempts(classId, aid);
  const [which, setWhich] = useState<Which>('latest');
  const [sort, setSort] = useState<SortState<string>>({
    key: 'name',
    dir: 'asc',
  });
  const [comparing, setComparing] = useState<Student | null>(null);
  const [phoneStudent, setPhoneStudent] = useState('');
  const data = q.data;
  const played = useMemo(() => (data?.students ?? []).filter((s) => s.attempts.length), [data]);
  const rows = useMemo(() => {
    const value = (s: Student): string | number | null => {
      const at = pick(s, which);
      if (sort.key === 'name') return s.displayName.toLocaleLowerCase('en-GB');
      if (sort.key === 'score') return share(at);
      const r = at?.results[sort.key];
      return r === undefined ? null : r === 'right' ? 1 : 0;
    };
    return [...played].sort((x, y) => {
      const a = value(x);
      const b = value(y);
      if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
      const c = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b, 'en-GB') : Number(a) - Number(b);
      return (sort.dir === 'asc' ? c : -c) || x.displayName.localeCompare(y.displayName, 'en-GB');
    });
  }, [played, sort, which]);

  if (q.isPending) return <Skeleton className="h-48" />;
  if (!data) return <ErrorNotice message={errorText(q.error, 'The mastery grid did not load.')} onRetry={() => void q.refetch()} />;
  if (!played.length || !data.questions.length) {
    return (
      <EmptyState icon={<Grid3x3 className="size-8" />} title="No answers yet">
        Once students play, each one gets a row with every question marked right or wrong first time.
      </EmptyState>
    );
  }
  const onSort = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'asc' }));
  const columnRate = (qid: string) => {
    const marks = played.map((s) => pick(s, which)?.results[qid]).filter(Boolean);
    return marks.length ? marks.filter((m) => m === 'right').length / marks.length : null;
  };
  const phone = played.find((s) => s.id === phoneStudent) ?? rows[0]!;
  const phoneAt = pick(phone, which);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleChips<Which>
          value={which}
          onChange={setWhich}
          label="Which try"
          options={[
            { value: 'latest', label: 'Latest try' },
            { value: 'first', label: 'First try' },
          ]}
        />
        <p className="hidden text-sm text-text-2 sm:block">Sort by a question to see who missed it.</p>
      </div>

      <div className="flex flex-col gap-3 sm:hidden">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-text">
          Student
          <Select value={phone.id} onChange={(e) => setPhoneStudent(e.target.value)}>
            {rows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </Select>
        </label>
        <ul className="flex flex-col gap-1.5" aria-label={`${phone.displayName}, question by question`}>
          {data.questions.map((qq, i) => (
            <li key={qq.id} className="flex items-center gap-3 rounded-[var(--radius-m)] border border-line bg-raised px-3 py-2">
              <span className="w-7 shrink-0 font-display font-bold text-text-3 tabular">Q{i + 1}</span>
              <span className="min-w-0 flex-1 text-sm break-words text-text">{qq.prompt}</span>
              <ResultMark result={phoneAt?.results[qq.id]} label={`Q${i + 1}`} />
            </li>
          ))}
        </ul>
        {phone.attempts.length > 1 ? (
          <Button icon={<GitCompareArrows className="size-4" aria-hidden />} onClick={() => setComparing(phone)}>
            Compare {phone.displayName}&apos;s tries
          </Button>
        ) : null}
      </div>

      <div className="hidden sm:block">
        <TableBox caption="Mastery grid: each student's result on each question" minWidth={Math.max(640, 300 + data.questions.length * 44)}>
          <thead className="bg-surface-2">
            <tr>
              <SortTh label="Student" sortKey="name" sort={sort} onSort={onSort} />
              <SortTh label="Score" sortKey="score" sort={sort} onSort={onSort} />
              {data.questions.map((qq, i) => (
                <th key={qq.id} scope="col" title={qq.prompt} aria-sort={sort.key === qq.id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} className="px-1 py-2.5 text-center text-xs font-semibold text-text-2">
                  <button type="button" onClick={() => onSort(qq.id)} className={`min-h-8 min-w-8 rounded-[var(--radius-s)] font-display text-sm font-bold hover:text-text ${sort.key === qq.id ? 'text-text underline' : ''}`}>
                    Q{i + 1}
                    <span className="sr-only">: {qq.prompt}. Sort by this question.</span>
                  </button>
                </th>
              ))}
              <th scope="col" className="px-2 py-2.5 text-xs font-semibold text-text-2">
                <span className="sr-only">Compare</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const at = pick(s, which);
              return (
                <tr key={s.id} className="border-t border-line">
                  <th scope="row" className="sticky left-0 z-[1] bg-raised px-3 py-1.5 text-left font-semibold break-words text-text">
                    {s.displayName}
                    <span className="block text-xs font-normal text-text-3">{plural(s.attempts.length, 'try', 'tries')}</span>
                  </th>
                  <td className="px-3 py-1.5 font-display text-lg font-bold whitespace-nowrap text-text tabular">{at ? `${at.correct}/${at.answered}` : ''}</td>
                  {data.questions.map((qq, i) => (
                    <td key={qq.id} className="px-1 py-1.5">
                      <span className="flex justify-center">
                        <ResultMark result={at?.results[qq.id]} label={`${s.displayName}, Q${i + 1}`} />
                      </span>
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    {s.attempts.length > 1 ? (
                      <Button size="sm" variant="ghost" icon={<GitCompareArrows className="size-4" aria-hidden />} onClick={() => setComparing(s)}>
                        Compare
                        <span className="sr-only"> {s.displayName}&apos;s tries</span>
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-line bg-surface-2">
            <tr>
              <th scope="row" className="sticky left-0 bg-surface-2 px-3 py-2 text-left text-xs font-semibold text-text-2">
                Right first time
              </th>
              <td />
              {data.questions.map((qq) => {
                const r = columnRate(qq.id);
                return (
                  <td key={qq.id} className="px-1 py-2 text-center text-xs font-bold text-text tabular">
                    {r === null ? '' : percent(r)}
                  </td>
                );
              })}
              <td />
            </tr>
          </tfoot>
        </TableBox>
      </div>
      <CompareDialog key={comparing?.id ?? 'none'} student={comparing} questions={data.questions} onClose={() => setComparing(null)} />
    </div>
  );
}
