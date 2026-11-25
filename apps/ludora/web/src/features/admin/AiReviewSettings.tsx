import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AI_REVIEW_KIND_LABEL, type AiReviewView } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { formatNumber } from '../../lib/format.ts';
import { Badge, ErrorNotice, Field, Input, Skeleton } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { ActionDialog, Card, DataTable, dateTime } from './ui.tsx';

/*
 * The AI review section of the staff AI page: the API key (a super administrator saves it here, or the
 * server's ANTHROPIC_API_KEY is used), whether bans, suspensions and large grants are reviewed, the
 * model, the grant thresholds, a test of the key, and the recent reviews with what they cost.
 */

interface ReviewSettings {
  enabled: boolean;
  model: string;
  modelSetting: string | null;
  thresholds: Record<string, number>;
  keySource: 'saved' | 'environment' | 'none';
  keyHint: string | null;
  keyUnreadable: boolean;
  canChange: boolean;
  canChangeKey: boolean;
}

const KEY = ['admin', 'ai', 'review'];
const LIST = ['admin', 'ai', 'reviews'];

export function AiReviewSection() {
  const q = useQuery({ queryKey: KEY, queryFn: () => api.get<{ settings: ReviewSettings }>('/api/admin/ai/review') });
  if (q.isError) return <ErrorNotice message={q.error instanceof ApiError ? q.error.message : 'Could not load AI review.'} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-48" />;
  const s = q.data.settings;
  return (
    <>
      <Settings key={`${s.enabled}:${s.modelSetting}:${JSON.stringify(s.thresholds)}:${s.keySource}`} s={s} />
      <Recent />
    </>
  );
}

function Settings({ s }: { s: ReviewSettings }) {
  const qc = useQueryClient();
  const [model, setModel] = useState(s.modelSetting ?? '');
  const [sparks, setSparks] = useState(String(s.thresholds.sparks ?? ''));
  const [moon, setMoon] = useState(String(s.thresholds.moonstones ?? ''));
  const [key, setKey] = useState('');
  const [dialog, setDialog] = useState<null | 'on' | 'off' | 'save' | 'key' | 'remove'>(null);
  const [testing, setTesting] = useState(false);
  const whole = (v: string) => v.trim() === '' || (/^\d+$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= 1_000_000);
  const thresholds = () => ({ ...(sparks.trim() ? { sparks: Number(sparks) } : {}), ...(moon.trim() ? { moonstones: Number(moon) } : {}) });
  const save = async (enabled: boolean, reason: string) => {
    await api.put('/api/admin/ai/review', { enabled, model: model.trim() || null, thresholds: thresholds(), reason });
    await qc.invalidateQueries({ queryKey: KEY });
    toast.success(enabled === s.enabled ? 'AI review settings saved' : enabled ? 'AI review is on' : 'AI review is off');
  };
  const keyText = s.keySource === 'saved' ? `Saved here, ending ${s.keyHint}` : s.keySource === 'environment' ? `From the server's ANTHROPIC_API_KEY, ending ${s.keyHint}` : 'No key yet';
  return (
    <Card title="AI review of bans, suspensions and large grants">
      <div className="flex max-w-[75ch] flex-col gap-3 text-sm text-text-2">
        <p>
          When this is on, a ban, a suspension, or a grant at or above the amounts below goes to an AI investigator before it happens. It is given the account's whole record up front: reports, earlier moderation, the activity log, games, answer speed against the whole site, likely-cheating signals, where its money came from, sign-ins, linked accounts (same network, copied names), classes, teacher notes and merits, things it made, and the asking staff member's own recent actions and ties to the account. It then approves or declines with its reasons. A reason
          that is not real words is declined straight away without asking the AI. Only a super administrator can override a decline, with a written reason that goes in the audit log.
        </p>
        <p>
          Turning it on sends the records of the account under review to Anthropic's API, under the terms of the API account the key belongs to. Email addresses, passwords, network addresses and dates of birth are never sent. Each review is billed to the API account the key belongs to, by the tokens it uses; the list below shows the last 30 days.
        </p>
      </div>
      <dl className="my-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-4">
        <dt className="font-semibold">Status</dt>
        <dd>
          <Badge tone={s.enabled ? 'mint' : 'neutral'}>{s.enabled ? 'On' : 'Off'}</Badge>
        </dd>
        <dt className="font-semibold">API key</dt>
        <dd>
          {keyText}
          {s.keyUnreadable ? <span className="block text-ember">A saved key could not be opened: the server's IP_HASH_KEY changed since it was saved. Save the key again.</span> : null}
        </dd>
        <dt className="font-semibold">Model</dt>
        <dd>{s.model}</dd>
      </dl>
      {s.canChangeKey ? (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="grow">
            <Field label="Anthropic API key" hint="From the Claude Console (platform.claude.com), starting sk-ant-. It is stored encrypted and never shown again.">
              {(p) => <Input {...p} type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} />}
            </Field>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" disabled={!/^sk-ant-\S{20,}$/.test(key.trim())} onClick={() => setDialog('key')}>
              Save key
            </Button>
            {s.keySource === 'saved' ? <Button onClick={() => setDialog('remove')}>Remove</Button> : null}
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Model" hint="Empty uses the server's setting. claude-opus-5-5 investigates most thoroughly; claude-sonnet-5-5 costs less; claude-haiku-5-5 costs least but misses more.">
          {(p) => (
            <>
              <Input {...p} list="ai-review-models" value={model} placeholder={s.model} disabled={!s.canChange} onChange={(e) => setModel(e.target.value)} autoComplete="off" spellCheck={false} />
              <datalist id="ai-review-models">
                <option value="claude-opus-5-5" />
                <option value="claude-sonnet-5-5" />
                <option value="claude-haiku-5-5" />
              </datalist>
            </>
          )}
        </Field>
        <Field label="Review grants of Sparks from" error={whole(sparks) ? undefined : 'A whole number from 1, or empty for never.'}>
          {(p) => <Input {...p} inputMode="numeric" value={sparks} disabled={!s.canChange} onChange={(e) => setSparks(e.target.value)} />}
        </Field>
        <Field label="Review grants of Moonstones from" error={whole(moon) ? undefined : 'A whole number from 1, or empty for never.'}>
          {(p) => <Input {...p} inputMode="numeric" value={moon} disabled={!s.canChange} onChange={(e) => setMoon(e.target.value)} />}
        </Field>
      </div>
      {s.canChange ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {s.enabled ? (
            <Button variant="danger" onClick={() => setDialog('off')}>
              Switch off
            </Button>
          ) : (
            <Button variant="primary" disabled={s.keySource === 'none' || !whole(sparks) || !whole(moon)} onClick={() => setDialog('on')}>
              Switch on
            </Button>
          )}
          <Button disabled={!whole(sparks) || !whole(moon)} onClick={() => setDialog('save')}>
            Save model and amounts
          </Button>
          <Button
            loading={testing}
            disabled={s.keySource === 'none'}
            onClick={async () => {
              setTesting(true);
              try {
                const r = await api.post<{ ok: boolean; model: string; message?: string }>('/api/admin/ai/review/test', {});
                if (r.ok) toast.success(`The key works with ${r.model}.`);
                else toast.error(r.message ?? 'The test failed.');
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : 'The test failed.');
              } finally {
                setTesting(false);
              }
            }}
          >
            Test the key
          </Button>
        </div>
      ) : null}
      <ActionDialog
        open={dialog === 'on' || dialog === 'off' || dialog === 'save'}
        onOpenChange={(v) => !v && setDialog(null)}
        title={dialog === 'on' ? 'Switch AI review on' : dialog === 'off' ? 'Switch AI review off' : 'Save the model and amounts'}
        description={dialog === 'off' ? 'Bans, suspensions and large grants will happen without a review.' : dialog === 'on' ? `From now on bans, suspensions, and grants of ${formatNumber(Number(sparks) || 0)} Sparks or ${formatNumber(Number(moon) || 0)} Moonstones and more need an approving review.` : undefined}
        confirmLabel={dialog === 'on' ? 'Switch on' : dialog === 'off' ? 'Switch off' : 'Save'}
        variant={dialog === 'off' ? 'danger' : 'primary'}
        onSubmit={({ reason }) => save(dialog === 'on' ? true : dialog === 'off' ? false : s.enabled, reason)}
      />
      <ActionDialog
        open={dialog === 'key' || dialog === 'remove'}
        onOpenChange={(v) => !v && setDialog(null)}
        title={dialog === 'key' ? 'Save the API key' : 'Remove the saved key'}
        description={dialog === 'key' ? 'Only its last four characters are kept in the audit log.' : s.enabled ? 'Reviews will use the server\'s ANTHROPIC_API_KEY if it has one; without a key they fail until a new one is saved.' : undefined}
        confirmLabel={dialog === 'key' ? 'Save key' : 'Remove key'}
        variant={dialog === 'key' ? 'primary' : 'danger'}
        onSubmit={async ({ reason }) => {
          if (dialog === 'key') await api.put('/api/admin/ai/review/key', { key: key.trim(), reason });
          else await api.post('/api/admin/ai/review/key/remove', { reason });
          setKey('');
          await qc.invalidateQueries({ queryKey: KEY });
          toast.success(dialog === 'key' ? 'Key saved' : 'Key removed');
        }}
      />
    </Card>
  );
}

