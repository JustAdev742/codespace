import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Gamepad2, GraduationCap, Presentation } from 'lucide-react';
import { PASSWORD_RULES, USERNAME_RULES } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { useMe } from '../../lib/session.ts';
import { Button } from '../../ui/Button.tsx';
import { Field, Input, Select } from '../../ui/primitives.tsx';
import { AuthLayout } from './AuthLayout.tsx';
import { RecoveryCodeDialog } from './RecoveryCodeDialog.tsx';

const TYPES = [
  { value: 'student', label: 'Student', hint: 'Play in class and at home.', icon: GraduationCap },
  { value: 'teacher', label: 'Teacher', hint: 'Host games and run your classes.', icon: Presentation },
  { value: 'player', label: 'Just playing', hint: 'Quizzes for fun, with friends or on your own.', icon: Gamepad2 },
] as const;

const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: 90 }, (_, i) => thisYear - 5 - i);

export default function SignUp() {
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isGuest = Boolean(me.data?.user?.isGuest);
  const [form, setForm] = useState({ username: '', displayName: '', password: '', accountType: 'student' as (typeof TYPES)[number]['value'], birthYear: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);
    const body = {
      username: form.username,
      password: form.password,
      accountType: form.accountType,
      ...(form.displayName.trim() && !isGuest ? { displayName: form.displayName.trim() } : {}),
      ...(form.birthYear ? { birthYear: Number(form.birthYear) } : {}),
    };
    try {
      const res = await api.post<{ recoveryCode: string }>(isGuest ? '/api/auth/claim' : '/api/auth/register', body);
      setCode(res.recoveryCode);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (!Object.keys(err.fields).length) setError(err.message);
      } else setError('Could not create the account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={isGuest ? 'Keep your progress' : 'Create your account'}
      intro={isGuest ? 'Pick a username and password. Your Glims, Sparks and quests stay exactly where they are.' : 'Free, and no email needed. You get a recovery code instead.'}
      footer={
        <>
          Already have an account?{' '}
          <Link to="/signin" className="font-semibold">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <fieldset aria-describedby="account-type-hint">
          <legend className="mb-2 text-sm font-semibold">I am</legend>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => {
              const on = form.accountType === t.value;
              const Icon = t.icon;
              return (
                <label
                  key={t.value}
                  className={`flex cursor-pointer flex-col items-center gap-1 rounded-[16px] border-2 px-1.5 py-3 text-center text-sm transition-[transform,box-shadow] active:translate-y-[2px] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] ${on ? 'border-ink bg-lantern text-on-accent shadow-[0_3px_0_var(--ink)]' : 'border-line-strong bg-raised text-text-2 shadow-[0_3px_0_var(--line-strong)] hover:text-text'}`}
                >
                  <input type="radio" name="accountType" value={t.value} checked={on} onChange={set('accountType')} className="sr-only" />
                  <Icon className="size-6" aria-hidden />
                  <span className="font-bold leading-tight">{t.label}</span>
                </label>
              );
            })}
          </div>
          <p id="account-type-hint" className="mt-2 text-xs text-text-3">
            {TYPES.find((t) => t.value === form.accountType)?.hint}
          </p>
        </fieldset>
        <Field label="Username" hint={USERNAME_RULES} error={errors.username}>
          {(p) => <Input {...p} autoComplete="username" value={form.username} onChange={set('username')} required maxLength={20} />}
        </Field>
        {!isGuest ? (
          <Field label="Display name" hint="What other players see. Leave blank to use your username." error={errors.displayName}>
            {(p) => <Input {...p} value={form.displayName} onChange={set('displayName')} maxLength={24} />}
          </Field>
        ) : null}
        <Field label="Password" hint={PASSWORD_RULES} error={errors.password}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required />}
        </Field>
        <Field label="Year you were born (optional)" hint="Only used to choose safer privacy settings for younger players." error={errors.birthYear}>
          {(p) => (
            <Select {...p} value={form.birthYear} onChange={set('birthYear')}>
              <option value="">Prefer not to say</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {error ? (
          <p role="alert" className="text-sm font-semibold text-ember">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!form.username || !form.password}>
          {isGuest ? 'Save my progress' : 'Create account'}
        </Button>
      </form>
      <RecoveryCodeDialog
        code={code}
        onDone={async () => {
          setCode(null);
          await qc.invalidateQueries();
          toast.success(isGuest ? 'Your progress is saved to your new account.' : 'Welcome to Ludora!');
          navigate('/');
        }}
      />
    </AuthLayout>
  );
}
