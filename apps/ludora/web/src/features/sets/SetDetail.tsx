import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Flag, Pencil, Play, Presentation } from 'lucide-react';
import { QUESTION_TYPE_LABELS, SUBJECT_LABELS, type Question, type QuestionType } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import type { SetSummary } from '../../lib/queries.ts';
import { formatNumber, plural } from '../../lib/format.ts';
import { Badge, EmptyState, ErrorNotice, PageHeader, Panel, Spinner } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { SetCover } from './SetCover.tsx';
import { ReportDialog } from '../moderation/ReportDialog.tsx';

interface SetResponse {
  set: SetSummary;
  editable: boolean;
  questions: Question[] | null;
  preview: { id: string; type: QuestionType; prompt: string; choices?: string[] }[] | null;
  typeCounts: Record<string, number>;
}

function answerText(q: Question): string {
  switch (q.type) {
    case 'mcq':
      return q.choices.find((c) => c.id === q.correct)?.text ?? '';
    case 'multi':
      return q.choices.filter((c) => q.correct.includes(c.id)).map((c) => c.text).join(', ');
    case 'truefalse':
      return q.correct ? 'True' : 'False';
    case 'short':
      return q.accepted.join(' or ');
    case 'numeric':
      return `${q.answer}${q.unit ? ` ${q.unit}` : ''}`;
    case 'order':
      return q.items.map((i) => i.text).join(', then ');
    case 'match':
      return q.pairs.map((p) => `${p.left} to ${p.right}`).join('; ');
    case 'flashcard':
      return q.back;
  }
}

export default function SetDetail() {
  const { id } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const data = useQuery({ queryKey: ['set', id], queryFn: () => api.get<SetResponse>(`/api/sets/${id}`) });
  const [reporting, setReporting] = useState(false);
  const copy = useMutation({
    mutationFn: () => api.post<{ set: SetSummary }>(`/api/sets/${id}/copy`),
    onSuccess: (r) => {
      toast.success('Copied to your sets');
      navigate(`/sets/${r.set.id}/edit`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not copy the set.'),
  });
  if (data.isLoading) return <Spinner />;
  if (data.isError) {
    const status = data.error instanceof ApiError ? data.error.status : 0;
    return (
      <div className="flex flex-col gap-6">
        <Link to="/library" className="text-sm font-semibold">
          All question sets
        </Link>
        <PageHeader title="Question set" />
        {/* A malformed id is refused before any lookup (400); a set that is missing or private is a 404. */}
        {status === 400 ? (
          <EmptyState title="This link does not point to a set" action={<ButtonLink to="/library">Browse the library</ButtonLink>}>
            Part of the address may be missing or mistyped. Check the link, or find the set in the library.
          </EmptyState>
        ) : status === 404 ? (
          <EmptyState title="Set not found" action={<ButtonLink to="/library">Back to the library</ButtonLink>}>
            It may be private or deleted.
          </EmptyState>
        ) : (
          <ErrorNotice message="The set could not be loaded." onRetry={() => data.refetch()} />
        )}
      </div>
    );
  }
  const { set, editable, questions, preview, typeCounts } = data.data!;
  const signedIn = Boolean(me.data?.user);
  return (
    <div className="flex flex-col gap-6">
      <Link to="/library" className="text-sm font-semibold">
        All question sets
      </Link>
      <div className="flex flex-wrap items-start gap-5">
        <SetCover cover={set.cover} subject={set.subject} size={88} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-4xl font-extrabold">{set.title}</h1>
          <p className="mt-1 max-w-[62ch] text-text-2">{set.description}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone="violet">{plural(set.questionCount, 'question')}</Badge>
            <Badge>{SUBJECT_LABELS[set.subject as keyof typeof SUBJECT_LABELS] ?? set.subject}</Badge>
            {set.gradeBand ? <Badge>{set.gradeBand}</Badge> : null}
            {set.isOfficial ? <Badge tone="amber">By Ludora</Badge> : set.ownerName ? <Badge>By {set.ownerName}</Badge> : null}
            {set.visibility !== 'public' ? <Badge>{set.visibility === 'private' ? 'Private' : 'Unlisted'}</Badge> : null}
            {set.plays ? <Badge>{set.plays === 1 ? 'Played once' : `Played ${formatNumber(set.plays)} times`}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/host" variant="primary" icon={<Presentation className="size-4" />}>
            Host
          </ButtonLink>
          <ButtonLink to="/host?solo=1" icon={<Play className="size-4" />}>
            Solo
          </ButtonLink>
          {editable ? (
            <ButtonLink to={`/sets/${set.id}/edit`} icon={<Pencil className="size-4" />}>
              Edit
            </ButtonLink>
          ) : signedIn && !me.data?.user?.isGuest ? (
            <Button icon={<Copy className="size-4" />} loading={copy.isPending} onClick={() => copy.mutate()}>
              Copy and edit
            </Button>
          ) : null}
          {signedIn && !editable ? (
            <Button variant="ghost" icon={<Flag className="size-4" />} onClick={() => setReporting(true)}>
              Report
            </Button>
          ) : null}
        </div>
      </div>
      <ReportDialog open={reporting} onOpenChange={setReporting} target={{ type: 'set', id: set.id, label: 'this question set' }} />
      <Panel className="p-5">
        <div className="mb-4 flex flex-wrap gap-1.5">
          {Object.entries(typeCounts).map(([t, n]) => (
            <Badge key={t}>
              {n} {QUESTION_TYPE_LABELS[t as QuestionType]}
            </Badge>
          ))}
        </div>
        {questions ? (
          <ol className="flex flex-col divide-y divide-line">
            {questions.map((q, i) => (
              <li key={q.id} className="flex gap-3 py-3">
                <span className="w-7 font-display font-bold text-text-3 tabular">{i + 1}</span>
                <div className="min-w-0">
                  <p className="font-semibold">{q.prompt}</p>
                  <p className="text-sm text-glim">{answerText(q)}</p>
                  {q.explanation ? <p className="text-sm text-text-3">{q.explanation}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <>
            <p className="mb-3 text-sm text-text-3">A preview of the first questions. Answers are hidden so the game stays fair.</p>
            <ol className="flex flex-col divide-y divide-line">
              {(preview ?? []).map((q, i) => (
                <li key={q.id} className="flex gap-3 py-3">
                  <span className="w-7 font-display font-bold text-text-3 tabular">{i + 1}</span>
                  <div>
                    <p className="font-semibold">{q.prompt}</p>
                    {q.choices ? <p className="text-sm text-text-3">{q.choices.join(', ')}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </Panel>
    </div>
  );
}
