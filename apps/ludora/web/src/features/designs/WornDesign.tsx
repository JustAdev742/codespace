import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Brush, Flag } from 'lucide-react';
import { REPORT_REASON_INFO, type ReportReason } from '@ludora/shared';
import { api } from '../../lib/api.ts';
import { Button, ButtonLink } from '../../ui/Button.tsx';
import { Dialog, ErrorNotice, Field, Select, Textarea } from '../../ui/primitives.tsx';

/*
 * Small pieces of My designs for other pages: the line under a profile card that names the design
 * a player wears (with a way to report it), and a card linking to My designs for the Make page.
 */

const REASONS: ReportReason[] = ['inappropriate_name', 'inappropriate_content', 'other'];

export function WornDesignNote({ design, canReport }: { design: { id: string; name: string }; canReport: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const send = useMutation({
    mutationFn: () => api.post(`/api/designs/${design.id}/report`, { reason, details: details.trim() }),
    onSuccess: () => {
      toast.success('Thanks. A moderator will look at it.');
      setOpen(false);
    },
  });
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-text-2">
      <Brush className="size-4" aria-hidden />
      <span className="min-w-0 break-words">
        Wearing their own design, <span className="font-bold text-text">{design.name}</span>
      </span>
      {canReport ? (
        <Button size="sm" variant="ghost" icon={<Flag className="size-4" aria-hidden />} onClick={() => (setReason(''), setDetails(''), setOpen(true))} aria-label={`Report the design ${design.name}`}>
          Report
        </Button>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(v) => !send.isPending && setOpen(v)}
        title={`Report the design ${design.name}`}
        description="Reports go to Ludora's moderators, not to the person who made it."
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={send.isPending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => send.mutate()} loading={send.isPending} disabled={!reason}>
              Send report
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="What is wrong">
            {(p) => (
              <Select {...p} value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
                <option value="" disabled>
                  Pick a reason
                </option>
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r === 'inappropriate_content' ? 'Inappropriate design' : REPORT_REASON_INFO[r].label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Anything else (optional)">{(p) => <Textarea {...p} value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000} />}</Field>
          {send.isError ? <ErrorNotice message="The report did not send. Try again." /> : null}
        </div>
      </Dialog>
    </div>
  );
}

/** For the Make page: a card that leads to My designs. */
export function MyDesignsCard() {
  return (
    <article className="flex flex-col gap-2 rounded-[var(--radius-l)] border border-line bg-raised p-4">
      <h3 className="flex items-center gap-2 font-display text-lg font-bold">
        <Brush className="size-5" aria-hidden />
        Design your own Glim
      </h3>
      <p className="text-sm text-text-2">Shape it, paint its markings, make a hat with your own emblem, and wear it in every game. Free, and yours alone.</p>
      <ButtonLink to="/designs" variant="secondary" className="self-start">
        Open My designs
      </ButtonLink>
    </article>
  );
}
