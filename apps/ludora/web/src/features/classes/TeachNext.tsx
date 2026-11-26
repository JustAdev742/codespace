import { useId, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Circle, CircleDashed, ListRestart, Minus, Presentation, Signpost, Triangle, Users } from 'lucide-react';
import { api } from '../../lib/api.ts';
import { plural, timeAgo } from '../../lib/format.ts';
import { EmptyState, ErrorNotice, Panel, Select, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { errorText, percent, TableBox, Th } from '../reports/reportUi.tsx';
import { classKeys, type MasteryLevel, type TeachNextData, type TeachStep, type TeachVerdict, type TopicCell } from './classData.ts';

/*
 * What to teach next, for a class's teacher: one step for each topic the class has played, the
 * most pressing first, and under it the map of who knows what. Counted on the server from the
 * answers Ludora already keeps (modules/classes/teachNext.ts); this only shows it.
 *
 * Never by colour alone: every level has its own shape and its own words, and the numbers are
 * always there to read.
 */

export const LEVEL_INFO: Record<MasteryLevel, { label: string; meaning: string; cell: string; icon: typeof Check }> = {
  secure: { label: 'Secure', meaning: '80% or more right first time', cell: 'bg-glim/20', icon: Check },
  nearly: { label: 'Nearly there', meaning: '50 to 79%', cell: 'bg-lantern/25', icon: Triangle },
  learning: { label: 'Still learning', meaning: 'Under 50%', cell: 'bg-ember/20', icon: Circle },
  started: { label: 'Just started', meaning: 'Fewer than 3 questions answered', cell: 'bg-sky/15', icon: CircleDashed },
  none: { label: 'Not played', meaning: 'No answers yet', cell: 'bg-sunken', icon: Minus },
};
const LEVEL_ORDER: MasteryLevel[] = ['secure', 'nearly', 'learning', 'started', 'none'];
const LEVEL_BAR: Record<MasteryLevel, string> = { secure: 'bg-glim', nearly: 'bg-lantern', learning: 'bg-ember', started: 'bg-sky', none: 'bg-surface-3' };

const VERDICT: Record<TeachVerdict, { label: string; tag: string; say: (s: TeachStep) => string }> = {
  reteach: { label: 'Teach it again', tag: 'plate-gold', say: (s) => `The class got ${percent(s.rate ?? 0)} of this right first time. That is low enough to go back over it together.` },
  practise: { label: 'Practise once more', tag: 'plate-blue', say: (s) => `Nearly there: ${percent(s.rate ?? 0)} right first time. One more game should settle it.` },
  moveOn: { label: 'Ready to move on', tag: '', say: (s) => `The class has this: ${percent(s.rate ?? 0)} right first time.` },
  unseen: { label: 'Too few have played to say', tag: '', say: (s) => `${s.students} of ${s.of} have played it. Once a third of the class has, it is judged.` },
};

export function LevelMark({ cell, compact = false }: { cell: TopicCell; compact?: boolean }) {
  const info = LEVEL_INFO[cell.level];
  const Icon = info.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[var(--radius-s)] px-2 py-1 text-xs font-semibold whitespace-nowrap text-text ${info.cell}`}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {info.label}
      {cell.answered ? (
        <span className={`font-normal text-text-2 tabular ${compact ? 'sr-only' : ''}`}>
          {compact ? ', ' : ''}
          {cell.right} of {cell.answered}
          {compact ? ' right' : ''}
        </span>
      ) : null}
    </span>
  );
}

/** How the class is spread over the levels: a bar to glance at, and the same in words. */
function LevelSpread({ levels, of }: { levels: Record<MasteryLevel, number>; of: number }) {
  const shown = LEVEL_ORDER.filter((l) => levels[l] > 0);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-sunken shadow-[inset_0_0_0_1px_var(--line)]" aria-hidden>
        {shown.map((l) => (
          <span key={l} className={LEVEL_BAR[l]} style={{ width: `${(levels[l] / Math.max(1, of)) * 100}%` }} />
        ))}
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-2">
        {shown.map((l) => {
          const Icon = LEVEL_INFO[l].icon;
          return (
            <span key={l} className="inline-flex items-center gap-1">
              <Icon className="size-3 shrink-0" aria-hidden />
              <span className="font-semibold text-text tabular">{levels[l]}</span> {LEVEL_INFO[l].label.toLowerCase()}
            </span>
          );
        })}
      </p>
    </div>
  );
}

function Names({ classId, people, more }: { classId: string; people: { id: string; displayName: string }[]; more: number }) {
  return (
    <>
      {people.map((p, i) => (
        <span key={p.id}>
          {i ? ', ' : ''}
          <Link to={`/classes/${classId}/students/${p.id}`}>{p.displayName}</Link>
        </span>
      ))}
      {more > 0 ? ` and ${more} more` : ''}
    </>
  );
}

function Step({ classId, days, step, lead, levels, of }: { classId: string; days: number; step: TeachStep; lead: boolean; levels: Record<MasteryLevel, number> | undefined; of: number }) {
  const id = useId();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ id: string; title: string; questionCount: number } | null>(null);
  const v = VERDICT[step.verdict];
  const make = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ set: { id: string; title: string; questionCount: number } }>(`/api/classes/${classId}/teach-next/reteach`, { topic: step.topic, days, count: 10 });
      setMade(res.set);
      toast.success(`${res.set.title} is in your sets`);
      void qc.invalidateQueries({ queryKey: ['sets'] });
    } catch (err) {
      toast.error(errorText(err, 'The reteach set was not made. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  };
  const canReteach = step.hardest.length > 0 && step.verdict !== 'unseen';
  const host = step.sets[0];
  return (
    <Panel as="article" aria-labelledby={id} className={`flex flex-col gap-3 p-4 sm:p-5 ${lead ? 'lift border-t-4 border-t-lantern' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="mb-1.5 flex flex-wrap items-center gap-2">
            {lead ? <span className="plate plate-gold text-xs">Start here</span> : null}
            <span className={`text-sm font-bold ${step.verdict === 'reteach' ? 'text-text' : 'text-text-2'}`}>{v.label}</span>
          </p>
          <h3 id={id} className={`font-display font-extrabold break-words text-text ${lead ? 'text-3xl sm:text-4xl' : 'text-2xl'}`}>
            {step.topic}
          </h3>
        </div>
        {step.rate !== null && step.verdict !== 'unseen' ? (
          <p className="shrink-0 text-right leading-none">
            <span className={`font-display font-extrabold text-text tabular ${lead ? 'text-5xl' : 'text-3xl'}`}>{percent(step.rate)}</span>
            <span className="mt-1 block text-xs text-text-2">right first time</span>
          </p>
        ) : null}
      </div>
      <p className="max-w-[70ch] text-sm text-text-2">{v.say(step)}</p>
      {levels ? <LevelSpread levels={levels} of={of} /> : null}

      {step.hardest.length && step.verdict !== 'unseen' ? (
        <div>
          <p className="mb-1.5 text-xs font-bold tracking-wide text-text-3 uppercase">{step.hardest.length === 1 ? 'The question that tripped them' : 'The questions that tripped them'}</p>
          <ul className="flex flex-col gap-1.5">
            {step.hardest.slice(0, lead ? 3 : 2).map((h) => (
              <li key={h.prompt} className="rounded-[var(--radius-m)] bg-surface-2 px-3 py-2">
                <span className="block break-words text-text">{h.prompt}</span>
                <span className="block text-xs text-text-2">
                  {h.right} of {h.tries} right
                  {h.commonWrong ? (
                    <>
                      . {h.commonWrong.count} said <q className="font-semibold text-text">{h.commonWrong.text}</q>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step.groupSize > 0 && step.verdict !== 'unseen' ? (
        <p className="flex items-start gap-2 text-sm text-text-2">
          <Users className="mt-0.5 size-4 shrink-0 text-text-3" aria-hidden />
          <span>
            <span className="font-semibold text-text">{step.verdict === 'reteach' ? 'Furthest from it: ' : 'A small group to sit with: '}</span>
            <Names classId={classId} people={step.group} more={step.groupSize - step.group.length} />
          </span>
        </p>
      ) : null}
      {step.notYetCount > 0 && step.verdict !== 'unseen' ? (
        <p className="text-sm text-text-2">
          <span className="font-semibold text-text">Not played it yet: </span>
          <Names classId={classId} people={step.notYet} more={step.notYetCount - step.notYet.length} />
        </p>
      ) : null}

      {made ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-m)] border border-line bg-surface-2 p-3 sm:flex-row sm:items-center" role="status">
          <p className="min-w-0 flex-1 text-sm text-text">
            <strong className="font-semibold break-words">{made.title}</strong> is a private set in your library with {plural(made.questionCount, 'question')}, hardest first.
          </p>
          <ButtonLink to={`/host?set=${made.id}&class=${classId}`} size="sm" variant="primary" icon={<Presentation className="size-4" aria-hidden />}>
            Host it for this class
          </ButtonLink>
          <ButtonLink to={`/sets/${made.id}`} size="sm">
            Open the set
          </ButtonLink>
        </div>
      ) : step.verdict === 'reteach' || step.verdict === 'practise' ? (
        <div className="flex flex-wrap gap-2">
          {canReteach ? (
            <Button variant={lead ? 'primary' : 'secondary'} size={lead ? 'md' : 'sm'} icon={<ListRestart className="size-4" aria-hidden />} loading={busy} onClick={() => void make()} aria-label={`Make a reteach set for ${step.topic}`}>
              Make a reteach set
            </Button>
          ) : null}
          {host ? (
            <ButtonLink to={`/host?set=${host.id}&class=${classId}`} size={lead ? 'md' : 'sm'} icon={<Presentation className="size-4" aria-hidden />} aria-label={`Host ${host.title} again for this class`}>
              Host it again
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function MasteryMap({ classId, data }: { classId: string; data: TeachNextData }) {
  return (
    <section aria-labelledby="mastery-map-title" className="flex flex-col gap-3">
      <div>
        <h3 id="mastery-map-title" className="font-display text-2xl font-extrabold text-text">
          Who knows what
        </h3>
        <p className="max-w-[70ch] text-sm text-text-2">Every student against every topic, judged on their latest first try at each question. Getting it right the next time it comes round counts.</p>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-text-2" aria-label="What the levels mean">
        {LEVEL_ORDER.map((l) => (
          <li key={l} className="inline-flex items-center gap-1.5">
            <LevelMark cell={{ level: l, right: 0, answered: 0 }} />
            {LEVEL_INFO[l].meaning}
          </li>
        ))}
      </ul>
      <TableBox caption="Each student's level in each topic the class has played" minWidth={Math.max(520, 220 + data.topics.length * 150)}>
        <thead>
          <tr>
            <Th>Student</Th>
            {data.topics.map((t) => (
              <Th key={t.topic}>
                <span className="block max-w-[14rem] break-words normal-case">{t.topic}</span>
                <span className="block text-xs font-normal normal-case text-text-3">
                  {t.rate === null ? 'No answers' : `Class ${percent(t.rate)}`}
                  {t.lastAt ? `, ${timeAgo(t.lastAt)}` : ''}
                </span>
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.students.map((s) => (
            <tr key={s.id} className="border-t border-line">
              <th scope="row" className="px-3 py-2 text-left font-semibold">
                <Link to={`/classes/${classId}/students/${s.id}`} className="break-words">
                  {s.displayName}
                </Link>
              </th>
              {s.cells.map((c, i) => (
                <td key={data.topics[i]!.topic} className="px-3 py-2">
                  <LevelMark cell={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </TableBox>
    </section>
  );
}

const WINDOWS = [
  { days: 30, label: 'The last 30 days' },
  { days: 90, label: 'This term (90 days)' },
  { days: 365, label: 'This year' },
];

export function TeachNextPanel({ classId }: { classId: string }) {
  const [days, setDays] = useState(90);
  const q = useQuery({
    queryKey: [...classKeys.teachNext(classId), days],
    queryFn: () => api.get<TeachNextData>(`/api/classes/${encodeURIComponent(classId)}/teach-next?days=${days}`),
    placeholderData: (prev) => prev,
  });
  const data = q.data;
  if (q.isPending) return <Skeleton className="h-64" />;
  if (!data) return <ErrorNotice message={errorText(q.error, 'What to teach next did not load.')} onRetry={() => void q.refetch()} />;
  const pick = (
    <label className="flex items-center gap-2 text-sm text-text-2">
      Looking at
      <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-10 w-48" aria-label="How far back to look">
        {WINDOWS.map((w) => (
          <option key={w.days} value={w.days}>
            {w.label}
          </option>
        ))}
      </Select>
    </label>
  );
  if (!data.next.length) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">{pick}</div>
        <EmptyState icon={<Signpost className="size-8" />} title="Nothing to go on yet">
          Host a game for this class, or set an assignment. Once students have played, this says which topic to teach again, who to sit with, and what the class is ready to leave behind.
        </EmptyState>
      </div>
    );
  }
  const spread = new Map(data.topics.map((t) => [t.topic, t.levels]));
  const [first, ...rest] = data.next;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl font-extrabold text-text">What to teach next</h2>
          <p className="max-w-[70ch] text-sm text-text-2">
            From {plural(data.classSize, 'student')}’ first tries in this class’s games and assignments. A topic is what a set says it is about: its topic, or its title when it names none.
          </p>
        </div>
        {pick}
      </div>
      <div className="flex flex-col gap-3">
        <Step classId={classId} days={days} step={first!} lead levels={spread.get(first!.topic)} of={data.classSize} />
        {rest.length ? (
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
            {rest.map((s) => (
              <Step key={s.topic} classId={classId} days={days} step={s} lead={false} levels={spread.get(s.topic)} of={data.classSize} />
            ))}
          </div>
        ) : null}
      </div>
      <MasteryMap classId={classId} data={data} />
    </div>
  );
}
