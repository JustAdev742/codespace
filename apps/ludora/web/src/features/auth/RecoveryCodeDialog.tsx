import { useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';

/** Shown once after sign-up or recovery. The code is the way back in without email. */
export function RecoveryCodeDialog({ code, onDone }: { code: string | null; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <Dialog
      open={Boolean(code)}
      onOpenChange={(o) => {
        if (!o && saved) onDone();
      }}
      title="Save your recovery code"
      description="If you forget your password, this code is how you get back in. We will not show it again."
      footer={
        <Button variant="primary" size="lg" disabled={!saved} onClick={onDone}>
          Continue
        </Button>
      }
    >
      <CodeTicket code={code ?? ''} label="Your recovery code" />
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[14px] bg-surface-2 p-3 text-sm text-text">
        <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--lantern-deep)]" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I have written it down or saved it somewhere safe.
      </label>
    </Dialog>
  );
}

/** A recovery code on a ticket, with a copy button. */
export function CodeTicket({ code, label }: { code: string; label: string }) {
  return (
    // A ticket: notched at the sides, torn along a dashed line
    <div className="relative overflow-hidden rounded-[18px] border-[2.5px] border-ink bg-lantern text-on-accent shadow-[0_4px_0_var(--ink)]">
      <span className="absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full border-[2.5px] border-ink bg-raised" aria-hidden />
      <span className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full border-[2.5px] border-ink bg-raised" aria-hidden />
      <div className="flex items-center gap-2 border-b-2 border-dashed border-[rgb(29_24_70/0.35)] px-6 py-2 text-sm font-bold">
        <KeyRound className="size-4" aria-hidden /> {label}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <code className="font-display text-xl font-extrabold tracking-wider break-all tabular select-all sm:text-2xl">{code}</code>
        <Button
          size="sm"
          className="paper"
          icon={<Copy className="size-4" aria-hidden />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              toast.success('Copied');
            } catch {
              toast.error('Copy failed. Write it down instead.');
            }
          }}
        >
          Copy
        </Button>
      </div>
    </div>
  );
}
