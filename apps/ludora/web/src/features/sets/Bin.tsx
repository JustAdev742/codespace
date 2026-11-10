import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RotateCcw, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { plural, timeAgo } from '../../lib/format.ts';
import { useMe } from '../../lib/session.ts';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { EmptyState, ErrorNotice, PageHeader, Skeleton } from '../../ui/primitives.tsx';
import { SetCover } from './SetCover.tsx';

interface BinSet {
  id: string;
  title: string;
  subject: string;
  cover: { glyph: string; hue: number } | null;
  questionCount: number;
  deletedAt: string;
  removeAt: string;
}

const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

/** /sets/bin: sets deleted in the last 30 days, to restore or remove for good. */
export default function Bin() {
  const me = useMe();
  const qc = useQueryClient();
  const signedIn = Boolean(me.data?.user && !me.data.user.isGuest);
  const bin = useQuery({ queryKey: ['sets-bin'], queryFn: () => api.get<{ sets: BinSet[]; days: number }>('/api/sets/bin'), enabled: signedIn });
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['sets-bin'] });
    void qc.invalidateQueries({ queryKey: ['sets'] });
    void qc.invalidateQueries({ queryKey: ['sets-organise'] });
  };
  const restore = useMutation({
    mutationFn: (s: BinSet) => api.post(`/api/sets/${s.id}/restore`),
    onSuccess: (_r, s) => {
      toast.success(`${s.title} is back in your sets`);
      done();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'The set could not be restored. Try again.'),
  });
  const remove = useMutation({
    mutationFn: (s: BinSet) => api.delete(`/api/sets/${s.id}/forever`),
    onSuccess: (_r, s) => {
      toast.success(`${s.title} was removed for good`);
      done();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'The set could not be removed. Try again.'),
  });
  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/library?scope=mine" className="font-semibold">
            My sets
          </Link>
        }
        title="Bin"
        description="Sets you delete wait here for 30 days, then are removed for good. Restore one to put it back in your sets."
      />
      {!signedIn ? (
        <EmptyState title="Sign in to see your bin" action={<ButtonLink to="/signin?next=/sets/bin">Sign in</ButtonLink>} />
      ) : bin.isError ? (
        <ErrorNotice message="Your bin could not be loaded." onRetry={() => bin.refetch()} />
      ) : bin.isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : !bin.data?.sets.length ? (
        <EmptyState icon={<Trash2 />} title="The bin is empty" action={<ButtonLink to="/library?scope=mine">Back to my sets</ButtonLink>}>
          Deleted sets come here first, so a set deleted by mistake can be put back.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {bin.data.sets.map((s) => {
            const left = daysLeft(s.removeAt);
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-l)] border border-line bg-raised p-4">
                <SetCover cover={s.cover} subject={s.subject} size={48} />
                <div className="min-w-0 flex-1 basis-48">
                  <h2 className="font-display text-xl leading-tight font-bold break-words text-text">{s.title}</h2>
                  <p className="text-sm text-text-2">
                    {plural(s.questionCount, 'question')}. Deleted {timeAgo(s.deletedAt)}. {left <= 1 ? 'Removed for good within a day.' : `Removed for good in ${left} days.`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" icon={<RotateCcw className="size-4" />} loading={restore.isPending && restore.variables?.id === s.id} onClick={() => restore.mutate(s)}>
                    Restore<span className="sr-only"> {s.title}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Trash2 className="size-4" />}
                    loading={remove.isPending && remove.variables?.id === s.id}
                    onClick={() => {
                      if (window.confirm(`Remove ${s.title} for good? This cannot be undone.`)) remove.mutate(s);
                    }}
                  >
                    Remove for good<span className="sr-only">: {s.title}</span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
