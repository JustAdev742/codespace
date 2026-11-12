import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../lib/api.ts';
import { formatNumber } from '../../lib/format.ts';
import { EmptyState, ErrorNotice, Field, Input, Skeleton } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { ActionDialog, Card, DataTable, Stat, StaffPage, StatusPill, dateTime } from './ui.tsx';

/*
 * The AI helpers, for staff: which providers and models the server's
 * environment configures (never their keys), which are switched on, the
 * allowance, today's use and recent failures. Changes need flags.manage and a
 * reason, and go to the audit log. Who may use helpers at all is set with the
 * ai.helpers_teachers and ai.helpers_students feature flags.
 */

interface AiAdmin {
  canChange: boolean;
  providers: { name: string; kind: 'openai' | 'anthropic'; host: string; models: { id: string; label: string; model: string; enabled: boolean }[] }[];
  settings: { perAccount: number; windowHours: number; siteDailyCap: number; siteDailyCapSetting: number | null; defaultSiteDailyCap: number };
  today: { total: number; ok: number; failed: number; refused: number; people: number; byTask: { task: string; n: number }[] };
  failures: { provider: string; model: string; kind: string; n: number; last: string }[];
}

const KEY = ['admin', 'ai'];
const KIND_TEXT: Record<string, string> = { busy: 'Busy or rate limited', timeout: 'Too slow', unavailable: 'Down or set up wrongly' };

type ModelRow = AiAdmin['providers'][number]['models'][number] & { provider: string; host: string };

function Allowance({ data }: { data: AiAdmin }) {
  const qc = useQueryClient();
  const s = data.settings;
  const [per, setPer] = useState(String(s.perAccount));
  const [hours, setHours] = useState(String(s.windowHours));
  const [cap, setCap] = useState(s.siteDailyCapSetting === null ? '' : String(s.siteDailyCapSetting));
  const [confirming, setConfirming] = useState(false);
  const whole = (v: string, min: number, max: number) => /^\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max;
  const errors = {
    per: whole(per, 0, 1000) ? undefined : 'Use a whole number from 0 to 1,000.',
    hours: whole(hours, 1, 168) ? undefined : 'Use a whole number of hours from 1 to 168.',
    cap: cap.trim() === '' || whole(cap, 0, 1_000_000) ? undefined : 'Use a whole number, or leave it empty for the default.',
  };
  const changed = Number(per) !== s.perAccount || Number(hours) !== s.windowHours || (cap.trim() === '' ? null : Number(cap)) !== s.siteDailyCapSetting;
  const ok = !errors.per && !errors.hours && !errors.cap;
  return (
    <Card title="Allowance">
      <p className="mb-3 max-w-[70ch] text-sm text-text-2">
        Each account may make this many helper requests in any rolling window. Requests a provider failed to answer do not count. The site cap stops every helper for the rest of a 24-hour period, so a free key's own limit is not used up by a few people.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Requests per account" error={errors.per}>
          {(p) => <Input {...p} inputMode="numeric" value={per} disabled={!data.canChange} onChange={(e) => setPer(e.target.value)} />}
        </Field>
        <Field label="In any window of (hours)" error={errors.hours}>
          {(p) => <Input {...p} inputMode="numeric" value={hours} disabled={!data.canChange} onChange={(e) => setHours(e.target.value)} />}
        </Field>
        <Field label="Site cap per 24 hours" hint={`Empty uses the server's setting, ${formatNumber(s.defaultSiteDailyCap)}.`} error={errors.cap}>
          {(p) => <Input {...p} inputMode="numeric" value={cap} disabled={!data.canChange} onChange={(e) => setCap(e.target.value)} />}
        </Field>
      </div>
      {data.canChange ? (
        <div className="mt-3">
          <Button variant="primary" disabled={!changed || !ok} onClick={() => setConfirming(true)}>
            Save allowance
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-text-2">Changing these needs the feature flags permission.</p>
      )}
      <ActionDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Change the AI allowance?"
        description={`Every account: ${per} requests in any ${hours} hours. Site cap: ${cap.trim() === '' ? `${formatNumber(s.defaultSiteDailyCap)} (the default)` : formatNumber(Number(cap))} a day. It applies straight away.`}
        confirmLabel="Save allowance"
        onSubmit={async ({ reason }) => {
          await api.put('/api/admin/ai/settings', { perAccount: Number(per), windowHours: Number(hours), siteDailyCap: cap.trim() === '' ? null : Number(cap), reason });
          toast.success('Allowance saved');
          await qc.invalidateQueries({ queryKey: KEY });
        }}
      />
    </Card>
  );
}

