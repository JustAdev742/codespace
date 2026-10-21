import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Circle, Search, TriangleAlert } from 'lucide-react';
import { QUESTION_TYPE_LABELS, REPORT_REASON_INFO, SUBJECT_LABELS, questionSchema, type Media, type Question, type QuestionType, type ReportReason } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { formatNumber, plural, timeAgo } from '../../lib/format.ts';
import { Badge, Dialog, EmptyState, ErrorNotice, Input, Skeleton, TabPanel, Tabs } from '../../ui/primitives.tsx';
import { Button, IconButton } from '../../ui/Button.tsx';
import { ActionDialog, DataTable, KeyValues, StaffPage, StatusPill, dateTime, useDebounced, useStaffMutation, type Column } from './ui.tsx';

/*
 * Question set review. Moderators find sets by filter or search, open one to
 * read every question with its answers and the reports about it, and hide,
 * unhide or feature it. Every change needs a reason and is audited.
 */

type SetFilter = 'public' | 'reported' | 'hidden' | 'featured' | 'all';
type Visibility = 'private' | 'unlisted' | 'public';
type SetAction = 'hide' | 'unhide' | 'feature' | 'unfeature';

interface StaffSetRow {
  id: string;
  title: string;
  subject: string;
  visibility: Visibility;
  questionCount: number;
  isOfficial: boolean;
  isFeatured: boolean;
  hidden: boolean;
  hiddenReason: string | null;
  plays: number;
  owner: string;
  openReports: number;
  updatedAt: string;
}

interface StaffSetDetail {
  set: {
    id: string;
    ownerId: string | null;
    title: string;
    description: string;
    subject: string;
    gradeBand: string | null;
    language: string;
    tags: string[];
    visibility: Visibility;
    questions: unknown[];
    questionCount: number;
    isOfficial: boolean;
    isFeatured: boolean;
    hiddenAt: string | null;
    hiddenReason: string | null;
    plays: number;
    createdAt: string;
    updatedAt: string;
  };
  owner: { displayName: string; username: string | null } | null;
  reports: { id: number; reason: ReportReason; details: string; status: 'open' | 'resolved'; createdAt: string }[];
}

const PAGE = 50;

const FILTERS: { value: SetFilter; label: string; hint: string }[] = [
  { value: 'public', label: 'Public', hint: 'Sets anyone can find in the library and host.' },
  { value: 'reported', label: 'Reported', hint: 'Sets with at least one open report.' },
  { value: 'hidden', label: 'Hidden', hint: 'Sets staff have hidden. Players cannot find or start them.' },
  { value: 'featured', label: 'Featured', hint: 'Sets recommended to hosts when they choose a set.' },
  { value: 'all', label: 'All sets', hint: 'Every set, including private and unlisted ones.' },
];

const VISIBILITY_LABEL: Record<Visibility, string> = { public: 'Public', unlisted: 'Unlisted', private: 'Private' };
const DIFFICULTY_LABEL: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

function subjectLabel(subject: string): string {
  return SUBJECT_LABELS[subject as keyof typeof SUBJECT_LABELS] ?? subject;
}

function SetStatus({ visibility, hidden, featured, official }: { visibility: Visibility; hidden: boolean; featured: boolean; official: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {hidden ? <StatusPill status="hidden" label="Hidden" /> : null}
      <StatusPill status={visibility === 'public' && !hidden ? 'published' : 'draft'} label={VISIBILITY_LABEL[visibility] ?? visibility} />
      {featured ? <StatusPill status="featured" label="Featured" /> : null}
      {official ? <Badge tone="amber">By Ludora</Badge> : null}
    </span>
  );
}

