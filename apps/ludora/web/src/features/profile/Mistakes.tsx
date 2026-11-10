import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Target } from 'lucide-react';
import { MISTAKES_PER_ROUND, QUESTION_TYPE_LABELS, type QuestionType } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { plural, timeAgo } from '../../lib/format.ts';
import { AccountError, EmptyState, ErrorNotice, PageHeader, Panel, Skeleton } from '../../ui/primitives.tsx';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { usePageTitle } from '../social/data.ts';
import { errorMessage } from './extras.ts';

interface Mistake {
  setId: string;
  setTitle: string;
  questionId: string;
  prompt: string;
  type: QuestionType;
  misses: number;
  rightDays: number;
  lastMissedAt: string;
}

/**
 * My mistakes: every question a signed-in player got wrong, grouped by set, with a round of
 * "Fix my mistakes" (the most-missed first). Only prompts are shown here: answers stay on the
 * server until the question is played.
 */
export default function Mistakes() {
  usePageTitle('My mistakes');
  const me = useMe();
  const navigate = useNavigate();
  const list = useQuery({ queryKey: ['mistakes'], queryFn: () => api.get<{ total: number; mistakes: Mistake[] }>('/api/me/mistakes'), enabled: Boolean(me.data?.user) });
  const start = useMutation({
    mutationFn: () => api.post<{ code: string }>('/api/me/mistakes/play'),
    onSuccess: (r) => navigate(`/room/${r.code}`),
    onError: (err) => toast.error(errorMessage(err, 'The round did not start. Try again.')),
  });
  const header = (
    <PageHeader
      title="My mistakes"
      description={`Questions you got wrong in games. Each round plays up to ${MISTAKES_PER_ROUND} of them, the ones you miss most first. Get a question right on two different days and it leaves the list.`}
      actions={
        list.data?.total ? (
          <Button variant="primary" size="lg" icon={<Target className="size-5" aria-hidden />} loading={start.isPending} onClick={() => start.mutate()}>
            Fix my mistakes
          </Button>
        ) : null
      }
    />
  );
  if (me.isError && !me.data) {
    return (
      <>
        {header}
        <AccountError onRetry={() => void me.refetch()} />
      </>
    );
  }
  if (!me.isLoading && !me.data?.user) {
    return (
      <>
        <PageHeader title="My mistakes" />
        <EmptyState icon={<Target />} title="Sign in to keep your mistakes" action={<ButtonLink to="/signin?next=/mistakes" variant="primary">Sign in</ButtonLink>}>
          With an account, every question you get wrong is kept here so you can practise it again.
        </EmptyState>
      </>
    );
  }
  const groups = new Map<string, { title: string; items: Mistake[] }>();
  for (const m of list.data?.mistakes ?? []) {
    if (!groups.has(m.setId)) groups.set(m.setId, { title: m.setTitle, items: [] });
    groups.get(m.setId)!.items.push(m);
  }
  return (
    <>
      {header}
      {list.isError ? <ErrorNotice message="Your mistakes did not load." onRetry={() => void list.refetch()} /> : null}
      {!list.data && !list.isError ? <Skeleton className="h-72" /> : null}
      {list.data && list.data.total === 0 ? (
        <EmptyState icon={<Check />} title="Nothing to fix" action={<ButtonLink to="/" variant="primary">Back to home</ButtonLink>}>
          When you get a question wrong in a game, it shows up here so you can try it again. Your list is clear.
        </EmptyState>
      ) : null}
      <div className="flex flex-col gap-6">
        {[...groups].map(([setId, g]) => (
          <Panel key={setId} className="p-5" aria-labelledby={`m-${setId}`}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id={`m-${setId}`} className="font-display text-2xl leading-tight font-bold break-words">
                {g.title}
              </h2>
              <Link to={`/sets/${setId}`} className="text-sm font-semibold">
                Open the set
              </Link>
            </div>
            <ul className="divide-y divide-line">
              {g.items.map((m) => (
                <li key={m.questionId} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold break-words">{m.prompt}</p>
                    <p className="text-sm text-text-2">
                      {QUESTION_TYPE_LABELS[m.type]}, missed {m.misses === 1 ? 'once' : `${m.misses} times`}, last {timeAgo(m.lastMissedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {[0, 1].map((i) => (
                      <span key={i} className={`grid size-7 place-items-center rounded-full ${i < m.rightDays ? 'bg-glim text-on-accent' : 'border-2 border-line-strong'}`} aria-hidden>
                        {i < m.rightDays ? <Check className="size-4" /> : null}
                      </span>
                    ))}
                    <span className="text-sm text-text-2">{m.rightDays ? 'Once more on another day' : 'Not fixed yet'}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
      {list.data && list.data.total > 0 ? <p className="mt-6 text-sm text-text-2">{plural(list.data.total, 'question')} on your list. Answers are shown after you play each question.</p> : null}
    </>
  );
}
