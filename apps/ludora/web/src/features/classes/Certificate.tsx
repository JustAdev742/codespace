import { useState } from 'react';
import { Printer } from 'lucide-react';
import type { AvatarLite } from '@ludora/shared';
import { Glim } from '../../art/glim/Glim.tsx';
import { Dialog, Field, Input, Textarea } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { PrintSheet, usePrinting } from './PrintSheet.tsx';

/*
 * A printable certificate for one student, with their Glim (the collectible they
 * chose) and wording the teacher picks. Nothing is stored: it is made in the
 * browser and printed.
 */

const PRESETS = ['for brilliant effort this week', 'for never giving up', 'for being a superb team player', 'for great progress'];

interface Wording {
  heading: string;
  reason: string;
  signed: string;
  date: string;
}

function CertificateArt({ student, avatar, className, schoolName, w, paper = false }: { student: string; avatar: AvatarLite | null; className: string; schoolName: string | null; w: Wording; paper?: boolean }) {
  return (
    <div
      className={`relative flex flex-col items-center gap-3 overflow-hidden rounded-[var(--radius-l)] border-[6px] border-double border-lantern-deep bg-raised px-6 py-8 text-center ${paper ? 'min-h-[175mm] justify-center' : ''}`}
    >
      <span className="plate bg-lantern px-4 py-1 text-on-accent">
        <span className="font-display text-sm font-bold">{schoolName || className}</span>
      </span>
      <p className="font-display text-3xl leading-tight font-bold break-words text-text sm:text-4xl">{w.heading || 'Certificate'}</p>
      <p className="text-sm text-text-2">awarded to</p>
      {avatar ? (
        <span className="grid size-32 place-items-center" aria-hidden>
          <Glim art={avatar.art} accessories={avatar.accessories} dress={avatar.uniform ?? null} size={128} />
        </span>
      ) : null}
      <p className="font-display text-5xl leading-none font-extrabold break-words text-text">{student}</p>
      <p className="max-w-[40ch] text-lg break-words whitespace-pre-line text-text">{w.reason}</p>
      <div className="mt-4 flex w-full max-w-md flex-wrap justify-between gap-4 text-sm text-text-2">
        <span className="min-w-0 border-t border-line pt-1 break-words">{w.signed}</span>
        <span className="border-t border-line pt-1">{w.date}</span>
      </div>
    </div>
  );
}

export function CertificateDialog({
  open,
  onOpenChange,
  student,
  avatar,
  className,
  schoolName,
  teacher,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: string;
  avatar: AvatarLite | null;
  className: string;
  schoolName: string | null;
  teacher: string;
}) {
  const [w, setW] = useState<Wording>({
    heading: 'Star of the week',
    reason: PRESETS[0]!,
    signed: teacher,
    date: new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  });
  const p = usePrinting();
  const set = (k: keyof Wording) => (v: string) => setW((cur) => ({ ...cur, [k]: v }));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={`Certificate for ${student}`}
      description="Choose the words, check the preview, then print. Nothing is saved."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="primary" icon={<Printer className="size-4" aria-hidden />} onClick={p.print}>
            Print certificate
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Heading">{(f) => <Input {...f} value={w.heading} onChange={(e) => set('heading')(e.target.value)} maxLength={50} />}</Field>
        <Field label="What it is for" hint="Or pick one below.">
          {(f) => <Textarea {...f} value={w.reason} onChange={(e) => set('reason')(e.target.value)} maxLength={160} rows={2} />}
        </Field>
        <div className="-mt-2 flex flex-wrap gap-1.5">
          {PRESETS.map((r) => (
            <Button key={r} size="sm" variant="ghost" onClick={() => set('reason')(r)} aria-pressed={w.reason === r}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Signed">{(f) => <Input {...f} value={w.signed} onChange={(e) => set('signed')(e.target.value)} maxLength={60} />}</Field>
          <Field label="Date">{(f) => <Input {...f} value={w.date} onChange={(e) => set('date')(e.target.value)} maxLength={40} />}</Field>
        </div>
        <section aria-label="Preview">
          <h3 className="mb-2 text-sm font-semibold text-text-2">Preview</h3>
          <CertificateArt student={student} avatar={avatar} className={className} schoolName={schoolName} w={w} />
        </section>
      </div>
      {p.printing ? (
        <PrintSheet onDone={p.done} label="Certificate">
          <CertificateArt student={student} avatar={avatar} className={className} schoolName={schoolName} w={w} paper />
        </PrintSheet>
      ) : null}
    </Dialog>
  );
}