/** Previous and next for lists the API pages by offset without a total. */
function PageControls({ offset, count, onChange }: { offset: number; count: number; onChange: (offset: number) => void }) {
  if (offset === 0 && count < PAGE) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-sm text-text-2">
      <span className="tabular">{count ? `${formatNumber(offset + 1)}-${formatNumber(offset + count)}` : 'No more sets'}</span>
      <IconButton label="Previous page" size="sm" variant="secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - PAGE))}>
        <ChevronLeft className="size-4" />
      </IconButton>
      <IconButton label="Next page" size="sm" variant="secondary" disabled={count < PAGE} onClick={() => onChange(offset + PAGE)}>
        <ChevronRight className="size-4" />
      </IconButton>
    </div>
  );
}

export default function Content() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const q = useDebounced(text.trim());
  const filterParam = params.get('filter');
  const filter: SetFilter = FILTERS.some((f) => f.value === filterParam) ? (filterParam as SetFilter) : 'public';
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
  const openSet = params.get('set');

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('offset' in changes) && !('set' in changes)) next.delete('offset');
    setParams(next, { replace: true });
  };

  const query = new URLSearchParams({ filter, offset: String(offset), ...(q ? { q } : {}) });
  const list = useQuery({
    queryKey: ['admin', 'sets', query.toString()],
    queryFn: () => api.get<{ sets: StaffSetRow[] }>(`/api/admin/sets?${query}`),
    placeholderData: (prev) => prev,
  });
  const rows = list.data?.sets;
  const hint = FILTERS.find((f) => f.value === filter)!.hint;

  const columns: Column<StaffSetRow>[] = [
    {
      key: 'title',
      header: 'Set',
      cell: (s) => (
        <div className="min-w-0 max-w-[24rem]">
          <button
            type="button"
            className="text-left font-semibold text-text hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              update({ set: s.id });
            }}
          >
            {s.title}
          </button>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-3">
            <span>
              {subjectLabel(s.subject)}, {plural(s.questionCount, 'question')}
            </span>
            {/* "By Ludora" is already in the owner column. */}
            <SetStatus visibility={s.visibility} hidden={s.hidden} featured={s.isFeatured} official={false} />
          </div>
          {s.hidden && s.hiddenReason ? <div className="mt-0.5 truncate text-xs text-text-3">Hidden: {s.hiddenReason}</div> : null}
        </div>
      ),
    },
    {
      key: 'reports',
      header: 'Open reports',
      align: 'right',
      className: 'whitespace-nowrap',
      cell: (s) => (s.openReports ? <Badge tone="coral">{formatNumber(s.openReports)}</Badge> : <span className="text-text-3">0</span>),
    },
    { key: 'owner', header: 'Owner', cell: (s) => <span className="break-words">{s.owner}</span> },
    { key: 'plays', header: 'Plays', align: 'right', cell: (s) => formatNumber(s.plays) },
    { key: 'updated', header: 'Updated', className: 'whitespace-nowrap', cell: (s) => <span title={dateTime(s.updatedAt)}>{timeAgo(s.updatedAt)}</span> },
  ];

  return (
    <StaffPage title="Question sets" description="Check sets players have made or reported. Open a set to read every question with its answers, see its reports, and hide or feature it.">
      <Tabs value={filter} onValueChange={(v) => update({ filter: v === 'public' ? null : v })} label="Which sets" items={FILTERS.map((f) => ({ value: f.value, label: f.label }))}>
        <TabPanel value={filter} className="focus-visible:outline-none">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 text-sm text-text-2">{hint}</p>
            <label className="relative w-full min-w-0 sm:w-80">
              <span className="sr-only">Search sets by title or owner username</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" aria-hidden />
              <Input
                type="search"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  update({ q: e.target.value.trim() || null });
                }}
                placeholder="Title or owner username"
                className="pl-9"
              />
            </label>
          </div>
          <DataTable
            caption="Question sets"
            minWidth={680}
            columns={columns}
            rows={rows}
            rowKey={(s) => s.id}
            loading={list.isLoading}
            error={list.error}
            onRetry={() => void list.refetch()}
            onRowClick={(s) => update({ set: s.id })}
            empty={q ? `No sets match "${q}" here.` : filter === 'reported' ? 'No sets have open reports.' : filter === 'hidden' ? 'No sets are hidden.' : filter === 'featured' ? 'No sets are featured.' : 'No sets here yet.'}
          />
          {rows ? <PageControls offset={offset} count={rows.length} onChange={(o) => update({ offset: o ? String(o) : null })} /> : null}
        </TabPanel>
      </Tabs>
      <SetReviewDialog setId={openSet} onClose={() => update({ set: null })} />
    </StaffPage>
  );
}

