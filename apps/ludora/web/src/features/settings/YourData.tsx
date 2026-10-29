import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '../../lib/api.ts';
import { Dialog, Field, Input, Panel } from '../../ui/primitives.tsx';
import { Button, buttonClass } from '../../ui/Button.tsx';

/*
 * The account's own data: a download of everything stored about it, and
 * deleting it. The server checks the username and password and refuses staff
 * accounts; this panel only explains and asks.
 */

export function YourData({ username, isGuest }: { username: string | null; isGuest: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Panel id="your-data" className="flex scroll-mt-20 flex-col gap-4 p-5">
      <h2 className="font-display text-2xl leading-tight font-bold">Your data</h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-text-2">A file with everything Ludora keeps about your account: your profile, Sparks and history, collection, sets, classes and games.</p>
        {/* A plain link: the server sends the file as a download with your session cookie. */}
        <a href="/api/me/export" download className={buttonClass('secondary', 'sm')}>
          Download my data
        </a>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-text-2">Deleting your account cannot be undone.</p>
        <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      </div>
      <p className="text-sm text-text-3">
        Read how Ludora uses your data in the{' '}
        <Link to="/privacy" className="underline underline-offset-2 hover:text-text">
          privacy policy
        </Link>{' '}
        and the{' '}
        <Link to="/terms" className="underline underline-offset-2 hover:text-text">
          terms of use
        </Link>
        .
      </p>
      <DeleteAccountDialog open={open} onOpenChange={setOpen} username={username} isGuest={isGuest} />
    </Panel>
  );
}

function DeleteAccountDialog({ open, onOpenChange, username, isGuest }: { open: boolean; onOpenChange: (v: boolean) => void; username: string | null; isGuest: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const word = username ?? 'delete';
  const ready = confirm.trim().toLowerCase() === word.toLowerCase() && (isGuest || password.length > 0);

  const remove = useMutation({
    mutationFn: () => api.post('/api/me/delete', { confirm, ...(isGuest ? {} : { password }) }),
    onSuccess: async () => {
      onOpenChange(false);
      qc.clear();
      toast.success('Your account was deleted.');
      navigate('/');
    },
    onError: (err) => {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setErrors({ confirm: err instanceof ApiError ? err.message : 'Could not delete your account. Try again.' });
    },
  });

  const close = (v: boolean) => {
    if (!v) {
      setConfirm('');
      setPassword('');
      setErrors({});
    }
    onOpenChange(v);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Delete your account?"
      description="This cannot be undone."
      footer={
        <>
          <Button onClick={() => close(false)}>Keep my account</Button>
          <Button type="submit" form="delete-account" variant="danger" loading={remove.isPending} disabled={!ready}>
            Delete my account
          </Button>
        </>
      }
    >
      <form
        id="delete-account"
        className="flex flex-col gap-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (ready) remove.mutate();
        }}
      >
        <div className="text-sm text-text-2">
          <p>Goes now, for good:</p>
          <ul className="mt-1 list-disc pl-5">
            <li>your account, Sparks, Glims and items</li>
            <li>your friends, classes you teach and your private question sets</li>
          </ul>
          <p className="mt-3">Stays, without your name:</p>
          <ul className="mt-1 list-disc pl-5">
            <li>scores in games you played, so other players' results still add up</li>
            <li>sets you shared publicly, for the people using them</li>
          </ul>
          <p className="mt-3">Want a copy first? Close this and choose Download my data.</p>
        </div>
        <Field label={username ? `Type your username, ${username}, to confirm` : 'Type delete to confirm'} error={errors.confirm}>
          {(fp) => <Input {...fp} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />}
        </Field>
        {isGuest ? null : (
          <Field label="Password" error={errors.password}>
            {(fp) => <Input {...fp} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
        )}
      </form>
    </Dialog>
  );
}