function Models({ data }: { data: AiAdmin }) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<ModelRow | null>(null);
  const rows: ModelRow[] = data.providers.flatMap((p) => p.models.map((m) => ({ ...m, provider: p.name, host: p.host })));
  return (
    <Card title="Providers and models">
      <p className="mb-3 max-w-[70ch] text-sm text-text-2">
        Set in the server's environment (AI_PROVIDERS, and ANTHROPIC_API_KEY for Anthropic). Keys stay on the server and are never shown. People pick from the models switched on here, by these names.
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No AI providers set up">Add one to the server's AI_PROVIDERS setting and restart it. Until then every AI helper is hidden.</EmptyState>
      ) : (
        <DataTable<ModelRow>
          caption="Configured models"
          rows={rows}
          rowKey={(r) => r.id}
          minWidth={560}
          columns={[
            { key: 'label', header: 'Model', cell: (r) => <span className="font-semibold break-words">{r.label}</span> },
            { key: 'provider', header: 'Provider', cell: (r) => <span className="break-words">{r.provider} <span className="text-text-3">({r.host})</span></span> },
            { key: 'state', header: 'State', cell: (r) => <StatusPill status={r.enabled ? 'active' : 'ended'} label={r.enabled ? 'On' : 'Off'} /> },
            {
              key: 'act',
              header: <span className="sr-only">Change</span>,
              align: 'right',
              cell: (r) =>
                data.canChange ? (
                  <Button size="sm" onClick={() => setTarget(r)}>
                    {r.enabled ? 'Switch off' : 'Switch on'}
                    <span className="sr-only"> {r.label}</span>
                  </Button>
                ) : null,
            },
          ]}
        />
      )}
      <ActionDialog
        open={target !== null}
        onOpenChange={(v) => !v && setTarget(null)}
        title={target ? `${target.enabled ? 'Switch off' : 'Switch on'} ${target.label}?` : ''}
        description={target?.enabled ? 'People can no longer pick it, and it no longer stands in when another model is busy.' : 'People can pick it again.'}
        confirmLabel={target?.enabled ? 'Switch off' : 'Switch on'}
        onSubmit={async ({ reason }) => {
          if (!target) return;
          await api.put('/api/admin/ai/models', { id: target.id, enabled: !target.enabled, reason });
          toast.success(`${target.label} is ${target.enabled ? 'off' : 'on'}`);
          await qc.invalidateQueries({ queryKey: KEY });
        }}
      />
    </Card>
  );
}

export default function AiPage() {
  const q = useQuery({ queryKey: KEY, queryFn: () => api.get<AiAdmin>('/api/admin/ai') });
  const d = q.data;
  return (
    <StaffPage title="AI helpers" description="The models behind the AI helpers in the making tools, the allowance each person has, and how they have been used. Who may use them is set with the ai.helpers_teachers and ai.helpers_students feature flags.">
      {q.isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : q.error || !d ? (
        <ErrorNotice message="The AI page could not be loaded." onRetry={() => void q.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <section aria-label="The last 24 hours" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Requests, 24 hours" value={formatNumber(d.today.total)} hint={`Cap ${formatNumber(d.settings.siteDailyCap)}`} />
            <Stat label="Answered" value={formatNumber(d.today.ok)} />
            <Stat label="Failed" value={formatNumber(d.today.failed)} />
            <Stat label="Refused or filtered" value={formatNumber(d.today.refused)} />
            <Stat label="People" value={formatNumber(d.today.people)} />
          </section>
          <Models key={d.providers.map((p) => p.models.map((m) => `${m.id}:${m.enabled}`).join()).join()} data={d} />
          <Allowance key={`${d.settings.perAccount}:${d.settings.windowHours}:${d.settings.siteDailyCapSetting}`} data={d} />
          <Card title="Helpers used, 24 hours">
            {d.today.byTask.length ? (
              <ul className="flex flex-col gap-1 text-sm">
                {d.today.byTask.map((t) => (
                  <li key={t.task} className="flex justify-between gap-3 border-b border-line py-1 last:border-0">
                    <span className="break-all">{t.task}</span>
                    <span className="font-semibold tabular">{formatNumber(t.n)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-2">No helper requests in the last 24 hours.</p>
            )}
          </Card>
          <Card title="Recent failures by provider">
            <p className="mb-3 text-sm text-text-2">The last 7 days. When one model fails, the next one the person allows answers instead.</p>
            <DataTable
              caption="Provider failures"
              rows={d.failures}
              rowKey={(r) => `${r.provider}|${r.model}|${r.kind}`}
              empty="No failures in the last 7 days."
              minWidth={560}
              columns={[
                { key: 'provider', header: 'Provider', cell: (r) => r.provider },
                { key: 'model', header: 'Model', cell: (r) => <span className="break-all">{r.model}</span> },
                { key: 'kind', header: 'What happened', cell: (r) => KIND_TEXT[r.kind] ?? r.kind },
                { key: 'n', header: 'Times', align: 'right', cell: (r) => <span className="tabular">{formatNumber(r.n)}</span> },
                { key: 'last', header: 'Last', cell: (r) => dateTime(r.last) },
              ]}
            />
          </Card>
        </div>
      )}
    </StaffPage>
  );
}