const ACTION_COPY: Record<SetAction, { title: string; confirm: string; done: string; danger: boolean }> = {
  hide: { title: 'Hide this set', confirm: 'Hide set', done: 'Set hidden', danger: true },
  unhide: { title: 'Unhide this set', confirm: 'Unhide set', done: 'Set no longer hidden', danger: false },
  feature: { title: 'Feature this set', confirm: 'Feature set', done: 'Set featured', danger: false },
  unfeature: { title: 'Stop featuring this set', confirm: 'Stop featuring', done: 'Set no longer featured', danger: false },
};

function actionDescription(action: SetAction, visibility: Visibility): string {
  switch (action) {
    case 'hide':
      return 'Players can no longer find, open or start it, and it stops being featured. Its owner can still open it, but is not shown your reason.';
    case 'unhide':
      return visibility === 'public'
        ? 'Players can find and start it again. It is not featured again automatically.'
        : visibility === 'unlisted'
          ? 'Anyone with its link can start it again. It stays out of the library because its owner made it unlisted.'
          : 'It goes back to being private to its owner.';
    case 'feature':
      return 'Featured sets are recommended to hosts when they choose a set, and come first in the library.';
    case 'unfeature':
      return 'It stays public, but is no longer recommended to hosts.';
  }
}

/**
 * The full review of one set: details, reports, every question with its
 * answers, and the visibility actions. Also opened from the report queue.
 */
export function SetReviewDialog({ setId, onClose }: { setId: string | null; onClose: () => void }) {
  const [action, setAction] = useState<SetAction | null>(null);
  const detail = useQuery({
    queryKey: ['admin', 'set', setId],
    queryFn: () => api.get<StaffSetDetail>(`/api/admin/sets/${setId}`),
    enabled: Boolean(setId),
  });
  const change = useStaffMutation((v: { action: SetAction; reason: string }) => api.post(`/api/admin/sets/${setId}/visibility`, v), {
    invalidate: [['admin', 'set', setId], ['admin', 'sets'], ['admin', 'reports']],
    success: (_res, v) => ACTION_COPY[v.action].done,
    silentError: true,
  });
  const d = detail.data;
  const s = d?.set;
  const notFound = detail.error instanceof ApiError && detail.error.status === 404;

  return (
    <>
      <Dialog
        open={Boolean(setId)}
        onOpenChange={(o) => !o && onClose()}
        size="lg"
        title={s ? s.title : notFound ? 'Set not found' : 'Question set'}
        description={s ? (s.isOfficial ? 'Made by Ludora.' : d.owner ? `Made by ${d.owner.displayName}${d.owner.username ? ` (@${d.owner.username})` : ''}.` : 'The owner account no longer exists.') : undefined}
      >
        {detail.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-28" />
            <Skeleton className="h-48" />
          </div>
        ) : notFound ? (
          <EmptyState title="This set no longer exists">Its owner may have deleted it.</EmptyState>
        ) : detail.error ? (
          <ErrorNotice message={detail.error instanceof ApiError ? detail.error.message : 'The set could not be loaded.'} onRetry={() => void detail.refetch()} />
        ) : s && d ? (
          <SetReviewBody detail={d} onAction={setAction} />
        ) : null}
      </Dialog>
      {s ? (
        <ActionDialog
          open={Boolean(action)}
          onOpenChange={(o) => !o && setAction(null)}
          title={action ? ACTION_COPY[action].title : ''}
          description={action ? actionDescription(action, s.visibility) : undefined}
          confirmLabel={action ? ACTION_COPY[action].confirm : ''}
          variant={action && ACTION_COPY[action].danger ? 'danger' : 'primary'}
          reasonHint={action === 'hide' ? 'Saved on the set and in the audit log, for staff only.' : undefined}
          onSubmit={({ reason }) => change.mutateAsync({ action: action!, reason })}
        />
      ) : null}
    </>
  );
}

