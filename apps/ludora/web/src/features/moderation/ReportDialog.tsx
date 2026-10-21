import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { REPORT_REASON_INFO, REPORT_REASONS, type ReportReason, type ReportTarget } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { Button } from '../../ui/Button.tsx';
import { Dialog, ErrorNotice, Field, Select, Textarea } from '../../ui/primitives.tsx';

/**
 * Send a report to the moderators. The server never says whether the
 * target exists or was reported before, so this always ends with the same
 * thank-you.
 */
export function ReportDialog({ open, onOpenChange, target, people = [] }: { open: boolean; onOpenChange: (v: boolean) => void; target: { type: ReportTarget; id: string; label: string }; people?: string[] }) {
  const reasons = REPORT_REASONS.filter((r) => REPORT_REASON_INFO[r].targets.includes(target.type));
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [who, setWho] = useState('');
  const [details, setDetails] = useState('');
  useEffect(() => {
    if (open) {
      setReason('');
      setWho('');
      setDetails('');
    }
  }, [open]);
  const send = useMutation({
    mutationFn: () => api.post('/api/reports', { targetType: target.type, targetId: target.id, reason, details: [who ? `About: ${who}` : '', details.trim()].filter(Boolean).join('\n') }),
    onSuccess: () => {
      toast.success('Thanks. A moderator will look at it.');
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => !send.isPending && onOpenChange(v)}
      title={`Report ${target.label}`}
      description="Reports go to Ludora's moderators, not to the person you report."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={send.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => send.mutate()} loading={send.isPending} disabled={!reason}>
            Send report
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason) send.mutate();
        }}
      >
        <Field label="What is wrong">
          {(p) => (
            <Select {...p} value={reason} onChange={(e) => setReason(e.target.value as ReportReason)} required>
              <option value="" disabled>
                Choose a reason
              </option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {REPORT_REASON_INFO[r].label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {people.length ? (
          <Field label="Who is it about" hint="Optional.">
            {(p) => (
              <Select {...p} value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="">Nobody in particular</option>
                {people.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field label="Anything else the moderators should know" hint="Optional. Do not include your password or other private details.">
          {(p) => <Textarea {...p} rows={3} maxLength={900} value={details} onChange={(e) => setDetails(e.target.value)} />}
        </Field>
        {send.error ? <ErrorNotice title="Not sent" message={send.error instanceof ApiError ? send.error.message : 'Try again in a moment.'} /> : null}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
