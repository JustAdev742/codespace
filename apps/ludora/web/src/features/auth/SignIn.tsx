import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { safeNext } from './next.ts';
import { Button } from '../../ui/Button.tsx';
import { Field, Input } from '../../ui/primitives.tsx';
import { AuthLayout } from './AuthLayout.tsx';
import { markSharedDevice } from '../../app/SharedDevice.tsx';

export default function SignIn() {
  const navigate = useNavigate();
  const me = useMe();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'signin' | 'guest' | null>(null);
  const next = safeNext(params.get('next'));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError(!username.trim() ? 'Enter your username.' : 'Enter your password.');
      return;
    }
    setBusy('signin');
    setError(null);
    try {
      await api.post('/api/auth/login', { username, password, ...(shared ? { shared: true } : {}) });
      markSharedDevice(shared);
      await qc.invalidateQueries();
      navigate(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in.');
    } finally {
      setBusy(null);
    }
  };

  const guest = async () => {
    setBusy('guest');
    try {
      await api.post('/api/auth/guest', {});
      await qc.invalidateQueries();
      toast.success('You are playing as a guest. Create an account any time to keep your progress.');
      navigate(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start a guest session.');
    } finally {
      setBusy(null);
    }
  };

  // Already signed in to an account: nothing to do here. A guest may still sign in to an account.
  if (me.data?.user && !me.data.user.isGuest && !busy) return <Navigate to={next} replace />;

  return (
    <AuthLayout
      title="Welcome back"
      intro="Sign in to pick up your Glims, quests and streak where you left them."
      footer={
        <>
          New here?{' '}
          <Link to={next === '/' ? '/signup' : `/signup?next=${encodeURIComponent(next)}`} className="font-semibold">
            Create a free account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Username">{(p) => <Input {...p} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />}</Field>
        <Field label="Password">{(p) => <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius-m)] border border-line px-3 py-2.5">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="mt-1 size-5 shrink-0 cursor-pointer accent-[var(--lantern-deep)]" aria-describedby="shared-hint" />
          <span>
            <span className="block font-semibold">This is a shared device</span>
            <span id="shared-hint" className="block text-sm text-text-3">
              You are signed out when you close this tab, and after 20 minutes with nothing pressed. Best for school computers.
            </span>
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-sm font-semibold text-ember">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" loading={busy === 'signin'}>
          Sign in
        </Button>
        <Link to="/recover" className="text-center text-sm font-semibold">
          Forgot your password?
        </Link>
      </form>
      <div className="my-6 flex items-center gap-3 text-sm text-text-3">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <Button size="lg" className="w-full" onClick={guest} loading={busy === 'guest'}>
        Play as a guest
      </Button>
      <p className="mt-2.5 text-center text-sm text-text-3">Joining a game with a code needs no account at all.</p>
    </AuthLayout>
  );
}