function SetReviewBody({ detail: d, onAction }: { detail: StaffSetDetail; onAction: (a: SetAction) => void }) {
  const s = d.set;
  const hidden = Boolean(s.hiddenAt);
  const canFeature = s.visibility === 'public' && !hidden;
  const parsed = (s.questions ?? []).map((raw) => ({ raw, result: questionSchema.safeParse(raw) }));
  const invalid = parsed.filter((p) => !p.result.success).length;
  const typeCounts = parsed.reduce<Partial<Record<QuestionType, number>>>((acc, p) => {
    if (p.result.success) acc[p.result.data.type] = (acc[p.result.data.type] ?? 0) + 1;
    return acc;
  }, {});
  const openReports = d.reports.filter((r) => r.status === 'open').length;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-3">
        <SetStatus visibility={s.visibility} hidden={hidden} featured={s.isFeatured} official={s.isOfficial} />
        {hidden ? (
          <div className="rounded-[12px] border border-ember/50 bg-ember/10 px-3 py-2 text-sm text-text">
            Hidden from players since {dateTime(s.hiddenAt)}.{s.hiddenReason ? <span className="text-text-2"> Reason: {s.hiddenReason}</span> : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {hidden ? (
            <Button size="sm" onClick={() => onAction('unhide')}>
              Unhide set
            </Button>
          ) : (
            <Button size="sm" variant="danger" onClick={() => onAction('hide')}>
              Hide set
            </Button>
          )}
          {s.isFeatured ? (
            <Button size="sm" onClick={() => onAction('unfeature')}>
              Stop featuring
            </Button>
          ) : canFeature ? (
            <Button size="sm" onClick={() => onAction('feature')}>
              Feature set
            </Button>
          ) : null}
        </div>
        {!s.isFeatured && !canFeature ? <p className="text-xs text-text-3">Only public sets that are not hidden can be featured.</p> : null}
      </div>

      <KeyValues
        items={[
          ['Subject', subjectLabel(s.subject)],
          ['Grade band', s.gradeBand || 'Not set'],
          ['Language', s.language],
          ['Visibility', VISIBILITY_LABEL[s.visibility] ?? s.visibility],
          ['Questions', formatNumber(s.questionCount)],
          ['Plays', formatNumber(s.plays)],
          ['Created', dateTime(s.createdAt)],
          ['Last edited', dateTime(s.updatedAt)],
        ]}
      />
      {s.description ? <p className="text-sm whitespace-pre-wrap break-words text-text-2">{s.description}</p> : null}
      {s.tags.length ? (
        <div className="flex flex-wrap gap-1" aria-label="Tags">
          {s.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      ) : null}

      <section aria-labelledby="set-reports">
        <h3 id="set-reports" className="mb-2 font-semibold text-text">
          Reports{' '}
          {d.reports.length ? (
            <span className="font-normal text-text-3">
              ({d.reports.length >= 20 ? `latest 20 shown, ${openReports} of them open` : `${openReports} open`})
            </span>
          ) : null}
        </h3>
        {d.reports.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-[12px] border border-line">
            {d.reports.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-text">{REPORT_REASON_INFO[r.reason]?.label ?? r.reason}</span>
                  <StatusPill status={r.status} label={r.status === 'open' ? 'Open' : 'Resolved'} />
                  <span className="text-xs text-text-3" title={dateTime(r.createdAt)}>
                    {timeAgo(r.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words text-text-2">{r.details || 'No details given.'}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-2">Nobody has reported this set.</p>
        )}
      </section>

      <section aria-labelledby="set-questions">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <h3 id="set-questions" className="mr-1 font-semibold text-text">
            Questions and answers
          </h3>
          {Object.entries(typeCounts).map(([t, n]) => (
            <Badge key={t}>
              {n} {QUESTION_TYPE_LABELS[t as QuestionType]}
            </Badge>
          ))}
        </div>
        {invalid ? (
          <p className="mb-2 flex items-start gap-2 rounded-[12px] border border-lantern/50 bg-lantern/10 px-3 py-2 text-sm text-text">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {invalid === 1 ? '1 question does not pass the question checks, so games leave it out.' : `${invalid} questions do not pass the question checks, so games leave them out.`}
          </p>
        ) : null}
        {parsed.length ? (
          <ol className="flex flex-col gap-2">
            {parsed.map((p, i) => (
              <li key={i} className="min-w-0 rounded-[12px] border border-line p-3">
                {p.result.success ? <QuestionView q={p.result.data} index={i} /> : <BrokenQuestion raw={p.raw} index={i} />}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-text-2">This set has no questions.</p>
        )}
      </section>
    </div>
  );
}

/* ------------------------------ answer display ------------------------------ */

function num(n: number): string {
  return n.toLocaleString('en-GB', { maximumFractionDigits: 10 });
}

function MediaView({ media, small = false }: { media: Media; small?: boolean }) {
  return (
    <figure className={small ? 'mt-1' : 'mt-2'}>
      <img src={media.url} alt={media.alt} loading="lazy" className={`${small ? 'max-h-16' : 'max-h-48'} max-w-full rounded-[10px] border border-line bg-sunken object-contain`} />
      <figcaption className="mt-0.5 text-xs text-text-3">Image description: {media.alt || 'none given'}</figcaption>
    </figure>
  );
}

function QuestionView({ q, index }: { q: Question; index: number }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-3">
        <span className="font-semibold text-text-2 tabular">Question {index + 1}</span>
        <Badge>{QUESTION_TYPE_LABELS[q.type]}</Badge>
        {q.difficulty ? <Badge>{DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty}</Badge> : null}
        {q.timeLimitSec ? <span>{q.timeLimitSec} s to answer</span> : null}
        {q.points !== undefined ? <span>{plural(q.points, 'point')}</span> : null}
      </div>
      <p className="mt-1.5 font-semibold whitespace-pre-wrap break-words text-text">{q.prompt}</p>
      {q.media ? <MediaView media={q.media} /> : null}
      <div className="mt-2">
        <AnswerView q={q} />
      </div>
      {q.explanation ? (
        <p className="mt-2 text-sm whitespace-pre-wrap break-words text-text-2">
          <span className="font-semibold text-text">Explanation: </span>
          {q.explanation}
        </p>
      ) : null}
      {q.tags?.length ? (
        <div className="mt-2 flex flex-wrap gap-1" aria-label="Question tags">
          {q.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AnswerLabel({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-xs font-semibold text-text-3">{children}</div>;
}

function ChoiceList({ choices, correct }: { choices: { id: string; text: string; media?: Media }[]; correct: string[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {choices.map((c) => {
        const ok = correct.includes(c.id);
        return (
          <li key={c.id} className={`flex min-w-0 items-start gap-2 rounded-[10px] border px-2.5 py-1.5 text-sm ${ok ? 'border-glim/60 bg-glim/10 text-text' : 'border-transparent text-text-2'}`}>
            {ok ? <Check className="mt-0.5 size-4 shrink-0 text-glim" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0 text-text-3" aria-hidden />}
            <span className="min-w-0 flex-1 break-words">
              {c.text || <span className="text-text-3">Image only</span>}
              {c.media ? <MediaView media={c.media} small /> : null}
            </span>
            {ok ? <span className="shrink-0 text-xs font-semibold text-text">Correct</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-block max-w-full rounded-[8px] border border-glim/60 bg-glim/10 px-2 py-0.5 text-sm font-semibold whitespace-pre-wrap break-words text-text">{children}</span>;
}

function AnswerView({ q }: { q: Question }) {
  switch (q.type) {
    case 'mcq':
      return (
        <>
          <AnswerLabel>Choices (one correct)</AnswerLabel>
          <ChoiceList choices={q.choices} correct={[q.correct]} />
        </>
      );
    case 'multi':
      return (
        <>
          <AnswerLabel>
            Choices ({q.correct.length} of {q.choices.length} correct; a right answer picks exactly these)
          </AnswerLabel>
          <ChoiceList choices={q.choices} correct={q.correct} />
        </>
      );
    case 'truefalse':
      return (
        <p className="text-sm text-text-2">
          Correct answer: <Chip>{q.correct ? 'True' : 'False'}</Chip>
        </p>
      );
    case 'short':
      return (
        <>
          <AnswerLabel>{q.accepted.length === 1 ? 'Accepted answer' : 'Accepted answers (any of these)'}</AnswerLabel>
          <div className="flex flex-wrap gap-1.5">
            {q.accepted.map((a, i) => (
              <Chip key={i}>{a}</Chip>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-text-3">
            {q.caseSensitive ? 'Capital letters must match.' : 'Capital letters do not matter.'} Accents, punctuation and a leading &ldquo;the&rdquo; or &ldquo;a&rdquo; are ignored.{' '}
            {(q.fuzzy ?? true) ? 'Small typos are accepted in answers of four letters or more, but numbers must be exact.' : 'Otherwise the spelling must match exactly.'}
          </p>
        </>
      );
    case 'numeric': {
      const unit = q.unit ? ` ${q.unit}` : '';
      const tol = q.tolerance ?? 0;
      return (
        <p className="text-sm text-text-2">
          Correct answer: <Chip>{`${num(q.answer)}${unit}`}</Chip>{' '}
          {tol > 0 ? `Anything from ${num(q.answer - tol)} to ${num(q.answer + tol)}${unit} is marked correct.` : 'It must be exact.'}
        </p>
      );
    }
    case 'order':
      return (
        <>
          <AnswerLabel>Correct order (players see these shuffled)</AnswerLabel>
          <ol className="flex flex-col gap-1">
            {q.items.map((it, i) => (
              <li key={it.id} className="flex min-w-0 items-start gap-2 text-sm text-text">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-semibold text-text-2 tabular">{i + 1}</span>
                <span className="min-w-0 break-words">{it.text}</span>
              </li>
            ))}
          </ol>
        </>
      );
    case 'match':
      return (
        <>
          <AnswerLabel>Correct pairs</AnswerLabel>
          <table className="w-full table-fixed border-collapse text-sm">
            <caption className="sr-only">Correct pairs</caption>
            <thead className="text-left text-xs text-text-3">
              <tr>
                <th scope="col" className="pb-1 font-semibold">
                  Item
                </th>
                <th scope="col" className="pb-1 font-semibold">
                  Matches
                </th>
              </tr>
            </thead>
            <tbody>
              {q.pairs.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="py-1 pr-3 align-top break-words text-text">{p.left}</td>
                  <td className="py-1 align-top break-words text-text">{p.right}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      );
    case 'flashcard':
      return (
        <>
          <AnswerLabel>Back of the card</AnswerLabel>
          <p className="rounded-[10px] bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap break-words text-text">{q.back}</p>
        </>
      );
  }
}

function BrokenQuestion({ raw, index }: { raw: unknown; index: number }) {
  const prompt = raw && typeof raw === 'object' && typeof (raw as { prompt?: unknown }).prompt === 'string' ? (raw as { prompt: string }).prompt : null;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-3">
        <span className="font-semibold text-text-2 tabular">Question {index + 1}</span>
        <Badge tone="coral">Fails the checks</Badge>
      </div>
      {prompt ? <p className="mt-1.5 font-semibold whitespace-pre-wrap break-words text-text">{prompt}</p> : null}
      <p className="mt-1 text-sm text-text-2">Games leave this question out. This is exactly what is stored:</p>
      <pre className="mt-1 max-h-48 overflow-auto rounded-[10px] bg-sunken p-2 font-mono text-xs text-text-2">{JSON.stringify(raw, null, 2)}</pre>
    </div>
  );
}
