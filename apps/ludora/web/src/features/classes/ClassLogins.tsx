import { useRef, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileUp, KeyRound, Printer } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { plural } from '../../lib/format.ts';
import { Dialog, ErrorNotice, Field, Textarea } from '../../ui/primitives.tsx';
import { Button } from '../../ui/Button.tsx';
import { errorText } from '../reports/reportUi.tsx';
import { classKeys, type ClassMember, type LoginCard } from './classData.ts';
import { parseNames } from './classLogic.ts';
import { PrintSheet, usePrinting } from './PrintSheet.tsx';

/*
 * Class logins: the teacher pastes first names (or imports a CSV from the school's
 * system) and Ludora makes a student account for each, with a username and a
 * three-word passcode. The passcodes come back once and are printed on cards to
 * cut out and hand round. A teacher can reset a passcode later, one student at a time.
 */

const MAX = 40;

function signInAddress(): string {
  return `${window.location.host}/signin`;
}

/** One card: big, plain type, so a seven-year-old can copy it at a laptop. */
function Card({ card, className }: { card: LoginCard; className: string }) {
  return (
    <div className="print-avoid-break rounded-[var(--radius-m)] border-2 border-dashed border-line p-4">
      <p className="text-xs text-text-3">Ludora, {className}</p>
      <p className="mt-1 font-display text-2xl leading-tight font-bold break-words text-text">{card.displayName}</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-text-2">Username</dt>
        <dd className="text-lg leading-snug font-bold break-all text-text">{card.username}</dd>
        <dt className="text-text-2">Passcode</dt>
        <dd className="text-lg leading-snug font-bold break-all text-text">{card.passcode}</dd>
      </dl>
      <p className="mt-3 text-xs text-text-2">Go to {signInAddress()}, type your username and passcode, then choose Sign in.</p>
    </div>
  );
}

function CardSheet({ cards, className, onDone }: { cards: LoginCard[]; className: string; onDone: () => void }) {
  return (
    <PrintSheet onDone={onDone} label="Login cards">
      <div className="grid grid-cols-2 gap-4">
        {cards.map((c) => (
          <Card key={c.userId} card={c} className={className} />
        ))}
      </div>
    </PrintSheet>
  );
}

/** The cards on screen, once, with a way to print them. */
function CardsResult({ cards, className }: { cards: LoginCard[]; className: string }) {
  const p = usePrinting();
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-[var(--radius-m)] bg-surface-2 p-3 text-sm text-text">
        <strong className="font-semibold">Print these now.</strong> The passcodes are shown only this once. If one goes missing, use Reset passcode on the Students tab.
      </p>
      <div>
        <Button variant="primary" icon={<Printer className="size-4" aria-hidden />} onClick={p.print}>
          Print {cards.length === 1 ? 'the card' : `${cards.length} cards`}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 p-0.5 sm:grid-cols-2" role="list" aria-label="Login cards">
        {cards.map((c) => (
          <div role="listitem" key={c.userId}>
            <Card card={c} className={className} />
          </div>
        ))}
      </div>
      {p.printing ? <CardSheet cards={cards} className={className} onDone={p.done} /> : null}
    </div>
  );
}

export function ClassLoginsDialog({ classId, className, open, onOpenChange }: { classId: string; className: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cards, setCards] = useState<LoginCard[] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const names = parseNames(text);

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setText('');
      setError(null);
      setCards(null);
    }
    onOpenChange(next);
  };

  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 500_000) {
      setError('That file is too big for a class list. Export just the names, or paste them in.');
      return;
    }
    const found = parseNames(await f.text());
    if (!found.length) {
      setError(`No names found in ${f.name}. Use a CSV with a First name or Name column, or paste the names in.`);
      return;
    }
    setError(null);
    setText(found.join('\n'));
    toast.success(`${plural(found.length, 'name')} read from ${f.name}. Check them before you make the logins.`);
  };

  const make = async () => {
    if (!names.length) {
      setError('Add at least one first name, one per line.');
      return;
    }
    if (names.length > MAX) {
      setError(`Make up to ${MAX} logins at a time. You have ${names.length}; do the rest in a second batch.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ accounts: LoginCard[] }>(`/api/classes/${classId}/logins`, { names });
      setCards(res.accounts);
      void qc.invalidateQueries({ queryKey: classKeys.all });
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.names ?? err.message) : 'The logins were not made. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      size="lg"
      title={cards ? `${plural(cards.length, 'login')} made` : 'Make class logins'}
      description={cards ? `Each student is now in ${className}.` : 'For students with no email. Ludora makes each one an account with a username and an easy passcode of three words, and puts them in this class.'}
      dismissible={!busy}
      footer={
        cards ? (
          <Button variant="primary" onClick={() => close(false)}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={() => close(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" icon={<KeyRound className="size-4" aria-hidden />} loading={busy} onClick={() => void make()}>
              {names.length ? `Make ${plural(names.length, 'login')}` : 'Make logins'}
            </Button>
          </>
        )
      }
    >
      {cards ? (
        <CardsResult cards={cards} className={className} />
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="First names" hint={`One per line, up to ${MAX} at a time. Only the first name is used, and it is checked like any name on Ludora. ${plural(names.length, 'name')} so far.`} error={error ?? undefined}>
            {(p) => <Textarea {...p} value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={'Amira\nBen\nChloé'} autoComplete="off" spellCheck={false} />}
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <input ref={file} type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void importFile(e)} />
            <Button size="sm" icon={<FileUp className="size-4" aria-hidden />} onClick={() => file.current?.click()}>
              Import a CSV
            </Button>
            <p className="text-sm text-text-3">From your school&apos;s system: a First name (or Name) column is used.</p>
          </div>
          <p className="text-sm text-text-2">Accounts start with the safest settings for under-13s. No email and no date of birth are asked for.</p>
        </div>
      )}
    </Dialog>
  );
}

/** A new passcode for one student made with a class login. Their old one stops working and they are signed out. */
export function ResetPasscodeDialog({ classId, className, student, onClose }: { classId: string; className: string; student: ClassMember | null; onClose: () => void }) {
  const [card, setCard] = useState<LoginCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const name = student?.displayName ?? 'this student';
  const close = () => {
    if (busy) return;
    onClose();
    setCard(null);
    setProblem(null);
  };
  const reset = async () => {
    if (!student) return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await api.post<{ account: LoginCard }>(`/api/classes/${classId}/logins/${student.id}/passcode`);
      setCard(res.account);
    } catch (err) {
      setProblem(errorText(err, 'The passcode was not reset. Try again.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={student !== null}
      onOpenChange={(o) => !o && close()}
      title={card ? `New passcode for ${name}` : `Reset ${name}'s passcode?`}
      description={card ? undefined : `${name} gets a new three-word passcode. The old one stops working, and they are signed out on every device.`}
      footer={
        card ? (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" icon={<KeyRound className="size-4" aria-hidden />} loading={busy} onClick={() => void reset()}>
              Reset passcode
            </Button>
          </>
        )
      }
    >
      {card ? <CardsResult cards={[card]} className={className} /> : problem ? <ErrorNotice title="Not reset" message={problem} /> : null}
    </Dialog>
  );
}
