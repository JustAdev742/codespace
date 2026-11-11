import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Dialog } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { useDevicePrefs } from '../../lib/usePrefs.ts';
import { formatDate } from '../../lib/format.ts';

/*
 * "What's new": recent additions, read from whats-new.json in the repo (newest first). A button
 * in the header shows a dot while this device has entries it has not seen; opening the panel and
 * closing it marks them seen. Loaded only when needed, so the first page stays small.
 */

export interface WhatsNewEntry {
  id: string;
  date: string;
  title: string;
  items: string[];
}

export const useWhatsNew = () =>
  useQuery({
    queryKey: ['whats-new'],
    queryFn: async () => ((await import('./whats-new.json')).default as { entries: WhatsNewEntry[] }).entries,
    staleTime: Infinity,
  });

/** Entries newer than the one this device last saw (all of them when it has seen none). */
export function unseen(entries: WhatsNewEntry[], seen: string | null): WhatsNewEntry[] {
  if (!seen) return entries;
  const i = entries.findIndex((e) => e.id === seen);
  return i < 0 ? entries : entries.slice(0, i);
}

export function WhatsNewDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data } = useWhatsNew();
  const [device, setDevice] = useDevicePrefs();
  const newest = data?.[0]?.id ?? null;
  // Seen once the panel has been opened.
  useEffect(() => {
    if (open && newest && device.whatsNew !== newest) setDevice({ whatsNew: newest });
  }, [open, newest, device.whatsNew, setDevice]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="What's new" description="Recent additions to Ludora." size="md" footer={<Button onClick={() => onOpenChange(false)}>Close</Button>}>
      <div className="flex flex-col gap-5">
        {(data ?? []).map((e) => (
          <section key={e.id} aria-labelledby={`wn-${e.id}`}>
            <h3 id={`wn-${e.id}`} className="font-display text-xl leading-tight font-bold">
              {e.title}
            </h3>
            <p className="text-sm text-text-3">
              <time dateTime={e.date}>{formatDate(`${e.date}T12:00:00Z`, { day: 'numeric', month: 'long', year: 'numeric' })}</time>
            </p>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-text-2">
              {e.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}

/** The header button (wider screens; phones open it from Settings): a dot while there is something this device has not seen. */
export function WhatsNewButton() {
  const [open, setOpen] = useState(false);
  const [device] = useDevicePrefs();
  const { data } = useWhatsNew();
  const fresh = data ? unseen(data, device.whatsNew).length : 0;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={fresh ? `What's new: ${fresh} new` : "What's new"}
        className="relative hidden size-11 place-items-center rounded-[var(--radius-m)] sm:grid text-text-2 hover:bg-white/[0.08] hover:text-text"
      >
        <Sparkles className="size-5" aria-hidden />
        {fresh ? <span className="absolute top-2 right-2 size-2.5 rounded-full bg-lantern shadow-[0_0_0_2px_var(--stage-1)]" aria-hidden /> : null}
      </button>
      {open ? <WhatsNewDialog open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}

/** A plain button that opens the panel, for Settings. */
export function WhatsNewLink() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" icon={<Sparkles className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
        What's new
      </Button>
      {open ? <WhatsNewDialog open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
