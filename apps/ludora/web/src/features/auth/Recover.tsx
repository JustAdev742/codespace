import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { PASSWORD_RULES } from '@ludora/shared';
import { api, ApiError } from '../../lib/api.ts';
import { Button } from '../../ui/Button.tsx';
import { Field, Input, focusFirstInvalid } from '../../ui/primitives.tsx';
import { AuthLayout } from './AuthLayout.tsx';
import { RecoveryCodeDialog } from './RecoveryCodeDialog.tsx';

export default function Recover() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ username: '', recoveryCode: '', newPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const missing: Record<string, string> = {};
    if (!form.username.trim()) missing.username = 'Enter your username.';
    if (!form.recoveryCode.trim()) missing.recoveryCode = 'Enter the recovery code you saved.';
    if (!form.newPassword) missing.newPassword = 'Choose a new password.';
    if (Object.keys(missing).length) {
      setErrors(missing);
      focusFirstInvalid(formRef.current);
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const res = await api.post<{ recoveryCode: string }>('/api/auth/recover', form);
      setCode(res.recoveryCode);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (!Object.keys(err.fields).length) setError(err.message);
        else focusFirstInvalid(formRef.current);
      } else setError('Could not recover the account. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Get back in"
      intro="Use the recovery code you saved when you made your account. If you are in a class and have lost yours, your teacher can make you a new one."
      footer={
        <Link to="/signin" className="font-semibold">
          Back to sign in
        </Link>
      }
    >
      <form ref={formRef} onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Username" error={errors.username}>
          {(p) => <Input {...p} autoComplete="username" value={form.username} onChange={set('username')} required />}
        </Field>
        <Field label="Recovery code" hint="Looks like ABCD-EFGH-JKLM-NPQR." error={errors.recoveryCode}>
          {(p) => <Input {...p} value={form.recoveryCode} onChange={set('recoveryCode')} required autoCapitalize="characters" spellCheck={false} />}
        </Field>
        <Field label="New password" hint={PASSWORD_RULES} error={errors.newPassword}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} required />}
        </Field>
        {error ? (
          <p role="alert" className="text-sm font-semibold text-ember">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" size="lg" loading={busy}>
          Reset password
        </Button>
      </form>
      <RecoveryCodeDialog
        code={code}
        onDone={async () => {
          setCode(null);
          await qc.invalidateQueries();
          navigate('/');
        }}
      />
    </AuthLayout>
  );
}
