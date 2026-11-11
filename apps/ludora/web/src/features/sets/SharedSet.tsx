import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Copy, LogIn } from 'lucide-react';
import { QUESTION_TYPE_LABELS, SUBJECT_LABELS, type Question } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { useMe } from '../../lib/session.ts';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { Badge, EmptyState, ErrorNotice, Panel, Spinner } from '../../ui/primitives.tsx';
import { SetCover } from './SetCover.tsx';
import { answerText } from './answers.ts';
import { MathText } from './math/MathText.tsx';

interface SharedResponse {
  set: { id: string; title: string; description: string; subject: string; gradeBand: string | null; topic: string | null; cover: { glyph: string; hue: number } | null; questionCount: number; ownerName: string | null };
  questions: Question[];
}

/** /sets/shared/:token: a set someone shared with a private link, to look through and copy. */
export default function SharedSet() {
  const { token } = useParams();
  const me = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const signedIn = Boolean(me.data?.user && !me.data.user.isGuest);
  const data = useQuery({ queryKey: ['shared-set', token], queryFn: () => api.get<SharedResponse>(`/api/sets/shared/${token}`), enabled: signedIn, retry: false });
  const copy = useMutation({
    mutationFn: () => api.post<{ set: { id: string } }>(`/api/sets/shared/${token}/copy`),
    onSuccess: (r) => {
      toast.success('Copied to your sets');
      void navigate(`/sets/${r.set.id}/edit`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'The set could not be copied. Try again.'),
  });
  if (me.isLoading) return <Spinner />;
  if (!signedIn) {
    return (
      <EmptyState title="Sign in to see this shared set" action={<ButtonLink to={`/signin?next=${encodeURIComponent(location.pathname)}`} variant="primary" icon={<LogIn className="size-4" />}>Sign in</ButtonLink>}>
        Someone shared a question set with you. Sign in with your Ludora account to look through it and copy it to your own sets.
      </EmptyState>
    );
  }
  if (data.isLoading) return <Spinner />;
  if (data.isError) {
    const status = data.error instanceof ApiError ? data.error.status : 0;
    return status === 404 || status === 400 ? (
      <EmptyState title="This link no longer works" action={<ButtonLink to="/library">Browse the library</ButtonLink>}>
        The owner may have turned the link off or deleted the set. Ask them for a new link.
      </EmptyState>
    ) : (
      <ErrorNotice message="The shared set could not be loaded." onRetry={() => data.refetch()} />
    );
  }
  const { set, questions } = data.data!;
  return (
    <div className="flex flex-col gap-6">
      <Link to="/library" className="text-sm font-semibold">
        All question sets
      </Link>
      <div className="flex flex-wrap items-start gap-5">
        <SetCover cover={set.cover} subject={set.subject} size={88} described />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-2">Shared with you{set.ownerName ? ` by ${set.ownerName}` : ''}</p>
          <h1 className="font-display text-[2.25rem] leading-[1.02] font-bold break-words sm:text-[2.9rem]">{set.title}</h1>
          {set.description ? <p className="mt-2 max-w-[62ch] break-words text-text-2">{set.description}</p> : null}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge>{plural(set.questionCount, 'question')}</Badge>
            <Badge>{SUBJECT_LABELS[set.subject as keyof typeof SUBJECT_LABELS] ?? set.subject}</Badge>
            {set.gradeBand ? <Badge>{set.gradeBand}</Badge> : null}
            {set.topic ? <Badge>{set.topic}</Badge> : null}
          </div>
        </div>
        <Button variant="primary" icon={<Copy className="size-4" />} loading={copy.isPending} onClick={() => copy.mutate()}>
          Copy to my sets
        </Button>
      </div>
      <Panel className="p-5">
        <ol className="flex flex-col divide-y divide-line">
          {questions.map((q, i) => (
            <li key={q.id} className="flex gap-3 py-3">
              <span className="w-8 shrink-0 font-display text-xl leading-6 font-bold text-text-3 tabular">{i + 1}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text-3">{QUESTION_TYPE_LABELS[q.type]}</p>
                <p className="font-semibold [overflow-wrap:anywhere]">
                  <MathText text={q.prompt} />
                </p>
                <p className="mt-0.5 flex items-start gap-1.5 text-sm font-semibold text-glim [overflow-wrap:anywhere]">
                  <Check className="mt-0.5 size-4 shrink-0" strokeWidth={3} aria-hidden />
                  <span>
                    <span className="sr-only">Answer: </span>
                    <MathText text={answerText(q)} />
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
