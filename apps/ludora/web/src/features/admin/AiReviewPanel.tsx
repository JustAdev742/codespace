import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { AI_REVIEW_VALID_MINUTES, type AiReviewRequest, type AiReviewView } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { formatDate } from '../../lib/format.ts';
import { Badge, ErrorNotice, Field, Textarea } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';

/*
 * The AI review inside a staff action dialog (aiReview on the server). It starts a review of exactly
 * the action in the dialog, waits for it, and shows what the reviewer found. An approval lets the
 * dialog go ahead; a decline says why, and a super administrator may override it with a reason.
 */

const reviewKey = (id: string) => ['admin', 'ai-review', id] as const;

export function AiReviewPanel({ request, onDecided }: { request: AiReviewRequest; onDecided: (approvedId: string | null) => void }) {
  const [id, setId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const started = useRef(false);
  const me = useMe();
  const superadmin = Boolean(me.data?.roles.includes('superadmin'));

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api
      .post<{ review: AiReviewView }>('/api/admin/reviews', request)
      .then((res) => setId(res.review.id))
      .catch((err) => setStartError(err instanceof ApiError ? err.message : 'The review could not start.'));
  }, [request]);

  const review = useQuery({
    queryKey: reviewKey(id ?? 'none'),
    queryFn: () => api.get<{ review: AiReviewView }>(`/api/admin/reviews/${id}`),
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data?.review.status === 'running' ? 2500 : false),
  });
  const r = review.data?.review;
  const status = r?.status;
  useEffect(() => {
    if (!r || r.status === 'running') return;
    onDecided(r.status === 'approved' || r.status === 'overridden' ? r.id : null);
  }, [r, onDecided]);

  if (startError) return <ErrorNotice title="Review not started" message={startError} />;
  if (!r || status === 'running') {
    return (
      <div className="flex items-start gap-3 rounded-[var(--radius-m)] border border-line bg-surface-2 p-3" role="status" aria-live="polite">
        <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-text-2 motion-reduce:animate-none" aria-hidden />
        <div className="text-sm">
          <p className="font-semibold">The AI reviewer is reading the records</p>
          <p className="text-text-2">Reports, past moderation, games, money, sign-ins and your own recent staff actions. This usually takes under a minute.</p>
        </div>
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-2 rounded-[var(--radius-m)] border border-line bg-surface-2 p-3 text-sm" aria-label="AI review" aria-live="polite">
      <Header review={r} />
      {r.verdict ? <p>{r.verdict.summary}</p> : null}
      {r.error ? <p>{r.error}</p> : null}
      {r.verdict?.findings.length ? (
        <div>
          <p className="font-semibold">What the records show</p>
          <ul className="ml-5 list-disc">
            {r.verdict.findings.map((f, i) => (
              <li key={i}>
                {f.point}
                {f.evidence.length ? <span className="text-text-3"> ({f.evidence.join(', ')})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {r.verdict?.concerns.length ? (
        <div>
          <p className="font-semibold">Concerns</p>
          <ul className="ml-5 list-disc">
            {r.verdict.concerns.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {r.verdict?.suggestion ? (
        <p>
          <span className="font-semibold">Suggested instead: </span>
          {r.verdict.suggestion}
        </p>
      ) : null}
      {r.override ? (
        <p>
          <span className="font-semibold">Overridden by {r.override.byName}: </span>
          {r.override.reason}
        </p>
      ) : null}
      {status === 'approved' || status === 'overridden' ? (
        <p className="text-text-2">Approved for exactly this action and reason. Use it before {r.validUntil ? formatDate(r.validUntil, { hour: '2-digit', minute: '2-digit' }) : `${AI_REVIEW_VALID_MINUTES} minutes pass`}; changing the reason needs a new review.</p>
      ) : (
        <p className="text-text-2">{status === 'failed' ? 'Try again in a moment.' : 'Change the reason so it says what happened and where staff can see it, then try again.'}</p>
      )}
      {superadmin && (status === 'declined' || status === 'failed') ? <Override id={r.id} onDone={() => void review.refetch()} /> : null}
    </section>
  );
}

function Header({ review: r }: { review: AiReviewView }) {
  if (r.status === 'approved') {
    return (
      <p className="flex items-center gap-2 font-semibold">
        <ShieldCheck className="size-5 text-glim" aria-hidden /> <Badge tone="mint">Approved</Badge> by the AI reviewer
      </p>
    );
  }
  if (r.status === 'overridden') {
    return (
      <p className="flex items-center gap-2 font-semibold">
        <ShieldAlert className="size-5 text-lantern" aria-hidden /> <Badge tone="amber">Overridden</Badge> by a super administrator
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 font-semibold">
      <ShieldAlert className="size-5 text-ember" aria-hidden /> <Badge tone="coral">{r.status === 'failed' ? 'Review failed' : 'Declined'}</Badge>
      {r.source === 'first_check' ? 'before asking the AI' : r.status === 'failed' ? '' : 'by the AI reviewer'}
    </p>
  );
}

function Override({ id, onDone }: { id: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  if (!open) {
    return (
      <div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Override as super administrator
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2">
      <Field label="Why this cannot wait for an approving review" hint="At least 30 characters. Saved in the audit log with your name." error={error?.fields.reason ?? (error && !error.fields.reason ? error.message : undefined)}>
        {(p) => <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
      </Field>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="danger"
          loading={pending}
          disabled={reason.trim().length < 30}
          onClick={async () => {
            setPending(true);
            setError(null);
            try {
              await api.post(`/api/admin/reviews/${id}/override`, { reason: reason.trim() });
              onDone();
            } catch (err) {
              setError(err instanceof ApiError ? err : new ApiError(0, 'internal', 'That did not work.'));
            } finally {
              setPending(false);
            }
          }}
        >
          Override and allow
        </Button>
      </div>
    </div>
  );
}
