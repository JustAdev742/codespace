import { useState, type ReactNode } from 'react';
import { CalendarClock, School, UserPlus } from 'lucide-react';
import { untilText } from '../../lib/format.ts';
import { Badge, Dialog, EmptyState, ErrorNotice } from '../../ui/primitives.tsx';
import { Button, ButtonLink, type ButtonVariant } from '../../ui/Button.tsx';
import { dateTimeText, errorText, SignInPrompt } from '../reports/reportUi.tsx';

/**
 * Asks before doing something that cannot be undone or that other people
 * will notice. The server's message shows inside the dialog if it fails.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  onConfirm: () => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = (next: boolean) => {
    if (pending) return;
    setError(null);
    onOpenChange(next);
  };
  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setPending(false);
      onOpenChange(false);
    } catch (err) {
      setPending(false);
      setError(errorText(err, 'That did not work. Check your connection and try again.'));
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={change}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button onClick={() => change(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant={variant} loading={pending} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error ? <ErrorNotice title="Not done" message={error} /> : null}
    </Dialog>
  );
}

/** A class join code, spelt out letter by letter for screen readers. */
export function JoinCode({ code, className = '' }: { code: string; className?: string }) {
  return (
    <span className={`font-display font-extrabold tracking-[0.14em] text-text tabular ${className}`}>
      <span aria-hidden>{code}</span>
      <span className="sr-only">{code.split('').join(' ')}</span>
    </span>
  );
}

/**
 * When an assignment is due. Past due dates get a badge for teachers and
 * for students who have not played it; a student who has played sees a
 * quieter note, since playing late is allowed.
 */
export function DueLabel({ dueAt, now, quietWhenPast = false }: { dueAt: string | null; now: number; quietWhenPast?: boolean }) {
  if (!dueAt) return <span className="text-text-3">No due date</span>;
  const past = new Date(dueAt).getTime() < now;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1.5 text-text-2">
        <CalendarClock className="size-4 shrink-0 text-text-3" aria-hidden />
        <span>
          Due <time dateTime={dueAt}>{dateTimeText(dueAt)}</time>
        </span>
      </span>
      {!past ? <span className="text-text-3">in {untilText(dueAt)}</span> : quietWhenPast ? <span className="text-text-3">Due date passed</span> : <Badge tone="coral">Past due</Badge>}
    </span>
  );
}

/** What signed-out visitors and guests see instead of class pages. */
export function ClassAccountGate({ state, next, message }: { state: 'signedOut' | 'guest'; next: string; message?: string }) {
  if (state === 'signedOut') {
    return (
      <SignInPrompt title="Sign in to see your classes" next={next}>
        Classes keep your assignments and results together under your account.
      </SignInPrompt>
    );
  }
  return (
    <EmptyState
      icon={<UserPlus className="size-8" />}
      title="Classes need a free account"
      action={
        <ButtonLink to="/signup" variant="primary">
          Create a free account
        </ButtonLink>
      }
    >
      {message ?? 'Classes keep your work under your own account, so your teacher can see it and you never lose it. When you create one, everything you did as a guest comes with you.'}
    </EmptyState>
  );
}

/** The page body while a class page loads. */
export function ClassPageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span className="sr-only" role="status">
        Loading
      </span>
      <div className="skeleton h-4 w-28" />
      <div className="skeleton h-10 w-2/3 max-w-md" />
      <div className="skeleton h-28" />
      <div className="skeleton h-24" />
      <div className="skeleton h-24" />
    </div>
  );
}

export function ClassIcon() {
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-surface-2 text-lantern" aria-hidden>
      <School className="size-5" />
    </span>
  );
}
