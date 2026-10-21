import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '../../lib/api.ts';
import { Button } from '../../ui/Button.tsx';
import { Field, Input } from '../../ui/primitives.tsx';
import { AuthLayout } from './AuthLayout.tsx';

export default function SignIn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'signin' | 'guest' | null>(null);
  const next = params.get('next')?.startsWith('/') ? params.get('next')! : '/';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('signin');
    setError(null);
    try {
      await api.post('/api/auth/login', { username, password });
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

  return (
    <AuthLayout
      title="Welcome back"
      intro="Sign in to pick up your Glims, quests and streak where you left them."
      footer={
        <>
          New here?{' '}
          <Link to="/signup" className="font-semibold">
            Create a free account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Username">{(p) => <Input {...p} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />}</Field>
        <Field label="Password">{(p) => <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}</Field>
        {error ? (
          <p role="alert" className="text-sm font-semibold text-ember">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" loading={busy === 'signin'} disabled={!username || !password}>
          Sign in
        </Button>
        <Link to="/recover" className="text-center text-sm font-semibold">
          Forgot your password?
        </Link>
      </form>
      <div className="my-6 flex items-center gap-3 text-xs text-text-3">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <Button size="lg" className="w-full" onClick={guest} loading={busy === 'guest'}>
        Play as a guest
      </Button>
      <p className="mt-2 text-center text-xs text-text-3">Joining a game with a code needs no account at all.</p>
    </AuthLayout>
  );
}