function Recent() {
  const q = useQuery({ queryKey: LIST, queryFn: () => api.get<{ reviews: AiReviewView[]; last30Days: { reviews: number; inputTokens: number; outputTokens: number } }>('/api/admin/reviews'), refetchInterval: 15_000 });
  const d = q.data;
  return (
    <Card title="Recent reviews">
      {d ? (
        <p className="mb-3 text-sm text-text-2">
          {formatNumber(d.last30Days.reviews)} reviews in the last 30 days, using {formatNumber(d.last30Days.inputTokens)} input and {formatNumber(d.last30Days.outputTokens)} output tokens.
        </p>
      ) : null}
      <DataTable
        caption="Recent AI reviews"
        rows={d?.reviews}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        rowKey={(r) => r.id}
        empty="No reviews yet."
        columns={[
          { key: 'when', header: 'When', cell: (r) => dateTime(r.createdAt) },
          { key: 'what', header: 'Action', cell: (r) => `${AI_REVIEW_KIND_LABEL[r.kind]}: ${r.targetName}` },
          { key: 'who', header: 'Asked by', cell: (r) => r.actorName },
          { key: 'outcome', header: 'Outcome', cell: (r) => <Badge tone={r.status === 'approved' ? 'mint' : r.status === 'running' ? 'sky' : r.status === 'overridden' ? 'amber' : 'coral'}>{r.status === 'declined' && r.source === 'first_check' ? 'Declined: not a reason' : r.status.charAt(0).toUpperCase() + r.status.slice(1)}</Badge> },
          { key: 'why', header: 'Summary', cell: (r) => <span className="line-clamp-2">{r.verdict?.summary ?? r.error ?? (r.override ? `Overridden: ${r.override.reason}` : '')}</span> },
          { key: 'used', header: 'Used', cell: (r) => (r.usedAt ? dateTime(r.usedAt) : '-') },
        ]}
      />
    </Card>
  );
}
