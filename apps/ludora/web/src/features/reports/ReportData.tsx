import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { Dialog, ErrorNotice, Field, Input, PageHeader, Panel, Select } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { BackLink, dateText, errorText, usePageTitle } from './reportUi.tsx';
import { localDay } from './logic.ts';
import { ReportGate, useSignedIn } from './pageKit.tsx';

/*
 * /reports/data: what Ludora keeps about the games you host, and your controls over it. Download
 * everything as JSON, delete reports older than a date, and a retention setting that the server
 * enforces (it removes older games every few hours, and at once when you choose it).
 */

interface Settings {
  retentionMonths: number | null;
  choices: number[];
  games: number;
  oldest: string | null;
}

const WHAT_GOES = 'the game, every player’s result and answer in it, and your note. It also leaves players’ own game history and class attendance. Rewards players already earned stay with them.';

export default function ReportData() {
  const { me, signedIn } = useSignedIn();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['reports', 'settings'], queryFn: () => api.get<Settings>('/api/reports/settings'), enabled: signedIn });
  usePageTitle('Your report data');
  const [exporting, setExporting] = useState(false);

  const download = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/reports/export', { credentials: 'same-origin', headers: { 'x-ludora-csrf': '1' } });
      if (!res.ok) throw new Error(res.status === 429 ? 'You can download this five times an hour. Try again later.' : 'The download did not start. Try again.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ludora-hosted-games-${localDay(new Date())}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The download did not start. Try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <ReportGate me={me} query={q} title="Your report data" next="/reports/data" notFound="This page could not be found.">
      {(s) => (
        <>
          <BackLink to="/reports">Your reports</BackLink>
          <PageHeader title="Your report data" description={s.games ? `Ludora keeps ${plural(s.games, 'game')} you hosted${s.oldest ? `, the oldest from ${dateText(s.oldest)}` : ''}.` : 'Ludora keeps no games you hosted.'} />
          <div className="flex max-w-3xl flex-col gap-4">
            <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="export-title">
              <h2 id="export-title" className="font-display text-2xl font-bold text-text">
                Download everything
              </h2>
              <p className="text-sm text-text-2">One JSON file with every game you hosted that Ludora still keeps: settings, players by display name, every answer, team results and your notes. No usernames, emails or account details.</p>
              <div>
                <Button icon={<Download className="size-4" aria-hidden />} onClick={() => void download()} loading={exporting} disabled={!s.games}>
                  Download as JSON
                </Button>
              </div>
            </Panel>
            <RetentionForm settings={s} onSaved={() => void qc.invalidateQueries({ queryKey: ['reports'] })} />
            <DeleteOlder disabled={!s.games} onDone={() => void qc.invalidateQueries({ queryKey: ['reports'] })} />
          </div>
        </>
      )}
    </ReportGate>
  );
}

function RetentionForm({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [value, setValue] = useState(settings.retentionMonths === null ? '' : String(settings.retentionMonths));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.put<{ deleted: number; retentionMonths: number | null }>('/api/reports/settings', { retentionMonths: value ? Number(value) : null });
      toast.success(r.retentionMonths ? `Saved. ${r.deleted ? `${plural(r.deleted, 'older game')} removed.` : 'No games were old enough to remove.'}` : 'Saved. Your reports are kept until you delete them.');
      onSaved();
    } catch (err) {
      setError(errorText(err, 'The setting was not saved. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="retention-title">
      <h2 id="retention-title" className="font-display text-2xl font-bold text-text">
        Remove old reports automatically
      </h2>
      <form onSubmit={save} noValidate className="flex flex-col gap-3">
        {error ? <ErrorNotice title="Not saved" message={error} /> : null}
        <Field label="Keep my reports for" hint={`Ludora removes games older than this every few hours, and straight away when you save. Removing a game takes ${WHAT_GOES}`}>
          {(p) => (
            <Select {...p} value={value} onChange={(e) => setValue(e.target.value)} className="sm:max-w-xs">
              <option value="">Until I delete them</option>
              {settings.choices.map((m) => (
                <option key={m} value={m}>
                  {m} months
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div>
          <Button type="submit" variant="primary" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function DeleteOlder({ disabled, onDone }: { disabled: boolean; onDone: () => void }) {
  const [before, setBefore] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | undefined>();
  const ask = (e: FormEvent) => {
    e.preventDefault();
    setField(undefined);
    if (!before) return setField('Choose a date.');
    if (before > localDay(new Date())) return setField('Choose today or an earlier date.');
    setConfirm(true);
  };
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ deleted: number }>('/api/reports/delete-older', { before });
      toast.success(r.deleted ? `${plural(r.deleted, 'report')} deleted` : 'No reports were that old');
      setConfirm(false);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.before ?? err.message) : 'Nothing was deleted. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel className="flex flex-col gap-3 p-4 sm:p-5" aria-labelledby="older-title">
      <h2 id="older-title" className="font-display text-2xl font-bold text-text">
        Delete older reports
      </h2>
      <form onSubmit={ask} noValidate className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <Field label="Delete every report from before" error={field}>
            {(p) => <Input {...p} type="date" value={before} max={localDay(new Date())} onChange={(e) => setBefore(e.target.value)} />}
          </Field>
        </div>
        <Button type="submit" variant="danger" icon={<Trash2 className="size-4" aria-hidden />} disabled={disabled}>
          Delete…
        </Button>
      </form>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete these reports?"
        description={before ? `Every game you hosted before ${dateText(`${before}T12:00:00`)}.` : undefined}
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Keep them</Button>
            <Button variant="danger" onClick={() => void go()} loading={busy}>
              Delete reports
            </Button>
          </>
        }
      >
        {error ? <ErrorNotice title="Not deleted" message={error} /> : null}
        <p className="text-sm text-text-2">For each game this removes {WHAT_GOES} It cannot be undone.</p>
      </Dialog>
    </Panel>
  );
}
