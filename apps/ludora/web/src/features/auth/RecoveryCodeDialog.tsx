import { useState } from 'react';
import { Copy } from 'lucide-react';
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
      <div className="flex items-center justify-between gap-3 rounded-[14px] border-2 border-dashed border-line-strong bg-sunken px-4 py-4">
        <code className="font-display text-xl font-bold tracking-wider tabular select-all">{code}</code>
        <Button
          size="sm"
          icon={<Copy className="size-4" />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code ?? '');
              toast.success('Copied');
            } catch {
              toast.error('Copy failed. Write it down instead.');
            }
          }}
        >
          Copy
        </Button>
      </div>
      <label className="mt-4 flex items-start gap-3 text-sm text-text-2">
        <input type="checkbox" className="mt-0.5 size-5 accent-[var(--lantern)]" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I have written it down or saved it somewhere safe.
      </label>
    </Dialog>
  );
}
