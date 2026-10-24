import { useId, useState } from 'react';
import { Copy, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';

/** Shown once after sign-up or recovery. The code is the way back in without email. */
export function RecoveryCodeDialog({ code, onDone }: { code: string | null; onDone: () => void }) {
  // The tick belongs to one code, so a second new code (from Settings) has to be confirmed again.
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const saved = code !== null && savedCode === code;
  const hintId = useId();
  return (
    // Continue is the only way out: closing early would lose the code for good.
    <Dialog
      open={Boolean(code)}
      onOpenChange={(o) => {
        if (!o && saved) onDone();
      }}
      dismissible={false}
      title="Save your recovery code"
      description="If you forget your password, this code is how you get back in. We will not show it again."
      footer={
        <>
          {saved ? null : (
            <p id={hintId} className="mr-auto self-center text-sm font-semibold text-text-2">
              Tick the box above to continue.
            </p>
          )}
          <Button variant="primary" size="lg" disabled={!saved} aria-describedby={saved ? undefined : hintId} onClick={onDone}>
            Continue
          </Button>
        </>
      }
    >
      <CodeTicket code={code ?? ''} label="Your recovery code" />
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[var(--radius-m)] border border-line bg-surface-2 p-3 text-sm text-text">
        <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--lantern-deep)]" checked={saved} onChange={(e) => setSavedCode(e.target.checked ? code : null)} />
        I have written it down or saved it somewhere safe.
      </label>
    </Dialog>
  );
}

/** A recovery code on a ticket, with a copy button. */
export function CodeTicket({ code, label }: { code: string; label: string }) {
  return (
    // An event ticket: solid gold, notched at the sides, torn along a dashed line
    <div className="relative overflow-hidden rounded-[var(--radius-l)] bg-lantern text-on-accent">
      <span className="absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full bg-raised" aria-hidden />
      <span className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full bg-raised" aria-hidden />
      <div className="flex items-center gap-2 border-b-2 border-dashed border-on-accent/25 px-6 py-2 text-sm font-bold">
        <KeyRound className="size-4" aria-hidden /> {label}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <code className="font-display text-2xl font-extrabold tracking-wider break-all tabular select-all sm:text-[1.75rem]">{code}</code>
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
